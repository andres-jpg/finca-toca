import { getGastos } from "@/features/gastos/actions/gastos.actions";
import { GastosTable } from "@/features/gastos/components/gastos-table";
import { checkRoutePermission, canWrite } from "@/lib/auth/check-permissions";

export default async function GastosPage() {
  // Verificar permisos: solo admin y viewer pueden acceder
  const userRole = await checkRoutePermission(["admin", "viewer"]);

  const gastos = await getGastos();
  const canEdit = canWrite(userRole);

  return (
    <div className="max-w-5xl mx-auto">
      <GastosTable gastos={gastos} canEdit={canEdit} />
    </div>
  );
}
