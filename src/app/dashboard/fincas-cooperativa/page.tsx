import { checkRoutePermission, canWrite } from "@/lib/auth/check-permissions";
import { getFincas } from "@/features/fincas-cooperativa/actions/fincas.actions";
import { getRutas } from "@/features/rutas-cooperativa/actions/rutas.actions";
import { FincasTable } from "@/features/fincas-cooperativa/components/fincas-table";

export default async function FincasCooperativaPage() {
  const [userRole, fincas, rutas] = await Promise.all([
    checkRoutePermission(["cooperativa_admin"]),
    getFincas(),
    getRutas(),
  ]);
  const canEdit = canWrite(userRole);

  return <FincasTable fincas={fincas} rutas={rutas} canEdit={canEdit} />;
}
