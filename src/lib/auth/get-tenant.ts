import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/get-user-role";

export interface Tenant {
  id: string;
  nombre: string;
  slug: string;
}

/**
 * Cliente (finca) al que pertenece el usuario de la sesión.
 *
 * No hace falta filtrar por id: la política `tenants_select` solo deja ver la fila del
 * propio cliente, así que un `select` sin `where` devuelve exactamente una fila — o ninguna
 * para los roles de cooperativa, que no son multi-tenant y tienen `roles.tenant_id` a NULL.
 *
 * Va envuelto en `React.cache()` como `getUserRole()`: el layout lo pide una vez por request.
 */
export const getTenantActual = cache(async function getTenantActual(): Promise<Tenant | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants")
    .select("id, nombre, slug")
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as Tenant;
});
