import { createClient } from "@/lib/supabase/server";
import { getKardex, getStock } from "@/modules/core/inventario/queries/inventario.queries";
import { callRpc } from "@/modules/core/rpc/call-rpc";
import { leerAtributosInsumo } from "../lib/insumos";
import { REF_TERCERO, type InsumoEmpaque, type KardexInsumo } from "../types";

// Módulo plano (no "use server"): solo lo llama código de servidor. La autorización es el RLS: sin membresía
// en el cliente actual las listas salen vacías.

/**
 * Insumos de empaque del cliente (bolsas y etiquetas), activos e inactivos, con su stock actual —la suma de
 * sus movimientos— y `bajo_minimo`. Un stock negativo sale tal cual: es información, no un error. Los
 * artículos de tipo insumo que no son bolsa/etiqueta con peso válido no se muestran aquí.
 */
export async function getInsumosEmpaque(): Promise<InsumoEmpaque[]> {
  const stock = await getStock({ tipo: "insumo", incluirInactivos: true });
  return stock.flatMap((s) => {
    const atributos = leerAtributosInsumo(s.atributos);
    return atributos ? [{ ...s, clase: atributos.clase, presentacionG: atributos.presentacionG }] : [];
  });
}

/**
 * Kardex de un insumo más los nombres de quienes aparecen en él: el usuario de cada movimiento y el
 * proveedor de cada compra. Si no se pueden resolver (p. ej. el cliente no tiene el módulo de terceros) la
 * tabla muestra "—": el kardex en sí no depende de ellos.
 */
export async function getKardexInsumo(articuloId: string): Promise<KardexInsumo> {
  const movimientos = await getKardex(articuloId);

  const idsUsuarios = [...new Set(movimientos.flatMap((m) => (m.created_by ? [m.created_by] : [])))];
  const idsTerceros = [
    ...new Set(movimientos.flatMap((m) => (m.ref_tipo === REF_TERCERO && m.ref_id ? [m.ref_id] : []))),
  ];

  const [usuarios, proveedores] = await Promise.all([nombresUsuarios(idsUsuarios), nombresTerceros(idsTerceros)]);
  return { movimientos, usuarios, proveedores };
}

async function nombresUsuarios(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const r = await callRpc<"public", "nombres_usuarios_tenant", { user_id: string; email: string }[]>(
    "public",
    "nombres_usuarios_tenant",
    { p_ids: ids },
  );
  if (!r.ok) return {};
  return Object.fromEntries((r.data ?? []).map((u) => [u.user_id, u.email]));
}

async function nombresTerceros(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const supabase = await createClient();
  const { data, error } = await supabase.from("terceros").select("id, nombre").in("id", ids);
  if (error) return {};
  return Object.fromEntries((data ?? []).map((t) => [t.id, t.nombre]));
}
