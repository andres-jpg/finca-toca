import Link from "next/link";
import type { VacaDetalle } from "@/types";

interface VacaGenealogyProps {
  vaca: VacaDetalle;
}

export function VacaGenealogy({ vaca }: VacaGenealogyProps) {
  const hasPadre = vaca.padre !== null;
  const hasMadre = vaca.madre !== null;

  if (!hasPadre && !hasMadre) {
    return (
      <p className="text-sm text-gray-400">Sin información genealógica registrada.</p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs text-gray-500 mb-1">Padre (toro)</p>
        {vaca.padre ? (
          <Link
            href={`/dashboard/toros/${vaca.padre.id}`}
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            #{vaca.padre.toro_id} — {vaca.padre.nombre}
          </Link>
        ) : (
          <span className="text-sm text-gray-400">No registrado</span>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs text-gray-500 mb-1">Madre (vaca)</p>
        {vaca.madre ? (
          <Link
            href={`/dashboard/vacas/${vaca.madre.id}`}
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            #{vaca.madre.vaca_id} — {vaca.madre.nombre}
          </Link>
        ) : (
          <span className="text-sm text-gray-400">No registrada</span>
        )}
      </div>
    </div>
  );
}
