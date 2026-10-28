import { getArriendos } from "@/features/arriendos/actions/arriendos.actions";
import { ArriendosView } from "@/features/arriendos/components/arriendos-view";
import { checkRoutePermission, canWrite } from "@/lib/auth/check-permissions";
import { requireModuloPagina } from "@/modules/core/tenants/tenant.guards";

/**
 * El módulo solo existe para los clientes que lo tengan activo en `tenant_modulos` (hoy, Villa Blanca). Otro cliente que
 * escriba la URL a mano acaba en su dashboard, igual que con un rol sin permiso.
 */
export default async function ArriendosPage() {
  const userRole = await checkRoutePermission(["admin", "viewer"]);

  await requireModuloPagina("ganaderia.arriendos");

  const arriendos = await getArriendos();

  return <ArriendosView arriendos={arriendos} canEdit={canWrite(userRole)} />;
}
