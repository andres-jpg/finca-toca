"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { Milking } from "@/types";

export async function getMilkings(): Promise<Milking[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("milkings")
    .select("*")
    .order("date", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function createMilking(formData: {
  liters: number;
  date: Date;
  observations?: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("milkings").insert({
    liters: formData.liters,
    date: formData.date.toISOString().split("T")[0],
    observations: formData.observations || null,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/milkings");
  revalidatePath("/dashboard");
}

export async function updateMilking(
  id: number,
  formData: { liters: number; date: Date; observations?: string }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("milkings")
    .update({
      liters: formData.liters,
      date: formData.date.toISOString().split("T")[0],
      observations: formData.observations || null,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/milkings");
  revalidatePath("/dashboard");
}

export async function deleteMilking(id: number) {
  const supabase = await createClient();
  const { error } = await supabase.from("milkings").delete().eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/milkings");
  revalidatePath("/dashboard");
}
