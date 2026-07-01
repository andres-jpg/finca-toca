import { checkRoutePermission, canWrite, canDelete } from "@/lib/auth/check-permissions";
import { getCurrentUser } from "@/lib/auth/get-user-role";
import { getRecolecciones } from "@/features/recolecciones/actions/recolecciones.actions";
import { getFincasActivas } from "@/features/fincas-cooperativa/actions/fincas.actions";
import { getRutas } from "@/features/rutas-cooperativa/actions/rutas.actions";
import { getItinerarioAsignado } from "@/features/itinerarios/actions/itinerarios.actions";
import { RecoleccionesTable } from "@/features/recolecciones/components/recolecciones-table";
import { RutaConductorView } from "@/features/recolecciones/components/ruta-conductor-view";

function SinItinerarioAsignado() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-3">
      <p className="text-lg font-semibold text-gray-700">Sin itinerario asignado</p>
      <p className="text-sm text-gray-500 max-w-sm">
        Tu cuenta aún no tiene un itinerario asignado. Contacta con el administrador para que te
        asigne uno.
      </p>
    </div>
  );
}

export default async function RecoleccionesPage() {
  const userRole = await checkRoutePermission(["cooperativa_admin", "cooperativa_user"]);

  // Conductores: UI móvil offline-first
  if (userRole === "cooperativa_user") {
    const [user, itinerario] = await Promise.all([getCurrentUser(), getItinerarioAsignado()]);
    if (itinerario === null) return <SinItinerarioAsignado />;
    return (
      <RutaConductorView
        itinerarioId={itinerario.id}
        itinerarioNombre={itinerario.nombre}
        userId={user?.id ?? ""}
      />
    );
  }

  // Admin: tabla completa con historial y precios
  const [recolecciones, rutas, fincasParaForm] = await Promise.all([
    getRecolecciones(),
    getRutas(),
    getFincasActivas(),
  ]);

  return (
    <RecoleccionesTable
      recolecciones={recolecciones}
      fincas={fincasParaForm}
      rutas={rutas}
      canEdit={canWrite(userRole)}
      canDelete={canDelete(userRole)}
      canViewDetail={true}
      lockDate={false}
      todayOnly={false}
      showPricing={true}
    />
  );
}
