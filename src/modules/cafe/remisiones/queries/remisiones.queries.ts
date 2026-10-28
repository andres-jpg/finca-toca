import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { leerDetalle } from "../lib/detalle";
import { escaparLike } from "@/modules/cafe/lotes/lib/filtros";
import { REMISIONES_POR_PAGINA, type FiltrosRemisiones } from "../lib/filtros";
import type { Remision } from "../types";
import { createClienteRemisiones, type RemisionRow } from "./cliente";

// Módulo plano (no "use server"): solo lo llama código de servidor. La autorización es el RLS de `cafe.remisiones`:
// sin el módulo `cafe.remisiones` activo, o sin membresía en el cliente actual, todo sale vacío.

const num = (n: number | null | undefined): number => (n === null || n === undefined ? 0 : Number(n));

function aRemision(r: RemisionRow): Remision {
  return {
    id: r.id,
    numero: r.numero,
    loteId: r.lote_id,
    loteCodigo: r.lote_codigo,
    fecha: r.fecha,
    terceroId: r.tercero_id,
    clienteNombre: r.cliente_nombre,
    clienteIdentificacion: r.cliente_identificacion,
    pesoRecibidoKg: num(r.peso_recibido_kg),
    pesoEntregadoKg: num(r.peso_entregado_kg),
    mermaTotalKg: num(r.merma_total_kg),
    detalle: leerDetalle(r.detalle),
    valorServicios: num(r.valor_servicios),
    recibidoPor: r.recibido_por,
    observaciones: r.observaciones,
    forzada: r.forzada === true,
    anulacion: r.anulada_at ? { en: r.anulada_at, motivo: r.motivo_anulacion ?? "", por: r.anulada_por } : null,
    creadoEn: r.created_at,
    creadoPor: r.created_by,
  };
}

export interface PaginaRemisiones {
  filas: Remision[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
}

function paginar(filas: Remision[], total: number, pagina: number): PaginaRemisiones {
  return { filas, total, pagina, porPagina: REMISIONES_POR_PAGINA, totalPaginas: Math.max(1, Math.ceil(total / REMISIONES_POR_PAGINA)) };
}

/**
 * Una página del listado de remisiones con los filtros de la URL: más recientes primero (fecha de entrega y luego
 * creación). Pagina con `.range()` (tope de 1000 filas de PostgREST). Una página más allá del final (URL vieja)
 * devuelve vacío con el total correcto.
 */
export async function listarRemisiones(filtros: FiltrosRemisiones): Promise<PaginaRemisiones> {
  const supabase = await createClienteRemisiones();
  const desde = (filtros.pagina - 1) * REMISIONES_POR_PAGINA;

  const consulta = (head: boolean) => {
    let q = supabase.from("remisiones").select(head ? "id" : "*", { count: "exact", head });
    if (filtros.desde) q = q.gte("fecha", filtros.desde);
    if (filtros.hasta) q = q.lte("fecha", filtros.hasta);
    if (filtros.tercero) q = q.eq("tercero_id", filtros.tercero);
    if (filtros.estado === "vigente") q = q.is("anulada_at", null);
    if (filtros.estado === "anulada") q = q.not("anulada_at", "is", null);
    if (filtros.q) {
      // Dentro de `.or()` la coma, los paréntesis y las comillas son sintaxis del filtro: un número REM o un código
      // de lote nunca los llevan, así que se quitan en vez de escaparlos.
      const patron = `%${escaparLike(filtros.q.replace(/[,()"\\]/g, ""))}%`;
      q = q.or(`numero.ilike.${patron},lote_codigo.ilike.${patron}`);
    }
    return q;
  };

  const { data, count, error } = await consulta(false)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(desde, desde + REMISIONES_POR_PAGINA - 1);

  if (error && error.code === "PGRST103") {
    const { count: total, error: errorTotal } = await consulta(true);
    if (errorTotal) throw new Error("No se pudieron cargar las remisiones");
    return paginar([], total ?? 0, filtros.pagina);
  }
  if (error) throw new Error("No se pudieron cargar las remisiones");
  const filas = ((data ?? []) as unknown as RemisionRow[]).map(aRemision);
  return paginar(filas, count ?? filas.length, filtros.pagina);
}

/** Una remisión por id (`null` si no existe o no es de este cliente: el RLS la esconde igual). */
export const getRemision = cache(async (id: string): Promise<Remision | null> => {
  const supabase = await createClienteRemisiones();
  const { data, error } = await supabase.from("remisiones").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("No se pudo cargar la remisión");
  return data ? aRemision(data) : null;
});

/** Todas las remisiones de un lote (la vigente y las anuladas), de la más reciente a la más antigua. */
export async function getRemisionesDeLote(loteId: string): Promise<Remision[]> {
  const supabase = await createClienteRemisiones();
  const { data, error } = await supabase
    .from("remisiones")
    .select("*")
    .eq("lote_id", loteId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("No se pudieron cargar las remisiones del lote");
  return (data ?? []).map(aRemision);
}

/** NIT del cliente (emisor del tiquete): `tenants.nit`, que la sesión no trae. `null` si no está registrado. */
export async function getNitDelCliente(tenantId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("tenants").select("nit").eq("id", tenantId).maybeSingle();
  if (error) return null;
  return data?.nit ?? null;
}

/** Fecha de recepción y bultos del lote para la línea «Recibido» del tiquete (de `cafe.v_lotes`). */
export async function getRecepcionDelLote(loteId: string): Promise<{ fechaRecepcion: string; numBultos: number } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("cafe")
    .from("v_lotes")
    .select("fecha_recepcion, num_bultos")
    .eq("id", loteId)
    .maybeSingle();
  if (error || !data) return null;
  return { fechaRecepcion: data.fecha_recepcion, numBultos: data.num_bultos };
}
