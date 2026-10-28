import { cn } from "@/lib/utils";
import type { Avance } from "../lib/avance";

/**
 * Barra de avance del lote con su texto («2 de 3», «Tostado 4/6 bultos»). El texto va en la propia barra para
 * lectores de pantalla (`role="progressbar"`): el color solo no dice nada.
 */
export function AvanceBarra({ avance, completo = false, className }: { avance: Avance; completo?: boolean; className?: string }) {
  const pct = Math.round(avance.fraccion * 100);
  return (
    <div className={cn("min-w-32", className)}>
      <div className="text-xs font-medium tabular-nums text-gray-700">{avance.texto}</div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={avance.texto}
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-stone-200"
      >
        <div className={cn("h-full rounded-full", completo || pct === 100 ? "bg-emerald-500" : "bg-sky-500")} style={{ width: `${pct}%` }} />
      </div>
      {avance.detalle && <div className="mt-1 text-[11px] text-amber-700">{avance.detalle}</div>}
    </div>
  );
}
