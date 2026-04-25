import { getExtracciones } from "@/features/extracciones/actions/extracciones.actions";
import { ExtraccionesTable } from "@/features/extracciones/components/extracciones-table";
import { getUserRole } from "@/lib/auth/get-user-role";
import { canWrite } from "@/lib/auth/check-permissions";

export default async function ExtraccionesPage() {
  const [extracciones, userRole] = await Promise.all([
    getExtracciones(),
    getUserRole(),
  ]);
  const canEdit = canWrite(userRole);

  return <ExtraccionesTable extracciones={extracciones} canEdit={canEdit} />;
}
