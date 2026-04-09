import { getGastos, getConceptosGasto } from "@/features/gastos/actions/gastos.actions";
import { GastosTable } from "@/features/gastos/components/gastos-table";
import { checkRoutePermission, canWrite } from "@/lib/auth/check-permissions";

export default async function GastosPage() {
  const userRole = await checkRoutePermission(["admin", "viewer"]);

  const [gastos, conceptos] = await Promise.all([getGastos(), getConceptosGasto()]);
  const canEdit = canWrite(userRole);

  return <GastosTable gastos={gastos} conceptos={conceptos} canEdit={canEdit} />;
}
