import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { getLineasEmpaque } from "../../empaque/queries/empaque.queries";
import type { EtapaAvance } from "../lib/avance";
import type { BultoPeso, EtapaLote } from "../lib/etapas";
import { aplicarFiltrosLotes, LOTES_POR_PAGINA, type FiltrosLotes } from "../lib/filtros";
import {
  construirLineaDeTiempo,
  type BacheLinea,
  type EventoLinea,
  type MovimientoLinea,
  type ProcesoLinea,
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
  pesoRecibidoKg: number;
  numBultos: number;
  pesoActualKg: number;
  mermaTotalKg: number;
  alertasCalidad: string[];
  tieneDesvio: boolean;
  etapas: EtapaAvance[];
}

export interface PaginaLotes {
  filas: LoteListado[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
}

const COLUMNAS_LISTADO =
  "id, codigo, linea, servicios, servicios_requeridos, servicios_completados, avance_texto, estado, tercero_id, tercero_nombre, tipo_cafe_nombre, fecha_recepcion, peso_recibido_kg, num_bultos, peso_actual_kg, merma_total_kg, alertas_calidad, tiene_desvio";

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
    .select("lote_id, tipo, bultos_procesados, bultos_total, completo, parcial")
    .in("lote_id", data.map((l) => l.id));
  if (errorEtapas) throw new Error("No se pudo cargar el avance de los lotes");

  const porLote = new Map<string, EtapaAvance[]>();
  for (const e of etapas ?? []) {
    const lista = porLote.get(e.lote_id) ?? [];
    lista.push({
      tipo: e.tipo,
      bultosProcesados: num(e.bultos_procesados),
      bultosTotal: num(e.bultos_total),
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
      pesoRecibidoKg: num(l.peso_recibido_kg),
      numBultos: l.num_bultos,
      pesoActualKg: num(l.peso_actual_kg),
      mermaTotalKg: num(l.merma_total_kg),
      alertasCalidad: l.alertas_calidad,
      tieneDesvio: l.tiene_desvio === true,
      etapas: porLote.get(l.id) ?? [],
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
  numBultos: number;
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
    numBultos: l.num_bultos,
    humedadPct: l.humedad_pct,
    densidad: l.densidad,
    alertasCalidad: l.alertas_calidad,
    rangosCalidad: l.rangos_calidad,
    servicios: l.servicios,
    serviciosRequeridos: l.servicios_requeridos ?? [],
    serviciosCompletados: num(l.servicios_completados),
    avanceTexto: l.avance_texto,
    nivelTueste: l.nivel_tueste,
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
    bultosProcesados: num(e.bultos_procesados),
    bultosTotal: num(e.bultos_total),
    completo: e.completo === true,
    parcial: e.parcial === true,
    pesoEntradaKg: num(e.peso_entrada),
    pesoSalidaKg: num(e.peso_salida),
    mermaKg: num(e.merma_kg),
    valor: num(e.valor),
    desvios: num(e.desvios),
    numProcesos: num(e.num_procesos),
  }));
}

/** Un bulto con los pasos por los que ya pasó y lo que pesa ahora (`v_bultos_estado`). */
export interface BultoFicha extends BultoPeso {
  id: string;
  numero: number;
  pesoKg: number;
  pasos: TipoProceso[];
}

export async function getBultos(loteId: string): Promise<BultoFicha[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("cafe")
    .from("v_bultos_estado")
    .select("bulto_id, numero, peso_kg, pasos, ultimo_tipo, peso_actual_kg")
    .eq("lote_id", loteId)
    .order("numero", { ascending: true });
  if (error) throw new Error("No se pudieron cargar los bultos del lote");
  return (data ?? []).map((b) => ({
    id: b.bulto_id,
    numero: b.numero,
    pesoKg: num(b.peso_kg),
    pasos: b.pasos ?? [],
    ultimoTipo: b.ultimo_tipo,
    pesoActualKg: num(b.peso_actual_kg),
  }));
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
 * La historia completa del lote, ordenada: recepción → procesos (con baches y bultos) → movimientos de inventario
 * con `ref_tipo = 'cafe.lote'` (los empaques de CO-30) → anulación. `usuarios` (id → email) viene de
 * `getResponsables()`. La remisión (CO-32) y las reaperturas (CO-33) se sumarán aquí.
 */
export async function getTimeline(
  lote: LoteFicha,
  bultos: readonly BultoFicha[],
  usuarios: ReadonlyMap<string, string>,
): Promise<EventoLinea[]> {
  const supabase = await createClient();
  const cafe = supabase.schema("cafe");

  const [procesosRes, procesoBultosRes, movimientosRes] = await Promise.all([
    cafe
      .from("procesos")
      .select(
        "id, tipo, fecha, created_at, created_by, peso_entrada_kg, peso_salida_kg, merma_kg, tarifa_kg, valor, merma_referencia_pct, tolerancia_pts, desvio, nivel_tueste, observaciones, anulado_at, anulado_por, motivo_anulacion",
      )
      .eq("lote_id", lote.id),
    cafe.from("proceso_bultos").select("proceso_id, bulto_id").eq("lote_id", lote.id),
    supabase
      .from("movimientos_inventario")
      .select("id, articulo_id, fecha, cantidad, motivo, observaciones, created_at, created_by")
      .eq("ref_tipo", "cafe.lote")
      .eq("ref_id", lote.id),
  ]);
  if (procesosRes.error) throw new Error("No se pudieron cargar los procesos del lote");
  if (procesoBultosRes.error) throw new Error("No se pudieron cargar los bultos de los procesos");
  if (movimientosRes.error) throw new Error("No se pudieron cargar los movimientos del lote");

  const procesos = procesosRes.data ?? [];
  const movimientos = movimientosRes.data ?? [];

  const [bachesRes, articulosRes] = await Promise.all([
    procesos.length > 0
      ? cafe
          .from("baches")
          .select("proceso_id, numero, peso_entrada_kg, peso_salida_kg, temperatura_c, observaciones")
          .in("proceso_id", procesos.map((p) => p.id))
          .order("numero", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    movimientos.length > 0
      ? supabase.from("articulos").select("id, nombre").in("id", [...new Set(movimientos.map((m) => m.articulo_id))])
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (bachesRes.error) throw new Error("No se pudieron cargar los baches");
  if (articulosRes.error) throw new Error("No se pudieron cargar los artículos de los movimientos");

  const numeroDeBulto = new Map(bultos.map((b) => [b.id, b.numero]));
  const bultosDe = new Map<string, number[]>();
  for (const pb of procesoBultosRes.data ?? []) {
    const n = numeroDeBulto.get(pb.bulto_id);
    if (n === undefined) continue;
    bultosDe.set(pb.proceso_id, [...(bultosDe.get(pb.proceso_id) ?? []), n]);
  }
  const bachesDe = new Map<string, BacheLinea[]>();
  for (const b of bachesRes.data ?? []) {
    const entrada = num(b.peso_entrada_kg);
    const salida = num(b.peso_salida_kg);
    bachesDe.set(b.proceso_id, [
      ...(bachesDe.get(b.proceso_id) ?? []),
      {
        numero: b.numero,
        pesoEntradaKg: entrada,
        pesoSalidaKg: salida,
        mermaKg: Math.round((entrada - salida) * 1000) / 1000,
        temperaturaC: b.temperatura_c,
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
      bultos: (bultosDe.get(p.id) ?? []).sort((a, b) => a - b),
      pesoEntradaKg: num(p.peso_entrada_kg),
      pesoSalidaKg: num(p.peso_salida_kg),
      mermaKg: num(p.merma_kg),
      tarifaKg: num(p.tarifa_kg),
      valor: num(p.valor),
      mermaReferenciaPct: p.merma_referencia_pct,
      toleranciaPts: p.tolerancia_pts,
      desvio: p.desvio === true,
      nivelTueste: p.nivel_tueste,
      observaciones: p.observaciones,
      baches: bachesDe.get(p.id) ?? [],
      lineasEmpaque: lineasEmpaque.get(p.id) ?? [],
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
      numBultos: lote.numBultos,
    },
    numBultosLote: lote.numBultos,
    procesos: procesosLinea,
    movimientos: movimientosLinea,
    anulacionLote: lote.anulacion
      ? { en: lote.anulacion.en, por: quien(lote.anulacion.por), motivo: lote.anulacion.motivo }
      : null,
  });
}
