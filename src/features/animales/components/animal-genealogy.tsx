import Link from "next/link";
import { RAZA_LABELS } from "@/lib/animales/razas";
import type { AnimalDetalle } from "@/types";

interface AnimalGenealogyProps {
  animal: AnimalDetalle;
}

export function AnimalGenealogy({ animal }: AnimalGenealogyProps) {
  const hasPadre = animal.padre !== null;
  const hasMadre = animal.madre !== null;

  if (!hasPadre && !hasMadre && !animal.padre_pajilla_nombre && !animal.padre_alquiler_nombre) {
    return (
      <p className="text-sm text-gray-400">Sin información genealógica registrada.</p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs text-gray-500 mb-1">Padre</p>
        {animal.padre ? (
          <Link
            href={`/dashboard/animales/${animal.padre.id}`}
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            #{animal.padre.identificador} — {animal.padre.nombre}
          </Link>
        ) : animal.padre_pajilla_nombre ? (
          <div>
            <span className="text-sm font-medium text-gray-800">{animal.padre_pajilla_nombre}</span>
            <span className="ml-2 text-xs text-purple-600 bg-purple-50 border border-purple-200 rounded px-1.5 py-0.5">
              pajilla
            </span>
          </div>
        ) : animal.padre_alquiler_nombre ? (
          <div>
            <span className="text-sm font-medium text-gray-800">{animal.padre_alquiler_nombre}</span>
            <span className="ml-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
              alquiler
            </span>
            {animal.padre_alquiler_raza && (
              <p className="text-xs text-gray-500 mt-0.5">
                {RAZA_LABELS[animal.padre_alquiler_raza]}
              </p>
            )}
          </div>
        ) : (
          <span className="text-sm text-gray-400">No registrado</span>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs text-gray-500 mb-1">Madre</p>
        {animal.madre ? (
          <Link
            href={`/dashboard/animales/${animal.madre.id}`}
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            #{animal.madre.identificador} — {animal.madre.nombre}
          </Link>
        ) : (
          <span className="text-sm text-gray-400">No registrada</span>
        )}
      </div>
    </div>
  );
}
