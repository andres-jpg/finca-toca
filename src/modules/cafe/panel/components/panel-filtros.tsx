import Link from "next/link";
import { cn } from "@/lib/utils";
import { etiquetaPeriodo, PERIODOS, serializarParamsPanel } from "../lib/periodo";
import type { PeriodoPanel } from "../types";

const RUTA = "/dashboard/cafe";

const CHIP = "inline-flex min-h-11 items-center rounded-md border px-3.5 text-sm font-medium transition-colors sm:min-h-9";
const CHIP_ACTIVO = "border-stone-800 bg-stone-800 text-white";
const CHIP_INACTIVO = "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-900";

function href(periodo: PeriodoPanel): string {
  const qs = serializarParamsPanel({ periodo });
  return qs ? `${RUTA}?${qs}` : RUTA;
}

/** Periodo del panel: Hoy / Semana / Mes. Son enlaces: todo vive en la URL (se comparte) y funciona sin JavaScript. */
export function PanelFiltros({ periodo }: { periodo: PeriodoPanel }) {
  return (
    <nav aria-label="Periodo" className="flex flex-wrap gap-1.5">
      {PERIODOS.map((p) => (
        <Link key={p} href={href(p)} aria-current={periodo === p ? "page" : undefined} className={cn(CHIP, periodo === p ? CHIP_ACTIVO : CHIP_INACTIVO)}>
          {etiquetaPeriodo(p)}
        </Link>
      ))}
    </nav>
  );
}
