import { getVacas } from "@/features/vacas/actions/vacas.actions";
import { VacasTable } from "@/features/vacas/components/vacas-table";
import { getUserRole } from "@/lib/auth/get-user-role";
import { canWrite, checkRoutePermission } from "@/lib/auth/check-permissions";

export default async function VacasPage() {
  // Verificar permisos: solo admin y viewer pueden acceder
  await checkRoutePermission(["admin", "viewer"]);

  // Traer todas las vacas (alta=true y false); el filtro se aplica en el cliente
  const vacas = await getVacas();
  const userRole = await getUserRole();
  const canEdit = canWrite(userRole);

  return <VacasTable vacas={vacas} canEdit={canEdit} />;
}
