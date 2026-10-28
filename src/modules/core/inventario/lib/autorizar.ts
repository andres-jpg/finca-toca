import { AuthorizationError } from "@/lib/auth/errors";
import { registrarContextoSentry } from "@/lib/sentry/contexto";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type RolTenant = Database["public"]["Enums"]["rol_tenant"];

/**
 * Lanza `AuthorizationError` si el rol del llamante en su cliente actual (`rol_en_tenant()`,
 * membresías de FIN-90) no está entre los permitidos. Cada Server Action es un endpoint POST público:
 * esto es defensa en profundidad —la frontera real es el RLS de `articulos` y `movimientos_inventario`—.
 *
 * Se lee de membresías y no de `getUserRole()` (tabla `roles` legacy) porque los usuarios de los
 * clientes nuevos (café) pueden no tener fila en `roles`.
 *
 * TODO(FIN-91): sustituir por `requireRolTenant()` del núcleo cuando la tarea de sesión lo publique.
 */
export async function exigirRolTenant(permitidos: readonly RolTenant[]): Promise<RolTenant> {
  const supabase = await createClient();
  const { data: rol, error } = await supabase.rpc("rol_en_tenant");
  if (error || !rol || !permitidos.includes(rol)) throw new AuthorizationError();
  await registrarContextoSentry();
  return rol;
}

/** Quién administra el catálogo de artículos (alta, edición, desactivar). */
export const ROLES_CATALOGO: readonly RolTenant[] = ["owner", "admin"];
/** Quién registra movimientos (los mismos que permite el INSERT de `movimientos_inventario`). */
export const ROLES_MOVIMIENTOS: readonly RolTenant[] = ["owner", "admin", "operativo"];
