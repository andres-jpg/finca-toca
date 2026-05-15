"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { FincaCooperativa } from "@/types";

const FINCA_SELECT =
  "id, nombre, precio_litro, activa, created_at, rutas_fincas(rutas_cooperativa(nombre))";

function mapFinca(row: any): FincaCooperativa {
  const rf = row.rutas_fincas;
  const rutasFincas: any[] = Array.isArray(rf) ? rf : rf ? [rf] : [];
  const rutaObj = rutasFincas[0]?.rutas_cooperativa;
  const rutaNombre = rutaObj
    ? Array.isArray(rutaObj)
      ? rutaObj[0]?.nombre ?? null
      : rutaObj.nombre ?? null
    : null;
  return {
    id: row.id,
    nombre: row.nombre,
    precio_litro: Number(row.precio_litro),
    activa: row.activa,
    created_at: row.created_at,
    ruta_nombre: rutaNombre,
  };
}

export async function getFincas(): Promise<FincaCooperativa[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fincas_cooperativa")
    .select(FINCA_SELECT)
    .order("nombre");
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapFinca);
}

export async function getFincasActivas(): Promise<FincaCooperativa[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fincas_cooperativa")
    .select(FINCA_SELECT)
    .eq("activa", true)
    .order("nombre");
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapFinca);
}

export async function createFinca(formData: {
  nombre: string;
  precio_litro: number;
  activa: boolean;
  ruta_id?: number | null;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fincas_cooperativa")
    .insert({ nombre: formData.nombre, precio_litro: formData.precio_litro, activa: formData.activa })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  if (formData.ruta_id) {
    const { error: rutaError } = await supabase
      .from("rutas_fincas")
      .insert({ ruta_id: formData.ruta_id, finca_id: data.id });
    if (rutaError) throw new Error(rutaError.message);
  }

  revalidatePath("/dashboard/fincas-cooperativa");
  revalidatePath("/dashboard/rutas-cooperativa");
  revalidatePath("/dashboard/cooperativa");
}

export async function updateFinca(
  id: number,
  formData: {
    nombre: string;
    precio_litro: number;
    activa: boolean;
    ruta_id?: number | null;
  }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("fincas_cooperativa")
    .update({ nombre: formData.nombre, precio_litro: formData.precio_litro, activa: formData.activa })
    .eq("id", id);
  if (error) throw new Error(error.message);

  // Reemplaza la asignación de ruta
  await supabase.from("rutas_fincas").delete().eq("finca_id", id);
  if (formData.ruta_id) {
    const { error: rutaError } = await supabase
      .from("rutas_fincas")
      .insert({ ruta_id: formData.ruta_id, finca_id: id });
    if (rutaError) throw new Error(rutaError.message);
  }

  revalidatePath("/dashboard/fincas-cooperativa");
  revalidatePath("/dashboard/rutas-cooperativa");
  revalidatePath("/dashboard/cooperativa");
  revalidatePath("/dashboard/recolecciones");
}

export async function deleteFinca(id: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("fincas_cooperativa")
    .delete()
    .eq("id", id);
  if (error) {
    if (error.code === "23503") {
      throw new Error(
        "No se puede eliminar esta finca porque tiene recolecciones asociadas"
      );
    }
    throw new Error(error.message);
  }
  revalidatePath("/dashboard/fincas-cooperativa");
  revalidatePath("/dashboard/cooperativa");
}
