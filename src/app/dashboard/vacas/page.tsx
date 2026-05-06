import { getVacas } from "@/features/vacas/actions/vacas.actions";
import { getTorosDeAlta } from "@/features/toros/actions/toros.actions";
import { getPajillasPorToro } from "@/features/inventario/pajillas/actions/pajillas.actions";
import { VacasTable } from "@/features/vacas/components/vacas-table";
import { canWrite, checkRoutePermission } from "@/lib/auth/check-permissions";

export default async function VacasPage() {
  const [userRole, vacas, toros, pajillasPorToro] = await Promise.all([
    checkRoutePermission(["admin", "viewer"]),
    getVacas(),
    getTorosDeAlta(),
    getPajillasPorToro(),
  ]);
  const canEdit = canWrite(userRole);

  return <VacasTable vacas={vacas} toros={toros} pajillasPorToro={pajillasPorToro} canEdit={canEdit} />;
}
