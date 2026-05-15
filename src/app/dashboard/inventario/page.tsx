import { getPajillas, getPajillasPorToro } from "@/features/inventario/pajillas/actions/pajillas.actions";
import { PajillasTable } from "@/features/inventario/pajillas/components/pajillas-table";
import { checkRoutePermission, canWrite } from "@/lib/auth/check-permissions";

export default async function InventarioPage() {
  const [userRole, pajillas, porToro] = await Promise.all([
    checkRoutePermission(["admin", "viewer"]),
    getPajillas(),
    getPajillasPorToro(),
  ]);
  const canEdit = canWrite(userRole);

  return <PajillasTable pajillas={pajillas} porToro={porToro} canEdit={canEdit} />;
}
