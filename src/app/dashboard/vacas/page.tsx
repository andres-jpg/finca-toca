import { getVacas } from "@/features/vacas/actions/vacas.actions";
import { VacasTable } from "@/features/vacas/components/vacas-table";
import { canWrite, checkRoutePermission } from "@/lib/auth/check-permissions";

export default async function VacasPage() {
  const [userRole, vacas] = await Promise.all([
    checkRoutePermission(["admin", "viewer"]),
    getVacas(),
  ]);
  const canEdit = canWrite(userRole);

  return <VacasTable vacas={vacas} canEdit={canEdit} />;
}
