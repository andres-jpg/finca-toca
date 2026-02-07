import { getUserRole } from "./get-user-role";
import { redirect } from "next/navigation";
import type { UserRole } from "@/types";

/**
 * Verifica si el usuario tiene permiso para acceder a una ruta.
 * Si no tiene permiso, redirige a /dashboard/extracciones (ruta por defecto).
 *
 * @param allowedRoles - Array de roles permitidos para acceder
 * @returns El rol del usuario si tiene permiso
 */
export async function checkRoutePermission(
  allowedRoles: UserRole[]
): Promise<UserRole> {
  const role = await getUserRole();

  if (!role || !allowedRoles.includes(role)) {
    redirect("/dashboard/extracciones");
  }

  return role;
}

/**
 * Verifica si el usuario puede realizar acciones de escritura (crear, editar, eliminar).
 * Los viewers solo pueden ver, no pueden modificar.
 *
 * @param role - Rol del usuario
 * @returns true si puede escribir, false si solo puede ver
 */
export function canWrite(role: UserRole | null): boolean {
  return role === "admin" || role === "user";
}

/**
 * Verifica si el usuario puede ver una ruta específica.
 *
 * @param role - Rol del usuario
 * @param allowedRoles - Array de roles permitidos
 * @returns true si puede ver, false si no
 */
export function canView(role: UserRole | null, allowedRoles: UserRole[]): boolean {
  return role ? allowedRoles.includes(role) : false;
}
