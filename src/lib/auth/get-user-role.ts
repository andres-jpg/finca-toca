import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/types";

export async function getUserRole(): Promise<UserRole | null> {
  const supabase = await createClient();

  // Obtener usuario autenticado
  const {
    data: { user },
  } = await supabase.auth.getUser();

  console.log("🔍 getUserRole - Usuario:", user?.id, user?.email);

  if (!user) {
    console.log("❌ getUserRole - No hay usuario autenticado");
    return null;
  }

  // Consultar tabla roles con el campo valor
  try {
    const { data, error } = await supabase
      .from("roles")
      .select("rol")
      .eq("user_id", user.id)
      .single();

    console.log("📊 getUserRole - Query result:", { data, error });

    if (error) {
      console.log("❌ getUserRole - Error:", error.message, error.details);
      return "user";
    }

    if (!data) {
      console.log("⚠️ getUserRole - No se encontró rol para el usuario");
      return "user";
    }

    console.log("✅ getUserRole - Rol encontrado:", data.rol);
    return data.rol as UserRole;
  } catch (err) {
    console.log("❌ getUserRole - Exception:", err);
    return "user"; // Default role en caso de error
  }
}
