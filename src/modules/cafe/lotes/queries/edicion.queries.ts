import { createClient } from "@/lib/supabase/server";
import type { DatosEdicion, ProcesoEditable } from "../edicion/edicion";

// A-18 · Lectura para «Editar lote» y su historial. Solo la usa quien puede editar (owner/admin); el RLS filtra por cliente.

export interface EdicionLote {
  edicionId: string;
  entidad: "lote" | "proceso" | "bache";
  referencia: string | null;
  campo: string;
  antes: string | null;
  despues: string | null;
  motivo: string;
  en: string;
  por: string | null;
}

/** Lo editable del lote: sus datos y sus procesos vigentes (sin el empaque) con baches. `null` si el lote no se puede editar. */
export async function getDatosEdicion(loteId: string): Promise<DatosEdicion | null> {
  const supabase = await createClient();
  const cafe = supabase.schema("cafe");
  const [{ data: bloqueo }, { data: lote }, { data: procesos }] = await Promise.all([
    cafe.rpc("lote_bloqueo_edicion", { p_lote: loteId }),
    cafe.from("lotes").select("id, codigo, linea, fecha_recepcion, created_at, precio_compra_kg, factura_proveedor, observaciones, peso_recibido_kg").eq("id", loteId).maybeSingle(),
    cafe
      .from("procesos")
      .select("id, tipo, fecha, peso_entrada_kg, peso_salida_kg, observaciones, created_at, baches(id, numero, peso_entrada_kg, peso_salida_kg, temperatura_c, tiempo_min)")
      .eq("lote_id", loteId)
      .is("anulado_at", null)
      .is("reapertura_id", null)
      .neq("tipo", "empaque")
      .order("created_at"),
  ]);
  if (!lote || bloqueo) return null;
  return {
    loteId: lote.id,
    codigo: lote.codigo,
    linea: lote.linea,
    fechaRecepcion: lote.fecha_recepcion,
    llegadaEn: lote.created_at,
    precioCompraKg: lote.precio_compra_kg === null ? null : Number(lote.precio_compra_kg),
    facturaProveedor: lote.factura_proveedor,
    observaciones: lote.observaciones,
    pesoRecibidoKg: Number(lote.peso_recibido_kg),
    procesos: (procesos ?? []).map(
      (p): ProcesoEditable => ({
        id: p.id,
        tipo: p.tipo,
        fecha: p.fecha,
        pesoEntradaKg: Number(p.peso_entrada_kg),
        pesoSalidaKg: Number(p.peso_salida_kg),
        observaciones: p.observaciones,
        baches: [...(p.baches ?? [])]
          .sort((a, b) => a.numero - b.numero)
          .map((b) => ({
            id: b.id,
            numero: b.numero,
            pesoEntradaKg: Number(b.peso_entrada_kg),
            pesoSalidaKg: Number(b.peso_salida_kg),
            temperaturaC: b.temperatura_c === null ? null : Number(b.temperatura_c),
            tiempoMin: b.tiempo_min === null ? null : Number(b.tiempo_min),
          })),
      }),
    ),
  };
}

/** Por qué no se puede editar el lote (`null` si se puede): para explicarlo en vez de esconderlo sin más. */
export async function getBloqueoEdicion(loteId: string): Promise<"lote_anulado" | "lote_entregado" | "lote_con_ventas" | null> {
  const supabase = await createClient();
  const { data } = await supabase.schema("cafe").rpc("lote_bloqueo_edicion", { p_lote: loteId });
  return (data as "lote_anulado" | "lote_entregado" | "lote_con_ventas" | null) ?? null;
}

/** Historial de ediciones, de la más reciente a la más antigua (cualquier miembro del cliente lo lee). */
export async function getEdicionesLote(loteId: string): Promise<EdicionLote[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("cafe").rpc("ediciones_lote", { p_lote: loteId });
  if (error || !data) return [];
  return data.map((e) => ({
    edicionId: e.edicion_id,
    entidad: e.entidad as EdicionLote["entidad"], // CHECK de la columna
    referencia: e.referencia,
    campo: e.campo,
    antes: e.valor_anterior,
    despues: e.valor_nuevo,
    motivo: e.motivo,
    en: e.created_at,
    por: e.email,
  }));
}
