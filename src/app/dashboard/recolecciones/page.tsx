import { checkRoutePermission, canWrite, canDelete } from "@/lib/auth/check-permissions";
import { getRecolecciones } from "@/features/recolecciones/actions/recolecciones.actions";
import { getFincasActivas } from "@/features/fincas-cooperativa/actions/fincas.actions";
import { getRutas } from "@/features/rutas-cooperativa/actions/rutas.actions";
import { getRutaAsignada } from "@/features/usuarios-cooperativa/actions/usuarios.actions";
import { RecoleccionesTable } from "@/features/recolecciones/components/recolecciones-table";
import type { FincaCooperativa, RutaCooperativa } from "@/types";

function SinRutaAsignada() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-3">
      <p className="text-lg font-semibold text-gray-700">Sin ruta asignada</p>
      <p className="text-sm text-gray-500 max-w-sm">
        Tu cuenta aún no tiene una ruta asignada. Contacta con el administrador para que te asigne una.
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
  let sinRuta = false;

  if (userRole === "cooperativa_user") {
    const rutaId = await getRutaAsignada();
    if (rutaId === null) {
      sinRuta = true;
    } else {
      const rutaAsignada = rutas.find((r) => r.id === rutaId) ?? null;
      fincasParaForm = rutaAsignada?.fincas ?? [];
      // No se pasa rutasParaForm → el selector de ruta no aparece en el form
    }
  } else {
    // cooperativa_admin: todas las fincas activas y todas las rutas
    fincasParaForm = await getFincasActivas();
    rutasParaForm = rutas;
  }

  if (sinRuta) {
    return <SinRutaAsignada />;
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
