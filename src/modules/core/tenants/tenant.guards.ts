import { redirect } from "next/navigation";
import { AuthorizationError } from "@/lib/auth/errors";
import { getTenantActual } from "./tenant.queries";
import { tieneModulo, type ModuloId } from "./modulos";

/** ¿El cliente de la sesión tiene activo este módulo? */
export async function tenantTieneModulo(modulo: ModuloId): Promise<boolean> {
  const tenant = await getTenantActual();
  return tieneModulo(tenant?.modulos, modulo);
}

/**
 * Lanza `AuthorizationError` si el cliente de la sesión no tiene el módulo activo. Para los Server
 * Actions: esconder la opción en la barra lateral no basta, cada acción es un endpoint POST público.
 * Reutiliza el `getTenantActual()` cacheado del request, así que no cuesta otra consulta.
 */
export async function requireModulo(modulo: ModuloId): Promise<void> {
  if (!(await tenantTieneModulo(modulo))) throw new AuthorizationError();
}

/**
 * Para `page.tsx` / `layout.tsx` de una sección que pertenece a un módulo: si el cliente no lo tiene activo
 * manda a `/dashboard`, igual que un rol sin permiso (quien teclea la URL a mano no ve una página rota).
 * Es el equivalente de página de `requireModulo()` (que lanza, para los Server Actions); las dos son
 * necesarias, porque esconder la opción del menú es solo cosmético.
 */
export async function requireModuloPagina(modulo: ModuloId): Promise<void> {
  if (!(await tenantTieneModulo(modulo))) redirect("/dashboard");
}
