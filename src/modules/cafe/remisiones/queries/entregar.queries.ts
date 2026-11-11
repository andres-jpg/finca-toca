import { createClient } from "@/lib/supabase/server";
import { fetchAllPaginado } from "@/modules/core/export/lib/paginar";
import { getLineasEmpaque } from "@/modules/cafe/empaque/queries/empaque.queries";
import type { NivelTueste, TipoProceso } from "@/modules/cafe/lotes/types";
import type { ExtrasLoteTiquete, LoteEntregable } from "../lib/entregar";

// Módulo plano (no "use server"): solo lo llama código de servidor. La autorización es el RLS (vistas `security_invoker`).

/**
 * Los lotes de servicio LISTOS (todos los servicios completos, sin remisión entregada): lo que se puede entregar.
 * Cada uno con su valor real por servicio (lo que cobró cada proceso). Ordenados por cliente y código.
 */
export async function getLotesEntregables(): Promise<LoteEntregable[]> {
  const cafe = (await createClient()).schema("cafe");
  const lotes = await fetchAllPaginado((desde, hasta) =>
    cafe
      .from("v_lotes")
      .select("id, codigo, tercero_id, tercero_nombre, fecha_recepcion, peso_recibido_kg, peso_actual_kg")
      .eq("estado", "listo")
      .eq("linea", "servicio")
      .not("tercero_id", "is", null)
      .order("tercero_nombre", { ascending: true })
      .order("codigo", { ascending: true })
      .range(desde, hasta),
  );
  if (lotes.length === 0) return [];

  const ids = lotes.map((l) => l.id as string);
  const etapas = new Map<string, LoteEntregable["servicios"]>();
  for (let i = 0; i < ids.length; i += 50) {
    const filas = await fetchAllPaginado((desde, hasta) =>
      cafe
        .from("v_lote_etapas")
        .select("lote_id, tipo, valor, peso_entrada, peso_salida")
        .in("lote_id", ids.slice(i, i + 50))
        .order("lote_id")
        .order("tipo")
        .range(desde, hasta),
    );
    for (const e of filas) {
      etapas.set(e.lote_id as string, [
        ...(etapas.get(e.lote_id as string) ?? []),
        { tipo: e.tipo as TipoProceso, valor: Number(e.valor ?? 0), kgEntrada: Number(e.peso_entrada ?? 0), kgSalida: Number(e.peso_salida ?? 0) },
      ]);
    }
  }

  return lotes.map((l) => ({
    id: l.id as string,
    codigo: l.codigo as string,
    terceroId: l.tercero_id as string,
    cliente: (l.tercero_nombre as string | null) ?? "—",
    fechaRecepcion: l.fecha_recepcion as string,
    pesoRecibidoKg: Number(l.peso_recibido_kg),
    pesoEntregadoKg: Number(l.peso_actual_kg ?? l.peso_recibido_kg),
    servicios: etapas.get(l.id as string) ?? [],
  }));
}

/**
 * Lo que el tiquete añade del lote y que la remisión no guarda: hora de llegada (A-11), perfil de tueste pedido (A-09)
 * y cómo se empacó (A-01/A-02: bolsas del cliente y café suelto). Un lote entregado no admite procesos, así que leerlo
 * en vivo equivale a leerlo al entregar.
 */
export async function getExtrasTiquete(loteIds: readonly string[]): Promise<Map<string, ExtrasLoteTiquete>> {
  const resultado = new Map<string, ExtrasLoteTiquete>();
  if (loteIds.length === 0) return resultado;
  const cafe = (await createClient()).schema("cafe");
  const ids = [...loteIds];

  const { data: lotes, error } = await cafe
    .from("v_lotes")
    .select("id, created_at, fecha_recepcion, nivel_tueste, perfil_temp_c, perfil_tiempo_min")
    .in("id", ids);
  if (error) throw new Error("No se pudieron cargar los datos de los lotes");

  const { data: procesos, error: errorProcesos } = await cafe
    .from("procesos")
    .select("id, lote_id, diferencia_kg, diferencia_destino")
    .in("lote_id", ids)
    .eq("tipo", "empaque")
    .is("anulado_at", null);
  if (errorProcesos) throw new Error("No se pudo cargar el empaque de los lotes");
  const lineas = await getLineasEmpaque((procesos ?? []).map((p) => p.id));

  for (const l of lotes ?? []) {
    const deLote = (procesos ?? []).filter((p) => p.lote_id === l.id);
    const bolsasCliente = deLote.flatMap((p) => (lineas.get(p.id) ?? []).filter((x) => x.bolsaCliente));
    const sueltoKg = deLote.reduce((a, p) => a + (p.diferencia_destino === "suelto" ? Number(p.diferencia_kg ?? 0) : 0), 0);
    resultado.set(l.id as string, {
      llegadaEn: l.created_at as string,
      fechaRecepcion: l.fecha_recepcion as string,
      nivelTueste: (l.nivel_tueste as NivelTueste | null) ?? null,
      perfilTempC: l.perfil_temp_c ?? null,
      perfilTiempoMin: l.perfil_tiempo_min ?? null,
      bolsasCliente: bolsasCliente.map((b) => ({ tamano: b.producto, unidades: b.unidades })),
      sueltoKg,
    });
  }
  return resultado;
}
