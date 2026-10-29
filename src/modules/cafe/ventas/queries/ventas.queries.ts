import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { escaparLike } from "@/modules/cafe/lotes/lib/filtros";
import { getStock } from "@/modules/core/inventario/queries/inventario.queries";
import { getTarifasVigentes } from "@/modules/core/tarifas/queries/tarifas.queries";
import { leerAtributosProducto } from "../../empaque/lib/matriz";
import { conceptoPrecio } from "../lib/precios";
import { VENTAS_POR_PAGINA, type FiltrosVentas } from "../lib/filtros";
import {
  REF_VENTA,
  type EstadoFactura,
  type EstadoVenta,
  type LineaVentaVista,
  type MovimientoVenta,
  type ProductoVenta,
  type ResumenVentas,
  type VentaDetalle,
  type VentaFila,
} from "../types";

// Módulo plano (no "use server"): solo lo llama código de servidor. La autorización es el RLS de `cafe.ventas`: sin
// el módulo `cafe.ventas` activo, o sin membresía en el cliente actual, todo sale vacío.

const num = (n: number | null | undefined): number => (n === null || n === undefined ? 0 : Number(n));

interface FilaVista {
  id: string;
  numero: string;
  tipo: "venta" | "cortesia";
  fecha: string;
  tercero_id: string;
  tercero_nombre: string | null;
  es_consumidor_final: boolean | null;
  n_lineas: number | null;
  unidades: number | null;
  total: number;
  requiere_factura: boolean;
  numero_factura_aliados: string | null;
  factura_estado: string | null;
  estado: string | null;
  observaciones: string | null;
  anulada_at: string | null;
  anulada_por: string | null;
  motivo_anulacion: string | null;
  created_at: string;
  created_by: string | null;
}

function aFila(r: FilaVista): VentaFila {
  return {
    id: r.id,
    numero: r.numero,
    tipo: r.tipo,
    fecha: r.fecha,
    terceroId: r.tercero_id,
    clienteNombre: r.tercero_nombre ?? "—",
    esConsumidorFinal: r.es_consumidor_final === true,
    nLineas: num(r.n_lineas),
    unidades: num(r.unidades),
    total: num(r.total),
    requiereFactura: r.requiere_factura,
    numeroFactura: r.numero_factura_aliados,
    facturaEstado: (r.factura_estado ?? "no_requerida") as EstadoFactura, // derivado en la vista
    estado: (r.estado ?? "vigente") as EstadoVenta, // derivado en la vista
  };
}

export interface PaginaVentas {
  filas: VentaFila[];
  total: number;
  pagina: number;
  porPagina: number;
  totalPaginas: number;
}

function paginar(filas: VentaFila[], total: number, pagina: number): PaginaVentas {
  return { filas, total, pagina, porPagina: VENTAS_POR_PAGINA, totalPaginas: Math.max(1, Math.ceil(total / VENTAS_POR_PAGINA)) };
}

/**
 * Una página del listado de ventas con los filtros de la URL: más recientes primero (fecha y luego creación). Pagina
 * con `.range()` (tope de 1000 filas de PostgREST). Una página más allá del final (URL vieja) devuelve vacío con el
 * total correcto.
 */
export async function listarVentas(filtros: FiltrosVentas): Promise<PaginaVentas> {
  const supabase = await createClient();
  const desde = (filtros.pagina - 1) * VENTAS_POR_PAGINA;

  const consulta = (head: boolean) => {
    let q = supabase.schema("cafe").from("v_ventas").select(head ? "id" : "*", { count: "exact", head });
    if (filtros.desde) q = q.gte("fecha", filtros.desde);
    if (filtros.hasta) q = q.lte("fecha", filtros.hasta);
    if (filtros.tipo) q = q.eq("tipo", filtros.tipo);
    if (filtros.tercero) q = q.eq("tercero_id", filtros.tercero);
    if (filtros.estado) q = q.eq("estado", filtros.estado);
    if (filtros.facturaPendiente) q = q.eq("factura_pendiente", true);
    if (filtros.q) q = q.ilike("numero", `%${escaparLike(filtros.q)}%`);
    return q;
  };

  const { data, count, error } = await consulta(false)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(desde, desde + VENTAS_POR_PAGINA - 1);

  if (error && error.code === "PGRST103") {
    const { count: total, error: errorTotal } = await consulta(true);
    if (errorTotal) throw new Error("No se pudieron cargar las ventas");
    return paginar([], total ?? 0, filtros.pagina);
  }
  if (error) throw new Error("No se pudieron cargar las ventas");
  const filas = ((data ?? []) as unknown as FilaVista[]).map(aFila);
  return paginar(filas, count ?? filas.length, filtros.pagina);
}

/** Totales del periodo filtrado (`cafe.resumen_ventas`, mismos filtros que el listado). Las cortesías no suman. */
export async function getResumenVentas(filtros: FiltrosVentas): Promise<ResumenVentas> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("cafe").rpc("resumen_ventas", {
    ...(filtros.desde ? { p_desde: filtros.desde } : {}),
    ...(filtros.hasta ? { p_hasta: filtros.hasta } : {}),
    ...(filtros.tercero ? { p_tercero: filtros.tercero } : {}),
    ...(filtros.tipo ? { p_tipo: filtros.tipo } : {}),
    ...(filtros.estado ? { p_estado: filtros.estado } : {}),
    ...(filtros.facturaPendiente ? { p_factura_pendiente: true } : {}),
    ...(filtros.q ? { p_q: filtros.q } : {}),
  });
  if (error || data === null || typeof data !== "object" || Array.isArray(data)) throw new Error("No se pudo calcular el resumen de ventas");
  const r = data as Record<string, unknown>;
  return {
    totalVentas: num(r.total_ventas as number),
    nVentas: num(r.n_ventas as number),
    nCortesias: num(r.n_cortesias as number),
    unidadesCortesia: num(r.unidades_cortesia as number),
    nAnuladas: num(r.n_anuladas as number),
    nFacturaPendiente: num(r.n_factura_pendiente as number),
  };
}

/** La venta con sus líneas y los movimientos de inventario que generó (`null` si no existe o no es de este cliente). */
export const getVenta = cache(async (id: string): Promise<VentaDetalle | null> => {
  const supabase = await createClient();
  const { data: v, error } = await supabase.schema("cafe").from("v_ventas").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error("No se pudo cargar la venta");
  if (!v) return null;

  const [lineasRes, movRes] = await Promise.all([
    supabase.schema("cafe").from("venta_lineas").select("id, articulo_pt_id, cantidad, precio_unitario, subtotal, created_at").eq("venta_id", id).order("created_at").order("id"),
    supabase.from("v_kardex").select("id, fecha, articulo_nombre, motivo, cantidad, created_at, seq").eq("ref_tipo", REF_VENTA).eq("ref_id", id).order("fecha").order("created_at").order("seq"),
  ]);
  if (lineasRes.error) throw new Error("No se pudieron cargar las líneas de la venta");
  if (movRes.error) throw new Error("No se pudieron cargar los movimientos de la venta");

  const ids = [...new Set((lineasRes.data ?? []).map((l) => l.articulo_pt_id))];
  const nombres = new Map<string, string>();
  if (ids.length > 0) {
    const { data: articulos, error: errArticulos } = await supabase.from("articulos").select("id, nombre").in("id", ids);
    if (errArticulos) throw new Error("No se pudieron cargar los productos de la venta");
    for (const a of articulos ?? []) nombres.set(a.id, a.nombre);
  }

  // Las líneas de una venta se insertan juntas (mismo `created_at`): se ordenan por producto para que el orden sea estable.
  const lineas: LineaVentaVista[] = (lineasRes.data ?? [])
    .map((l) => ({
      id: l.id,
      articuloId: l.articulo_pt_id,
      producto: nombres.get(l.articulo_pt_id) ?? "Producto terminado",
      cantidad: l.cantidad,
      precioUnitario: num(l.precio_unitario),
      subtotal: num(l.subtotal),
    }))
    .sort((a, b) => a.producto.localeCompare(b.producto, "es", { numeric: true }));
  const movimientos: MovimientoVenta[] = (movRes.data ?? []).map((m) => ({
    id: m.id ?? "",
    fecha: m.fecha ?? "",
    producto: m.articulo_nombre ?? "",
    motivo: m.motivo ?? "",
    cantidad: num(m.cantidad),
  }));

  const fila = v as unknown as FilaVista;
  return {
    ...aFila(fila),
    observaciones: fila.observaciones,
    anulacion: fila.anulada_at ? { en: fila.anulada_at, motivo: fila.motivo_anulacion ?? "", por: fila.anulada_por } : null,
    creadoEn: fila.created_at,
    creadoPor: fila.created_by,
    lineas,
    movimientos,
  };
});

/**
 * Los productos terminados ACTIVOS que se pueden vender, con su stock y el precio vigente de cada uno (`null` si no
 * tiene precio: la línea pide el valor a mano). Ordenados por tipo de café y presentación.
 */
export async function getProductosParaVenta(): Promise<ProductoVenta[]> {
  const supabase = await createClient();
  const [stock, tiposRes, vigentes] = await Promise.all([
    getStock({ tipo: "producto_terminado" }),
    supabase.schema("cafe").from("tipos_cafe").select("id, nombre, orden").order("orden").order("nombre"),
    getTarifasVigentes(),
  ]);
  if (tiposRes.error) throw new Error("No se pudieron cargar los tipos de café");
  const tipos = new Map((tiposRes.data ?? []).map((t) => [t.id, t]));
  const precios = new Map(vigentes.map((t) => [t.concepto, t.valor]));

  const filas = stock.flatMap((s): { orden: number; producto: ProductoVenta }[] => {
    const a = leerAtributosProducto(s.atributos);
    if (!a) return [];
    const tipo = tipos.get(a.tipoCafeId);
    return [
      {
        orden: tipo?.orden ?? 999,
        producto: {
          articuloId: s.articulo_id,
          nombre: s.nombre,
          tipoCafe: tipo?.nombre ?? "Café",
          presentacionG: a.presentacionG,
          stock: s.stock,
          precio: precios.get(conceptoPrecio(s.articulo_id)) ?? null,
        },
      },
    ];
  });
  return filas
    .sort((x, y) => x.orden - y.orden || x.producto.tipoCafe.localeCompare(y.producto.tipoCafe, "es") || x.producto.presentacionG - y.producto.presentacionG)
    .map((f) => f.producto);
}

/** Id del «Consumidor final» del cliente (cliente por defecto de una venta), o `null` si no existe o no lo ve (módulo `core.terceros`). */
export async function getConsumidorFinalId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("terceros").select("id").eq("es_consumidor_final", true).maybeSingle();
  if (error) return null;
  return data?.id ?? null;
}
