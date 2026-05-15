import { checkRoutePermission, canWrite } from "@/lib/auth/check-permissions";
import { getRutas } from "@/features/rutas-cooperativa/actions/rutas.actions";
import { getFincas } from "@/features/fincas-cooperativa/actions/fincas.actions";
import { RutasTable } from "@/features/rutas-cooperativa/components/rutas-table";

export default async function RutasCooperativaPage() {
  const [userRole, rutas, fincas] = await Promise.all([
    checkRoutePermission(["admin", "cooperativa_admin"]),
    getRutas(),
    getFincas(),
  ]);
  const canEdit = canWrite(userRole);

  return <RutasTable rutas={rutas} fincas={fincas} canEdit={canEdit} />;
}
