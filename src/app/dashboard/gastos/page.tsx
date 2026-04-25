import { getGastos, getConceptosGasto } from "@/features/gastos/actions/gastos.actions";
import { GastosTable } from "@/features/gastos/components/gastos-table";
import { checkRoutePermission, canWrite } from "@/lib/auth/check-permissions";

export default async function GastosPage() {
  const [userRole, gastos, conceptos] = await Promise.all([
    checkRoutePermission(["admin", "viewer"]),
    getGastos(),
    getConceptosGasto(),
  ]);
  const canEdit = canWrite(userRole);

  return <GastosTable gastos={gastos} conceptos={conceptos} canEdit={canEdit} />;
}
