import { createClient } from "@/lib/supabase/server";
import { fetchAllPaginado } from "@/modules/core/export/lib/paginar";
import { getParametro } from "@/modules/core/parametros/queries/parametros.queries";
import { callRpc, type Result } from "@/modules/core/rpc/call-rpc";
import { getTarifasVigentes } from "@/modules/core/tarifas/queries/tarifas.queries";
import { PARAMETROS_CAFE } from "../../parametros";
import type { DestinoDiferencia } from "../../empaque/lib/empaque";
import { getLineasEmpaque } from "../../empaque/queries/empaque.queries";
import type { TipoProceso } from "../../lotes/types";
import { getStock } from "@/modules/core/inventario/queries/inventario.queries";
import { bultosPorEtapa } from "../lib/cola";
import { procesadosPorTipo, siguientePaso } from "../lib/pasos";
import type { AlertaCalidad } from "../../recepciones/lib/calidad";
import type { EstadoLote } from "../types";
import type { BultoPlanta, ConfigPlanta, LoteParaProceso, ProcesoHistorial, TarjetaLotePlanta } from "../types-planta";

// Módulo plano (no "use server"): solo lo llama código de servidor. La autorización es el RLS (vistas
// `security_invoker`): sin el módulo `cafe.procesos`, o sin membresía en el cliente actual, todo sale vacío.
// Nada de estados guardados: el estado y el avance de cada lote salen de `cafe.v_lotes` / `v_lote_etapas`.

/**
 * Estados con trabajo pendiente en la planta. Un lote de SERVICIO `listo` (todo procesado, sin remisión) sigue
 * en el tablero, en «Por entregar», hasta que se entrega (`entregado`); el de marca propia `listo` ya no tiene cola.
 */
const FILTRO_TABLERO = "estado.in.(recibido,en_proceso,parcial),and(estado.eq.listo,linea.eq.servicio)";

const COLUMNAS_COLA =
  "id, codigo, linea, tercero_nombre, tipo_cafe_nombre, fecha_recepcion, created_at, peso_recibido_kg, peso_actual_kg, num_bultos, nivel_tueste, perfil_temp_c, perfil_tiempo_min, alertas_calidad, tiene_desvio, estado, avance_texto, servicios_requeridos, servicios, anulado_at";

/** Trozos de `n` para no pasar de la longitud de URL de PostgREST con `.in()` sobre muchos ids. */
function trozos<T>(lista: readonly T[], n: number): T[][] {
  const resultado: T[][] = [];
  for (let i = 0; i < lista.length; i += n) resultado.push(lista.slice(i, i + n));
  return resultado;
}

/**
 * El tablero de la planta: los lotes con pasos pendientes (`recibido`, `en_proceso`, `parcial`) y los de servicio
 * ya `listo` sin entregar, el más antiguo primero. Cada uno trae sus bultos repartidos por etapa (un parcial cae en
 * varias columnas) y, si está listo, desde cuándo. El avance se deriva de `v_bultos_estado`, nunca se guarda.
 */
export async function getColaPlanta(): Promise<TarjetaLotePlanta[]> {
  const supabase = await createClient();
  const cafe = supabase.schema("cafe");

  const lotes = await fetchAllPaginado((desde, hasta) =>
    cafe
      .from("v_lotes")
      .select(COLUMNAS_COLA)
      .or(FILTRO_TABLERO)
      .order("fecha_recepcion", { ascending: true })
      .order("codigo", { ascending: true })
      .range(desde, hasta),
  );
  if (lotes.length === 0) return [];

  const ids = lotes.map((l) => l.id as string);

  // Pasos por los que ya pasó cada bulto, por lote.
  const bultosPorLote = new Map<string, { pasos: TipoProceso[] }[]>();
  for (const grupo of trozos(ids, 50)) {
    const filas = await fetchAllPaginado((desde, hasta) =>
      cafe.from("v_bultos_estado").select("lote_id, bulto_id, pasos").in("lote_id", grupo).order("bulto_id").range(desde, hasta),
    );
    for (const b of filas) bultosPorLote.set(b.lote_id as string, [...(bultosPorLote.get(b.lote_id as string) ?? []), { pasos: (b.pasos ?? []) as TipoProceso[] }]);
  }

  // «Listo desde»: la fecha del último proceso vigente de cada lote listo.
  const listos = lotes.filter((l) => l.estado === "listo").map((l) => l.id as string);
  const listoDesde = new Map<string, string>();
  for (const grupo of trozos(listos, 50)) {
    const filas = await fetchAllPaginado((desde, hasta) =>
      cafe.from("procesos").select("id, lote_id, fecha").in("lote_id", grupo).is("anulado_at", null).is("reapertura_id", null).order("id").range(desde, hasta),
    );
    for (const p of filas) {
      const actual = listoDesde.get(p.lote_id as string);
      if (!actual || p.fecha > actual) listoDesde.set(p.lote_id as string, p.fecha as string);
    }
  }

  return lotes.map((l) => {
    const id = l.id as string;
    const requeridos = (l.servicios_requeridos ?? []) as TipoProceso[];
    const bultos = bultosPorLote.get(id) ?? [];
    const procesados = procesadosPorTipo(bultos.map((b, i) => ({ id: String(i), numero: i + 1, pasos: b.pasos })));
    return {
      id,
      codigo: l.codigo as string,
      linea: l.linea,
      tercero: l.tercero_nombre ?? "—",
      tipoCafe: l.tipo_cafe_nombre,
      fechaRecepcion: l.fecha_recepcion as string,
      llegadaEn: l.created_at as string,
      pesoRecibidoKg: Number(l.peso_recibido_kg),
      pesoActualKg: Number(l.peso_actual_kg ?? l.peso_recibido_kg),
      numBultos: l.num_bultos as number,
      nivelTueste: l.nivel_tueste,
      perfilTempC: l.perfil_temp_c,
      perfilTiempoMin: l.perfil_tiempo_min,
      alertasCalidad: (l.alertas_calidad ?? []) as AlertaCalidad[], // CHECK de la columna
      tieneDesvio: l.tiene_desvio ?? false,
      estado: l.estado as EstadoLote, // vista: solo estos valores
      avanceTexto: l.avance_texto ?? "",
      siguiente: siguientePaso(requeridos, l.num_bultos as number, procesados),
      serviciosRequeridos: requeridos,
      procesados,
      bultosPorEtapa: bultosPorEtapa(requeridos, bultos),
      listoDesde: listoDesde.get(id) ?? null,
    };
  });
}

/** Cifras del día para el subtítulo de la cabecera de Planta (kg recibidos y tostados hoy). `hoy` = `YYYY-MM-DD` en la zona del cliente. */
export async function getKpisPlantaHoy(hoy: string): Promise<{ recibidoHoyKg: number; tostadoHoyKg: number }> {
  const cafe = (await createClient()).schema("cafe");
  const [lotes, tostiones] = await Promise.all([
    fetchAllPaginado((desde, hasta) => cafe.from("v_lotes").select("id, peso_recibido_kg").eq("fecha_recepcion", hoy).is("anulado_at", null).order("id").range(desde, hasta)),
    fetchAllPaginado((desde, hasta) =>
      cafe.from("procesos").select("id, peso_entrada_kg").eq("tipo", "tostion").eq("fecha", hoy).is("anulado_at", null).order("id").range(desde, hasta),
    ),
  ]);
  const suma = (xs: readonly { [k: string]: unknown }[], k: string) => xs.reduce((a, x) => a + Number(x[k] ?? 0), 0);
  return { recibidoHoyKg: suma(lotes, "peso_recibido_kg"), tostadoHoyKg: suma(tostiones, "peso_entrada_kg") };
}

/** Nombres de los insumos activos por debajo de su mínimo (`v_stock.bajo_minimo`), para el aviso de la cabecera. */
export async function getInsumosBajoMinimo(): Promise<string[]> {
  const stock = await getStock({ tipo: "insumo", soloBajoMinimo: true });
  return stock.map((s) => s.nombre);
}

/** Parámetros y tarifas que el formulario de proceso necesita (una consulta de parámetros por request). */
export async function getConfigPlanta(): Promise<ConfigPlanta> {
  const [capacidad, trilla, tostionBajo, tostionMedio, tostionAlto, tolerancia, vigentes] = await Promise.all([
    getParametro(PARAMETROS_CAFE.capacidadTostadoraKg),
    getParametro(PARAMETROS_CAFE.mermaReferenciaTrillaPct),
    getParametro(PARAMETROS_CAFE.mermaReferenciaTostionBajoPct),
    getParametro(PARAMETROS_CAFE.mermaReferenciaTostionMedioPct),
    getParametro(PARAMETROS_CAFE.mermaReferenciaTostionAltoPct),
    getParametro(PARAMETROS_CAFE.mermaToleranciaPts),
    getTarifasVigentes(),
  ]);
  const tarifa = (concepto: string) => vigentes.find((t) => t.concepto === concepto)?.valor ?? null;
  return {
    capacidadTostadoraKg: capacidad,
    merma: { referenciaTrillaPct: trilla, referenciaTostionPct: { bajo: tostionBajo, medio: tostionMedio, alto: tostionAlto }, toleranciaPts: tolerancia },
    tarifas: { trilla: tarifa("cafe.trilla"), tostion: tarifa("cafe.tostion"), molienda: tarifa("cafe.molienda") },
  };
}

/**
 * Todo lo que necesita el formulario de proceso de un lote: el lote con su estado derivado, sus bultos con los
 * pasos por los que ya pasaron (y cuándo), los procesos ya registrados (vigentes y anulados) y la
 * configuración. `null` si el lote no existe o no es visible para el cliente actual.
 */
export async function getLoteParaProceso(loteId: string): Promise<LoteParaProceso | null> {
  const supabase = await createClient();
  const cafe = supabase.schema("cafe");

  const [lotes, bultos, procesos, vinculos, config] = await Promise.all([
    cafe.from("v_lotes").select(COLUMNAS_COLA).eq("id", loteId).maybeSingle(),
    cafe.from("v_bultos_estado").select("bulto_id, numero, peso_kg, peso_actual_kg, pasos").eq("lote_id", loteId).order("numero"),
    cafe
      .from("procesos")
      .select(
        "id, tipo, fecha, peso_entrada_kg, peso_salida_kg, merma_kg, merma_pct, desvio, merma_referencia_pct, tolerancia_pts, valor, tarifa_kg, nivel_tueste, observaciones, diferencia_kg, diferencia_destino, anulado_at, motivo_anulacion, created_at",
      )
      .eq("lote_id", loteId)
      // Los procesos de una reapertura (CO-33) no son de los bultos del lote: se ven en su propia pantalla.
      .is("reapertura_id", null)
      .order("created_at", { ascending: true }),
    cafe.from("proceso_bultos").select("proceso_id, bulto_id, tipo").eq("lote_id", loteId),
    getConfigPlanta(),
  ]);
  for (const r of [lotes, bultos, procesos, vinculos]) {
    if (r.error) throw new Error(`No se pudo cargar el lote (${r.error.code ?? "sin código"})`);
  }
  const l = lotes.data;
  if (!l) return null;

  // Baches por proceso (solo las tostiones los tienen).
  const idsTostion = (procesos.data ?? []).filter((p) => p.tipo === "tostion").map((p) => p.id);
  const numBaches = new Map<string, number>();
  if (idsTostion.length > 0) {
    const { data, error } = await cafe.from("baches").select("proceso_id").in("proceso_id", idsTostion);
    if (error) throw new Error(`No se pudieron cargar los baches (${error.code ?? "sin código"})`);
    for (const b of data ?? []) numBaches.set(b.proceso_id, (numBaches.get(b.proceso_id) ?? 0) + 1);
  }

  // Líneas de bolsas del empaque (tamaño × unidades): marca propia con su producto; servicios, solo el tamaño.
  const lineasEmpaque = await getLineasEmpaque((procesos.data ?? []).filter((p) => p.tipo === "empaque").map((p) => p.id));

  const procesosPorId = new Map((procesos.data ?? []).map((p) => [p.id, p]));
  const numeroDeBulto = new Map((bultos.data ?? []).map((b) => [b.bulto_id, b.numero]));

  // Qué bultos tiene cada proceso y cuándo pasó cada bulto por cada paso (solo procesos vigentes).
  const bultosDeProceso = new Map<string, string[]>();
  const hechos = new Map<string, BultoPlanta["hechos"]>();
  for (const v of vinculos.data ?? []) {
    bultosDeProceso.set(v.proceso_id, [...(bultosDeProceso.get(v.proceso_id) ?? []), v.bulto_id]);
    const proceso = procesosPorId.get(v.proceso_id);
    if (proceso && proceso.anulado_at === null) {
      const h = hechos.get(v.bulto_id) ?? {};
      h[v.tipo] = { fecha: proceso.fecha, procesoId: v.proceso_id };
      hechos.set(v.bulto_id, h);
    }
  }

  const bultosPlanta: BultoPlanta[] = (bultos.data ?? []).map((b) => ({
    id: b.bulto_id,
    numero: b.numero,
    pesoKg: Number(b.peso_kg),
    pesoActualKg: Number(b.peso_actual_kg ?? b.peso_kg),
    pasos: b.pasos ?? [],
    hechos: hechos.get(b.bulto_id) ?? {},
  }));

  const historial: ProcesoHistorial[] = (procesos.data ?? []).map((p) => {
    const ids = bultosDeProceso.get(p.id) ?? [];
    return {
      id: p.id,
      tipo: p.tipo,
      fecha: p.fecha,
      pesoEntradaKg: Number(p.peso_entrada_kg),
      pesoSalidaKg: Number(p.peso_salida_kg),
      mermaKg: Number(p.merma_kg),
      mermaPct: Number(p.merma_pct),
      desvio: p.desvio ?? false,
      mermaReferenciaPct: p.merma_referencia_pct === null ? null : Number(p.merma_referencia_pct),
      toleranciaPts: p.tolerancia_pts === null ? null : Number(p.tolerancia_pts),
      valor: Number(p.valor),
      tarifaKg: Number(p.tarifa_kg),
      nivelTueste: p.nivel_tueste,
      observaciones: p.observaciones,
      numBaches: numBaches.get(p.id) ?? 0,
      lineasEmpaque: lineasEmpaque.get(p.id) ?? [],
      diferenciaKg: p.tipo === "empaque" && p.diferencia_kg !== null ? Number(p.diferencia_kg) : null,
      // Lo guarda la base con un CHECK (suelto | granel | muestra | perdida).
      diferenciaDestino: p.diferencia_destino as DestinoDiferencia | null,
      bultos: ids.map((id) => numeroDeBulto.get(id) ?? 0).sort((a, b) => a - b),
      bultoIds: ids,
      anulado: p.anulado_at !== null,
      motivoAnulacion: p.motivo_anulacion,
      createdAt: p.created_at,
    };
  });

  return {
    lote: {
      id: l.id as string,
      codigo: l.codigo as string,
      linea: l.linea,
      tercero: l.tercero_nombre ?? "—",
      tipoCafe: l.tipo_cafe_nombre,
      fechaRecepcion: l.fecha_recepcion as string,
      pesoRecibidoKg: Number(l.peso_recibido_kg),
      pesoActualKg: Number(l.peso_actual_kg ?? l.peso_recibido_kg),
      numBultos: l.num_bultos as number,
      servicios: l.servicios,
      serviciosRequeridos: l.servicios_requeridos ?? [],
      nivelTueste: l.nivel_tueste,
      perfilTempC: l.perfil_temp_c,
      perfilTiempoMin: l.perfil_tiempo_min,
      alertasCalidad: (l.alertas_calidad ?? []) as AlertaCalidad[], // CHECK de la columna
      estado: l.estado as EstadoLote,
      avanceTexto: l.avance_texto ?? "",
      anulado: l.anulado_at !== null,
    },
    bultos: bultosPlanta,
    procesos: historial,
    config,
  };
}

/**
 * Peso que puede entrar a `tipo` con esos bultos (`cafe.peso_disponible`): la suma de los bultos si es el
 * primer paso, o, bulto a bulto, la parte de la SALIDA del paso previo que le toca (HU-03 c5: el operario no
 * vuelve a pesar). `data` es `null` cuando no se puede calcular (sin bultos, uno ajeno o sin el paso previo).
 */
export async function getPesoDisponible(
  loteId: string,
  tipo: TipoProceso,
  bultoIds: readonly string[],
): Promise<Result<number | null>> {
  return callRpc<"cafe", "peso_disponible", number | null>("cafe", "peso_disponible", {
    p_lote: loteId,
    p_tipo: tipo,
    p_bultos: [...bultoIds],
  });
}
