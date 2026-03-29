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
      "id, fecha, subconcepto_id, valor, proveedor, numero_factura, pagado, observaciones, subconceptos_gasto(nombre, conceptos_gasto(nombre)), pagos(forma_pago, tipo_cuenta, banco, numero_cuenta)"
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
    proveedor: row.proveedor ?? null,
    numero_factura: row.numero_factura,
    pagado: row.pagado,
    observaciones: row.observaciones,
    pago: Array.isArray(row.pagos) ? (row.pagos[0] ?? null) : (row.pagos ?? null),
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
  proveedor?: string;
  numero_factura?: string;
  pagado: boolean;
  forma_pago?: string | null;
  tipo_cuenta?: string;
  banco?: string;
  numero_cuenta?: string;
  observaciones?: string;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gastos")
    .insert({
      fecha: formatDate(formData.fecha),
      subconcepto_id: formData.subconcepto_id ?? null,
      valor: formData.valor,
      proveedor: formData.proveedor || null,
      numero_factura: formData.numero_factura || null,
      pagado: formData.pagado,
      observaciones: formData.observaciones || null,
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  if (formData.pagado && formData.forma_pago) {
    const { error: pagoError } = await supabase.from("pagos").insert({
      gasto_id: data.id,
      forma_pago: formData.forma_pago,
      tipo_cuenta: formData.forma_pago === "transferencia" ? (formData.tipo_cuenta || null) : null,
      banco: formData.forma_pago === "transferencia" ? (formData.banco || null) : null,
      numero_cuenta: formData.forma_pago === "transferencia" ? (formData.numero_cuenta || null) : null,
    });
    if (pagoError) throw new Error(pagoError.message);
  }

  revalidatePath("/dashboard/gastos");
  revalidatePath("/dashboard");
}

export async function updateGasto(
  id: number,
  formData: {
    fecha: Date;
    subconcepto_id?: number | null;
    valor: number;
    proveedor?: string;
    numero_factura?: string;
    pagado: boolean;
    forma_pago?: string | null;
    tipo_cuenta?: string;
    banco?: string;
    numero_cuenta?: string;
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
      proveedor: formData.proveedor || null,
      numero_factura: formData.numero_factura || null,
      pagado: formData.pagado,
      observaciones: formData.observaciones || null,
    })
    .eq("id", id);

  if (error) throw new Error(error.message);

  if (formData.pagado && formData.forma_pago) {
    const { error: pagoError } = await supabase.from("pagos").upsert(
      {
        gasto_id: id,
        forma_pago: formData.forma_pago,
        tipo_cuenta: formData.forma_pago === "transferencia" ? (formData.tipo_cuenta || null) : null,
        banco: formData.forma_pago === "transferencia" ? (formData.banco || null) : null,
        numero_cuenta: formData.forma_pago === "transferencia" ? (formData.numero_cuenta || null) : null,
      },
      { onConflict: "gasto_id" }
    );
    if (pagoError) throw new Error(pagoError.message);
  } else {
    await supabase.from("pagos").delete().eq("gasto_id", id);
  }

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
