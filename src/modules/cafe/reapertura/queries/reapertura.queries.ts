import { createClient } from "@/lib/supabase/server";
import { getStock } from "@/modules/core/inventario/queries/inventario.queries";
import { getLineasEmpaque } from "../../empaque/queries/empaque.queries";
import type { ReaperturaLinea } from "../../lotes/lib/linea-tiempo";
import { textoReapertura } from "../lib/reapertura";
import type { EstadoReapertura, ProcesoDeReapertura, ReaperturaVista, SaldoPresentacion } from "../types";

// Módulo plano (no "use server"): solo lo llama código de servidor. La autorización es el RLS: las vistas son
// `security_invoker`, así que sin el módulo `cafe.procesos` activo, o sin membresía en el cliente actual, todo sale
// vacío. Nada de estados guardados: el estado y el saldo salen de `cafe.v_reaperturas` / `cafe.v_saldo_reabrible`.

const num = (n: number | null | undefined): number => (n === null || n === undefined ? 0 : Number(n));

const COLUMNAS =
  "id, lote_id, lote_codigo, tipo_cafe_nombre, producto, presentacion_g, unidades, peso_kg, fecha, motivo, estado, molienda_id, empaque_id, peso_disponible_kg, created_at, created_by";

type Fila = {
  id: string;
  lote_id: string;
  lote_codigo: string;
  tipo_cafe_nombre: string | null;
  producto: string | null;
  presentacion_g: number;
  unidades: number;
  peso_kg: number | null;
  fecha: string;
  motivo: string | null;
  estado: string | null;
  molienda_id: string | null;
  empaque_id: string | null;
  peso_disponible_kg: number | null;
  created_at: string;
  created_by: string | null;
};

function aVista(f: Fila): ReaperturaVista {
  return {
    id: f.id,
    loteId: f.lote_id,
    loteCodigo: f.lote_codigo,
    tipoCafe: f.tipo_cafe_nombre,
    producto: f.producto ?? "Producto terminado",
    presentacionG: f.presentacion_g,
    unidades: f.unidades,
    pesoKg: num(f.peso_kg),
    fecha: f.fecha,
    motivo: f.motivo,
    estado: (f.estado ?? "pendiente") as EstadoReapertura, // la vista solo emite estos tres valores
    moliendaId: f.molienda_id,
    empaqueId: f.empaque_id,
    pesoDisponibleKg: num(f.peso_disponible_kg),
    creadoEn: f.created_at,
    creadoPor: f.created_by,
  };
}

/**
 * Lo empacado, lo reabierto y el saldo de CADA presentación de un lote, más lo que hay en el inventario de ese
 * producto (el tope global). Solo salen las presentaciones que el lote empacó alguna vez.
 */
export async function getSaldosReabribles(loteId: string): Promise<SaldoPresentacion[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("cafe")
    .from("v_saldo_reabrible")
    .select("presentacion_g, articulo_pt_id, unidades_empacadas, unidades_reabiertas, saldo")
    .eq("lote_id", loteId)
    .order("presentacion_g", { ascending: true });
  if (error) throw new Error("No se pudo cargar el saldo reabrible del lote");
  if (!data?.length) return [];

  const productos = await getStock({ tipo: "producto_terminado", incluirInactivos: true });
  const porId = new Map(productos.map((p) => [p.articulo_id, p]));
  return data.flatMap((s): SaldoPresentacion[] => {
    if (!s.articulo_pt_id) return [];
    const producto = porId.get(s.articulo_pt_id);
    return [
      {
        presentacionG: s.presentacion_g,
        articuloId: s.articulo_pt_id,
        producto: producto?.nombre ?? "Producto terminado",
        empacadas: num(s.unidades_empacadas),
        reabiertas: num(s.unidades_reabiertas),
        saldo: Math.max(0, num(s.saldo)),
        stockGlobal: producto?.stock ?? 0,
      },
    ];
  });
}

/** Las reaperturas de un lote, de la más antigua a la más reciente. */
export async function getReaperturasDeLote(loteId: string): Promise<ReaperturaVista[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("cafe")
    .from("v_reaperturas")
    .select(COLUMNAS)
    .eq("lote_id", loteId)
    .order("fecha", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error("No se pudieron cargar las reaperturas del lote");
  return (data ?? []).map((f) => aVista(f as Fila));
}

/** Una reapertura (`null` si no existe o no es de este cliente). */
export async function getReapertura(id: string): Promise<ReaperturaVista | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("cafe").from("v_reaperturas").select(COLUMNAS).eq("id", id).maybeSingle();
  if (error) throw new Error("No se pudo cargar la reapertura");
  return data ? aVista(data as Fila) : null;
}

/**
 * Reaperturas con trabajo pendiente (sin proceso o ya molidas pero sin empacar), la más antigua primero: son las
 * tarjetas que la cola de planta muestra junto al café de marca propia. Una reapertura sale de la cola sola cuando la
 * base la da por `completada` (empacada).
 */
export async function getReaperturasPendientes(): Promise<ReaperturaVista[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("cafe")
    .from("v_reaperturas")
    .select(COLUMNAS)
    .in("estado", ["pendiente", "en_proceso"])
    .order("fecha", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw new Error("No se pudieron cargar las reaperturas pendientes");
  return (data ?? []).map((f) => aVista(f as Fila));
}

/** Los procesos (molienda y empaque, vigentes y anulados) de esas reaperturas, con sus presentaciones empacadas. */
export async function getProcesosDeReaperturas(reaperturaIds: readonly string[]): Promise<ProcesoDeReapertura[]> {
  if (reaperturaIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("cafe")
    .from("procesos")
    .select("id, reapertura_id, tipo, fecha, peso_entrada_kg, peso_salida_kg, merma_kg, anulado_at, created_at")
    .in("reapertura_id", [...reaperturaIds])
    .order("created_at", { ascending: true });
  if (error) throw new Error("No se pudieron cargar los procesos de las reaperturas");
  const filas = data ?? [];
  const lineas = await getLineasEmpaque(filas.filter((p) => p.tipo === "empaque").map((p) => p.id));
  return filas.flatMap((p): ProcesoDeReapertura[] =>
    p.reapertura_id && (p.tipo === "molienda" || p.tipo === "empaque")
      ? [
          {
            id: p.id,
            reaperturaId: p.reapertura_id,
            tipo: p.tipo,
            fecha: p.fecha,
            pesoEntradaKg: num(p.peso_entrada_kg),
            pesoSalidaKg: num(p.peso_salida_kg),
            mermaKg: num(p.merma_kg),
            anulado: p.anulado_at !== null,
            lineasEmpaque: lineas.get(p.id) ?? [],
          },
        ]
      : [],
  );
}

/** Todo lo de reaperturas que muestra la ficha de un lote de marca propia. */
export interface ReaperturasDeFicha {
  saldos: SaldoPresentacion[];
  reaperturas: ReaperturaVista[];
  procesos: ProcesoDeReapertura[];
  /** Las mismas reaperturas como eventos de la línea de tiempo. */
  eventos: ReaperturaLinea[];
}

/**
 * Saldos, reaperturas, sus procesos y sus eventos de línea de tiempo en una sola llamada. Es un extra de la ficha: si
 * la lectura falla (p. ej. la migración de reaperturas aún no se aplicó en este entorno mientras se despliega el código)
 * la ficha se muestra igual, sin esa sección.
 */
export async function getReaperturasDeFicha(loteId: string, usuarios: ReadonlyMap<string, string>): Promise<ReaperturasDeFicha> {
  try {
    const [saldos, reaperturas] = await Promise.all([getSaldosReabribles(loteId), getReaperturasDeLote(loteId)]);
    const procesos = await getProcesosDeReaperturas(reaperturas.map((r) => r.id));
    const eventos = reaperturas.map(
      (r): ReaperturaLinea => ({
        id: r.id,
        fecha: r.fecha,
        creadoEn: r.creadoEn,
        creadoPor: r.creadoPor ? (usuarios.get(r.creadoPor) ?? null) : null,
        presentacionG: r.presentacionG,
        unidades: r.unidades,
        producto: r.producto,
        pesoKg: r.pesoKg,
        motivo: r.motivo,
        texto: textoReapertura(r.unidades, r.producto, r.pesoKg),
      }),
    );
    return { saldos, reaperturas, procesos, eventos };
  } catch {
    return { saldos: [], reaperturas: [], procesos: [], eventos: [] };
  }
}
