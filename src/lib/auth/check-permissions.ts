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
// Página de inicio garantizada para cada rol — siempre accesible sin redirigir de nuevo.
const ROLE_HOME: Record<UserRole, string> = {
  admin:            "/dashboard",
  viewer:           "/dashboard",
  user:             "/dashboard/extracciones",
  cooperativa_admin: "/dashboard/cooperativa",
  cooperativa_user:  "/dashboard/recolecciones",
};

export async function checkRoutePermission(
  allowedRoles: UserRole[]
): Promise<UserRole> {
  const role = await getUserRole();

  // Sin rol (sesión nula o error) → login, nunca a una ruta protegida.
  if (!role) redirect("/login");

  if (!allowedRoles.includes(role)) redirect(ROLE_HOME[role]);

  return role;
}

export function canWrite(role: UserRole | null): boolean {
  return role === "admin" || role === "user" || role === "cooperativa_admin" || role === "cooperativa_user";
}

export function canDelete(role: UserRole | null): boolean {
  return role === "admin" || role === "user" || role === "cooperativa_admin";
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

export async function requireRole(allowedRoles: UserRole[]): Promise<UserRole> {
  const role = await getUserRole();
  if (!role) throw new Error("No autorizado");
  if (!allowedRoles.includes(role)) throw new Error("No autorizado");
  return role;
}
