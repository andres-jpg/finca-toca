import { redirect } from "next/navigation";
import { getArriendos } from "@/features/arriendos/actions/arriendos.actions";
import { ArriendosView } from "@/features/arriendos/components/arriendos-view";
import { checkRoutePermission, canWrite } from "@/lib/auth/check-permissions";
import { tenantTieneModulo } from "@/lib/auth/get-tenant";

/**
 * El módulo es exclusivo de Villa Blanca (ver `lib/tenants/modulos.ts`). Otro cliente que
 * escriba la URL a mano acaba en su dashboard, igual que con un rol sin permiso.
 */
export default async function ArriendosPage() {
  const userRole = await checkRoutePermission(["admin", "viewer"]);

  if (!(await tenantTieneModulo("arriendos"))) redirect("/dashboard");

  const arriendos = await getArriendos();

  return <ArriendosView arriendos={arriendos} canEdit={canWrite(userRole)} />;
}
