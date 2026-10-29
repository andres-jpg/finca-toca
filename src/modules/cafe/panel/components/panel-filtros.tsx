import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { etiquetaLinea, etiquetaPeriodo, LINEAS_PANEL, PERIODOS, serializarParamsPanel, type ParamsPanel } from "../lib/periodo";
import type { LineaPanel, PeriodoPanel } from "../types";

const RUTA = "/dashboard/cafe";

const CHIP = "inline-flex min-h-11 items-center rounded-md border px-3.5 text-sm font-medium transition-colors sm:min-h-9";
const CHIP_ACTIVO = "border-stone-800 bg-stone-800 text-white";
const CHIP_INACTIVO = "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:text-stone-900";

function href(params: Partial<ParamsPanel>): string {
  const qs = serializarParamsPanel(params);
  return qs ? `${RUTA}?${qs}` : RUTA;
}

interface PanelFiltrosProps {
  periodo: PeriodoPanel;
  linea: LineaPanel | null;
  /** Las fechas del rango (o las del periodo elegido, que precargan el formulario de «Rango»). */
  desde: string;
  hasta: string;
  hoy: string;
}

/**
 * Filtros del panel: Hoy / Esta semana / Este mes / Rango y la línea (Todo · Marca propia · Trilla · Maquila). Son enlaces y
 * un formulario GET: todo vive en la URL (se comparte y el botón «Exportar» la reutiliza) y funciona sin JavaScript.
 * Cambiar el periodo conserva la línea y viceversa.
 */
export function PanelFiltros({ periodo, linea, desde, hasta, hoy }: PanelFiltrosProps) {
  return (
    <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-8">
        <nav aria-label="Periodo" className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Periodo</p>
          <div className="flex flex-wrap gap-1.5">
            {PERIODOS.map((p) => (
              <Link
                key={p}
                href={href({ periodo: p, linea, ...(p === "rango" ? { desde, hasta } : {}) })}
                aria-current={periodo === p ? "page" : undefined}
                className={cn(CHIP, periodo === p ? CHIP_ACTIVO : CHIP_INACTIVO)}
              >
                {etiquetaPeriodo(p)}
              </Link>
            ))}
          </div>
        </nav>

        <nav aria-label="Línea de negocio" className="space-y-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Línea</p>
          <div className="flex flex-wrap gap-1.5">
            {[null, ...LINEAS_PANEL].map((l) => (
              <Link
                key={l ?? "todo"}
                href={href({ periodo, linea: l, ...(periodo === "rango" ? { desde, hasta } : {}) })}
                aria-current={linea === l ? "page" : undefined}
                className={cn(CHIP, linea === l ? CHIP_ACTIVO : CHIP_INACTIVO)}
              >
                {etiquetaLinea(l)}
              </Link>
            ))}
          </div>
        </nav>
      </div>

      {periodo === "rango" && (
        <form method="get" action={RUTA} className="flex flex-wrap items-end gap-3 border-t border-stone-100 pt-3">
          <input type="hidden" name="periodo" value="rango" />
          {linea && <input type="hidden" name="linea" value={linea} />}
          <div className="space-y-1.5">
            <Label htmlFor="panel-desde">Desde</Label>
            <Input id="panel-desde" name="desde" type="date" defaultValue={desde} max={hoy} className="h-11 sm:h-9" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="panel-hasta">Hasta</Label>
            <Input id="panel-hasta" name="hasta" type="date" defaultValue={hasta} className="h-11 sm:h-9" required />
          </div>
          <Button type="submit" className="h-11 sm:h-9">
            Aplicar
          </Button>
        </form>
      )}
    </div>
  );
}
