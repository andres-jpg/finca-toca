import { getVacas } from "@/features/vacas/actions/vacas.actions";
import { getTorosDeAlta } from "@/features/toros/actions/toros.actions";
import { VacasTable } from "@/features/vacas/components/vacas-table";
import { canWrite, checkRoutePermission } from "@/lib/auth/check-permissions";

export default async function VacasPage() {
  const [userRole, vacas, toros] = await Promise.all([
    checkRoutePermission(["admin", "viewer"]),
    getVacas(),
    getTorosDeAlta(),
  ]);
  const canEdit = canWrite(userRole);

  return <VacasTable vacas={vacas} toros={toros} canEdit={canEdit} />;
}
