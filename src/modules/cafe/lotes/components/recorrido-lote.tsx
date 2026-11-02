import { Check, Circle, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EstadoPaso, PasoRecorrido } from "../lib/recorrido";

const TEXTO: Record<EstadoPaso, string> = { completo: "completo", en_curso: "en curso", pendiente: "pendiente" };
const ESTILO: Record<EstadoPaso, string> = {
  completo: "border-emerald-300 bg-emerald-50 text-emerald-900",
  en_curso: "border-amber-300 bg-amber-50 text-amber-900",
  pendiente: "border-stone-200 bg-stone-50 text-stone-500",
};

/** Stepper horizontal del lote: cada etapa con su estado (completo / en curso / pendiente), dicho con icono y palabra. */
export function RecorridoLote({ pasos }: { pasos: PasoRecorrido[] }) {
  return (
    <section aria-labelledby="titulo-recorrido" className="space-y-2">
      <h2 id="titulo-recorrido" className="text-lg font-semibold text-gray-800">
        Recorrido
      </h2>
      <ol className="flex gap-2 overflow-x-auto pb-1">
        {pasos.map((p) => {
          const Icono = p.estado === "completo" ? Check : p.estado === "en_curso" ? CircleDot : Circle;
          return (
            <li key={p.clave} className={cn("flex min-h-11 min-w-32 shrink-0 flex-col justify-center rounded-lg border px-3 py-2", ESTILO[p.estado])}>
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                <Icono className="h-4 w-4 shrink-0" aria-hidden />
                {p.etiqueta}
              </span>
              <span className="text-xs">
                {p.detalle ?? TEXTO[p.estado]}
                {p.detalle && <span className="sr-only"> ({TEXTO[p.estado]})</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
