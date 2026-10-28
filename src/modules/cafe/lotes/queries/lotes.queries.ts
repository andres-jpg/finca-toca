import { createClient } from "@/lib/supabase/server";
import { listarTiposCafe } from "@/modules/cafe/tipos/queries/tipos.queries";
import type { LineaLote } from "../types";

// Módulo plano (no "use server"): solo lo llama código de servidor. La autorización es el RLS: sin el módulo
// `cafe.recepcion` activo, o sin membresía en el cliente actual, la lista sale vacía.

/** Una fila de la lista de lotes: lo mínimo para reconocer el lote. La ficha completa llega con CO-29. */
export interface LoteReciente {
  id: string;
  codigo: string;
  linea: LineaLote;
  /** Proveedor (marca propia) o cliente (servicio); «—» si el cliente no tiene `core.terceros` y no se puede leer. */
  tercero: string;
  /** Tipo de café (solo marca propia). */
  tipoCafe: string | null;
  /** `YYYY-MM-DD`. */
  fechaRecepcion: string;
  pesoKg: number;
  numBultos: number;
  /** Solo marca propia (`valor_compra` es NULL en los lotes de servicio). */
  valorCompra: number | null;
  anulado: boolean;
}

/**
 * Los lotes más recientes del cliente actual (por fecha de recepción y, a igualdad, por creación). Pensado para
 * la lista inicial: sin paginación ni filtros hasta CO-29. Los nombres de tercero y tipo se resuelven aparte
 * (dos consultas pequeñas por id) porque `cafe.lotes` y `public.terceros` están en esquemas distintos.
 */
export async function listarLotesRecientes(limite = 50): Promise<LoteReciente[]> {
  const supabase = await createClient();
  const { data: lotes, error } = await supabase
    .schema("cafe")
    .from("lotes")
    .select("id, codigo, linea, tercero_id, tipo_cafe_id, fecha_recepcion, peso_recibido_kg, num_bultos, valor_compra, anulado_at")
    .order("fecha_recepcion", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw new Error("No se pudieron cargar los lotes");
  if (!lotes || lotes.length === 0) return [];

  const ids = [...new Set(lotes.map((l) => l.tercero_id))];
  const [{ data: terceros }, tipos] = await Promise.all([
    supabase.from("terceros").select("id, nombre").in("id", ids),
    listarTiposCafe(),
  ]);
  const nombreTercero = new Map((terceros ?? []).map((t) => [t.id, t.nombre]));
  const nombreTipo = new Map(tipos.map((t) => [t.id, t.nombre]));

  return lotes.map((l) => ({
    id: l.id,
    codigo: l.codigo,
    linea: l.linea,
    tercero: nombreTercero.get(l.tercero_id) ?? "—",
    tipoCafe: l.tipo_cafe_id ? (nombreTipo.get(l.tipo_cafe_id) ?? null) : null,
    fechaRecepcion: l.fecha_recepcion,
    pesoKg: Number(l.peso_recibido_kg),
    numBultos: l.num_bultos,
    valorCompra: l.valor_compra === null ? null : Number(l.valor_compra),
    anulado: l.anulado_at !== null,
  }));
}
