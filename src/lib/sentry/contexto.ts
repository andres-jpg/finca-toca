import { cache } from "react";
import { getCurrentUser, getUserRole } from "@/lib/auth/get-user-role";
import { getTenantActual } from "@/lib/auth/get-tenant";
import { aplicarContextoSentry } from "./etiquetas";

// La parte pura (sin código de servidor) vive en `etiquetas.ts` para poder usarla también desde
// el navegador (`components/sentry/contexto-sentry-cliente.tsx`). Se reexporta por compatibilidad.
export { aplicarContextoSentry, type ContextoSentry } from "./etiquetas";

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
