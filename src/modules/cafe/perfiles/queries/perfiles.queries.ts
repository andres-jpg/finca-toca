import { createClient } from "@/lib/supabase/server";
import { aPerfilTueste } from "../lib/perfil-vigente";
import type { PerfilTuesteTipo } from "../types";

// Módulo plano (no "use server"): solo lo llama código de servidor. La autorización es el RLS de
// `cafe.perfil_tueste_tipo`: sin el módulo `cafe.recepcion` o sin membresía en el cliente actual sale vacío.

/**
 * Todas las versiones de perfil del cliente actual (tipos y maquila), de la más reciente a la más antigua.
 * Son pocas filas: no pagina. Para resolver «el perfil de un tipo a una fecha» pásalas a `resolverPerfilVigente`.
 */
export async function listarPerfilesTueste(): Promise<PerfilTuesteTipo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("cafe")
    .from("perfil_tueste_tipo")
    .select("*")
    .order("vigente_desde", { ascending: false });
  if (error) throw new Error("No se pudieron cargar los perfiles de tueste");
  return (data ?? []).map(aPerfilTueste);
}

/**
 * Perfil vigente de un tipo de café en `fecha` (`YYYY-MM-DD`, zona del cliente); `tipoCafeId = null` = maquila.
 * Llama a `cafe.perfil_tueste_vigente()`. `null` si no hay perfil a esa fecha.
 */
export async function obtenerPerfilTuesteVigente(
  tipoCafeId: string | null,
  fecha: string,
): Promise<PerfilTuesteTipo | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("cafe")
    // `p_tipo` admite NULL (maquila) aunque los tipos generados lo marquen como string.
    .rpc("perfil_tueste_vigente", { p_tipo: tipoCafeId as string, p_fecha: fecha });
  if (error) throw new Error("No se pudo consultar el perfil de tueste vigente");
  const fila = data?.[0];
  return fila ? aPerfilTueste(fila) : null;
}
