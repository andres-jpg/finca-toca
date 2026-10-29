import { createClient } from "@/lib/supabase/server";
import { getKardex, getStock } from "@/modules/core/inventario/queries/inventario.queries";
import type { StockArticulo } from "@/modules/core/inventario/types";
import { callRpc } from "@/modules/core/rpc/call-rpc";
import { leerAtributosInsumo } from "../../insumos/lib/insumos";
import { construirMatriz, leerAtributosProducto, type MatrizProductoTerminado, type ProductoTerminado, type TipoCafeMatriz } from "../lib/matriz";
import {
  REF_LOTE,
  REF_PROCESO,
  REF_VENTA,
  type ConfigEmpaque,
  type InsumoPresentacion,
  type KardexProducto,
  type LineaEmpaqueVista,
  type PresentacionEmpaque,
} from "../types";

// Módulo plano (no "use server"): solo lo llama código de servidor. La autorización es el RLS: sin el módulo o sin
// membresía en el cliente actual las listas salen vacías. El stock nunca se guarda: es la suma de movimientos.

const aInsumo = (s: StockArticulo): InsumoPresentacion => ({ id: s.articulo_id, nombre: s.nombre, stock: s.stock, stockMinimo: s.stock_minimo });

/**
 * Presentaciones que ofrece el formulario de empaque de un lote: una por cada bolsa ACTIVA, con su bolsa, su
 * etiqueta y el producto terminado del tipo de café del lote (más el stock de los tres). Una presentación sin
 * etiqueta (o sin bolsa) se devuelve igual: el formulario la muestra bloqueada con el motivo.
 */
export async function getConfigEmpaque(loteId: string): Promise<ConfigEmpaque> {
  const supabase = await createClient();
  const [{ data: lote }, insumos, productos] = await Promise.all([
    supabase.schema("cafe").from("lotes").select("tipo_cafe_id").eq("id", loteId).maybeSingle(),
    getStock({ tipo: "insumo" }),
    getStock({ tipo: "producto_terminado" }),
  ]);

  const bolsas = new Map<number, StockArticulo>();
  const etiquetas = new Map<number, StockArticulo>();
  for (const s of insumos) {
    const a = leerAtributosInsumo(s.atributos);
    if (!a) continue;
    const mapa = a.clase === "bolsa" ? bolsas : etiquetas;
    if (!mapa.has(a.presentacionG)) mapa.set(a.presentacionG, s);
  }

  const delTipo = new Map<number, StockArticulo>();
  for (const p of productos) {
    const a = leerAtributosProducto(p.atributos);
    if (a && a.tipoCafeId === lote?.tipo_cafe_id && !delTipo.has(a.presentacionG)) delTipo.set(a.presentacionG, p);
  }

  const presentaciones: PresentacionEmpaque[] = [...bolsas.keys()]
    .sort((a, b) => a - b)
    .map((g) => {
      const etiqueta = etiquetas.get(g);
      const producto = delTipo.get(g);
      return {
        presentacionG: g,
        bolsa: aInsumo(bolsas.get(g)!),
        etiqueta: etiqueta ? aInsumo(etiqueta) : null,
        producto: producto ? { id: producto.articulo_id, nombre: producto.nombre, stock: producto.stock } : null,
      };
    });

  return { presentaciones };
}

/** Todo lo que pinta la matriz del producto terminado: los productos con su stock y los tipos de café. */
export async function getMatrizProductoTerminado(): Promise<{ matriz: MatrizProductoTerminado; productos: ProductoTerminado[] }> {
  const supabase = await createClient();
  const [stock, tiposRes] = await Promise.all([
    getStock({ tipo: "producto_terminado", incluirInactivos: true }),
    supabase.schema("cafe").from("tipos_cafe").select("id, nombre, activo, orden").order("orden").order("nombre"),
  ]);
  if (tiposRes.error) throw new Error("No se pudieron cargar los tipos de café");

  const productos = stock.flatMap((s): ProductoTerminado[] => {
    const a = leerAtributosProducto(s.atributos);
    return a ? [{ articuloId: s.articulo_id, nombre: s.nombre, stock: s.stock, tipoCafeId: a.tipoCafeId, presentacionG: a.presentacionG, activo: s.activo }] : [];
  });
  const tipos: TipoCafeMatriz[] = (tiposRes.data ?? []).map((t) => ({ id: t.id, nombre: t.nombre, activo: t.activo, orden: t.orden }));
  return { matriz: construirMatriz(productos, tipos), productos };
}

/** Insumos bajo su mínimo (activos): alimenta la tarjeta `AlertaStockBajo` de la pantalla. */
export async function getInsumosBajoMinimo(): Promise<StockArticulo[]> {
  return getStock({ tipo: "insumo", soloBajoMinimo: true });
}

/**
 * Kardex de un producto terminado más los nombres que el log solo guarda como uuid: el usuario de cada movimiento
 * y el ORIGEN de cada uno. Un empaque (`ref_tipo = 'cafe.proceso'`) apunta al proceso y de ahí al lote: la
 * referencia muestra su código («MP-2026-0001») y enlaza a su ficha. Lo que no se pueda resolver se queda sin
 * referencia («—»): el kardex en sí no depende de ello.
 */
export async function getKardexProducto(articuloId: string): Promise<KardexProducto> {
  const movimientos = await getKardex(articuloId);

  const idsUsuarios = [...new Set(movimientos.flatMap((m) => (m.created_by ? [m.created_by] : [])))];
  const idsProcesos = [...new Set(movimientos.flatMap((m) => (m.ref_tipo === REF_PROCESO && m.ref_id ? [m.ref_id] : [])))];

  const idsLotes = [...new Set(movimientos.flatMap((m) => (m.ref_tipo === REF_LOTE && m.ref_id ? [m.ref_id] : [])))];

  const [usuarios, lotesDeProceso, codigosDeLote] = await Promise.all([
    nombresUsuarios(idsUsuarios),
    lotesDeProcesos(idsProcesos),
    codigosDeLotes(idsLotes),
  ]);

  const numerosDeVenta = await numerosDeVentas([...new Set(movimientos.flatMap((m) => (m.ref_tipo === REF_VENTA && m.ref_id ? [m.ref_id] : [])))]);

  const referencias: Record<string, string> = {};
  const enlaces: Record<string, string> = {};
  for (const m of movimientos) {
    if (!m.ref_id) continue;
    if (m.ref_tipo === REF_PROCESO) {
      const lote = lotesDeProceso.get(m.ref_id);
      if (!lote) continue;
      referencias[m.ref_id] = lote.codigo;
      enlaces[m.ref_id] = `/dashboard/cafe/lotes/${lote.id}`;
    } else if (m.ref_tipo === REF_LOTE) {
      // La reapertura de un lote (CO-33) apunta directamente al lote reabierto.
      const codigo = codigosDeLote.get(m.ref_id);
      if (!codigo) continue;
      referencias[m.ref_id] = codigo;
      enlaces[m.ref_id] = `/dashboard/cafe/lotes/${m.ref_id}`;
    } else if (m.ref_tipo === REF_VENTA) {
      // Una venta, una cortesía o su anulación (CO-31): el número (VT-2026-0001) enlaza al detalle.
      referencias[m.ref_id] = numerosDeVenta.get(m.ref_id) ?? "Venta";
      if (numerosDeVenta.has(m.ref_id)) enlaces[m.ref_id] = `/dashboard/cafe/ventas/${m.ref_id}`;
    }
  }
  return { movimientos, usuarios, referencias, enlaces };
}

async function nombresUsuarios(ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const r = await callRpc<"public", "nombres_usuarios_tenant", { user_id: string; email: string }[]>("public", "nombres_usuarios_tenant", { p_ids: ids });
  if (!r.ok) return {};
  return Object.fromEntries((r.data ?? []).map((u) => [u.user_id, u.email]));
}

/** `lote_id` → código de los lotes reabiertos (movimientos con `ref_tipo = 'cafe.lote'`, CO-33). */
async function codigosDeLotes(loteIds: string[]): Promise<Map<string, string>> {
  if (loteIds.length === 0) return new Map();
  const cafe = (await createClient()).schema("cafe");
  const { data, error } = await cafe.from("lotes").select("id, codigo").in("id", loteIds);
  if (error) return new Map();
  return new Map((data ?? []).map((l) => [l.id, l.codigo]));
}

/** `venta_id` → número (`VT-2026-0001`) de las ventas y cortesías que originaron esos movimientos (CO-31). */
async function numerosDeVentas(ventaIds: string[]): Promise<Map<string, string>> {
  if (ventaIds.length === 0) return new Map();
  const cafe = (await createClient()).schema("cafe");
  const { data, error } = await cafe.from("ventas").select("id, numero").in("id", ventaIds);
  if (error) return new Map();
  return new Map((data ?? []).map((v) => [v.id, v.numero]));
}

/** `proceso_id` → lote (id y código) de los empaques que originaron esos movimientos. */
async function lotesDeProcesos(procesoIds: string[]): Promise<Map<string, { id: string; codigo: string }>> {
  if (procesoIds.length === 0) return new Map();
  const cafe = (await createClient()).schema("cafe");
  const { data: procesos, error } = await cafe.from("procesos").select("id, lote_id").in("id", procesoIds);
  if (error || !procesos?.length) return new Map();
  const { data: lotes, error: errLotes } = await cafe.from("lotes").select("id, codigo").in("id", [...new Set(procesos.map((p) => p.lote_id))]);
  if (errLotes) return new Map();
  const codigo = new Map((lotes ?? []).map((l) => [l.id, l.codigo]));
  return new Map(procesos.flatMap((p) => (codigo.has(p.lote_id) ? [[p.id, { id: p.lote_id, codigo: codigo.get(p.lote_id)! }] as const] : [])));
}

/**
 * Las presentaciones empacadas de esos procesos de empaque (con el nombre del producto), por `proceso_id`. Las usan
 * el historial de la planta y la línea de tiempo del lote para decir «120 × Excelso 500 g». Un proceso sin líneas
 * (empaque de maquila, que no mueve inventario) no aparece en el mapa.
 */
export async function getLineasEmpaque(procesoIds: readonly string[]): Promise<Map<string, LineaEmpaqueVista[]>> {
  const resultado = new Map<string, LineaEmpaqueVista[]>();
  if (procesoIds.length === 0) return resultado;
  const supabase = await createClient();
  const { data: lineas, error } = await supabase
    .schema("cafe")
    .from("empaque_lineas")
    .select("proceso_id, presentacion_g, unidades, articulo_pt_id")
    .in("proceso_id", [...procesoIds]);
  if (error) throw new Error("No se pudieron cargar las presentaciones empacadas");
  if (!lineas?.length) return resultado;

  const { data: articulos, error: errArticulos } = await supabase
    .from("articulos")
    .select("id, nombre")
    .in("id", [...new Set(lineas.map((l) => l.articulo_pt_id))]);
  if (errArticulos) throw new Error("No se pudieron cargar los productos empacados");
  const nombre = new Map((articulos ?? []).map((a) => [a.id, a.nombre]));

  for (const l of lineas) {
    resultado.set(l.proceso_id, [
      ...(resultado.get(l.proceso_id) ?? []),
      { presentacionG: l.presentacion_g, unidades: l.unidades, producto: nombre.get(l.articulo_pt_id) ?? "Producto terminado" },
    ]);
  }
  for (const lista of resultado.values()) lista.sort((a, b) => a.presentacionG - b.presentacionG);
  return resultado;
}
