"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/utils";
import type { Vaca } from "@/types";

export async function getVacas(): Promise<Vaca[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vacas")
    .select("id, created_at, vaca_id, nombre, origen, estado, fecha_compra, numero_registro, madre_id, madre:madre_id(nombre)")
    .order("vaca_id", { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    created_at: row.created_at,
    vaca_id: row.vaca_id,
    nombre: row.nombre,
    origen: row.origen,
    estado: row.estado,
    fecha_compra: row.fecha_compra,
    numero_registro: row.numero_registro,
    madre_id: row.madre_id,
    madre_nombre: row.madre?.nombre ?? null,
  }));
}

export async function createVaca(formData: {
  vaca_id: number;
  nombre: string;
  origen: "finca" | "externa";
  estado: "produccion" | "secado" | "pre_jardin" | "jardin";
  fecha_compra?: Date | null;
  numero_registro?: string;
  madre_id?: string | null;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("vacas").insert({
    vaca_id: formData.vaca_id,
    nombre: formData.nombre,
    origen: formData.origen,
    estado: formData.estado,
    fecha_compra: formData.fecha_compra ? formatDate(formData.fecha_compra) : null,
    numero_registro: formData.numero_registro || null,
    madre_id: formData.madre_id || null,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/vacas");
}

export async function updateVaca(
  id: string,
  formData: {
    vaca_id: number;
    nombre: string;
    origen: "finca" | "externa";
    estado: "produccion" | "secado" | "pre_jardin" | "jardin";
    fecha_compra?: Date | null;
    numero_registro?: string;
    madre_id?: string | null;
  }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("vacas")
    .update({
      vaca_id: formData.vaca_id,
      nombre: formData.nombre,
      origen: formData.origen,
      estado: formData.estado,
      fecha_compra: formData.fecha_compra ? formatDate(formData.fecha_compra) : null,
      numero_registro: formData.numero_registro || null,
      madre_id: formData.madre_id || null,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/vacas");
}

export async function deleteVaca(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("vacas").delete().eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/vacas");
}
