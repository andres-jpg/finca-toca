"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/utils";
import type { Toro } from "@/types";

export async function getToros(): Promise<Toro[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("toros")
    .select("id, created_at, toro_id, nombre, origen, fecha_compra, numero_registro, madre_id, alta, madre:madre_id(nombre)")
    .order("toro_id", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    created_at: row.created_at,
    toro_id: row.toro_id,
    nombre: row.nombre,
    origen: row.origen,
    fecha_compra: row.fecha_compra,
    numero_registro: row.numero_registro,
    madre_id: row.madre_id,
    madre_nombre: row.madre?.nombre ?? null,
    alta: row.alta,
  }));
}

export async function createToro(formData: {
  toro_id: number;
  nombre: string;
  origen: "finca" | "externa";
  fecha_compra?: Date | null;
  numero_registro?: string;
  madre_id?: string | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("toros").insert({
    toro_id: formData.toro_id,
    nombre: formData.nombre,
    origen: formData.origen,
    fecha_compra: formData.fecha_compra ? formatDate(formData.fecha_compra) : null,
    numero_registro: formData.numero_registro || null,
    madre_id: formData.madre_id || null,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/toros");
}

export async function updateToro(
  id: string,
  formData: {
    toro_id: number;
    nombre: string;
    origen: "finca" | "externa";
    fecha_compra?: Date | null;
    numero_registro?: string;
    madre_id?: string | null;
  }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("toros")
    .update({
      toro_id: formData.toro_id,
      nombre: formData.nombre,
      origen: formData.origen,
      fecha_compra: formData.fecha_compra ? formatDate(formData.fecha_compra) : null,
      numero_registro: formData.numero_registro || null,
      madre_id: formData.madre_id || null,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/toros");
}

export async function venderToro(id: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("toros")
    .update({ alta: false })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/toros");
}

export async function deleteToro(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("toros").delete().eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/toros");
}
