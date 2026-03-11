"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/utils";
import type { ExtraccionLeche } from "@/types";
import type { SupabaseClient } from "@supabase/supabase-js";

async function upsertIngresoLeche(
  fecha: string,
  supabase: SupabaseClient
): Promise<void> {
  // 1. Get current leche price
  const { data: precioRow } = await supabase
    .from("precios")
    .select("valor")
    .eq("tipo", "leche")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 2. Sum litros for the day
  const { data: extRows } = await supabase
    .from("extracciones_leche")
    .select("litros")
    .eq("fecha", fecha);

  const totalLitros = (extRows ?? []).reduce((sum, r) => sum + r.litros, 0);

  // 3. Find existing auto-ingreso for this day
  const { data: existing } = await supabase
    .from("ingresos")
    .select("id")
    .eq("fecha", fecha)
    .eq("source", "leche_extraccion")
    .maybeSingle();

  // 4. If no price or no litros, delete auto-ingreso if it exists
  if (!precioRow || totalLitros === 0) {
    if (existing?.id) {
      await supabase.from("ingresos").delete().eq("id", existing.id);
    }
    return;
  }

  const valor = Math.round(totalLitros * precioRow.valor);

  // 5. Update or insert
  if (existing?.id) {
    await supabase.from("ingresos").update({ valor }).eq("id", existing.id);
  } else {
    // Lookup leche subconcepto
    const { data: subconcepto } = await supabase
      .from("subconceptos_ingreso")
      .select("id")
      .ilike("nombre", "%leche%")
      .order("id", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!subconcepto?.id) {
      console.error("upsertIngresoLeche: no se encontró subconcepto 'leche' en subconceptos_ingreso");
      return;
    }

    await supabase.from("ingresos").insert({
      fecha,
      subconcepto_id: subconcepto.id,
      valor,
      observaciones: "Auto-generado desde extracciones",
      source: "leche_extraccion",
    });
  }
}

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

  await upsertIngresoLeche(formatDate(formData.fecha), supabase);

  revalidatePath("/dashboard/extracciones");
  revalidatePath("/dashboard/ingresos");
  revalidatePath("/dashboard");
}

export async function updateExtraccion(
  id: number,
  formData: { fecha: Date; litros: number }
) {
  const supabase = await createClient();

  // Fetch previous date before updating
  const { data: oldRow } = await supabase
    .from("extracciones_leche")
    .select("fecha")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("extracciones_leche")
    .update({
      fecha: formatDate(formData.fecha),
      litros: formData.litros,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  const newFechaStr = formatDate(formData.fecha);
  if (oldRow && oldRow.fecha !== newFechaStr) {
    await upsertIngresoLeche(oldRow.fecha, supabase);
  }
  await upsertIngresoLeche(newFechaStr, supabase);

  revalidatePath("/dashboard/extracciones");
  revalidatePath("/dashboard/ingresos");
  revalidatePath("/dashboard");
}

export async function deleteExtraccion(id: number) {
  const supabase = await createClient();

  // Fetch date before deleting
  const { data: row } = await supabase
    .from("extracciones_leche")
    .select("fecha")
    .eq("id", id)
    .single();

  const { error } = await supabase
    .from("extracciones_leche")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);

  if (row?.fecha) await upsertIngresoLeche(row.fecha, supabase);

  revalidatePath("/dashboard/extracciones");
  revalidatePath("/dashboard/ingresos");
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

export async function getLecheMesQuincenas(): Promise<{
  q1Litros: number;
  q1Valor: number;
  q2Litros: number;
  q2Valor: number;
}> {
  const supabase = await createClient();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const q1Start = formatDate(new Date(year, month, 1));
  const q1End = formatDate(new Date(year, month, 15));
  const q2Start = formatDate(new Date(year, month, 16));
  const q2End = formatDate(new Date(year, month + 1, 0));

  const [
    { data: ext1 },
    { data: ext2 },
    { data: ing1 },
    { data: ing2 },
  ] = await Promise.all([
    supabase.from("extracciones_leche").select("litros").gte("fecha", q1Start).lte("fecha", q1End),
    supabase.from("extracciones_leche").select("litros").gte("fecha", q2Start).lte("fecha", q2End),
    supabase.from("ingresos").select("valor").eq("source", "leche_extraccion").gte("fecha", q1Start).lte("fecha", q1End),
    supabase.from("ingresos").select("valor").eq("source", "leche_extraccion").gte("fecha", q2Start).lte("fecha", q2End),
  ]);

  return {
    q1Litros: (ext1 ?? []).reduce((s, r) => s + r.litros, 0),
    q1Valor: (ing1 ?? []).reduce((s, r) => s + r.valor, 0),
    q2Litros: (ext2 ?? []).reduce((s, r) => s + r.litros, 0),
    q2Valor: (ing2 ?? []).reduce((s, r) => s + r.valor, 0),
  };
}
