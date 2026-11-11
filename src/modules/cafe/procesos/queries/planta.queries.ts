import { createClient } from "@/lib/supabase/server";
import { fetchAllPaginado } from "@/modules/core/export/lib/paginar";
import { getParametro } from "@/modules/core/parametros/queries/parametros.queries";
import { callRpc, type Result } from "@/modules/core/rpc/call-rpc";
import { getTarifasVigentes } from "@/modules/core/tarifas/queries/tarifas.queries";
import { PARAMETROS_CAFE } from "../../parametros";
import type { DestinoDiferencia } from "../../empaque/lib/empaque";
import { getLineasEmpaque } from "../../empaque/queries/empaque.queries";
import type { TipoProceso } from "../../lotes/types";
import { kgPorEtapa } from "../lib/cola";
import type { ModoMolienda } from "../lib/molienda";
import { evaluarPasos, siguientePaso, type EtapaKg, type OrigenPlanta } from "../lib/pasos";
import type { AlertaCalidad } from "../../recepciones/lib/calidad";
import type { EstadoLote } from "../types";
import type { ConfigPlanta, LoteParaProceso, ProcesoHistorial, TarjetaLotePlanta } from "../types-planta";

// Módulo plano (no "use server"): solo lo llama código de servidor. La autorización es el RLS (vistas
// `security_invoker`): sin el módulo `cafe.procesos`, o sin membresía en el cliente actual, todo sale vacío.
// Nada de estados guardados: el estado y el avance de cada lote salen de `cafe.v_lotes` / `v_lote_etapas`, y el saldo por kilos
// de `cafe.v_origenes_disponibles` (ADR 0002: sin bultos).

/**
 * Estados con trabajo pendiente en la planta. Un lote de SERVICIO `listo` (todo procesado, sin remisión) sigue
 * en el tablero, en «Por entregar», hasta que se entrega (`entregado`); el de marca propia `listo` ya no tiene cola.
 */
const FILTRO_TABLERO = "estado.in.(recibido,en_proceso,parcial),and(estado.eq.listo,linea.eq.servicio)";

const COLUMNAS_COLA =
  "id, codigo, linea, tercero_nombre, tipo_cafe_nombre, fecha_recepcion, created_at, peso_recibido_kg, peso_actual_kg, tipo_cafe_id, nivel_tueste, perfil_temp_c, perfil_tiempo_min, alertas_calidad, tiene_desvio, estado, avance_texto, servicios_requeridos, servicios, anulado_at";

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

  // Saldo por origen y etapas en kilos, por lote.
  const origenesPorLote = await cargarOrigenes(supabase, ids);
  const etapasPorLote = new Map<string, EtapaKg[]>();
  const completosPorLote = new Map<string, Partial<Record<TipoProceso, boolean>>>();
  for (const grupo of trozos(ids, 50)) {
    const filas = await fetchAllPaginado((desde, hasta) =>
      cafe.from("v_lote_etapas").select("lote_id, tipo, kg_base, kg_pendientes, completo").in("lote_id", grupo).order("lote_id").order("tipo").range(desde, hasta),
    );
    for (const e of filas) {
      const id = e.lote_id as string;
      etapasPorLote.set(id, [...(etapasPorLote.get(id) ?? []), { tipo: e.tipo as TipoProceso, kgBase: Number(e.kg_base ?? 0), kgPendientes: Number(e.kg_pendientes ?? 0) }]);
      completosPorLote.set(id, { ...(completosPorLote.get(id) ?? {}), [e.tipo as TipoProceso]: e.completo === true });
    }
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
    const pesoRecibidoKg = Number(l.peso_recibido_kg);
    const evaluaciones = evaluarPasos({ linea: l.linea, servicios: (l.servicios ?? []) as TipoProceso[] }, origenesPorLote.get(id) ?? []);
    return {
      id,
      codigo: l.codigo as string,
      linea: l.linea,
      tercero: l.tercero_nombre ?? "—",
      tipoCafe: l.tipo_cafe_nombre,
      fechaRecepcion: l.fecha_recepcion as string,
      llegadaEn: l.created_at as string,
      pesoRecibidoKg,
      pesoActualKg: Number(l.peso_actual_kg ?? l.peso_recibido_kg),
      nivelTueste: l.nivel_tueste,
      perfilTempC: l.perfil_temp_c,
      perfilTiempoMin: l.perfil_tiempo_min,
      alertasCalidad: (l.alertas_calidad ?? []) as AlertaCalidad[], // CHECK de la columna
      tieneDesvio: l.tiene_desvio ?? false,
      estado: l.estado as EstadoLote, // vista: solo estos valores
      avanceTexto: l.avance_texto ?? "",
      siguiente: siguientePaso(requeridos, etapasPorLote.get(id) ?? [], pesoRecibidoKg),
      serviciosRequeridos: requeridos,
      completos: completosPorLote.get(id) ?? {},
      kgPorEtapa: kgPorEtapa(evaluaciones),
      listoDesde: listoDesde.get(id) ?? null,
    };
  });
}

/**
 * Saldo por origen de los lotes (`v_origenes_disponibles`) con la fecha de cada proceso de origen y si la tostión ya tiene
 * su molienda. Una sola fuente del saldo: nadie repite la cuenta.
 */
export async function cargarOrigenes(supabase: Awaited<ReturnType<typeof createClient>>, loteIds: readonly string[]): Promise<Map<string, OrigenPlanta[]>> {
  const cafe = supabase.schema("cafe");
  const resultado = new Map<string, OrigenPlanta[]>();
  for (const grupo of trozos(loteIds, 50)) {
    const [origenes, procesos] = await Promise.all([
      fetchAllPaginado((desde, hasta) =>
        cafe.from("v_origenes_disponibles").select("lote_id, proceso_id, tipo, base_kg, consumido_kg, saldo_kg, estimado").in("lote_id", grupo).order("lote_id").order("proceso_id", { nullsFirst: true }).range(desde, hasta),
      ),
      fetchAllPaginado((desde, hasta) =>
        cafe.from("procesos").select("id, lote_id, tipo, fecha, origen_proceso_id, molienda_modo, molienda_kg").in("lote_id", grupo).is("anulado_at", null).is("reapertura_id", null).order("id").range(desde, hasta),
      ),
    ]);
    const fechaDe = new Map(procesos.map((p) => [p.id as string, p.fecha as string]));
    const moliendaDe = new Map(procesos.map((p) => [p.id as string, { modo: (p.molienda_modo as ModoMolienda | null) ?? null, kg: p.molienda_kg === null ? null : Number(p.molienda_kg) }]));
    const conMolienda = new Set(procesos.filter((p) => p.tipo === "molienda" && p.origen_proceso_id).map((p) => p.origen_proceso_id as string));
    for (const o of origenes) {
      const id = o.lote_id as string;
      const procesoId = (o.proceso_id as string | null) ?? null;
      resultado.set(id, [
        ...(resultado.get(id) ?? []),
        {
          procesoId,
          tipo: (o.tipo as TipoProceso | null) ?? null,
          fecha: procesoId ? (fechaDe.get(procesoId) ?? null) : null,
          baseKg: Number(o.base_kg ?? 0),
          consumidoKg: Number(o.consumido_kg ?? 0),
          saldoKg: Number(o.saldo_kg ?? 0),
          estimado: o.estimado === true,
          conMolienda: procesoId ? conMolienda.has(procesoId) : false,
          moliendaModo: procesoId ? (moliendaDe.get(procesoId)?.modo ?? null) : null,
          moliendaKg: procesoId ? (moliendaDe.get(procesoId)?.kg ?? null) : null,
        },
      ]);
    }
  }
  return resultado;
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

  const [lotes, procesos, config, perfilesLote, solicitada] = await Promise.all([
    cafe.from("v_lotes").select(COLUMNAS_COLA).eq("id", loteId).maybeSingle(),
    cafe
      .from("procesos")
      .select(
        "id, tipo, fecha, peso_entrada_kg, peso_salida_kg, merma_kg, merma_pct, desvio, merma_referencia_pct, tolerancia_pts, valor, tarifa_kg, nivel_tueste, observaciones, diferencia_kg, diferencia_destino, origen_proceso_id, molienda_modo, molienda_kg, anulado_at, motivo_anulacion, created_at",
      )
      .eq("lote_id", loteId)
      // Los procesos de una reapertura (CO-33) no son de los bultos del lote: se ven en su propia pantalla.
      .is("reapertura_id", null)
      .order("created_at", { ascending: true }),
    getConfigPlanta(),
    cafe.from("lote_perfil_tostion").select("orden, nivel, temp_c, tiempo_min, kg").eq("lote_id", loteId).order("orden", { ascending: true }),
    cafe.from("lotes").select("molienda_solicitada_modo, molienda_solicitada_kg").eq("id", loteId).maybeSingle(),
  ]);
  for (const r of [lotes, procesos, perfilesLote, solicitada]) {
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

  const origenes = (await cargarOrigenes(supabase, [loteId])).get(loteId) ?? [];
  const { data: etapasData, error: errorEtapas } = await cafe.from("v_lote_etapas").select("tipo, kg_base, kg_pendientes").eq("lote_id", loteId);
  if (errorEtapas) throw new Error(`No se pudo cargar el avance del lote (${errorEtapas.code ?? "sin código"})`);
  const etapas: EtapaKg[] = (etapasData ?? []).map((e) => ({ tipo: e.tipo as TipoProceso, kgBase: Number(e.kg_base ?? 0), kgPendientes: Number(e.kg_pendientes ?? 0) }));

  const historial: ProcesoHistorial[] = (procesos.data ?? []).map((p) => {
    return {
      id: p.id,
      tipo: p.tipo,
      fecha: p.fecha,
      pesoEntradaKg: Number(p.peso_entrada_kg),
      pesoSalidaKg: p.peso_salida_kg === null ? null : Number(p.peso_salida_kg),
      // Solo trilla y tostión (con su salida) tienen merma; molienda y empaque no.
      mermaKg: p.merma_kg === null || (p.tipo !== "trilla" && p.tipo !== "tostion") ? null : Number(p.merma_kg),
      mermaPct: p.merma_pct === null || (p.tipo !== "trilla" && p.tipo !== "tostion") ? null : Number(p.merma_pct),
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
      origenProcesoId: p.origen_proceso_id,
      moliendaModo: (p.molienda_modo as ModoMolienda | null) ?? null,
      moliendaKg: p.molienda_kg === null ? null : Number(p.molienda_kg),
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
      tipoCafeId: l.tipo_cafe_id,
      fechaRecepcion: l.fecha_recepcion as string,
      pesoRecibidoKg: Number(l.peso_recibido_kg),
      pesoActualKg: Number(l.peso_actual_kg ?? l.peso_recibido_kg),
      servicios: l.servicios,
      serviciosRequeridos: l.servicios_requeridos ?? [],
      nivelTueste: l.nivel_tueste,
      perfilTempC: l.perfil_temp_c,
      perfilTiempoMin: l.perfil_tiempo_min,
      perfiles: (perfilesLote.data ?? []).map((p) => ({
        orden: p.orden,
        nivel: p.nivel,
        tempC: p.temp_c === null ? null : Number(p.temp_c),
        tiempoMin: p.tiempo_min === null ? null : Number(p.tiempo_min),
        kg: Number(p.kg),
      })),
      alertasCalidad: (l.alertas_calidad ?? []) as AlertaCalidad[], // CHECK de la columna
      estado: l.estado as EstadoLote,
      avanceTexto: l.avance_texto ?? "",
      anulado: l.anulado_at !== null,
      moliendaSolicitada: {
        modo: (solicitada.data?.molienda_solicitada_modo as ModoMolienda | null) ?? null,
        kg: solicitada.data?.molienda_solicitada_kg == null ? null : Number(solicitada.data.molienda_solicitada_kg),
      },
    },
    origenes,
    etapas,
    procesos: historial,
    config,
  };
}

/**
 * Kilos que puede procesar `tipo` ahora (`cafe.peso_disponible`): Σ saldo de los orígenes de su paso de origen (la raíz si es el
 * primer paso). `data` es `null` cuando no se puede calcular (el paso previo aún no se ha registrado).
 */
export async function getPesoDisponible(loteId: string, tipo: TipoProceso): Promise<Result<number | null>> {
  return callRpc<"cafe", "peso_disponible", number | null>("cafe", "peso_disponible", { p_lote: loteId, p_tipo: tipo });
}
