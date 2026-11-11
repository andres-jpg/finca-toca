import { createClient } from "@/lib/supabase/server";
import { callRpc } from "@/modules/core/rpc/call-rpc";
import { getCostoLibraPanel } from "../../costo/queries/costo.queries";
import { promedioPonderadoPorCalidad } from "../../costo/lib/costo-libra";
import { desdeHistorico } from "../../panel/lib/periodo";
import type { ProductoTerminado } from "../../empaque/lib/matriz";
import { DIAS_VENTANA_COBERTURA, leerLibrasVendidas, saldosPorLote, diasEnPlanta, type ConversionSaldo, type EmpaqueSaldo, type LibrasVendidas } from "../lib/inventario";

// Lecturas de las pestañas del inventario (A-15). Módulo plano (no "use server"): solo lo llama código de servidor.
// La autorización es el RLS (`security_invoker` en las vistas): sin el módulo o sin membresía todo sale vacío.
// Cada lista es de UNA pestaña; ninguna función suma kilos de dos pestañas.

const PAGINA = 1000;
const LOTE_IDS = 100;

const trozos = <T,>(xs: readonly T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export interface CafeVerdeTipo {
  tipoCafe: string;
  kg: number;
}

/** Café verde de marca propia que aún no se ha tostado: kg por tipo de café (lotes no anulados). Sale del saldo de la raíz. */
export async function getCafeVerde(): Promise<CafeVerdeTipo[]> {
  const cafe = (await createClient()).schema("cafe");
  const filas: { lote_id: string; saldo_kg: number }[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await cafe
      .from("v_origenes_disponibles")
      .select("lote_id, saldo_kg")
      .is("proceso_id", null)
      .gt("saldo_kg", 0.05)
      .order("lote_id")
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error("No se pudo cargar el café verde");
    filas.push(...(data ?? []).flatMap((b) => (b.lote_id ? [{ lote_id: b.lote_id, saldo_kg: Number(b.saldo_kg ?? 0) }] : [])));
    if ((data?.length ?? 0) < PAGINA) break;
  }
  if (filas.length === 0) return [];

  const tipoDe = new Map<string, string>();
  for (const ids of trozos([...new Set(filas.map((b) => b.lote_id))], LOTE_IDS)) {
    const { data, error } = await cafe.from("v_lotes").select("id, tipo_cafe_nombre").in("id", ids).eq("linea", "marca_propia").is("anulado_at", null);
    if (error) throw new Error("No se pudo cargar el café verde");
    for (const l of data ?? []) if (l.id) tipoDe.set(l.id, l.tipo_cafe_nombre ?? "Sin tipo");
  }

  const porTipo = new Map<string, CafeVerdeTipo>();
  for (const b of filas) {
    const tipo = tipoDe.get(b.lote_id);
    if (!tipo) continue; // lote de servicio o anulado: no es nuestro café verde
    const f = porTipo.get(tipo) ?? { tipoCafe: tipo, kg: 0 };
    f.kg += b.saldo_kg;
    porTipo.set(tipo, f);
  }
  return [...porTipo.values()].sort((a, b) => a.tipoCafe.localeCompare(b.tipoCafe, "es"));
}

export interface TostadoSinEmpacar {
  loteId: string;
  codigo: string;
  tipoCafe: string | null;
  forma: "grano" | "molido";
  kg: number;
}

/** Tostado sin empacar (kg) por lote, tipo de café y forma: el sobrante de los empaques de marca propia (B-09). */
export async function getTostadoSinEmpacar(): Promise<TostadoSinEmpacar[]> {
  const cafe = (await createClient()).schema("cafe");
  const { data, error } = await cafe.from("v_inventario_tostado").select("lote_id, lote_codigo, tipo_cafe_nombre, forma, kg").gt("kg", 0);
  if (error) throw new Error("No se pudo cargar el tostado sin empacar");
  return (data ?? [])
    .flatMap((g) => (g.lote_id && g.lote_codigo ? [{ loteId: g.lote_id, codigo: g.lote_codigo, tipoCafe: g.tipo_cafe_nombre, forma: g.forma as "grano" | "molido", kg: Number(g.kg ?? 0) }] : []))
    .sort((a, b) => a.codigo.localeCompare(b.codigo) || a.forma.localeCompare(b.forma));
}

export interface SaldoConvertible {
  loteId: string;
  codigo: string;
  articuloId: string;
  unidades: number;
}

/**
 * Unidades convertibles por lote y producto terminado, solo de los productos con existencias (lo ya vendido no se
 * convierte). Mismo cálculo que `cafe.convertir_presentacion`; la base lo vuelve a comprobar.
 */
export async function getSaldosConvertibles(articulosConStock: readonly string[]): Promise<SaldoConvertible[]> {
  if (articulosConStock.length === 0) return [];
  const cafe = (await createClient()).schema("cafe");

  const lineas: { proceso_id: string; articulo_pt_id: string; unidades: number }[] = [];
  for (const ids of trozos(articulosConStock, LOTE_IDS)) {
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await cafe.from("empaque_lineas").select("proceso_id, articulo_pt_id, unidades").in("articulo_pt_id", ids).order("proceso_id").range(desde, desde + PAGINA - 1);
      if (error) throw new Error("No se pudo cargar lo empacado");
      lineas.push(...(data ?? []).flatMap((l) => (l.articulo_pt_id ? [{ proceso_id: l.proceso_id, articulo_pt_id: l.articulo_pt_id, unidades: l.unidades }] : [])));
      if ((data?.length ?? 0) < PAGINA) break;
    }
  }
  const loteDeProceso = new Map<string, string>();
  for (const ids of trozos([...new Set(lineas.map((l) => l.proceso_id))], LOTE_IDS)) {
    const { data, error } = await cafe.from("procesos").select("id, lote_id").in("id", ids).is("anulado_at", null);
    if (error) throw new Error("No se pudo cargar lo empacado");
    for (const p of data ?? []) loteDeProceso.set(p.id, p.lote_id);
  }
  const empaques: EmpaqueSaldo[] = lineas.flatMap((l) => {
    const loteId = loteDeProceso.get(l.proceso_id);
    return loteId ? [{ loteId, articuloId: l.articulo_pt_id, unidades: l.unidades }] : [];
  });
  if (empaques.length === 0) return [];

  const lotesIds = [...new Set(empaques.map((e) => e.loteId))];
  const reaperturas: EmpaqueSaldo[] = [];
  const conversiones: ConversionSaldo[] = [];
  for (const ids of trozos(lotesIds, LOTE_IDS)) {
    const [r, c] = await Promise.all([
      cafe.from("reaperturas").select("lote_id, articulo_pt_id, unidades").in("lote_id", ids),
      cafe.from("conversiones_presentacion").select("lote_id, articulo_origen_id, articulo_destino_id, unidades_origen, unidades_destino").in("lote_id", ids),
    ]);
    if (r.error || c.error) throw new Error("No se pudo cargar lo reabierto y convertido");
    reaperturas.push(...(r.data ?? []).map((x) => ({ loteId: x.lote_id, articuloId: x.articulo_pt_id, unidades: x.unidades })));
    conversiones.push(...(c.data ?? []).map((x) => ({ loteId: x.lote_id, origenId: x.articulo_origen_id, destinoId: x.articulo_destino_id, unidadesOrigen: x.unidades_origen, unidadesDestino: x.unidades_destino })));
  }

  const saldos = saldosPorLote(empaques, reaperturas, conversiones);
  const codigos = new Map<string, string>();
  for (const ids of trozos(lotesIds, LOTE_IDS)) {
    const { data, error } = await cafe.from("lotes").select("id, codigo").in("id", ids).is("anulado_at", null).eq("linea", "marca_propia");
    if (error) throw new Error("No se pudo cargar los lotes");
    for (const l of data ?? []) codigos.set(l.id, l.codigo);
  }
  const conStock = new Set(articulosConStock);
  return saldos
    .filter((s) => conStock.has(s.articuloId) && codigos.has(s.loteId))
    .map((s) => ({ loteId: s.loteId, codigo: codigos.get(s.loteId)!, articuloId: s.articuloId, unidades: s.unidades }))
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export interface LoteTercero {
  id: string;
  codigo: string;
  cliente: string;
  etapa: string;
  estado: string;
  kg: number;
  fechaRecepcion: string;
  dias: number;
}

const ETAPA: Record<string, string> = { recibido: "Recibido", en_proceso: "En proceso", parcial: "En proceso (parcial)", listo: "Listo para entregar" };

/** Lotes de servicio que siguen en planta (recibidos, en proceso o listos, sin entregar ni anular): café de clientes. */
export async function getLotesTercerosEnPlanta(hoy: string): Promise<LoteTercero[]> {
  const cafe = (await createClient()).schema("cafe");
  const filas: LoteTercero[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await cafe
      .from("v_lotes")
      .select("id, codigo, tercero_nombre, estado, avance_texto, peso_actual_kg, fecha_recepcion")
      .eq("linea", "servicio")
      .in("estado", ["recibido", "en_proceso", "parcial", "listo"])
      .order("fecha_recepcion")
      .order("codigo")
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error("No se pudo cargar el café de terceros en planta");
    for (const l of data ?? []) {
      if (!l.id || !l.codigo || !l.fecha_recepcion) continue;
      const estado = l.estado ?? "recibido";
      filas.push({
        id: l.id,
        codigo: l.codigo,
        cliente: l.tercero_nombre ?? "—",
        etapa: `${ETAPA[estado] ?? estado}${l.avance_texto && estado !== "listo" && estado !== "recibido" ? ` · ${l.avance_texto}` : ""}`,
        estado,
        kg: Number(l.peso_actual_kg ?? 0),
        fechaRecepcion: l.fecha_recepcion,
        dias: diasEnPlanta(l.fecha_recepcion, hoy),
      });
    }
    if ((data?.length ?? 0) < PAGINA) break;
  }
  return filas;
}

const sumarDias = (fecha: string, dias: number): string => {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
};

/**
 * Libras vendidas por producto en los últimos 30 días contados hasta `hoy` inclusive (ventas y cortesías no anuladas), con
 * `cafe.libras_vendidas`. Si la base falla se devuelve vacío: la cobertura sale «—» en vez de romper el inventario.
 */
export async function getLibrasVendidas30d(hoy: string): Promise<LibrasVendidas[]> {
  const r = await callRpc("cafe", "libras_vendidas", { p_desde: sumarDias(hoy, -(DIAS_VENTANA_COBERTURA - 1)), p_hasta: hoy });
  return r.ok ? leerLibrasVendidas(r.data) : [];
}

export interface ValorACosto {
  /** COP: Σ libras × costo por libra de cada tipo × presentación que tiene costo. */
  total: number;
  /** `false` si algún producto con existencias no tiene costo calculable (sin tostión, sin precio de insumos…). */
  completo: boolean;
}

/**
 * Valor a costo del producto terminado = Σ libras disponibles × costo por libra (B-13). El costo de cada tipo × presentación es el
 * promedio ponderado por kg empacado de los lotes de marca propia con costo (`cafe.costo_libra_panel`, todo el histórico);
 * un producto sin costo no se valora (y `completo` = false). Las existencias de carga inicial no tienen lote: tampoco se valoran
 * aquí. Si la función del panel no está disponible (módulo `cafe.dashboard`) devuelve `null`.
 */
export async function getValorACosto(productos: readonly ProductoTerminado[], hoy: string): Promise<ValorACosto | null> {
  const conStock = productos.filter((p) => p.stock > 0);
  if (conStock.length === 0) return { total: 0, completo: true };
  try {
    const costoPor = new Map<string, number | null>();
    for (const g of [...new Set(conStock.map((p) => p.presentacionG))]) {
      for (const c of promedioPonderadoPorCalidad(await getCostoLibraPanel(desdeHistorico(hoy), hoy, g))) costoPor.set(`${c.tipoCafeId}:${g}`, c.costoLibra);
    }
    let total = 0;
    let completo = true;
    for (const p of conStock) {
      const costo = costoPor.get(`${p.tipoCafeId}:${p.presentacionG}`) ?? null;
      if (costo === null) completo = false;
      else total += p.stock * (p.presentacionG / 500) * costo;
    }
    return { total: Math.round(total), completo };
  } catch {
    return null;
  }
}
