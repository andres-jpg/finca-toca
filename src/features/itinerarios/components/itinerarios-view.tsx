"use client";

import { ItinerarioPanel } from "./itinerario-panel";
import { ItinerarioFincasEditor } from "./itinerario-fincas-editor";
import { EstadoItinerarioPanel } from "./estado-itinerario-panel";
import type { Itinerario, FincaCooperativa } from "@/types";

interface ItinerariosViewAdminProps {
  itinerarios: Itinerario[];
  fincasDisponibles: FincaCooperativa[];
}

export function ItinerariosViewAdmin({ itinerarios, fincasDisponibles }: ItinerariosViewAdminProps) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 tracking-tight">Itinerarios</h2>
        <p className="text-sm text-gray-500 mt-0.5">
          Organiza las fincas por conductor. Arrastra para reordenar.
        </p>
      </div>

      <EstadoItinerarioPanel itinerarios={itinerarios} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {itinerarios.map((it) => (
          <ItinerarioPanel
            key={it.id}
            itinerario={it}
            fincasDisponibles={fincasDisponibles}
            isAdmin={true}
          />
        ))}
      </div>
    </div>
  );
}

interface ItinerariosViewUserProps {
  itinerario: Itinerario | null;
}

export function ItinerariosViewUser({ itinerario }: ItinerariosViewUserProps) {
  if (!itinerario) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-3">
        <p className="text-lg font-semibold text-gray-700">Sin itinerario asignado</p>
        <p className="text-sm text-gray-500 max-w-sm">
          Tu cuenta aún no tiene un itinerario asignado. Contacta con el administrador.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 tracking-tight">
          {itinerario.nombre}
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {itinerario.fincas.length} finca{itinerario.fincas.length !== 1 ? "s" : ""} · arrastra para reordenar
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <ItinerarioFincasEditor
          itinerarioId={itinerario.id}
          initialFincas={itinerario.fincas}
          isAdmin={false}
        />
      </div>
    </div>
  );
}
