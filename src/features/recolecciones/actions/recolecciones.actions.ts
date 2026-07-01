"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/check-permissions";
import { getUserRole, getCurrentUser } from "@/lib/auth/get-user-role";
import type { Recoleccion } from "@/types";

export async function getRecolecciones(): Promise<Recoleccion[]> {
  const supabase = await createClient();

  // Filtrar por ruta asignada si el usuario es cooperativa_user
  const role = await getUserRole();
  let fincaIdsFiltro: number[] | null = null;

  if (role === "cooperativa_user") {
    const user = await getCurrentUser();
    if (user) {
      const { data: userIt } = await supabase
        .from("user_itinerarios")
        .select("itinerario_id")
        .eq("user_id", user.id)
        .single();

      if (userIt) {
        const { data: fincasIt } = await supabase
          .from("itinerarios_fincas")
          .select("finca_id")
          .eq("itinerario_id", userIt.itinerario_id);
        fincaIdsFiltro = (fincasIt ?? []).map((f: any) => f.finca_id as number);
      } else {
        return []; // sin itinerario asignado → sin recolecciones
      }
    }
  }

  if (fincaIdsFiltro !== null && fincaIdsFiltro.length === 0) return [];

  const PAGE = 1000;
  const allRows: any[] = [];
  let from = 0;

  while (true) {
    let q = supabase
      .from("recolecciones")
      .select(
        "id, finca_id, fecha, litros, precio_litro, created_at, fincas_cooperativa(nombre, rutas_fincas(rutas_cooperativa(nombre)))"
      )
      .order("fecha", { ascending: false })
      .range(from, from + PAGE - 1);

    if (fincaIdsFiltro !== null) {
      q = q.in("finca_id", fincaIdsFiltro);
    }

    const { data, error } = await q;
    if (error) throw new Error("No se pudieron cargar las recolecciones");
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return allRows.map((row: any) => {
    const finca = Array.isArray(row.fincas_cooperativa)
      ? row.fincas_cooperativa[0]
      : row.fincas_cooperativa;
    const rutasFincasRaw = finca?.rutas_fincas;
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
      id: row.id,
      finca_id: row.finca_id,
      finca_nombre: finca?.nombre ?? "—",
      ruta_nombre: rutaNombre,
      fecha: row.fecha,
      litros: Number(row.litros),
      precio_litro: Number(row.precio_litro),
      valor_total: Number(row.litros) * Number(row.precio_litro),
      created_at: row.created_at,
    };
  });
}

export async function createRecoleccion(formData: {
  finca_id: number;
  fecha: string;
  litros: number;
}) {
  await requireRole(["cooperativa_admin", "cooperativa_user"]);
  const supabase = await createClient();

  const { data: fincaData, error: fincaError } = await supabase
    .from("fincas_cooperativa")
    .select("precio_litro")
    .eq("id", formData.finca_id)
    .single();
  if (fincaError) throw new Error("No se encontró la finca seleccionada");

  const { error } = await supabase.from("recolecciones").insert({
    finca_id: formData.finca_id,
    fecha: formData.fecha,
    litros: formData.litros,
    precio_litro: fincaData.precio_litro,
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error("Ya existe una recolección para esta finca en esta fecha");
    }
    throw new Error("No se pudo registrar la recolección");
  }

  revalidatePath("/dashboard/recolecciones");
  revalidatePath("/dashboard/cooperativa");
}

export async function updateRecoleccion(
  id: number,
  formData: { finca_id: number; fecha: string; litros: number }
) {
  await requireRole(["cooperativa_admin", "cooperativa_user"]);
  const supabase = await createClient();

  const { data: fincaData, error: fincaError } = await supabase
    .from("fincas_cooperativa")
    .select("precio_litro")
    .eq("id", formData.finca_id)
    .single();
  if (fincaError) throw new Error("No se encontró la finca seleccionada");

  const { error } = await supabase
    .from("recolecciones")
    .update({
      finca_id: formData.finca_id,
      fecha: formData.fecha,
      litros: formData.litros,
      precio_litro: fincaData.precio_litro,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      throw new Error("Ya existe una recolección para esta finca en esta fecha");
    }
    throw new Error("No se pudo actualizar la recolección");
  }

  revalidatePath("/dashboard/recolecciones");
  revalidatePath("/dashboard/cooperativa");
}

export async function deleteRecoleccion(id: number) {
  await requireRole(["cooperativa_admin", "cooperativa_user"]);
  const supabase = await createClient();
  const { error } = await supabase.from("recolecciones").delete().eq("id", id);
  if (error) throw new Error("No se pudo eliminar la recolección");
  revalidatePath("/dashboard/recolecciones");
  revalidatePath("/dashboard/cooperativa");
}
