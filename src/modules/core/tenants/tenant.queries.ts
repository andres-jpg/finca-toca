import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/get-user-role";
import { aLista } from "@/lib/supabase/relaciones";

export type Vertical = "ganaderia" | "cooperativa" | "cafe";
export type TenantEstado = "activo" | "prueba" | "suspendido" | "baja";

export interface Tenant {
  id: string;
  nombre: string;
  slug: string;
  vertical: Vertical;
  plan: string;
  estado: TenantEstado;
  logoUrl: string | null;
  colorPrimario: string | null;
  zonaHoraria: string;
  moneda: string;
  /** Ids de los módulos activos (`tenant_modulos.activo`), p. ej. `ganaderia.arriendos`. */
  modulos: string[];
}

/**
 * Cliente (finca) al que pertenece el usuario de la sesión, con sus módulos activos.
 *
 * No hace falta filtrar por id: la política `tenants_select` solo deja ver la fila del propio
 * cliente, así que un `select` sin `where` devuelve exactamente una fila — o ninguna para los
 * roles de cooperativa, que no son multi-tenant y tienen `roles.tenant_id` a NULL. Los módulos
 * llegan en la misma consulta (join a `tenant_modulos`, que RLS también limita al cliente).
 *
 * Va envuelto en `React.cache()` como `getUserRole()`: el layout lo pide una vez por request.
 */
export const getTenantActual = cache(async function getTenantActual(): Promise<Tenant | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tenants")
    .select(
      "id, nombre, slug, vertical, plan, estado, logo_url, color_primario, zona_horaria, moneda, tenant_modulos(modulo_id)"
    )
    // Filtra las filas embebidas, no el tenant: sin módulos activos sigue devolviéndose, con [].
    .eq("tenant_modulos.activo", true)
    .maybeSingle();

  if (error || !data) return null;

  return {
    id: data.id,
    nombre: data.nombre,
    slug: data.slug,
    vertical: data.vertical,
    plan: data.plan,
    estado: data.estado,
    logoUrl: data.logo_url,
    colorPrimario: data.color_primario,
    zonaHoraria: data.zona_horaria,
    moneda: data.moneda,
    modulos: aLista(data.tenant_modulos).map((m) => m.modulo_id),
  };
});
