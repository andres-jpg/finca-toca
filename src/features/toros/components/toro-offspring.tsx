import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { CriaAnimal } from "@/types";

const VACA_ESTADO_LABELS: Record<string, string> = {
  produccion: "Producción",
  secado: "Secado",
  pre_jardin: "Pre-jardín",
  jardin: "Jardín",
  transicion: "Transición",
};

const TORO_ESTADO_LABELS: Record<string, string> = {
  jardin: "Jardín",
  reproductor: "Reproductor",
};

interface ToroOffspringProps {
  crias: CriaAnimal[];
}

export function ToroOffspring({ crias }: ToroOffspringProps) {
  if (crias.length === 0) {
    return (
      <p className="text-sm text-gray-400">Sin crías registradas.</p>
    );
  }

  return (
    <div className="space-y-2">
      {crias.map((cria) => {
        const estadoLabel =
          cria.tipo === "vaca"
            ? VACA_ESTADO_LABELS[cria.estado ?? ""] ?? cria.estado
            : TORO_ESTADO_LABELS[cria.estado ?? ""] ?? cria.estado;
        const href =
          cria.tipo === "vaca"
            ? `/dashboard/vacas/${cria.id}`
            : `/dashboard/toros/${cria.id}`;

        return (
          <div
            key={cria.id}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{cria.tipo === "vaca" ? "🐄" : "🐂"}</span>
              <Link href={href} className="text-sm font-medium text-blue-600 hover:underline">
                #{cria.animal_id} — {cria.nombre}
              </Link>
              {!cria.alta && (
                <span className="text-xs text-gray-400">(baja)</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {estadoLabel && (
                <Badge variant="outline" className="text-xs text-gray-600">
                  {estadoLabel}
                </Badge>
              )}
              <Badge variant="outline" className="text-xs capitalize text-gray-500">
                {cria.tipo}
              </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}
