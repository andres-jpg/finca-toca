"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { Gasto } from "@/types";

export async function getGastos(): Promise<Gasto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gastos")
    .select("*")
    .order("fecha", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function createGasto(formData: {
  fecha: Date;
  concepto: string;
  valor: number;
  observaciones?: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("gastos").insert({
    fecha: formData.fecha.toISOString().split("T")[0],
    concepto: formData.concepto,
    valor: formData.valor,
    observaciones: formData.observaciones || null,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/gastos");
  revalidatePath("/dashboard");
}

export async function updateGasto(
  id: number,
  formData: { fecha: Date; concepto: string; valor: number; observaciones?: string }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("gastos")
    .update({
      fecha: formData.fecha.toISOString().split("T")[0],
      concepto: formData.concepto,
      valor: formData.valor,
      observaciones: formData.observaciones || null,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/gastos");
  revalidatePath("/dashboard");
}

export async function deleteGasto(id: number) {
  const supabase = await createClient();
  const { error } = await supabase.from("gastos").delete().eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/gastos");
  revalidatePath("/dashboard");
}
