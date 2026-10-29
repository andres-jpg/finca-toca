import { createClient } from "@/lib/supabase/server";
import { fetchAllPaginado } from "@/modules/core/export/lib/paginar";
import { getParametro } from "@/modules/core/parametros/queries/parametros.queries";
import { callRpc, type Result } from "@/modules/core/rpc/call-rpc";
import { getTarifasVigentes } from "@/modules/core/tarifas/queries/tarifas.queries";
import { PARAMETROS_CAFE } from "../../parametros";
import { getLineasEmpaque } from "../../empaque/queries/empaque.queries";
import type { TipoProceso } from "../../lotes/types";
import { siguientePaso } from "../lib/pasos";
import type { AlertaCalidad } from "../../recepciones/lib/calidad";
import type { EstadoLote } from "../types";
import type { BultoPlanta, ConfigPlanta, LoteParaProceso, ProcesoHistorial, TarjetaLotePlanta } from "../types-planta";

// Módulo plano (no "use server"): solo lo llama código de servidor. La autorización es el RLS (vistas
// `security_invoker`): sin el módulo `cafe.procesos`, o sin membresía en el cliente actual, todo sale vacío.
// Nada de estados guardados: el estado y el avance de cada lote salen de `cafe.v_lotes` / `v_lote_etapas`.

/** Estados con trabajo pendiente en la planta. `listo`, `entregado` y `anulado` ya no tienen cola. */
const ESTADOS_PENDIENTES = ["recibido", "en_proceso", "parcial"];

const COLUMNAS_COLA =
  "id, codigo, linea, tercero_nombre, tipo_cafe_nombre, fecha_recepcion, peso_recibido_kg, peso_actual_kg, num_bultos, nivel_tueste, alertas_calidad, tiene_desvio, estado, avance_texto, servicios_requeridos, servicios, anulado_at";

/** Trozos de `n` para no pasar de la longitud de URL de PostgREST con `.in()` sobre muchos ids. */
function trozos<T>(lista: readonly T[], n: number): T[][] {
  const resultado: T[][] = [];
  for (let i = 0; i < lista.length; i += n) resultado.push(lista.slice(i, i + n));
  return resultado;
}

/**
 * La cola de trabajo: los lotes con pasos pendientes (`recibido`, `en_proceso`, `parcial`), el más antiguo
 * primero, cada uno con su SIGUIENTE paso («Tostión · 4 de 6 bultos pendientes»). Un lote desaparece solo
 * cuando la base lo da por `listo`; el avance se deriva de `v_lote_etapas`, nunca se guarda.
 */
export async function getColaPlanta(): Promise<TarjetaLotePlanta[]> {
  const supabase = await createClient();
  const cafe = supabase.schema("cafe");

  const lotes = await fetchAllPaginado((desde, hasta) =>
    cafe
      .from("v_lotes")
      .select(COLUMNAS_COLA)
      .in("estado", ESTADOS_PENDIENTES)
      .order("fecha_recepcion", { ascending: true })
      .order("codigo", { ascending: true })
      .range(desde, hasta),
  );
  if (lotes.length === 0) return [];

  // Bultos que ya pasaron por cada paso, por lote.
  const respuestas = await Promise.all(
    trozos(
      lotes.map((l) => l.id as string),
      100,
    ).map((ids) => cafe.from("v_lote_etapas").select("lote_id, tipo, bultos_procesados").in("lote_id", ids)),
  );
  const procesados = new Map<string, Partial<Record<TipoProceso, number>>>();
  for (const { data, error } of respuestas) {
    if (error) throw new Error(`No se pudo leer el avance de los lotes (${error.code ?? "sin código"})`);
    for (const e of data ?? []) {
      const lote = procesados.get(e.lote_id) ?? {};
      lote[e.tipo] = e.bultos_procesados ?? 0;
      procesados.set(e.lote_id, lote);
    }
  }

  return lotes.map((l) => ({
    id: l.id as string,
    codigo: l.codigo as string,
    linea: l.linea,
    tercero: l.tercero_nombre ?? "—",
    tipoCafe: l.tipo_cafe_nombre,
    fechaRecepcion: l.fecha_recepcion as string,
    pesoRecibidoKg: Number(l.peso_recibido_kg),
    pesoActualKg: Number(l.peso_actual_kg ?? l.peso_recibido_kg),
    numBultos: l.num_bultos as number,
    nivelTueste: l.nivel_tueste,
    alertasCalidad: (l.alertas_calidad ?? []) as AlertaCalidad[], // CHECK de la columna
    tieneDesvio: l.tiene_desvio ?? false,
    estado: l.estado as EstadoLote, // vista: solo estos valores
    avanceTexto: l.avance_texto ?? "",
    siguiente: siguientePaso(l.servicios_requeridos ?? [], l.num_bultos as number, procesados.get(l.id as string) ?? {}),
  }));
}

/** Parámetros y tarifas que el formulario de proceso necesita (una consulta de parámetros por request). */
export async function getConfigPlanta(): Promise<ConfigPlanta> {
  const [capacidad, trilla, tostion, tolerancia, vigentes] = await Promise.all([
    getParametro(PARAMETROS_CAFE.capacidadTostadoraKg),
    getParametro(PARAMETROS_CAFE.mermaReferenciaTrillaPct),
    getParametro(PARAMETROS_CAFE.mermaReferenciaTostionPct),
    getParametro(PARAMETROS_CAFE.mermaToleranciaPts),
    getTarifasVigentes(),
  ]);
  const tarifa = (concepto: string) => vigentes.find((t) => t.concepto === concepto)?.valor ?? null;
  return {
    capacidadTostadoraKg: capacidad,
    merma: { referenciaTrillaPct: trilla, referenciaTostionPct: tostion, toleranciaPts: tolerancia },
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
        "id, tipo, fecha, peso_entrada_kg, peso_salida_kg, merma_kg, merma_pct, desvio, valor, tarifa_kg, nivel_tueste, observaciones, anulado_at, motivo_anulacion, created_at",
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

  // Presentaciones empacadas (el empaque de marca propia mueve inventario; el de maquila no tiene líneas).
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
      valor: Number(p.valor),
      tarifaKg: Number(p.tarifa_kg),
      nivelTueste: p.nivel_tueste,
      observaciones: p.observaciones,
      numBaches: numBaches.get(p.id) ?? 0,
      lineasEmpaque: lineasEmpaque.get(p.id) ?? [],
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
