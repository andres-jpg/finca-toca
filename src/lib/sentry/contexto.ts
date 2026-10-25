import { cache } from "react";
import * as Sentry from "@sentry/nextjs";
import { getCurrentUser, getUserRole } from "@/lib/auth/get-user-role";
import { getTenantActual } from "@/lib/auth/get-tenant";

export interface ContextoSentry {
  userId: string | null;
  rol: string | null;
  tenantSlug: string | null;
  /** Vertical del cliente (finca, café…). Todavía no existe en `tenants`: ver abajo. */
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
 * Resuelve sesión, rol y cliente y los pone como contexto de Sentry. Las tres lecturas están
 * envueltas en `React.cache()`, así que no añade round-trips a Supabase Auth; además se
 * cachea ella misma para que layout, páginas y Server Actions del mismo request no repitan
 * el `setTag`.
 *
 * Se llama desde el layout del dashboard y también desde `checkRoutePermission()` /
 * `requireRole()`: layout y página se renderizan en paralelo, y un Server Action no vuelve a
 * pasar por el layout hasta después de ejecutarse, así que sin esto un error temprano
 * saldría sin etiquetas. Nunca lanza: la observabilidad no puede romper una petición.
 */
export const registrarContextoSentry = cache(async function registrarContextoSentry(): Promise<void> {
  try {
    const [user, rol, tenant] = await Promise.all([
      getCurrentUser(),
      getUserRole(),
      getTenantActual(),
    ]);

    aplicarContextoSentry({
      userId: user?.id ?? null,
      rol,
      tenantSlug: tenant?.slug ?? null,
      // `vertical`: aún no hay columna en `tenants` (llega con el schema multi-vertical,
      // FIN-86 / CO-09). Cuando exista, pásalo aquí: `vertical: tenant?.vertical`.
    });
  } catch {
    // Sin contexto no se rompe nada: el evento sale igual, solo menos etiquetado.
  }
});
