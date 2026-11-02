import { formatCOP, formatKg, formatPct } from "@/modules/core/formato/numeros";
import { Cifra, Detalle, TarjetaKpi } from "../../panel/components/tarjeta-kpi";
import { promedioPonderadoPorCalidad } from "../lib/costo-libra";
import { getCostoLibraPanel } from "../queries/costo.queries";

const DEFINICION =
  "Costo directo de producir una libra (500 g) de café de marca propia: el café con la merma de tostión del lote más la bolsa y la etiqueta. Es el promedio de los lotes empacados en el periodo, ponderado por los kilos empacados. Energía, gas, mano de obra y arriendo no entran.";

/**
 * Costo por libra por calidad (A-05 · HU-F1-17): una tarjeta por tipo de café con el costo promedio ponderado por kg de los lotes
 * de marca propia empacados en el periodo, frente al precio de venta y el margen. Sin empaques en el periodo, estado vacío.
 */
export async function SeccionCostoLibra({ desde, hasta }: { desde: string; hasta: string }) {
  const calidades = promedioPonderadoPorCalidad(await getCostoLibraPanel(desde, hasta));

  return (
    <section className="space-y-3" aria-labelledby="costo-libra-titulo">
      <div>
        <h2 id="costo-libra-titulo" className="text-lg font-semibold tracking-tight text-gray-800">
          Costo por libra (500 g)
        </h2>
        <p className="text-sm text-gray-500">Marca propia empacada en el periodo, por calidad.</p>
      </div>
      {calidades.length === 0 ? (
        <p role="status" className="rounded-md border border-stone-200 bg-white px-3 py-3 text-sm text-gray-600">
          No hubo café de marca propia empacado en este periodo.
        </p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(16rem,1fr))] gap-3">
          {calidades.map((c) => (
            <TarjetaKpi key={c.tipoCafeId} titulo={c.tipoCafe} definicion={DEFINICION}>
              <div>
                <Cifra>{c.costoLibra === null ? "—" : formatCOP(c.costoLibra)}</Cifra>
                <Detalle>
                  costo por libra · {formatKg(c.kg)} empacados
                </Detalle>
              </div>
              <dl className="space-y-0.5 text-sm text-gray-700">
                <div className="flex justify-between gap-2">
                  <dt>Precio de venta</dt>
                  <dd className="tabular-nums">{c.precioVenta === null ? "—" : formatCOP(c.precioVenta)}</dd>
                </div>
                <div className="flex justify-between gap-2 font-semibold">
                  <dt>Margen</dt>
                  <dd className="tabular-nums">{c.margen === null ? "—" : `${formatCOP(c.margen)} (${formatPct(c.margenPct)})`}</dd>
                </div>
              </dl>
              {c.costoLibra === null ? (
                <Detalle>Aún no se puede calcular: falta la tostión del lote o el precio de compra de la bolsa y la etiqueta.</Detalle>
              ) : (
                c.lotesSinCosto > 0 && <Detalle>{c.lotesSinCosto === 1 ? "1 lote sin costo no entra" : `${c.lotesSinCosto} lotes sin costo no entran`} en el promedio.</Detalle>
              )}
              {c.precioVenta === null && c.costoLibra !== null && <Detalle>Sin ventas de este producto no hay precio ni margen.</Detalle>}
            </TarjetaKpi>
          ))}
        </div>
      )}
    </section>
  );
}
