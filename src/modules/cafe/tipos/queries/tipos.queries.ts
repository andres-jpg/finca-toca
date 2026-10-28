import { createClient } from "@/lib/supabase/server";
import type { TipoCafe } from "../types";

// Módulo plano (no "use server"): solo lo llama código de servidor. La autorización es el RLS: sin el
// módulo `cafe.recepcion` activo, o sin membresía en el cliente actual, la lista sale vacía.

/** Tipos de café del cliente actual (activos e inactivos), en su orden y luego por nombre. El catálogo es pequeño: no pagina. */
export async function listarTiposCafe(): Promise<TipoCafe[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("cafe")
    .from("tipos_cafe")
    .select("*")
    .order("orden")
    .order("nombre");
  if (error) throw new Error("No se pudieron cargar los tipos de café");
  return data ?? [];
}
