"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { Ingreso } from "@/types";

export async function getIngresos(): Promise<Ingreso[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ingresos")
    .select("*")
    .order("fecha", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function createIngreso(formData: {
  fecha: Date;
  concepto: string;
  valor: number;
  observaciones?: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("ingresos").insert({
    fecha: formData.fecha.toISOString().split("T")[0],
    concepto: formData.concepto,
    valor: formData.valor,
    observaciones: formData.observaciones || null,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/ingresos");
  revalidatePath("/dashboard");
}

export async function updateIngreso(
  id: number,
  formData: { fecha: Date; concepto: string; valor: number; observaciones?: string }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("ingresos")
    .update({
      fecha: formData.fecha.toISOString().split("T")[0],
      concepto: formData.concepto,
      valor: formData.valor,
      observaciones: formData.observaciones || null,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/ingresos");
  revalidatePath("/dashboard");
}

export async function deleteIngreso(id: number) {
  const supabase = await createClient();
  const { error } = await supabase.from("ingresos").delete().eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/ingresos");
  revalidatePath("/dashboard");
}
