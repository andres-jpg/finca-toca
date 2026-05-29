import { checkRoutePermission, canWrite, canDelete } from "@/lib/auth/check-permissions";
import { getRecolecciones } from "@/features/recolecciones/actions/recolecciones.actions";
import { getFincasActivas } from "@/features/fincas-cooperativa/actions/fincas.actions";
import { getRutas } from "@/features/rutas-cooperativa/actions/rutas.actions";
import { RecoleccionesTable } from "@/features/recolecciones/components/recolecciones-table";

export default async function RecoleccionesPage() {
  const [userRole, recolecciones, fincas, rutas] = await Promise.all([
    checkRoutePermission(["cooperativa_admin", "cooperativa_user"]),
    getRecolecciones(),
    getFincasActivas(),
    getRutas(),
  ]);

  const todayOnly = userRole === "cooperativa_user";

  return (
    <RecoleccionesTable
      recolecciones={recolecciones}
      fincas={fincas}
      rutas={rutas}
      canEdit={canWrite(userRole)}
      canDelete={canDelete(userRole)}
      canViewDetail={userRole !== "cooperativa_user"}
      lockDate={todayOnly}
      todayOnly={todayOnly}
      showPricing={userRole !== "cooperativa_user"}
    />
  );
}
