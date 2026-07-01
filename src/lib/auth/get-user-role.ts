import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import type { UserRole } from "@/types";

// supabase.auth.getUser() siempre hace un round-trip real al servidor de Auth (a diferencia
// de getSession()). Cachear por request evita repetirlo en cada Server Action/route handler
// que ya pasó por getUserRole() más arriba en el mismo request.
export const getCurrentUser = cache(async function getCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getUserRole = cache(async function getUserRole(): Promise<UserRole | null> {
  const user = await getCurrentUser();

  if (!user) {
    return null;
  }

  const supabase = await createClient();

  // Consultar tabla roles con el campo valor
  try {
    const { data, error } = await supabase
      .from("roles")
      .select("rol")
      .eq("user_id", user.id)
      .single();

    if (error) {
      return null;
    }

    if (!data) {
      return null;
    }

    return data.rol as UserRole;
  } catch (err) {
    console.error(err);
    return null; // Sin rol asignado en `roles` o error: no se concede acceso por defecto
  }
});
