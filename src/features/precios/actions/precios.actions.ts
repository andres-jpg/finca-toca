"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/check-permissions";
import type { Precio } from "@/types";
import type { Tables } from "@/lib/supabase/database.types";

// `created_at` es nullable en la tabla (tiene DEFAULT now(), así que en la práctica siempre viene).
function mapPrecio(row: Tables<"precios">): Precio {
  return { id: row.id, created_at: row.created_at ?? "", valor: row.valor, tipo: row.tipo };
}

export async function getPrecioActual(): Promise<Precio | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("precios")
    .select("*")
    .eq("tipo", "leche")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("No se pudo cargar el precio actual");
  return data ? mapPrecio(data) : null;
}

export async function getHistorialPrecios(): Promise<Precio[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("precios")
    .select("*")
    .eq("tipo", "leche")
    .order("created_at", { ascending: false });

  if (error) throw new Error("No se pudo cargar el historial de precios");
  return (data ?? []).map(mapPrecio);
}

export async function setPrecio(valor: number): Promise<void> {
  await requireRole(["admin"]);
  const supabase = await createClient();
  const { error } = await supabase.from("precios").insert({ valor, tipo: "leche" });

  if (error) throw new Error("No se pudo guardar el nuevo precio");
  revalidatePath("/dashboard/configuracion");
}
