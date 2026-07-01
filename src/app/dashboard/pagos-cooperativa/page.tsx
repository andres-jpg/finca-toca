import { checkRoutePermission } from "@/lib/auth/check-permissions";
import { getRutas } from "@/features/rutas-cooperativa/actions/rutas.actions";
import { getItinerarios } from "@/features/itinerarios/actions/itinerarios.actions";
import { getPagosHistorial } from "@/features/pagos-cooperativa/actions/pagos.actions";
import { PagosCooperativaClient } from "./pagos-cooperativa-client";

export default async function PagosCooperativaPage() {
  await checkRoutePermission(["cooperativa_admin"]);

  const [rutas, itinerarios, historial] = await Promise.all([
    getRutas(),
    getItinerarios(),
    getPagosHistorial(),
  ]);

  const itinerariosSimple = itinerarios.map((it) => ({ id: it.id, nombre: it.nombre }));

  return (
    <PagosCooperativaClient
      rutas={rutas}
      itinerarios={itinerariosSimple}
      historial={historial}
    />
  );
}
