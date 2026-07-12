"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/check-permissions";
import { getCurrentUser } from "@/lib/auth/get-user-role";
import type { UserCooperativa } from "@/types";

export async function getCooperativaUsers(): Promise<UserCooperativa[]> {
  await requireRole(["cooperativa_admin"]);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_cooperativa_users");
  if (error) throw new Error("No se pudieron cargar los usuarios");

  return (data ?? []).map((row: any) => ({
    id: row.user_id as string,
    email: row.email as string,
    rol: row.rol as UserCooperativa["rol"],
    itinerario_id: row.itinerario_id as number | null,
    itinerario_nombre: row.itinerario_nombre as string | null,
  }));
}

export async function asignarItinerario(userId: string, itinerarioId: number) {
  await requireRole(["cooperativa_admin"]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("user_itinerarios")
    .upsert({ user_id: userId, itinerario_id: itinerarioId }, { onConflict: "user_id" });
  if (error) throw new Error("No se pudo asignar el itinerario");

  revalidatePath("/dashboard/usuarios-cooperativa");
}

export async function desasignarItinerario(userId: string) {
  await requireRole(["cooperativa_admin"]);
  const supabase = await createClient();

  const { error } = await supabase.from("user_itinerarios").delete().eq("user_id", userId);
  if (error) throw new Error("No se pudo quitar el itinerario");

  revalidatePath("/dashboard/usuarios-cooperativa");
}

export async function getItinerarioIdAsignado(): Promise<number | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data } = await supabase
    .from("user_itinerarios")
    .select("itinerario_id")
    .eq("user_id", user.id)
    .single();

  return data?.itinerario_id ?? null;
}
