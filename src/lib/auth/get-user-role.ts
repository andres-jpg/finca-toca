import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types";

export async function getUserRole(): Promise<UserRole | null> {
  const supabase = await createClient();

  // Obtener usuario autenticado
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // Consultar tabla roles con el campo valor
  try {
    const { data, error } = await supabase
      .from("roles")
      .select("rol")
      .eq("user_id", user.id)
      .single();

    if (error) {
      return "user";
    }

    if (!data) {
      return "user";
    }

    return data.rol as UserRole;
  } catch (err) {
    console.error(err);
    return "user"; // Default role en caso de error
  }
}
