"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/utils";
import type { ExtraccionLeche } from "@/types";

export async function getExtracciones(): Promise<ExtraccionLeche[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("extracciones_leche")
    .select("*")
    .order("fecha", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function createExtraccion(formData: {
  fecha: Date;
  litros: number;
}) {
  const supabase = await createClient();

  const { error } = await supabase.from("extracciones_leche").insert({
    fecha: formatDate(formData.fecha),
    litros: formData.litros,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/extracciones");
  revalidatePath("/dashboard");
}

export async function updateExtraccion(
  id: number,
  formData: { fecha: Date; litros: number }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("extracciones_leche")
    .update({
      fecha: formatDate(formData.fecha),
      litros: formData.litros,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/extracciones");
  revalidatePath("/dashboard");
}

export async function deleteExtraccion(id: number) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("extracciones_leche")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/extracciones");
  revalidatePath("/dashboard");
}

// === QUERIES ESPECÍFICAS PARA DASHBOARD ===

export async function getLitrosDiaActual(): Promise<number> {
  const supabase = await createClient();
  const hoy = formatDate(new Date());

  const { data, error } = await supabase
    .from("extracciones_leche")
    .select("litros")
    .eq("fecha", hoy);

  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, row) => sum + row.litros, 0);
}

export async function getLitrosMesActual(): Promise<number> {
  const supabase = await createClient();
  const now = new Date();
  const start = formatDate(new Date(now.getFullYear(), now.getMonth(), 1));
  const end = formatDate(new Date(now.getFullYear(), now.getMonth() + 1, 0));

  const { data, error } = await supabase
    .from("extracciones_leche")
    .select("litros")
    .gte("fecha", start)
    .lte("fecha", end);

  if (error) throw new Error(error.message);
  return (data ?? []).reduce((sum, row) => sum + row.litros, 0);
}
