import { getToros } from "@/features/toros/actions/toros.actions";
import { getVacasDeAlta } from "@/features/vacas/actions/vacas.actions";
import { TorosTable } from "@/features/toros/components/toros-table";
import { canWrite, checkRoutePermission } from "@/lib/auth/check-permissions";

export default async function TorosPage() {
  const [userRole, toros, vacas] = await Promise.all([
    checkRoutePermission(["admin", "viewer"]),
    getToros(),
    getVacasDeAlta(),
  ]);
  const canEdit = canWrite(userRole);

  return <TorosTable toros={toros} vacas={vacas} canEdit={canEdit} />;
}
