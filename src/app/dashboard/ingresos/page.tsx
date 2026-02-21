import { getIngresos, getConceptosIngreso } from "@/features/ingresos/actions/ingresos.actions";
import { IngresosTable } from "@/features/ingresos/components/ingresos-table";
import { checkRoutePermission, canWrite } from "@/lib/auth/check-permissions";

export default async function IngresosPage() {
  const userRole = await checkRoutePermission(["admin", "viewer"]);

  const [ingresos, conceptos] = await Promise.all([getIngresos(), getConceptosIngreso()]);
  const canEdit = canWrite(userRole);

  return (
    <div className="max-w-5xl mx-auto">
      <IngresosTable ingresos={ingresos} conceptos={conceptos} canEdit={canEdit} />
    </div>
  );
}
