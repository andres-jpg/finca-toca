"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/check-permissions";
import type { RutaCooperativa, FincaCooperativa } from "@/types";

export async function getRutas(): Promise<RutaCooperativa[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rutas_cooperativa")
    .select(
      "id, nombre, created_at, rutas_fincas(finca_id, orden, fincas_cooperativa(id, nombre, precio_litro, activa, created_at))"
    )
    .order("nombre");
  if (error) throw new Error("No se pudieron cargar las rutas");

  return (data ?? []).map((row: any) => ({
    id: row.id,
    nombre: row.nombre,
    created_at: row.created_at,
    fincas: (row.rutas_fincas ?? [])
      .sort((a: any, b: any) => a.orden - b.orden)
      .map((rf: any) => {
        const f = Array.isArray(rf.fincas_cooperativa)
          ? rf.fincas_cooperativa[0]
          : rf.fincas_cooperativa;
        return { ...f, orden: rf.orden } as FincaCooperativa;
      }),
  }));
}

export async function createRuta(formData: {
  nombre: string;
  finca_ids: number[];
}) {
  await requireRole(["cooperativa_admin"]);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("rutas_cooperativa")
    .insert({ nombre: formData.nombre })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") throw new Error("Ya existe una ruta con ese nombre");
    throw new Error("No se pudo crear la ruta");
  }

  const rutaId = data.id;
  if (formData.finca_ids.length > 0) {
    const { error: junctionError } = await supabase
      .from("rutas_fincas")
      .insert(formData.finca_ids.map((finca_id, index) => ({ ruta_id: rutaId, finca_id, orden: index })));
    if (junctionError) {
      if (junctionError.code === "23505") {
        throw new Error("Una o más fincas seleccionadas ya pertenecen a otra ruta");
      }
      throw new Error("No se pudieron asignar las fincas a la ruta");
    }
  }

  revalidatePath("/dashboard/rutas-cooperativa");
  revalidatePath("/dashboard/cooperativa");
}

export async function updateRuta(
  id: number,
  formData: { nombre: string; finca_ids: number[] }
) {
  await requireRole(["cooperativa_admin"]);
  const supabase = await createClient();

  const { error: updateError } = await supabase
    .from("rutas_cooperativa")
    .update({ nombre: formData.nombre })
    .eq("id", id);
  if (updateError) {
    if (updateError.code === "23505") throw new Error("Ya existe una ruta con ese nombre");
    throw new Error("No se pudo actualizar la ruta");
  }

  const { error: deleteError } = await supabase
    .from("rutas_fincas")
    .delete()
    .eq("ruta_id", id);
  if (deleteError) throw new Error("No se pudieron actualizar las fincas asignadas a la ruta");

  if (formData.finca_ids.length > 0) {
    const { error: insertError } = await supabase
      .from("rutas_fincas")
      .insert(formData.finca_ids.map((finca_id, index) => ({ ruta_id: id, finca_id, orden: index })));
    if (insertError) {
      if (insertError.code === "23505") {
        throw new Error("Una o más fincas seleccionadas ya pertenecen a otra ruta");
      }
      throw new Error("No se pudieron asignar las fincas a la ruta");
    }
  }

  revalidatePath("/dashboard/rutas-cooperativa");
  revalidatePath("/dashboard/cooperativa");
}

export async function deleteRuta(id: number) {
  await requireRole(["cooperativa_admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("rutas_cooperativa").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") throw new Error("No se puede eliminar esta ruta porque tiene recolecciones asociadas");
    throw new Error("No se pudo eliminar la ruta");
  }
  revalidatePath("/dashboard/rutas-cooperativa");
  revalidatePath("/dashboard/cooperativa");
}

export async function updateFincasOrden(rutaId: number, fincaIds: number[]) {
  await requireRole(["cooperativa_admin"]);
  const supabase = await createClient();

  await Promise.all(
    fincaIds.map((fincaId, index) =>
      supabase
        .from("rutas_fincas")
        .update({ orden: index })
        .eq("ruta_id", rutaId)
        .eq("finca_id", fincaId)
    )
  );

  revalidatePath("/dashboard/rutas-cooperativa");
  revalidatePath("/dashboard/recolecciones");
}
