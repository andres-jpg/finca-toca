import { checkRoutePermission } from "@/lib/auth/check-permissions";
import { getItinerarios, getItinerarioAsignado } from "@/features/itinerarios/actions/itinerarios.actions";
import { getFincasActivas } from "@/features/fincas-cooperativa/actions/fincas.actions";
import { ItinerariosViewAdmin, ItinerariosViewUser } from "@/features/itinerarios/components/itinerarios-view";
import type { FincaCooperativa } from "@/types";

export default async function ItinerariosPage() {
  const userRole = await checkRoutePermission(["cooperativa_admin", "cooperativa_user"]);

  if (userRole === "cooperativa_admin") {
    const [itinerarios, todasFincas] = await Promise.all([
      getItinerarios(),
      getFincasActivas(),
    ]);

    const asignadasIds = new Set(
      itinerarios.flatMap((it) => it.fincas.map((f) => f.id))
    );

    const fincasDisponibles: FincaCooperativa[] = todasFincas.filter(
      (f) => !asignadasIds.has(f.id)
    );

    return (
      <ItinerariosViewAdmin
        itinerarios={itinerarios}
        fincasDisponibles={fincasDisponibles}
      />
    );
  }

  const itinerario = await getItinerarioAsignado();
  return <ItinerariosViewUser itinerario={itinerario} />;
}
