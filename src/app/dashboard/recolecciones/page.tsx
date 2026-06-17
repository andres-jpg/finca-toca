import { checkRoutePermission, canWrite, canDelete } from "@/lib/auth/check-permissions";
import { getRecolecciones } from "@/features/recolecciones/actions/recolecciones.actions";
import { getFincasActivas } from "@/features/fincas-cooperativa/actions/fincas.actions";
import { getRutas } from "@/features/rutas-cooperativa/actions/rutas.actions";
import { getItinerarioAsignado } from "@/features/itinerarios/actions/itinerarios.actions";
import { RecoleccionesTable } from "@/features/recolecciones/components/recolecciones-table";
import type { FincaCooperativa, RutaCooperativa } from "@/types";

function SinItinerarioAsignado() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-3">
      <p className="text-lg font-semibold text-gray-700">Sin itinerario asignado</p>
      <p className="text-sm text-gray-500 max-w-sm">
        Tu cuenta aún no tiene un itinerario asignado. Contacta con el administrador para que te asigne uno.
      </p>
    </div>
  );
}

export default async function RecoleccionesPage() {
  const [userRole, recolecciones, rutas] = await Promise.all([
    checkRoutePermission(["cooperativa_admin", "cooperativa_user"]),
    getRecolecciones(),
    getRutas(),
  ]);

  const todayOnly = userRole === "cooperativa_user";

  let fincasParaForm: FincaCooperativa[] = [];
  let rutasParaForm: RutaCooperativa[] = [];
  let sinItinerario = false;

  if (userRole === "cooperativa_user") {
    const itinerario = await getItinerarioAsignado();
    if (itinerario === null) {
      sinItinerario = true;
    } else {
      fincasParaForm = itinerario.fincas as unknown as FincaCooperativa[];
    }
  } else {
    fincasParaForm = await getFincasActivas();
    rutasParaForm = rutas;
  }

  if (sinItinerario) {
    return <SinItinerarioAsignado />;
  }

  return (
    <RecoleccionesTable
      recolecciones={recolecciones}
      fincas={fincasParaForm}
      rutas={rutasParaForm}
      canEdit={canWrite(userRole)}
      canDelete={canDelete(userRole)}
      canViewDetail={userRole !== "cooperativa_user"}
      lockDate={todayOnly}
      todayOnly={todayOnly}
      showPricing={userRole !== "cooperativa_user"}
    />
  );
}
