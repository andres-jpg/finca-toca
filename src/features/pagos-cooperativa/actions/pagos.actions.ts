"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/check-permissions";
import { getCurrentUser } from "@/lib/auth/get-user-role";
import { fetchAllRecolecciones } from "@/lib/cooperativa/recolecciones";
import type { PagoFinca } from "@/types";
import type { ActivarPagoItem, FincaConLitros, ItinerarioGroup } from "../schemas/pago.schema";

export async function getFincasConLitrosPorRuta(
  rutaId: number,
  fechaInicio: string,
  fechaFin: string
): Promise<ItinerarioGroup[]> {
  await requireRole(["cooperativa_admin"]);
  const supabase = await createClient();

  // Fincas de la ruta con su itinerario y metodo_pago
  const { data: rutaFincas, error } = await supabase
    .from("rutas_fincas")
    .select(
      "finca_id, fincas_cooperativa(id, nombre, metodo_pago, itinerarios_fincas(itinerario_id, itinerarios(id, nombre, user_itinerarios(user_id))))"
    )
    .eq("ruta_id", rutaId);

  if (error || !rutaFincas) return [];

  const fincaIds = rutaFincas.map((rf: any) => rf.finca_id as number);
  if (fincaIds.length === 0) return [];

  // Litros por finca en el período
  const recolecciones = await fetchAllRecolecciones(supabase, fincaIds, fechaInicio, fechaFin);
  const litrosPorFinca = new Map<number, number>();
  for (const r of recolecciones) {
    litrosPorFinca.set(r.finca_id, (litrosPorFinca.get(r.finca_id) ?? 0) + r.litros);
  }

  // Resolver emails de conductores en batch
  const conductorUserIds = new Set<string>();
  for (const rf of rutaFincas) {
    const fc = Array.isArray((rf as any).fincas_cooperativa)
      ? (rf as any).fincas_cooperativa[0]
      : (rf as any).fincas_cooperativa;
    const itf = fc?.itinerarios_fincas;
    const itfRow = Array.isArray(itf) ? itf[0] : itf;
    const it = itfRow?.itinerarios;
    const itRow = Array.isArray(it) ? it[0] : it;
    const ui = itRow?.user_itinerarios;
    const uiRows: any[] = Array.isArray(ui) ? ui : ui ? [ui] : [];
    for (const u of uiRows) if (u?.user_id) conductorUserIds.add(u.user_id);
  }

  const emailMap = new Map<string, string>();
  if (conductorUserIds.size > 0) {
    const { data: rpcUsers } = await supabase.rpc("get_cooperativa_users");
    for (const u of rpcUsers ?? []) {
      if (u.user_id && u.email) emailMap.set(u.user_id, u.email);
    }
  }

  // Construir fincas con litros
  const fincaRows: FincaConLitros[] = [];
  for (const rf of rutaFincas) {
    const fc = Array.isArray((rf as any).fincas_cooperativa)
      ? (rf as any).fincas_cooperativa[0]
      : (rf as any).fincas_cooperativa;
    if (!fc) continue;

    const litros = litrosPorFinca.get(rf.finca_id) ?? 0;
    if (litros === 0) continue; // excluir fincas sin recolección en el período

    const itf = fc?.itinerarios_fincas;
    const itfRow = Array.isArray(itf) ? itf[0] : itf;
    const it = itfRow?.itinerarios;
    const itRow = Array.isArray(it) ? it[0] : it;
    const ui = itRow?.user_itinerarios;
    const uiRows: any[] = Array.isArray(ui) ? ui : ui ? [ui] : [];
    const conductorUserId = uiRows[0]?.user_id ?? null;

    fincaRows.push({
      finca_id: rf.finca_id,
      finca_nombre: fc.nombre,
      itinerario_id: itRow?.id ?? null,
      itinerario_nombre: itRow?.nombre ?? null,
      conductor_email: conductorUserId ? (emailMap.get(conductorUserId) ?? null) : null,
      litros,
      metodo_pago: fc.metodo_pago ?? "conductor",
    });
  }

  // Agrupar por itinerario
  const groups = new Map<string, ItinerarioGroup>();
  for (const f of fincaRows) {
    const key = f.itinerario_id !== null ? String(f.itinerario_id) : "__sin_itinerario__";
    if (!groups.has(key)) {
      groups.set(key, {
        itinerario_id: f.itinerario_id,
        itinerario_nombre: f.itinerario_nombre,
        conductor_email: f.conductor_email,
        fincas: [],
      });
    }
    groups.get(key)!.fincas.push(f);
  }

  return [...groups.values()];
}

export async function activarPago(
  items: ActivarPagoItem[],
  fechaInicio: string,
  fechaFin: string
): Promise<void> {
  await requireRole(["cooperativa_admin"]);
  // requireRole() ya resolvió getCurrentUser() internamente (cacheado por request),
  // esta llamada no dispara un segundo round-trip.
  const user = await getCurrentUser();
  const supabase = await createClient();

  const rows = items.map((item) => ({
    finca_id: item.finca_id,
    itinerario_id: item.itinerario_id,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin,
    litros: item.litros,
    responsable: item.responsable,
    estado: "pendiente" as const,
    activado_por: user?.id ?? null,
  }));

  const { error } = await supabase.from("pagos_finca").insert(rows);
  if (error) throw new Error("No se pudieron crear los registros de pago: " + error.message);

  revalidatePath("/dashboard/pagos-cooperativa");
}

export interface PagosHistorialFilters {
  itinerario_id?: number;
  finca_id?: number;
  fecha_desde?: string;
  fecha_hasta?: string;
  responsable?: string;
  estado?: string;
}

export async function getPagosHistorial(
  filters: PagosHistorialFilters = {}
): Promise<PagoFinca[]> {
  await requireRole(["cooperativa_admin"]);
  const supabase = await createClient();

  let query = supabase
    .from("pagos_finca")
    .select(
      "id, finca_id, itinerario_id, fecha_inicio, fecha_fin, litros, estado, responsable, fecha_marcado, activado_por, marcado_por, created_at, fincas_cooperativa(nombre), itinerarios(nombre)"
    )
    .order("created_at", { ascending: false });

  if (filters.finca_id) query = query.eq("finca_id", filters.finca_id);
  if (filters.itinerario_id) query = query.eq("itinerario_id", filters.itinerario_id);
  if (filters.responsable) query = query.eq("responsable", filters.responsable);
  if (filters.estado) query = query.eq("estado", filters.estado);
  if (filters.fecha_desde) query = query.gte("fecha_inicio", filters.fecha_desde);
  if (filters.fecha_hasta) query = query.lte("fecha_fin", filters.fecha_hasta);

  const { data, error } = await query;
  if (error) throw new Error("No se pudo cargar el historial de pagos");

  return (data ?? []).map((row: any) => {
    const fc = Array.isArray(row.fincas_cooperativa)
      ? row.fincas_cooperativa[0]
      : row.fincas_cooperativa;
    const it = Array.isArray(row.itinerarios) ? row.itinerarios[0] : row.itinerarios;
    return {
      id: row.id,
      finca_id: row.finca_id,
      finca_nombre: fc?.nombre ?? `Finca ${row.finca_id}`,
      itinerario_id: row.itinerario_id,
      itinerario_nombre: it?.nombre ?? null,
      fecha_inicio: row.fecha_inicio,
      fecha_fin: row.fecha_fin,
      litros: Number(row.litros),
      estado: row.estado,
      responsable: row.responsable,
      fecha_marcado: row.fecha_marcado,
      activado_por: row.activado_por,
      marcado_por: row.marcado_por,
      created_at: row.created_at,
    };
  });
}

export async function updateEstadoPago(
  id: number,
  estado: "pendiente" | "pagado" | "punto_venta" | "devuelto",
  responsable?: "conductor" | "punto_venta" | "gerente"
): Promise<void> {
  await requireRole(["cooperativa_admin"]);
  const supabase = await createClient();

  const update: Record<string, unknown> = { estado, updated_at: new Date().toISOString() };
  if (responsable) update.responsable = responsable;

  const { error } = await supabase.from("pagos_finca").update(update).eq("id", id);
  if (error) throw new Error("No se pudo actualizar el estado del pago");

  revalidatePath("/dashboard/pagos-cooperativa");
}
