import { getIngresos, getConceptosIngreso } from "@/features/ingresos/actions/ingresos.actions";
import { IngresosTable } from "@/features/ingresos/components/ingresos-table";
import { checkRoutePermission, canWrite } from "@/lib/auth/check-permissions";
import { getVacasDeAlta } from "@/features/vacas/actions/vacas.actions";

export default async function IngresosPage() {
  const userRole = await checkRoutePermission(["admin", "viewer"]);

  const [ingresos, conceptos, vacas] = await Promise.all([
    getIngresos(),
    getConceptosIngreso(),
    getVacasDeAlta(),
  ]);
  const canEdit = canWrite(userRole);

  return (
    <div className="max-w-5xl mx-auto">
      <IngresosTable ingresos={ingresos} conceptos={conceptos} vacas={vacas} canEdit={canEdit} />
    </div>
  );
}
