import { getExtracciones } from "@/features/extracciones/actions/extracciones.actions";
import { ExtraccionesTable } from "@/features/extracciones/components/extracciones-table";
import { checkRoutePermission, canWrite } from "@/lib/auth/check-permissions";

export default async function ExtraccionesPage() {
  const [userRole, extracciones] = await Promise.all([
    checkRoutePermission(["admin", "viewer", "user"]),
    getExtracciones(),
  ]);
  const canEdit = canWrite(userRole);

  return <ExtraccionesTable extracciones={extracciones} canEdit={canEdit} />;
}
