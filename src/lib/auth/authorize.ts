import { getUserRole } from "./get-user-role";
import type { UserRole } from "@/types";

/**
 * Helper para validar que el usuario tiene uno de los roles permitidos.
 * Útil para proteger server actions y rutas específicas.
 *
 * @param allowedRoles - Array de roles permitidos
 * @throws Error si el usuario no tiene permisos
 * @returns El rol del usuario si tiene permisos
 *
 * @example
 * ```typescript
 * export async function deleteAllData() {
 *   "use server";
 *   await requireRole(["admin"]); // Solo admins pueden ejecutar
 *   // ... lógica de eliminación
 * }
 * ```
 */
export async function requireRole(allowedRoles: UserRole[]): Promise<UserRole> {
  const role = await getUserRole();

  if (!role || !allowedRoles.includes(role)) {
    throw new Error("No tienes permisos para esta acción");
  }

  return role;
}
