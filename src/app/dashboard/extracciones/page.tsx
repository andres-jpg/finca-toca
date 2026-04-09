import { getExtracciones } from "@/features/extracciones/actions/extracciones.actions";
import { ExtraccionesTable } from "@/features/extracciones/components/extracciones-table";
import { getUserRole } from "@/lib/auth/get-user-role";
import { canWrite } from "@/lib/auth/check-permissions";

export default async function ExtraccionesPage() {
  const extracciones = await getExtracciones();
  const userRole = await getUserRole();
  const canEdit = canWrite(userRole);

  return (
    <div className="max-w-5xl mx-auto">
      <ExtraccionesTable extracciones={extracciones} canEdit={canEdit} />
    </div>
  );
}
