import { cn } from "@/lib/utils";
import type { AvisoPlanta } from "../lib/cola";

const PUNTO = { rojo: "bg-red-500", ambar: "bg-amber-500", gris: "bg-gray-400" } as const;

/** Fila de avisos del tablero (A-13): desvío de merma, insumo bajo mínimo y lote listo sin recoger. Solo avisan. */
export function AvisosPlanta({ avisos }: { avisos: AvisoPlanta[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-3" aria-label="Avisos de la planta">
      {avisos.map((a) => (
        <li key={a.id} className={cn("flex min-h-14 items-start gap-3 rounded-lg border bg-white px-4 py-3", a.cantidad > 0 ? "border-gray-300" : "border-gray-200")}>
          <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", a.cantidad > 0 ? PUNTO[a.tono] : "bg-gray-300")} aria-hidden />
          <div className="min-w-0">
            <p className={cn("text-sm font-semibold", a.cantidad > 0 ? "text-gray-900" : "text-gray-500")}>{a.titulo}</p>
            {a.detalle && <p className="truncate text-xs text-gray-600">{a.detalle}</p>}
          </div>
        </li>
      ))}
    </ul>
  );
}
