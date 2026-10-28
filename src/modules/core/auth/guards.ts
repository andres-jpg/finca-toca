import { redirect } from "next/navigation";
import { AuthorizationError } from "@/lib/auth/errors";
import { registrarContextoSentry } from "@/lib/sentry/contexto";
import { getSesion, getSesionBase, type RolTenant, type Sesion } from "./sesion";

/**
 * Para páginas y layouts (Server Components): devuelve la sesión o manda a `/login`. Los roles
 * legacy siguen yendo por `checkRoutePermission()`; esto solo exige que haya usuario con cliente activo.
 */
export async function requireSesion(): Promise<Sesion> {
  const sesion = await getSesion();
  if (!sesion) redirect("/login");
  await registrarContextoSentry();
  return sesion;
}

/**
 * Para los Server Actions de módulos nuevos: lanza `AuthorizationError` si no hay sesión o el rol de
 * la membresía no está en la lista. Cada Server Action es un endpoint POST público; esconder el botón
 * no basta, y esto no sustituye a RLS (que es la frontera real) sino que la acompaña.
 */
export async function requireRolTenant(roles: RolTenant[]): Promise<Sesion> {
  const sesion = await getSesion();
  if (!sesion || !roles.includes(sesion.rolTenant)) throw new AuthorizationError();
  await registrarContextoSentry();
  return sesion;
}

/**
 * Lanza `AuthorizationError` si quien llama no es platform admin. Usa la sesión *base*, porque un
 * platform admin que aún no ha elegido cliente no tiene tenant activo y debe poder listar y elegir.
 */
export async function requirePlatformAdmin(): Promise<void> {
  const base = await getSesionBase();
  if (!base?.esPlatformAdmin) throw new AuthorizationError();
  await registrarContextoSentry();
}
