"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/check-permissions";
import { getUserRole, getCurrentUser } from "@/lib/auth/get-user-role";
import type { Itinerario, ItinerarioFinca } from "@/types";

function mapItinerarioRow(row: any): Itinerario {
  const fincas: ItinerarioFinca[] = (row.itinerarios_fincas ?? [])
    .sort((a: any, b: any) => a.orden - b.orden)
    .map((iff: any) => {
      const f = Array.isArray(iff.fincas_cooperativa)
        ? iff.fincas_cooperativa[0]
        : iff.fincas_cooperativa;
      const rutasFincasRaw = f?.rutas_fincas;
      const rutasFincas: any[] = Array.isArray(rutasFincasRaw)
        ? rutasFincasRaw
        : rutasFincasRaw
        ? [rutasFincasRaw]
        : [];
      const primeraRuta = rutasFincas[0]?.rutas_cooperativa;
      const rutaNombre = primeraRuta
        ? Array.isArray(primeraRuta)
          ? primeraRuta[0]?.nombre ?? null
          : primeraRuta.nombre ?? null
        : null;
      return {
        id: f?.id,
        nombre: f?.nombre ?? "—",
        precio_litro: Number(f?.precio_litro ?? 0),
        activa: f?.activa ?? true,
        created_at: f?.created_at ?? "",
        ruta_nombre: rutaNombre,
        orden: iff.orden,
      } satisfies ItinerarioFinca;
    });

  return { id: row.id, nombre: row.nombre, fincas, conductores: [] };
}

const ITINERARIO_SELECT =
  "id, nombre, itinerarios_fincas(finca_id, orden, fincas_cooperativa(id, nombre, precio_litro, activa, created_at, rutas_fincas(rutas_cooperativa(nombre))))";

export async function getItinerarios(): Promise<Itinerario[]> {
  // get_cooperativa_users() devuelve emails de conductores — restringir a roles cooperativa
  // (un admin/user/viewer del lado finca no debería poder leer esto llamando la action directo).
  await requireRole(["admin", "cooperativa_admin", "cooperativa_user"]);

  const supabase = await createClient();
  const [{ data, error }, { data: usersData }] = await Promise.all([
    supabase.from("itinerarios").select(ITINERARIO_SELECT).order("id"),
    supabase.rpc("get_cooperativa_users"),
  ]);
  if (error) throw new Error("No se pudieron cargar los itinerarios");

  const conductoresMap = new Map<number, string[]>();
  for (const row of usersData ?? []) {
    if (row.itinerario_id) {
      const arr = conductoresMap.get(row.itinerario_id) ?? [];
      arr.push(row.email);
      conductoresMap.set(row.itinerario_id, arr);
    }
  }

  return (data ?? []).map((row) => ({
    ...mapItinerarioRow(row),
    conductores: conductoresMap.get(row.id) ?? [],
  }));
}

export async function getItinerarioAsignado(): Promise<Itinerario | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data: userIt } = await supabase
    .from("user_itinerarios")
    .select("itinerario_id")
    .eq("user_id", user.id)
    .single();

  if (!userIt) return null;

  const { data, error } = await supabase
    .from("itinerarios")
    .select(ITINERARIO_SELECT)
    .eq("id", userIt.itinerario_id)
    .single();

  if (error || !data) return null;
  return mapItinerarioRow(data);
}

export type EstadoItinerarioFinca = { id: number; nombre: string };

export type EstadoItinerarioResult = {
  itinerarioId: number;
  itinerarioNombre: string;
  fecha: string;
  total: number;
  visitadas: EstadoItinerarioFinca[];
  faltantes: EstadoItinerarioFinca[];
  completado: boolean;
};

// Estado de un itinerario en una fecha puntual: qué fincas tienen recolección
// registrada ese día y cuáles no. Una finca inactiva sin registro ese día no
// cuenta como pendiente (ya no se visita), pero si tiene registro sí se refleja
// — mismo criterio que el filtro de fincas inactivas en los informes.
export async function getEstadoItinerarioPorFecha(
  itinerarioId: number,
  fecha: string,
): Promise<EstadoItinerarioResult> {
  await requireRole(["cooperativa_admin"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("itinerarios")
    .select("nombre, itinerarios_fincas(orden, fincas_cooperativa(id, nombre, activa))")
    .eq("id", itinerarioId)
    .single();
  if (error || !data) throw new Error("Itinerario no encontrado");

  const ifList: any[] = Array.isArray(data.itinerarios_fincas) ? data.itinerarios_fincas : [];
  const fincas = ifList
    .sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))
    .map((iff: any) => {
      const f = Array.isArray(iff.fincas_cooperativa) ? iff.fincas_cooperativa[0] : iff.fincas_cooperativa;
      return f ? { id: f.id as number, nombre: f.nombre as string, activa: Boolean(f.activa) } : null;
    })
    .filter(Boolean) as { id: number; nombre: string; activa: boolean }[];

  if (fincas.length === 0) {
    return { itinerarioId, itinerarioNombre: data.nombre, fecha, total: 0, visitadas: [], faltantes: [], completado: false };
  }

  const fincaIds = fincas.map((f) => f.id);
  const { data: recs, error: recsErr } = await supabase
    .from("recolecciones")
    .select("finca_id")
    .eq("fecha", fecha)
    .in("finca_id", fincaIds);
  if (recsErr) throw new Error("No se pudieron cargar las recolecciones");

  const visitadasIds = new Set((recs ?? []).map((r) => r.finca_id as number));
  const fincasRelevantes = fincas.filter((f) => f.activa || visitadasIds.has(f.id));

  const visitadas = fincasRelevantes.filter((f) => visitadasIds.has(f.id)).map(({ id, nombre }) => ({ id, nombre }));
  const faltantes = fincasRelevantes.filter((f) => !visitadasIds.has(f.id)).map(({ id, nombre }) => ({ id, nombre }));

  return {
    itinerarioId,
    itinerarioNombre: data.nombre,
    fecha,
    total: fincasRelevantes.length,
    visitadas,
    faltantes,
    completado: fincasRelevantes.length > 0 && faltantes.length === 0,
  };
}

export async function addFincaToItinerario(itinerarioId: number, fincaId: number) {
  await requireRole(["cooperativa_admin"]);
  const supabase = await createClient();

  const { data: maxRow } = await supabase
    .from("itinerarios_fincas")
    .select("orden")
    .eq("itinerario_id", itinerarioId)
    .order("orden", { ascending: false })
    .limit(1)
    .single();

  const nextOrden = maxRow ? maxRow.orden + 1 : 0;

  const { error } = await supabase
    .from("itinerarios_fincas")
    .insert({ itinerario_id: itinerarioId, finca_id: fincaId, orden: nextOrden });

  if (error) {
    if (error.code === "23505") {
      throw new Error("Esta finca ya está asignada a otro itinerario");
    }
    throw new Error("No se pudo agregar la finca al itinerario");
  }

  revalidatePath("/dashboard/itinerarios");
}

export async function removeFincaFromItinerario(itinerarioId: number, fincaId: number) {
  await requireRole(["cooperativa_admin"]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("itinerarios_fincas")
    .delete()
    .eq("itinerario_id", itinerarioId)
    .eq("finca_id", fincaId);

  if (error) throw new Error("No se pudo quitar la finca del itinerario");

  revalidatePath("/dashboard/itinerarios");
}

export async function updateItinerarioFincasOrden(itinerarioId: number, fincaIds: number[]) {
  const role = await getUserRole();
  const supabase = await createClient();

  if (role === "cooperativa_user") {
    const user = await getCurrentUser();
    if (!user) throw new Error("No autorizado");

    const { data: userIt } = await supabase
      .from("user_itinerarios")
      .select("itinerario_id")
      .eq("user_id", user.id)
      .single();

    if (!userIt || userIt.itinerario_id !== itinerarioId) {
      throw new Error("No autorizado para modificar este itinerario");
    }
  } else if (role !== "cooperativa_admin") {
    throw new Error("No autorizado");
  }

  await Promise.all(
    fincaIds.map((fincaId, index) =>
      supabase
        .from("itinerarios_fincas")
        .update({ orden: index })
        .eq("itinerario_id", itinerarioId)
        .eq("finca_id", fincaId)
    )
  );

  revalidatePath("/dashboard/itinerarios");
  revalidatePath("/dashboard/recolecciones");
}
