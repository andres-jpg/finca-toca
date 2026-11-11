import { formatPct } from "@/modules/core/formato/numeros";
import { MermaBadge } from "../../components/merma-badge";
import { DEFINICIONES, produccionDelMes } from "../lib/kpis";
import { kgTexto } from "../lib/formato";
import { describirPeriodo, deLaPeriodo } from "../lib/periodo";
import { getProduccionPanel, getReferenciasPanel } from "../queries/panel.queries";
import type { PeriodoPanel } from "../types";
import { InfoDefinicion } from "./info-definicion";

const TH = "px-3 py-2 text-right font-semibold";

/**
 * Producción del periodo: los kg que ENTRAN a trilla, tostión (marca propia / maquila) y molienda (marca propia / maquila).
 * Sin empaque. La merma de tostión de marca propia va con su banda. La merma de trilla y la de maquila se consultan en cada lote.
 */
export async function SeccionProduccion({ periodo, desde, hasta }: { periodo: PeriodoPanel; desde: string; hasta: string }) {
  const [filas, refs] = await Promise.all([getProduccionPanel(desde, hasta), getReferenciasPanel()]);
  const p = produccionDelMes(filas);
  const merma = p.mermaTostionMarcaPropia;
  const sin = filas.length === 0;

  return (
    <section className="space-y-3" aria-labelledby="produccion-titulo">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="produccion-titulo" className="text-lg font-semibold tracking-tight text-gray-800">
            Producción {deLaPeriodo(periodo)}
          </h2>
          <p className="text-sm text-gray-500">Kilos que entran a cada proceso, del {describirPeriodo(desde, hasta)}.</p>
        </div>
        <InfoDefinicion titulo="Producción" texto={DEFINICIONES.produccion.texto} />
      </div>
      {sin ? (
        <p role="status" className="rounded-md border border-stone-200 bg-white px-3 py-3 text-sm text-gray-600">
          No hay procesos registrados en este periodo.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Proceso
                </th>
                <th scope="col" className={TH}>
                  Marca propia
                </th>
                <th scope="col" className={TH}>
                  Maquila
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              <tr>
                <th scope="row" className="px-3 py-2 text-left font-medium text-gray-800">
                  Trilla
                </th>
                <td colSpan={2} className="px-3 py-2 text-right tabular-nums">
                  {kgTexto(p.trillaKg)}
                </td>
              </tr>
              <tr>
                <th scope="row" className="px-3 py-2 text-left font-medium text-gray-800">
                  Tostión
                </th>
                <td className="px-3 py-2 text-right tabular-nums">{kgTexto(p.tostion.marcaPropiaKg)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{kgTexto(p.tostion.maquilaKg)}</td>
              </tr>
              <tr>
                <th scope="row" className="px-3 py-2 text-left font-medium text-gray-800">
                  Molienda
                </th>
                <td className="px-3 py-2 text-right tabular-nums">{kgTexto(p.molienda.marcaPropiaKg)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{kgTexto(p.molienda.maquilaKg)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm" data-testid="merma-tostion">
        <span className="font-medium text-gray-800">Merma de tostión · marca propia</span>
        {merma === null ? (
          <span className="text-gray-500">— sin tandas cerradas en el periodo</span>
        ) : (
          <>
            <span className="font-semibold tabular-nums text-gray-900">{formatPct(merma.pct)}</span>
            <MermaBadge mermaPct={merma.pct} referenciaPct={refs.tostion} toleranciaPts={refs.toleranciaPts} tipo="tostion" conAyuda={false} />
            {refs.tostion !== null && (
              <span className="text-xs text-gray-500">
                banda: {formatPct(refs.tostion)} ± {refs.toleranciaPts} pts
              </span>
            )}
          </>
        )}
      </div>
    </section>
  );
}
