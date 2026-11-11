import { formatCOP, formatPct } from "@/modules/core/formato/numeros";
import { describirPeriodo } from "../../panel/lib/periodo";
import { InfoDefinicion } from "../../panel/components/info-definicion";
import { NOTA_COSTO_DIRECTO, PRESENTACIONES_COSTO, promedioPonderadoPorCalidad, type CostoLibraCalidad } from "../lib/costo-libra";
import { getCostoLibraPanel } from "../queries/costo.queries";

const DEFINICION =
  "Costo directo de producir una libra (500 g) de café de marca propia, por tipo de café y presentación: el café con la merma de tostión acumulada del lote más la bolsa y la etiqueta a los precios registrados (en 2.500 g se reparten entre 5 libras). Es el promedio de los lotes empacados en el periodo, ponderado por los kilos empacados. Energía, gas, mano de obra y arriendo no entran.";

const gramosTexto = (g: number): string => `${String(g).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} g`;

function Celda({ c }: { c: CostoLibraCalidad | undefined }) {
  if (!c) return <span className="text-gray-400">—</span>;
  if (c.costoLibra === null) return <span className="text-xs text-gray-500">Falta la tostión o el precio de la bolsa y la etiqueta</span>;
  return (
    <>
      <span className="block text-base font-semibold text-gray-900">{formatCOP(c.costoLibra)}</span>
      <span className="block text-xs text-gray-500">
        {c.precioVenta === null ? "Sin precio de venta" : `Precio ${formatCOP(c.precioVenta)} por libra`}
      </span>
      {c.margen !== null && (
        <span className="block text-xs font-medium text-gray-700">
          Margen {formatCOP(c.margen)} ({formatPct(c.margenPct)})
        </span>
      )}
    </>
  );
}

/**
 * Costo de producir una libra por tipo de café y presentación (500 g y 2.500 g), con el precio por libra y el margen debajo.
 * Promedio ponderado por kg de los lotes de marca propia empacados en el periodo (`cafe.costo_libra_panel`).
 */
export async function SeccionCostoLibra({ desde, hasta, etiquetaPeriodo }: { desde: string; hasta: string; etiquetaPeriodo: string }) {
  const porPresentacion = await Promise.all(PRESENTACIONES_COSTO.map(async (g) => [g, promedioPonderadoPorCalidad(await getCostoLibraPanel(desde, hasta, g))] as const));
  const calidades = new Map<string, string>();
  for (const [, cs] of porPresentacion) for (const c of cs) calidades.set(c.tipoCafeId, c.tipoCafe);

  return (
    <section className="space-y-3" aria-labelledby="costo-libra-titulo">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="costo-libra-titulo" className="text-lg font-semibold tracking-tight text-gray-800">
            Costo de producir una libra
          </h2>
          <p className="text-sm text-gray-500">Marca propia empacada del {describirPeriodo(desde, hasta)}.</p>
        </div>
        <InfoDefinicion titulo="Costo de producir una libra" texto={DEFINICION} />
      </div>
      {calidades.size === 0 ? (
        <p role="status" className="rounded-md border border-stone-200 bg-white px-3 py-3 text-sm text-gray-600">
          No hubo café de marca propia empacado en este periodo.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Tipo de café
                </th>
                {PRESENTACIONES_COSTO.map((g) => (
                  <th key={g} scope="col" className="px-3 py-2 text-right font-semibold">
                    {gramosTexto(g)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {[...calidades.entries()].map(([id, nombre]) => (
                <tr key={id}>
                  <th scope="row" className="px-3 py-2 text-left font-medium text-gray-800">
                    {nombre}
                  </th>
                  {porPresentacion.map(([g, cs]) => (
                    <td key={g} className="px-3 py-2 text-right tabular-nums">
                      <Celda c={cs.find((c) => c.tipoCafeId === id)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-500">
        Promedio ponderado de los lotes empacados {etiquetaPeriodo}, por los kilos empacados. {NOTA_COSTO_DIRECTO}
      </p>
    </section>
  );
}
