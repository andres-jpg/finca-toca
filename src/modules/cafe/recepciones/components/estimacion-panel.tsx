import Link from "next/link";
import { formatearPesos } from "@/modules/core/tarifas/lib/formato";
import { etiquetaServicio } from "../../lotes/lib/servicios";
import type { Estimacion } from "../lib/estimar-servicios";

const KG = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });

interface EstimacionPanelProps {
  estimacion: Estimacion;
  /** El admin ve el enlace a «Tarifas y parámetros» cuando falta una tarifa. */
  puedeConfigurar: boolean;
}

/**
 * Panel lateral «Estimación»: cada servicio con el peso que entra, la tarifa vigente y el valor estimado, y el
 * total. Es solo una estimación (lo dice el rótulo): el valor real se congela al registrar cada proceso.
 */
export function EstimacionPanel({ estimacion, puedeConfigurar }: EstimacionPanelProps) {
  const { lineas, total, incompleta, conEmpaque } = estimacion;

  return (
    <section aria-label="Estimación" className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-gray-800">Estimación</h2>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">Estimado</span>
      </div>

      {lineas.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">Indica el peso y elige los servicios para ver cuánto costaría.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-100">
          {lineas.map((l) => (
            <li key={l.servicio} className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">{etiquetaServicio(l.servicio)}</p>
                <p className="text-xs text-gray-500">
                  {KG.format(l.pesoKg)} kg ×{" "}
                  {l.tarifaKg === null ? (
                    <span className="text-amber-700">sin tarifa</span>
                  ) : (
                    <>{formatearPesos(l.tarifaKg)}/kg</>
                  )}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-gray-800">
                {l.valor === null ? "—" : formatearPesos(l.valor)}
              </p>
            </li>
          ))}
          {conEmpaque && (
            <li className="flex items-start justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">Empaque</p>
                <p className="text-xs text-gray-500">La bolsa la trae el cliente</p>
              </div>
              <p className="shrink-0 text-sm text-gray-500">Incluido</p>
            </li>
          )}
        </ul>
      )}

      {lineas.length > 0 && (
        <div className="mt-1 flex items-center justify-between gap-3 border-t border-gray-200 pt-3">
          <p className="text-sm font-semibold text-gray-800">{incompleta ? "Total parcial" : "Total estimado"}</p>
          <p className="text-lg font-bold tabular-nums text-gray-900">{formatearPesos(total)}</p>
        </div>
      )}

      {incompleta && (
        <p className="mt-2 text-xs text-amber-700">
          Falta la tarifa de algún servicio.{" "}
          {puedeConfigurar ? (
            <Link href="/dashboard/tarifas" className="font-medium underline underline-offset-2">
              Configúrala en Tarifas y parámetros
            </Link>
          ) : (
            "Pide a un administrador que la configure."
          )}
        </p>
      )}

      <p className="mt-3 text-xs leading-relaxed text-gray-500">
        Con la tarifa de hoy y la merma de referencia. El valor real se fija al registrar cada proceso, con la tarifa
        de ese día y el peso que realmente entra.
      </p>
    </section>
  );
}
