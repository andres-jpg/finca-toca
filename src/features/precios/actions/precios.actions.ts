"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import type { Precio } from "@/types";

export async function getPrecioActual(): Promise<Precio | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("precios")
    .select("*")
    .eq("tipo", "leche")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function getHistorialPrecios(): Promise<Precio[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("precios")
    .select("*")
    .eq("tipo", "leche")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function setPrecio(valor: number): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("precios").insert({ valor, tipo: "leche" });

  if (error) throw new Error(error.message);
  revalidatePath("/dashboard/configuracion");
}
