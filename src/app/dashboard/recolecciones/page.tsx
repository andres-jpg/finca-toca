import { checkRoutePermission, canWrite, canDelete } from "@/lib/auth/check-permissions";
import { getCurrentUser } from "@/lib/auth/get-user-role";
import { getRecolecciones } from "@/features/recolecciones/actions/recolecciones.actions";
import { getFincasActivas } from "@/features/fincas-cooperativa/actions/fincas.actions";
import { getRutas } from "@/features/rutas-cooperativa/actions/rutas.actions";
import {
  getItinerarioAsignado,
  getItinerarios,
} from "@/features/itinerarios/actions/itinerarios.actions";
import { RecoleccionesView } from "@/features/recolecciones/components/recolecciones-view";
import { RutaConductorView } from "@/features/recolecciones/components/ruta-conductor-view";
import { formatDate } from "@/lib/utils";

function getMonthRange(year: number, month: number) {
  const start = formatDate(new Date(year, month - 1, 1));
  const end = formatDate(new Date(year, month, 0));
  return { start, end };
}

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

export default async function RecoleccionesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
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

  // Admin: vista con resumen agregado + detalle, acotada al rango de fechas seleccionado
  const params = await searchParams;
  const now = new Date();
  const hasRangoParam = Boolean(params.desde && params.hasta);
  const { start: desdeMes, end: hastaMes } = getMonthRange(
    now.getFullYear(),
    now.getMonth() + 1
  );
  const desde = hasRangoParam ? params.desde! : desdeMes;
  const hasta = hasRangoParam ? params.hasta! : hastaMes;

  const [recolecciones, rutas, itinerarios, fincasParaForm] = await Promise.all([
    getRecolecciones({ desde, hasta }),
    getRutas(),
    getItinerarios(),
    getFincasActivas(),
  ]);

  return (
    <RecoleccionesView
      recolecciones={recolecciones}
      fincas={fincasParaForm}
      rutas={rutas}
      itinerarios={itinerarios}
      desde={desde}
      hasta={hasta}
      canEdit={canWrite(userRole)}
      canDelete={canDelete(userRole)}
    />
  );
}
