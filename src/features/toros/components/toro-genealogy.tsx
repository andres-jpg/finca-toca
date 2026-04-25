import Link from "next/link";
import type { ToroDetalle } from "@/types";

interface ToroGenealogyProps {
  toro: ToroDetalle;
}

export function ToroGenealogy({ toro }: ToroGenealogyProps) {
  const hasPadre = toro.padre !== null;
  const hasMadre = toro.madre !== null;

  if (!hasPadre && !hasMadre) {
    return (
      <p className="text-sm text-gray-400">Sin información genealógica registrada.</p>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs text-gray-500 mb-1">Padre (toro)</p>
        {toro.padre ? (
          <Link
            href={`/dashboard/toros/${toro.padre.id}`}
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            #{toro.padre.toro_id} — {toro.padre.nombre}
          </Link>
        ) : (
          <span className="text-sm text-gray-400">No registrado</span>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
        <p className="text-xs text-gray-500 mb-1">Madre (vaca)</p>
        {toro.madre ? (
          <Link
            href={`/dashboard/vacas/${toro.madre.id}`}
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            #{toro.madre.vaca_id} — {toro.madre.nombre}
          </Link>
        ) : (
          <span className="text-sm text-gray-400">No registrada</span>
        )}
      </div>
    </div>
  );
}
