import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { CriaAnimal } from "@/types";

const ESTADO_LABELS: Record<string, string> = {
  produccion: "Producción",
  secado: "Secado",
  pre_jardin: "Pre-jardín",
  jardin: "Jardín",
  transicion: "Transición",
  reproductor: "Reproductor",
};

interface AnimalOffspringProps {
  crias: CriaAnimal[];
}

export function AnimalOffspring({ crias }: AnimalOffspringProps) {
  if (crias.length === 0) {
    return <p className="text-sm text-gray-400">Sin crías registradas.</p>;
  }

  return (
    <div className="space-y-2">
      {crias.map((cria) => {
        const estadoLabel = ESTADO_LABELS[cria.estado ?? ""] ?? cria.estado;

        return (
          <div
            key={cria.id}
            className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-base">{cria.sexo === "hembra" ? "🐄" : "🐂"}</span>
              <Link
                href={`/dashboard/animales/${cria.id}`}
                className="text-sm font-medium text-blue-600 hover:underline"
              >
                #{cria.identificador} — {cria.nombre}
              </Link>
              {!cria.alta && <span className="text-xs text-gray-400">(baja)</span>}
            </div>
            <div className="flex items-center gap-2">
              {estadoLabel && (
                <Badge variant="outline" className="text-xs text-gray-600">
                  {estadoLabel}
                </Badge>
              )}
              <Badge variant="outline" className="text-xs capitalize text-gray-500">
                {cria.sexo}
              </Badge>
            </div>
          </div>
        );
      })}
    </div>
  );
}
