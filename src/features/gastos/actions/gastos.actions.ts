"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/utils";
import type { Gasto, ConceptoGasto } from "@/types";

export async function getGastos(): Promise<Gasto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gastos")
    .select(
      "id, fecha, subconcepto_id, valor, numero_factura, pagado, observaciones, subconceptos_gasto(nombre, conceptos_gasto(nombre))"
    )
    .order("fecha", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    fecha: row.fecha,
    subconcepto_id: row.subconcepto_id,
    concepto: row.subconceptos_gasto?.conceptos_gasto?.nombre ?? "",
    subconcepto: row.subconceptos_gasto?.nombre ?? "",
    valor: row.valor,
    numero_factura: row.numero_factura,
    pagado: row.pagado,
    observaciones: row.observaciones,
  }));
}

export async function getConceptosGasto(): Promise<ConceptoGasto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conceptos_gasto")
    .select("id, nombre, subconceptos_gasto(id, concepto_id, nombre)")
    .order("nombre");

  if (error) throw new Error(error.message);

  return (data ?? []).map((c: any) => ({
    id: c.id,
    nombre: c.nombre,
    subconceptos: (c.subconceptos_gasto ?? []).map((s: any) => ({
      id: s.id,
      concepto_id: s.concepto_id,
      nombre: s.nombre,
    })),
  }));
}

export async function createGasto(formData: {
  fecha: Date;
  subconcepto_id?: number | null;
  valor: number;
  numero_factura?: string;
  pagado: boolean;
  observaciones?: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("gastos").insert({
    fecha: formatDate(formData.fecha),
    subconcepto_id: formData.subconcepto_id ?? null,
    valor: formData.valor,
    numero_factura: formData.numero_factura || null,
    pagado: formData.pagado,
    observaciones: formData.observaciones || null,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/gastos");
  revalidatePath("/dashboard");
}

export async function updateGasto(
  id: number,
  formData: {
    fecha: Date;
    subconcepto_id?: number | null;
    valor: number;
    numero_factura?: string;
    pagado: boolean;
    observaciones?: string;
  }
) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("gastos")
    .update({
      fecha: formatDate(formData.fecha),
      subconcepto_id: formData.subconcepto_id ?? null,
      valor: formData.valor,
      numero_factura: formData.numero_factura || null,
      pagado: formData.pagado,
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
