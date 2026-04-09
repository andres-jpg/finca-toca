import { getIngresos, getConceptosIngreso } from "@/features/ingresos/actions/ingresos.actions";
import { IngresosTable } from "@/features/ingresos/components/ingresos-table";
import { checkRoutePermission, canWrite } from "@/lib/auth/check-permissions";
import { getVacasDeAlta } from "@/features/vacas/actions/vacas.actions";
import { getTorosDeAlta } from "@/features/toros/actions/toros.actions";

export default async function IngresosPage() {
  const userRole = await checkRoutePermission(["admin", "viewer"]);

  const [ingresos, conceptos, vacas, toros] = await Promise.all([
    getIngresos(),
    getConceptosIngreso(),
    getVacasDeAlta(),
    getTorosDeAlta(),
  ]);
  const canEdit = canWrite(userRole);

  return <IngresosTable ingresos={ingresos} conceptos={conceptos} vacas={vacas} toros={toros} canEdit={canEdit} />;
}
