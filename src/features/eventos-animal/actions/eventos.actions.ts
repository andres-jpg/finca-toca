"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/utils";
import { requireRole } from "@/lib/auth/check-permissions";
import type { EventoAnimal } from "@/types";

export async function getEventosAnimal(
  animalId: string,
  animalTipo: "vaca" | "toro"
): Promise<EventoAnimal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("eventos_animal")
    .select("*")
    .eq("animal_id", animalId)
    .eq("animal_tipo", animalTipo)
    .order("fecha", { ascending: false });

  if (error) throw new Error("No se pudieron cargar los eventos del animal");
  return data ?? [];
}

export async function createEventoAnimal(formData: {
  animal_id: string;
  animal_tipo: "vaca" | "toro";
  tipo_evento: string;
  fecha: Date;
  descripcion?: string;
  responsable?: string;
}) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();
  const { error } = await supabase.from("eventos_animal").insert({
    animal_id: formData.animal_id,
    animal_tipo: formData.animal_tipo,
    tipo_evento: formData.tipo_evento,
    fecha: formatDate(formData.fecha),
    descripcion: formData.descripcion || null,
    responsable: formData.responsable || null,
  });

  if (error) throw new Error("No se pudo registrar el evento");

  revalidatePath(`/dashboard/animales/${formData.animal_id}`);
}

export async function updateEventoAnimal(
  id: string,
  formData: {
    animal_id: string;
    animal_tipo: "vaca" | "toro";
    tipo_evento: string;
    fecha: Date;
    descripcion?: string;
    responsable?: string;
  }
) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("eventos_animal")
    .update({
      tipo_evento: formData.tipo_evento,
      fecha: formatDate(formData.fecha),
      descripcion: formData.descripcion || null,
      responsable: formData.responsable || null,
    })
    .eq("id", id);

  if (error) throw new Error("No se pudo actualizar el evento");

  revalidatePath(`/dashboard/animales/${formData.animal_id}`);
}
