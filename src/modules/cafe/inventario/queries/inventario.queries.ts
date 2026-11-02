import { createClient } from "@/lib/supabase/server";
import { saldosPorLote, diasEnPlanta, type ConversionSaldo, type EmpaqueSaldo } from "../lib/inventario";

// Lecturas de las pestañas del inventario (A-15). Módulo plano (no "use server"): solo lo llama código de servidor.
// La autorización es el RLS (`security_invoker` en las vistas): sin el módulo o sin membresía todo sale vacío.
// Cada lista es de UNA pestaña; ninguna función suma kilos de dos pestañas.

const PAGINA = 1000;
const LOTE_IDS = 100;

const trozos = <T,>(xs: readonly T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export interface CafeVerdeTipo {
  tipoCafe: string;
  bultos: number;
  kg: number;
}

/** Café verde de marca propia que aún no se ha tostado: bultos y kg por tipo de café (lotes no anulados). */
export async function getCafeVerde(): Promise<CafeVerdeTipo[]> {
  const cafe = (await createClient()).schema("cafe");
  const bultos: { lote_id: string; peso_actual_kg: number }[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await cafe
      .from("v_bultos_estado")
      .select("lote_id, peso_actual_kg, pasos")
      .not("pasos", "cs", "{tostion}")
      .order("lote_id")
      .order("numero")
      .range(desde, desde + PAGINA - 1);
    if (error) throw new Error("No se pudo cargar el café verde");
    bultos.push(...(data ?? []).map((b) => ({ lote_id: b.lote_id, peso_actual_kg: Number(b.peso_actual_kg ?? 0) })));
    if ((data?.length ?? 0) < PAGINA) break;
  }
  if (bultos.length === 0) return [];

  const idsLotes = [...new Set(bultos.map((b) => b.lote_id))];
  const tipoDe = new Map<string, string>();
  for (const ids of trozos(idsLotes, LOTE_IDS)) {
    const { data, error } = await cafe.from("v_lotes").select("id, tipo_cafe_nombre").in("id", ids).eq("linea", "marca_propia").is("anulado_at", null);
    if (error) throw new Error("No se pudo cargar el café verde");
    for (const l of data ?? []) if (l.id) tipoDe.set(l.id, l.tipo_cafe_nombre ?? "Sin tipo");
  }

  const porTipo = new Map<string, CafeVerdeTipo>();
  for (const b of bultos) {
    const tipo = tipoDe.get(b.lote_id);
    if (!tipo) continue; // lote de servicio o anulado: no es nuestro café verde
    const f = porTipo.get(tipo) ?? { tipoCafe: tipo, bultos: 0, kg: 0 };
    f.bultos += 1;
    f.kg += b.peso_actual_kg;
    porTipo.set(tipo, f);
  }
  return [...porTipo.values()].sort((a, b) => a.tipoCafe.localeCompare(b.tipoCafe, "es"));
}

export interface GranelLote {
  loteId: string;
  codigo: string;
  tipoCafe: string | null;
  kg: number;
}

/** Tostado a granel (kg) por lote de marca propia: lo que «quedó a granel» al empacar (A-01). */
export async function getGranelPorLote(): Promise<GranelLote[]> {
  const cafe = (await createClient()).schema("cafe");
  const { data, error } = await cafe.from("v_granel_lote").select("lote_id, kg_granel").gt("kg_granel", 0);
  if (error) throw new Error("No se pudo cargar el tostado a granel");
  const filas = (data ?? []).flatMap((g) => (g.lote_id ? [{ loteId: g.lote_id, kg: Number(g.kg_granel ?? 0) }] : []));
  const lotes = new Map<string, { codigo: string; tipoCafe: string | null }>();
  for (const ids of trozos(filas.map((f) => f.loteId), LOTE_IDS)) {
    const { data: ls, error: e2 } = await cafe.from("v_lotes").select("id, codigo, tipo_cafe_nombre").in("id", ids).eq("linea", "marca_propia").is("anulado_at", null);
    if (e2) throw new Error("No se pudo cargar el tostado a granel");
    for (const l of ls ?? []) if (l.id && l.codigo) lotes.set(l.id, { codigo: l.codigo, tipoCafe: l.tipo_cafe_nombre });
  }
  return filas
    .flatMap((f) => {
      const l = lotes.get(f.loteId);
      return l ? [{ loteId: f.loteId, codigo: l.codigo, tipoCafe: l.tipoCafe, kg: f.kg }] : [];
    })
    .sort((a, b) => b.kg - a.kg);
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
