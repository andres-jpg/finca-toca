import { getUserRole } from "./get-user-role";
import { redirect } from "next/navigation";
import type { UserRole } from "@/types";
import { AuthorizationError } from "./errors";
import { registrarContextoSentry } from "@/lib/sentry/contexto";
// Página de inicio garantizada para cada rol (siempre accesible, sin redirigir de nuevo).
import { PAGINA_INICIAL_POR_ROL } from "@/modules/core/registry/pagina-inicial";

/**
 * Verifica si el usuario tiene permiso para acceder a una ruta.
 * Si no tiene permiso, redirige a la página de inicio de su rol (`PAGINA_INICIAL_POR_ROL`).
 *
 * @deprecated Solo para las pantallas legacy (roles de `roles`). En código nuevo usa `getSesion()` /
 * `requireSesion()` de `@/modules/core/auth` y el rol de la membresía (`rolTenant`).
 * @param allowedRoles - Array de roles permitidos para acceder
 * @returns El rol del usuario si tiene permiso
 */
export async function checkRoutePermission(
  allowedRoles: UserRole[]
): Promise<UserRole> {
  const role = await getUserRole();

  // Sin rol (sesión nula o error) → login, nunca a una ruta protegida.
  if (!role) redirect("/login");

  if (!allowedRoles.includes(role)) redirect(PAGINA_INICIAL_POR_ROL[role]);

  await registrarContextoSentry();
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

/**
 * @deprecated Solo para los Server Actions legacy. En módulos nuevos usa `requireRolTenant()` de
 * `@/modules/core/auth` (rol de la membresía en el cliente activo).
 */
export async function requireRole(allowedRoles: UserRole[]): Promise<UserRole> {
  const role = await getUserRole();
  if (!role) throw new AuthorizationError();
  if (!allowedRoles.includes(role)) throw new AuthorizationError();
  await registrarContextoSentry();
  return role;
}
