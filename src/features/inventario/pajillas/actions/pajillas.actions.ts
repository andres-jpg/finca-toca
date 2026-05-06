"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/utils";
import type { Pajilla, PajillaPorToro } from "@/types";

export async function getPajillas(): Promise<Pajilla[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pajillas")
    .select("id, created_at, toro_nombre, toro_ref_id, fecha_compra, cantidad, cantidad_disponible, observaciones")
    .order("fecha_compra", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row: any) => ({
    id: row.id,
    created_at: row.created_at,
    toro_nombre: row.toro_nombre,
    toro_ref_id: row.toro_ref_id,
    fecha_compra: row.fecha_compra,
    cantidad: row.cantidad,
    cantidad_disponible: row.cantidad_disponible,
    observaciones: row.observaciones ?? null,
  }));
}

export async function getPajillasPorToro(): Promise<PajillaPorToro[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pajillas")
    .select("toro_nombre, toro_ref_id, cantidad, cantidad_disponible");

  if (error) throw new Error(error.message);

  const grouped = new Map<string, PajillaPorToro>();
  for (const row of data ?? []) {
    const existing = grouped.get(row.toro_ref_id);
    if (existing) {
      existing.total_disponible += row.cantidad_disponible;
      existing.total_inicial += row.cantidad;
    } else {
      grouped.set(row.toro_ref_id, {
        toro_nombre: row.toro_nombre,
        toro_ref_id: row.toro_ref_id,
        total_disponible: row.cantidad_disponible,
        total_inicial: row.cantidad,
      });
    }
  }

  return Array.from(grouped.values()).sort((a, b) =>
    a.toro_nombre.localeCompare(b.toro_nombre)
  );
}

export async function createPajillas(formData: {
  toro_nombre: string;
  toro_ref_id: string;
  fecha_compra: Date;
  cantidad: number;
  observaciones?: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("pajillas").insert({
    toro_nombre: formData.toro_nombre,
    toro_ref_id: formData.toro_ref_id,
    fecha_compra: formatDate(formData.fecha_compra),
    cantidad: formData.cantidad,
    cantidad_disponible: formData.cantidad,
    observaciones: formData.observaciones || null,
  });

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/inventario");
}

export async function usarPajillas(id: string, cantidad: number) {
  const supabase = await createClient();

  const { data, error: fetchError } = await supabase
    .from("pajillas")
    .select("cantidad_disponible")
    .eq("id", id)
    .single();

  if (fetchError) throw new Error(fetchError.message);
  if (data.cantidad_disponible < cantidad) {
    throw new Error(
      `Solo hay ${data.cantidad_disponible} pajilla(s) disponibles en este lote`
    );
  }

  const { error } = await supabase
    .from("pajillas")
    .update({ cantidad_disponible: data.cantidad_disponible - cantidad })
    .eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/inventario");
}

export async function deletePajilla(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("pajillas").delete().eq("id", id);

  if (error) throw new Error(error.message);

  revalidatePath("/dashboard/inventario");
}
