import * as Sentry from "@sentry/nextjs";

export interface ContextoSentry {
  userId: string | null;
  rol: string | null;
  tenantSlug: string | null;
  /** Vertical del cliente (`tenants.vertical`: ganaderia, cooperativa, cafe). */
  vertical?: string | null;
}

/**
 * Etiqueta el ámbito de Sentry del request actual para saber **qué cliente** sufre un error.
 * Solo el `id` del usuario: nunca email, nombre ni IP. Pura sobre Sentry (sin Supabase)
 * para poderse probar suelta.
 */
export function aplicarContextoSentry({ userId, rol, tenantSlug, vertical }: ContextoSentry): void {
  if (userId) Sentry.setUser({ id: userId });
  if (rol) Sentry.setTag("rol", rol);
  if (tenantSlug) Sentry.setTag("tenant", tenantSlug);
  if (vertical) Sentry.setTag("vertical", vertical);
}

/**
 * Quita lo que puso `aplicarContextoSentry` (al salir del dashboard o cerrar sesión), para que
 * un error posterior en el navegador —p. ej. en /login— no salga etiquetado con el cliente
 * de la sesión anterior.
 */
export function limpiarContextoSentry(): void {
  Sentry.setUser(null);
  Sentry.setTag("rol", undefined);
  Sentry.setTag("tenant", undefined);
  Sentry.setTag("vertical", undefined);
}
