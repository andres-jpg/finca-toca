"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { Vaca } from "@/types";

export async function getVacas(): Promise<Vaca[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vacas")
    .select("*")
    .order("vaca_id", { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

export async function createVaca(formData: {
  vaca_id: number;
  nombre: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("vacas").insert({
    vaca_id: formData.vaca_id,
    nombre: formData.nombre,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/vacas");
}

export async function updateVaca(
  id: string,
  formData: { vaca_id: number; nombre: string }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("vacas")
    .update({
      vaca_id: formData.vaca_id,
      nombre: formData.nombre,
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
