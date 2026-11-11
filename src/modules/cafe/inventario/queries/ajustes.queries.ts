import { createClient } from "@/lib/supabase/server";
import { callRpc } from "@/modules/core/rpc/call-rpc";
import type { ClaseCarga } from "../lib/ajuste";

// Lecturas de la carga inicial (B-15). Módulo plano (no "use server"): solo lo llama código de servidor. La
// autorización es el RLS de `cafe.inventario_ajustes` (módulo `cafe.inventario` + membresía).

export interface CargaInicial {
  id: string;
  clase: ClaseCarga;
  articuloId: string | null;
  tipoCafeId: string | null;
  /** Unidades (producto terminado) o kg (tostado y verde) que se cargaron. */
  cantidad: number;
  /** Costo unitario estimado: por unidad o por kg. */
  costoUnitario: number | null;
  creadoEn: string;
  /** Correo de quien la cargó, si se pudo leer. */
  creadoPor: string | null;
}

/** Cargas iniciales del cliente, de la más reciente a la más antigua. Hay una por producto o tipo de café: no pagina. */
export async function getCargasIniciales(): Promise<CargaInicial[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("cafe")
    .from("inventario_ajustes")
    .select("id, clase, articulo_id, tipo_cafe_id, cantidad_antes, cantidad_despues, costo_unitario, created_at, created_by")
    .eq("tipo", "carga_inicial")
    .order("created_at", { ascending: false })
    .range(0, 999);
  if (error) throw new Error("No se pudieron cargar las cargas iniciales");

  const filas = data ?? [];
  const ids = [...new Set(filas.flatMap((f) => (f.created_by ? [f.created_by] : [])))];
  const correos = new Map<string, string>();
  if (ids.length > 0) {
    const r = await callRpc<"public", "nombres_usuarios_tenant", { user_id: string; email: string }[]>("public", "nombres_usuarios_tenant", { p_ids: ids });
    if (r.ok) for (const u of r.data ?? []) correos.set(u.user_id, u.email);
  }
  return filas.map((f) => ({
    id: f.id,
    clase: f.clase as ClaseCarga,
    articuloId: f.articulo_id,
    tipoCafeId: f.tipo_cafe_id,
    // En la carga inicial `cantidad_despues - cantidad_antes` es lo cargado (en el producto terminado el «antes» puede no ser 0).
    cantidad: Number(f.cantidad_despues) - Number(f.cantidad_antes),
    costoUnitario: f.costo_unitario === null ? null : Number(f.costo_unitario),
    creadoEn: f.created_at,
    creadoPor: f.created_by ? (correos.get(f.created_by) ?? null) : null,
  }));
}

/**
 * kg de la carga inicial de café verde y de tostado sin empacar por nombre de tipo de café: el saldo aparte que la
 * pantalla de Inventario suma a lo que dan los lotes (no tienen lote ni artículo propio).
 */
export async function getSaldosCargaInicial(): Promise<{ verde: Map<string, number>; tostado: Map<string, number> }> {
  const supabase = (await createClient()).schema("cafe");
  const [cargas, tipos] = await Promise.all([
    supabase.from("inventario_ajustes").select("clase, tipo_cafe_id, cantidad_antes, cantidad_despues").eq("tipo", "carga_inicial").neq("clase", "producto").range(0, 999),
    supabase.from("tipos_cafe").select("id, nombre"),
  ]);
  if (cargas.error || tipos.error) throw new Error("No se pudo cargar la carga inicial del café a granel");
  const nombre = new Map((tipos.data ?? []).map((t) => [t.id, t.nombre]));
  const salida = { verde: new Map<string, number>(), tostado: new Map<string, number>() };
  for (const c of cargas.data ?? []) {
    const tipo = c.tipo_cafe_id ? nombre.get(c.tipo_cafe_id) : undefined;
    if (!tipo || (c.clase !== "verde" && c.clase !== "tostado")) continue;
    const mapa = salida[c.clase];
    mapa.set(tipo, (mapa.get(tipo) ?? 0) + Number(c.cantidad_despues) - Number(c.cantidad_antes));
  }
  return salida;
}
