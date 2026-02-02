import { getIngresos } from "@/features/ingresos/actions/ingresos.actions";
import { IngresosTable } from "@/features/ingresos/components/ingresos-table";
import { checkRoutePermission, canWrite } from "@/lib/auth/check-permissions";

export default async function IngresosPage() {
  // Verificar permisos: solo admin y viewer pueden acceder
  const userRole = await checkRoutePermission(["admin", "viewer"]);

  const ingresos = await getIngresos();
  const canEdit = canWrite(userRole);

  return (
    <div className="max-w-5xl mx-auto">
      <IngresosTable ingresos={ingresos} canEdit={canEdit} />
    </div>
  );
}
