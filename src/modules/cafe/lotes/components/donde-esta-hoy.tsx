import { formatKg } from "@/modules/core/formato/numeros";
import { enteroConMiles } from "../../empaque/lib/empaque";
import type { GrupoSaldo, UnidadesEmpacadas } from "../lib/donde-esta-hoy";

interface Props {
  grupos: GrupoSaldo[];
  /** `null` = no aplica (servicios a terceros). */
  granelKg: number | null;
  empacado: UnidadesEmpacadas[];
}

/**
 * «Dónde está hoy este café»: una lista por tipo de existencia (café sin tostar o tostado, kilos de tostado sin empacar, unidades empacadas).
 * Cada línea tiene su propia unidad y NO hay total: sumar kilos con bolsas no significa nada.
 */
export function DondeEstaHoy({ grupos, granelKg, empacado }: Props) {
  const vacio = grupos.length === 0 && !(granelKg && granelKg > 0) && empacado.length === 0;
  return (
    <section aria-labelledby="titulo-donde" className="space-y-2">
      <h2 id="titulo-donde" className="text-lg font-semibold text-gray-800">
        Dónde está hoy este café
      </h2>
      {vacio ? (
        <p className="rounded-lg border border-stone-200 bg-white p-4 text-sm text-gray-500">No queda café de este lote en planta.</p>
      ) : (
        <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
          {grupos.map((g) => (
            <li key={g.paso ?? "sin"} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
              <span className="text-gray-700">
                Café {g.texto}
                {g.estimado && <span className="ml-2 text-xs text-gray-500">Estimado</span>}
              </span>
              <span className="font-medium tabular-nums text-gray-900">{formatKg(g.pesoKg)}</span>
            </li>
          ))}
          {granelKg !== null && granelKg > 0 && (
            <li className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
              <span className="text-gray-700">Tostado sin empacar</span>
              <span className="font-medium tabular-nums text-gray-900">{formatKg(granelKg)}</span>
            </li>
          )}
          {empacado.map((e) => (
            <li key={`${e.presentacionG}-${e.forma}`} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm">
              <span className="text-gray-700">
                Empacado · {e.producto}
                {e.forma === "molido" && !/molido/i.test(e.producto) ? " molido" : ""}
              </span>
              <span className="font-medium tabular-nums text-gray-900">
                {enteroConMiles(e.unidades)} {e.unidades === 1 ? "unidad" : "unidades"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
