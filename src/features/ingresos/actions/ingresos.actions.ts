"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/utils";
import type { Ingreso, ConceptoIngreso } from "@/types";

export async function getIngresos(): Promise<Ingreso[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ingresos")
    .select(
      "id, fecha, subconcepto_id, valor, observaciones, source, subconceptos_ingreso(nombre, conceptos_ingreso(nombre))"
    )
    .order("fecha", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    fecha: row.fecha,
    subconcepto_id: row.subconcepto_id,
    concepto: row.subconceptos_ingreso?.conceptos_ingreso?.nombre ?? "",
    subconcepto: row.subconceptos_ingreso?.nombre ?? "",
    valor: row.valor,
    observaciones: row.observaciones,
    source: row.source ?? null,
  }));
}

export async function getConceptosIngreso(): Promise<ConceptoIngreso[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conceptos_ingreso")
    .select("id, nombre, subconceptos_ingreso(id, concepto_id, nombre)")
    .order("nombre");

  if (error) throw new Error(error.message);

  return (data ?? []).map((c: any) => ({
    id: c.id,
    nombre: c.nombre,
    subconceptos: (c.subconceptos_ingreso ?? []).map((s: any) => ({
      id: s.id,
      concepto_id: s.concepto_id,
      nombre: s.nombre,
    })),
  }));
}

export async function createIngreso(formData: {
  fecha: Date;
  subconcepto_id: number;
  valor: number;
  observaciones?: string;
  vacaIdToSell?: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("ingresos").insert({
    fecha: formatDate(formData.fecha),
    subconcepto_id: formData.subconcepto_id,
    valor: formData.valor,
    observaciones: formData.observaciones || null,
  });

  if (error) throw new Error(error.message);

  if (formData.vacaIdToSell) {
    const { error: vacaError } = await supabase
      .from("vacas")
      .update({ alta: false })
      .eq("id", formData.vacaIdToSell);
    if (vacaError) throw new Error(vacaError.message);
    revalidatePath("/dashboard/vacas");
  }

  revalidatePath("/dashboard/ingresos");
  revalidatePath("/dashboard");
}

export async function updateIngreso(
  id: number,
  formData: {
    fecha: Date;
    subconcepto_id: number;
    valor: number;
    observaciones?: string;
  }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("ingresos")
    .update({
      fecha: formatDate(formData.fecha),
      subconcepto_id: formData.subconcepto_id,
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
