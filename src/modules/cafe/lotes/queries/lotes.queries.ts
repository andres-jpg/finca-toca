import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { getLineasEmpaque } from "../../empaque/queries/empaque.queries";
import type { EtapaAvance } from "../lib/avance";
import { mermaProcesada, type EtapaLote, type MermaProcesada } from "../lib/etapas";
import { aplicarFiltrosLotes, LOTES_POR_PAGINA, type FiltrosLotes } from "../lib/filtros";
import {
  construirLineaDeTiempo,
  type BacheLinea,
  type EventoLinea,
  type MovimientoLinea,
  type ProcesoLinea,
  type ReaperturaLinea,
  type RemisionLinea,
} from "../lib/linea-tiempo";
import type { LineaLote, NivelTueste, TipoProceso } from "../types";

// Módulo plano (no "use server"): solo lo llama código de servidor. La autorización es el RLS: las vistas son
// `security_invoker`, así que sin el módulo `cafe.recepcion` activo, o sin membresía en el cliente actual, todo sale
// vacío. Los nombres de tercero y de tipo de café vienen ya resueltos en `cafe.v_lotes`.

const num = (n: number | null | undefined): number => (n === null || n === undefined ? 0 : Number(n));

/** Una fila del listado: lo necesario para reconocer el lote, su estado y su avance. */
export interface LoteListado {
  id: string;
  codigo: string;
  linea: LineaLote;
  servicios: TipoProceso[];
  serviciosRequeridos: TipoProceso[];
  serviciosCompletados: number;
  /** «2 de 3», tal como lo deriva la vista. */
  avanceTexto: string | null;
  /** Derivado de los procesos (`v_lotes.estado`); nunca guardado. */
  estado: string;
  terceroId: string;
  /** Proveedor (marca propia) o cliente (servicio); «—» si el cliente no tiene `core.terceros` y no se puede leer. */
  tercero: string;
  tipoCafe: string | null;
  /** `YYYY-MM-DD`. */
  fechaRecepcion: string;
  /** Instante de registro (`created_at`): la hora de llegada. */
  llegadaEn: string;
  pesoRecibidoKg: number;
  pesoActualKg: number;
  mermaTotalKg: number;
  alertasCalidad: string[];
  tieneDesvio: boolean;
  etapas: EtapaAvance[];
  /** Merma solo sobre lo procesado (A-03); `null` si aún no hay procesos. */
  mermaProcesada: MermaProcesada | null;
}

export interface PaginaLotes {
  filas: LoteListado[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
}

const COLUMNAS_LISTADO =
  "id, codigo, linea, servicios, servicios_requeridos, servicios_completados, avance_texto, estado, tercero_id, tercero_nombre, tipo_cafe_nombre, fecha_recepcion, created_at, peso_recibido_kg, peso_actual_kg, merma_total_kg, alertas_calidad, tiene_desvio";

/**
 * Una página del listado de lotes con los filtros de la URL. Orden: línea (marca propia primero, así la pestaña
 * «Todos» agrupa por línea sin que la paginación las mezcle), fecha de recepción descendente y creación
 * descendente. Pagina con `.range()` (tope de 1000 filas de PostgREST). Las etapas de los lotes de la página se
 * traen en una segunda consulta (una por todas) para la barra de avance.
 */
export async function listarLotes(filtros: FiltrosLotes): Promise<PaginaLotes> {
  const supabase = await createClient();
  const desde = (filtros.pagina - 1) * LOTES_POR_PAGINA;

  const { data, count, error } = await aplicarFiltrosLotes(
    supabase.schema("cafe").from("v_lotes").select(COLUMNAS_LISTADO, { count: "exact" }),
    filtros,
  )
    .order("linea", { ascending: true })
    .order("fecha_recepcion", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(desde, desde + LOTES_POR_PAGINA - 1);

  // Una página más allá del final (URL vieja) da 416 / PGRST103: se devuelve vacía pero con el total correcto.
  if (error && error.code === "PGRST103") {
    const { count: total, error: errorTotal } = await aplicarFiltrosLotes(
      supabase.schema("cafe").from("v_lotes").select("id", { count: "exact", head: true }),
      filtros,
    );
    if (errorTotal) throw new Error("No se pudieron cargar los lotes");
    return paginar([], total ?? 0, filtros.pagina);
  }
  if (error) throw new Error("No se pudieron cargar los lotes");
  if (!data || data.length === 0) return paginar([], count ?? 0, filtros.pagina);

  const { data: etapas, error: errorEtapas } = await supabase
    .schema("cafe")
    .from("v_lote_etapas")
    .select("lote_id, tipo, kg_base, kg_procesados, kg_pendientes, completo, parcial, peso_entrada, merma_kg")
    .in("lote_id", data.map((l) => l.id));
  if (errorEtapas) throw new Error("No se pudo cargar el avance de los lotes");

  const porLote = new Map<string, EtapaAvance[]>();
  const pesosPorLote = new Map<string, { tipo: TipoProceso; pesoEntradaKg: number; mermaKg: number | null }[]>();
  for (const e of etapas ?? []) {
    const pesos = pesosPorLote.get(e.lote_id) ?? [];
    pesos.push({ tipo: e.tipo, pesoEntradaKg: num(e.peso_entrada), mermaKg: e.merma_kg === null ? null : num(e.merma_kg) });
    pesosPorLote.set(e.lote_id, pesos);
    const lista = porLote.get(e.lote_id) ?? [];
    lista.push({
      tipo: e.tipo,
      kgBase: num(e.kg_base),
      kgProcesados: num(e.kg_procesados),
      kgPendientes: num(e.kg_pendientes),
      completo: e.completo === true,
      parcial: e.parcial === true,
    });
    porLote.set(e.lote_id, lista);
  }

  const filas = data.map(
    (l): LoteListado => ({
      id: l.id,
      codigo: l.codigo,
      linea: l.linea,
      servicios: l.servicios,
      serviciosRequeridos: l.servicios_requeridos ?? [],
      serviciosCompletados: num(l.servicios_completados),
      avanceTexto: l.avance_texto,
      estado: l.estado ?? "recibido",
      terceroId: l.tercero_id,
      tercero: l.tercero_nombre ?? "—",
      tipoCafe: l.tipo_cafe_nombre,
      fechaRecepcion: l.fecha_recepcion,
      llegadaEn: l.created_at,
      pesoRecibidoKg: num(l.peso_recibido_kg),
      pesoActualKg: num(l.peso_actual_kg),
      mermaTotalKg: num(l.merma_total_kg),
      alertasCalidad: l.alertas_calidad,
      tieneDesvio: l.tiene_desvio === true,
      etapas: porLote.get(l.id) ?? [],
      mermaProcesada: mermaProcesada(pesosPorLote.get(l.id) ?? []),
    }),
  );
  return paginar(filas, count ?? filas.length, filtros.pagina);
}

function paginar(filas: LoteListado[], total: number, pagina: number): PaginaLotes {
  return { filas, total, pagina, porPagina: LOTES_POR_PAGINA, totalPaginas: Math.max(1, Math.ceil(total / LOTES_POR_PAGINA)) };
}

/** Un lote con todo lo de la cabecera de la ficha. Los números llegan ya como `number` (nunca `null`). */
export interface LoteFicha {
  id: string;
  codigo: string;
  linea: LineaLote;
  terceroId: string;
  tercero: string | null;
  terceroIdentificacion: string | null;
  tipoCafe: string | null;
  fechaRecepcion: string;
  pesoRecibidoKg: number;
  /** Hay tostiones sin empaque: el peso actual incluye un estimado. */
  pesoActualEstimado: boolean;
  humedadPct: number | null;
  densidad: number | null;
  alertasCalidad: string[];
  /** Rangos de calidad vigentes al guardar (snapshot): `{ humedad?: {min,max}, densidad?: {min,max} }`. */
  rangosCalidad: Json | null;
  servicios: TipoProceso[];
  serviciosRequeridos: TipoProceso[];
  serviciosCompletados: number;
  avanceTexto: string | null;
  nivelTueste: NivelTueste | null;
  /** Perfil de tueste guardado al recibir (snapshot, B-18): temperatura y tiempo; `null` si no se pidieron. */
  perfilTempC: number | null;
  perfilTiempoMin: number | null;
  precioCompraKg: number | null;
  valorCompra: number | null;
  facturaProveedor: string | null;
  observaciones: string | null;
  estado: string;
  pesoActualKg: number;
  mermaTotalKg: number;
  valorServicios: number;
  tieneDesvio: boolean;
  anulacion: { en: string; por: string | null; motivo: string } | null;
  creadoEn: string;
  creadoPor: string | null;
}

/** El lote de la ficha (`null` si no existe o no es de este cliente: el RLS lo esconde igual). */
export const getLote = cache(async (id: string): Promise<LoteFicha | null> => {
  const supabase = await createClient();
  const { data: l, error } = await supabase.schema("cafe").from("v_lotes").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("No se pudo cargar el lote");
  if (!l) return null;
  return {
    id: l.id,
    codigo: l.codigo,
    linea: l.linea,
    terceroId: l.tercero_id,
    tercero: l.tercero_nombre,
    terceroIdentificacion: l.tercero_identificacion,
    tipoCafe: l.tipo_cafe_nombre,
    fechaRecepcion: l.fecha_recepcion,
    pesoRecibidoKg: num(l.peso_recibido_kg),
    pesoActualEstimado: l.peso_actual_estimado === true,
    humedadPct: l.humedad_pct,
    densidad: l.densidad,
    alertasCalidad: l.alertas_calidad,
    rangosCalidad: l.rangos_calidad,
    servicios: l.servicios,
    serviciosRequeridos: l.servicios_requeridos ?? [],
    serviciosCompletados: num(l.servicios_completados),
    avanceTexto: l.avance_texto,
    nivelTueste: l.nivel_tueste,
    perfilTempC: l.perfil_temp_c === null ? null : Number(l.perfil_temp_c),
    perfilTiempoMin: l.perfil_tiempo_min === null ? null : Number(l.perfil_tiempo_min),
    precioCompraKg: l.precio_compra_kg,
    valorCompra: l.valor_compra,
    facturaProveedor: l.factura_proveedor,
    observaciones: l.observaciones,
    estado: l.estado ?? "recibido",
    pesoActualKg: num(l.peso_actual_kg),
    mermaTotalKg: num(l.merma_total_kg),
    valorServicios: num(l.valor_servicios),
    tieneDesvio: l.tiene_desvio === true,
    anulacion: l.anulado_at ? { en: l.anulado_at, por: l.anulado_por, motivo: l.motivo_anulacion ?? "" } : null,
    creadoEn: l.created_at,
    creadoPor: l.created_by,
  };
});

/** Resumen por etapa (`v_lote_etapas`): una fila por paso con al menos un proceso vigente, sin ordenar. */
export async function getEtapas(loteId: string): Promise<EtapaLote[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("cafe").from("v_lote_etapas").select("*").eq("lote_id", loteId);
  if (error) throw new Error("No se pudieron cargar las etapas del lote");
  return (data ?? []).map((e) => ({
    tipo: e.tipo,
    kgBase: num(e.kg_base),
    kgProcesados: num(e.kg_procesados),
    kgPendientes: num(e.kg_pendientes),
    completo: e.completo === true,
    parcial: e.parcial === true,
    pesoEntradaKg: num(e.peso_entrada),
    pesoSalidaKg: e.peso_salida === null ? null : num(e.peso_salida),
    mermaKg: e.merma_kg === null ? null : num(e.merma_kg),
    valor: num(e.valor),
    desvios: num(e.desvios),
    numProcesos: num(e.num_procesos),
  }));
}

/** Saldo por origen (`v_origenes_disponibles`): lo que queda de cada paso del lote, en kilos (sin bultos: ADR 0002). */
export interface OrigenFicha {
  tipo: TipoProceso | null;
  saldoKg: number;
  estimado: boolean;
}

export async function getOrigenes(loteId: string): Promise<OrigenFicha[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("cafe")
    .from("v_origenes_disponibles")
    .select("tipo, saldo_kg, estimado")
    .eq("lote_id", loteId);
  if (error) throw new Error("No se pudo cargar el saldo del lote");
  return (data ?? []).map((o) => ({ tipo: o.tipo, saldoKg: num(o.saldo_kg), estimado: o.estimado === true }));
}

/**
 * Email de quienes registraron el lote o sus procesos (RPC `cafe.responsables_lote`, que solo expone a miembros del
 * cliente). Es un dato accesorio: si falla, la ficha se muestra sin nombres en vez de caerse.
 */
export async function getResponsables(loteId: string): Promise<Map<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("cafe").rpc("responsables_lote", { p_lote: loteId });
  if (error || !data) return new Map();
  return new Map(data.filter((r) => r.email).map((r) => [r.user_id, r.email]));
}

/**
 * La historia completa del lote, ordenada: recepción → procesos (con baches) → movimientos de inventario
 * con `ref_tipo = 'cafe.lote'` → remisiones de entrega → anulación. `usuarios` (id → email) viene de `getResponsables()`.
 * Las remisiones (CO-32) y las reaperturas (CO-33) las lee quien llama (`remisiones/`, `reapertura/`) y llegan ya como
 * eventos: así `lotes` no depende de esos módulos. El movimiento de inventario de una reapertura NO sale como evento
 * suelto de «Inventario»: ya lo cuenta su evento de reapertura.
 */
export async function getTimeline(
  lote: LoteFicha,
  usuarios: ReadonlyMap<string, string>,
  remisiones: readonly RemisionLinea[] = [],
  reaperturas: readonly ReaperturaLinea[] = [],
): Promise<EventoLinea[]> {
  const supabase = await createClient();
  const cafe = supabase.schema("cafe");

  const [procesosRes, movimientosRes] = await Promise.all([
    cafe
      .from("procesos")
      .select(
        "id, tipo, fecha, created_at, created_by, peso_entrada_kg, peso_salida_kg, merma_kg, tarifa_kg, valor, merma_referencia_pct, tolerancia_pts, desvio, nivel_tueste, observaciones, diferencia_kg, diferencia_destino, anulado_at, anulado_por, motivo_anulacion, reapertura_id, origen_proceso_id",
      )
      .eq("lote_id", lote.id),
    supabase
      .from("movimientos_inventario")
      .select("id, articulo_id, fecha, cantidad, motivo, observaciones, created_at, created_by")
      .eq("ref_tipo", "cafe.lote")
      .eq("ref_id", lote.id)
      .neq("motivo", "reapertura"),
  ]);
  if (procesosRes.error) throw new Error("No se pudieron cargar los procesos del lote");
  if (movimientosRes.error) throw new Error("No se pudieron cargar los movimientos del lote");

  const procesos = procesosRes.data ?? [];
  const movimientos = movimientosRes.data ?? [];

  const [bachesRes, articulosRes] = await Promise.all([
    procesos.length > 0
      ? cafe
          .from("baches")
          .select("proceso_id, numero, peso_entrada_kg, temperatura_c, tiempo_min, nivel_tueste, observaciones")
          .in("proceso_id", procesos.map((p) => p.id))
          .order("numero", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    movimientos.length > 0
      ? supabase.from("articulos").select("id, nombre").in("id", [...new Set(movimientos.map((m) => m.articulo_id))])
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (bachesRes.error) throw new Error("No se pudieron cargar los baches");
  if (articulosRes.error) throw new Error("No se pudieron cargar los artículos de los movimientos");

  const bachesDe = new Map<string, BacheLinea[]>();
  for (const b of bachesRes.data ?? []) {
    const entrada = num(b.peso_entrada_kg);
    bachesDe.set(b.proceso_id, [
      ...(bachesDe.get(b.proceso_id) ?? []),
      {
        numero: b.numero,
        pesoEntradaKg: entrada,
        temperaturaC: b.temperatura_c,
        tiempoMin: b.tiempo_min,
        nivelTueste: b.nivel_tueste,
        observaciones: b.observaciones,
      },
    ]);
  }
  const nombreArticulo = new Map((articulosRes.data ?? []).map((a) => [a.id, a.nombre]));
  // Presentaciones empacadas por el empaque de marca propia (CO-30): salen en el propio evento del proceso.
  const lineasEmpaque = await getLineasEmpaque(procesos.filter((p) => p.tipo === "empaque").map((p) => p.id));
  const quien = (id: string | null) => (id ? (usuarios.get(id) ?? null) : null);

  const procesosLinea = procesos.map(
    (p): ProcesoLinea => ({
      id: p.id,
      tipo: p.tipo,
      fecha: p.fecha,
      creadoEn: p.created_at,
      creadoPor: quien(p.created_by),
      pesoEntradaKg: num(p.peso_entrada_kg),
      pesoSalidaKg: p.peso_salida_kg === null ? null : num(p.peso_salida_kg),
      mermaKg: p.merma_kg === null || (p.tipo !== "trilla" && p.tipo !== "tostion") ? null : num(p.merma_kg),
      tarifaKg: num(p.tarifa_kg),
      valor: num(p.valor),
      mermaReferenciaPct: p.merma_referencia_pct,
      toleranciaPts: p.tolerancia_pts,
      desvio: p.desvio === true,
      nivelTueste: p.nivel_tueste,
      observaciones: p.observaciones,
      baches: bachesDe.get(p.id) ?? [],
      lineasEmpaque: lineasEmpaque.get(p.id) ?? [],
      diferenciaKg: p.tipo === "empaque" && p.diferencia_kg !== null ? num(p.diferencia_kg) : null,
      diferenciaDestino: p.diferencia_destino,
      reaperturaId: p.reapertura_id,
      origenProcesoId: p.origen_proceso_id,
      anulacion: p.anulado_at ? { en: p.anulado_at, por: quien(p.anulado_por), motivo: p.motivo_anulacion ?? "" } : null,
    }),
  );
  const movimientosLinea = movimientos.map(
    (m): MovimientoLinea => ({
      id: m.id,
      fecha: m.fecha,
      creadoEn: m.created_at,
      creadoPor: quien(m.created_by),
      articulo: nombreArticulo.get(m.articulo_id) ?? "Artículo",
      cantidad: num(m.cantidad),
      motivo: m.motivo,
      observaciones: m.observaciones,
    }),
  );

  return construirLineaDeTiempo({
    recepcion: {
      fecha: lote.fechaRecepcion,
      creadoEn: lote.creadoEn,
      creadoPor: quien(lote.creadoPor),
      linea: lote.linea,
      tercero: lote.tercero,
      tipoCafe: lote.tipoCafe,
      pesoRecibidoKg: lote.pesoRecibidoKg,
      precioCompraKg: lote.precioCompraKg,
      humedadPct: lote.humedadPct,
    },
    procesos: procesosLinea,
    movimientos: movimientosLinea,
    remisiones,
    reaperturas,
    anulacionLote: lote.anulacion
      ? { en: lote.anulacion.en, por: quien(lote.anulacion.por), motivo: lote.anulacion.motivo }
      : null,
  });
}
