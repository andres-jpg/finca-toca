"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/check-permissions";
import type { UserCooperativa } from "@/types";

export async function getCooperativaUsers(): Promise<UserCooperativa[]> {
  await requireRole(["cooperativa_admin"]);
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("get_cooperativa_users");
  if (error) throw new Error("No se pudieron cargar los usuarios");

  return (data ?? []).map((row: any) => ({
    id: row.user_id as string,
    email: row.email as string,
    ruta_id: row.ruta_id as number | null,
    ruta_nombre: row.ruta_nombre as string | null,
  }));
}

export async function asignarRuta(userId: string, rutaId: number) {
  await requireRole(["cooperativa_admin"]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("user_rutas")
    .upsert({ user_id: userId, ruta_id: rutaId }, { onConflict: "user_id" });
  if (error) throw new Error("No se pudo asignar la ruta");

  revalidatePath("/dashboard/usuarios-cooperativa");
}

export async function desasignarRuta(userId: string) {
  await requireRole(["cooperativa_admin"]);
  const supabase = await createClient();

  const { error } = await supabase.from("user_rutas").delete().eq("user_id", userId);
  if (error) throw new Error("No se pudo quitar la ruta");

  revalidatePath("/dashboard/usuarios-cooperativa");
}

export async function getRutaAsignada(): Promise<number | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("user_rutas")
    .select("ruta_id")
    .eq("user_id", user.id)
    .single();

  return data?.ruta_id ?? null;
}
