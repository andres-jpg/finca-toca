"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/utils";
import { requireRole } from "@/lib/auth/check-permissions";

const CAMPOS = "id, animal_id, fecha, litros, created_at";

/**
 * Fila cruda de la tabla, sin `dias_en_leche`: ese campo se deriva en la página (que ya
 * tiene el historial de eventos del animal) con `calcularDiasEnLecheEnFecha()`, igual que
 * la edad o el DEL de hoy — no se calcula aquí para no traer los eventos dos veces.
 */
export interface MedicionLecheRow {
  id: string;
  animal_id: string;
  fecha: string;
  litros: number;
  created_at: string;
}

export async function getMedicionesLeche(animalId: string): Promise<MedicionLecheRow[]> {
  await requireRole(["admin", "user", "viewer"]);
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("mediciones_leche_animal")
    .select(CAMPOS)
    .eq("animal_id", animalId)
    .order("fecha", { ascending: false });

  if (error) throw new Error("No se pudieron cargar las mediciones de leche");
  return (data ?? []) as MedicionLecheRow[];
}

interface MedicionLecheFormData {
  fecha: Date;
  litros: number;
}

export async function createMedicionLeche(animalId: string, formData: MedicionLecheFormData) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();

  const { error } = await supabase.from("mediciones_leche_animal").insert({
    animal_id: animalId,
    fecha: formatDate(formData.fecha),
    litros: formData.litros,
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error("Ya existe una medición para este animal en esa fecha");
    }
    throw new Error("No se pudo registrar la medición");
  }

  revalidatePath(`/dashboard/animales/${animalId}`);
}

export async function updateMedicionLeche(
  id: string,
  animalId: string,
  formData: MedicionLecheFormData
) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("mediciones_leche_animal")
    .update({ fecha: formatDate(formData.fecha), litros: formData.litros })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      throw new Error("Ya existe una medición para este animal en esa fecha");
    }
    throw new Error("No se pudo actualizar la medición");
  }

  revalidatePath(`/dashboard/animales/${animalId}`);
}

export async function deleteMedicionLeche(id: string, animalId: string) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();

  const { error } = await supabase.from("mediciones_leche_animal").delete().eq("id", id);
  if (error) throw new Error("No se pudo eliminar la medición");

  revalidatePath(`/dashboard/animales/${animalId}`);
}
