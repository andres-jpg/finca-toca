import { getToros } from "@/features/toros/actions/toros.actions";
import { getVacasDeAlta } from "@/features/vacas/actions/vacas.actions";
import { TorosTable } from "@/features/toros/components/toros-table";
import { getUserRole } from "@/lib/auth/get-user-role";
import { canWrite, checkRoutePermission } from "@/lib/auth/check-permissions";

export default async function TorosPage() {
  await checkRoutePermission(["admin", "viewer"]);

  const [toros, vacas] = await Promise.all([getToros(), getVacasDeAlta()]);
  const userRole = await getUserRole();
  const canEdit = canWrite(userRole);

  return <TorosTable toros={toros} vacas={vacas} canEdit={canEdit} />;
}
