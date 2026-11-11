import { formatCOP, formatPct } from "@/modules/core/formato/numeros";
import { DEFINICIONES, fraseMargenGrande, gramosVendidosCsv, mixPorPresentacion } from "../lib/kpis";
import { librasTexto } from "../lib/formato";
import { describirPeriodo } from "../lib/periodo";
import { getCostosLibra, getVentasPresentacion } from "../queries/panel.queries";
import { InfoDefinicion } from "./info-definicion";

const COLORES = ["#b45309", "#0d9488", "#2563eb", "#78716c"];
const TH = "px-3 py-2 text-right font-semibold";

/** Una presentación en gramos, como se lee: `500` → «500 g», `2500` → «2.500 g». */
const gramosTexto = (g: number): string => `${String(g).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} g`;

/** «Libras vendidas por presentación»: barra de mix + tabla (libras, ingreso, margen por libra, margen) y la frase de la bolsa grande. */
export async function SeccionMix({ desde, hasta, hoy }: { desde: string; hasta: string; hoy: string }) {
  const ventas = await getVentasPresentacion(desde, hasta);
  const costos = await getCostosLibra(hoy, gramosVendidosCsv(ventas));
  const mix = mixPorPresentacion(ventas, costos);
  const frase = fraseMargenGrande(mix);

  return (
    <section className="space-y-3" aria-labelledby="mix-titulo">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="mix-titulo" className="text-lg font-semibold tracking-tight text-gray-800">
            {DEFINICIONES.mix.titulo}
          </h2>
          <p className="text-sm text-gray-500">Marca propia, del {describirPeriodo(desde, hasta)}.</p>
        </div>
        <InfoDefinicion titulo={DEFINICIONES.mix.titulo} texto={DEFINICIONES.mix.texto} />
      </div>
      {mix.length === 0 ? (
        <p role="status" className="rounded-md border border-stone-200 bg-white px-3 py-3 text-sm text-gray-600">
          No hubo ventas de marca propia en este periodo.
        </p>
      ) : (
        <div className="space-y-3 rounded-lg border border-stone-200 bg-white p-3 sm:p-4">
          <div role="img" aria-label={`Mix de presentaciones: ${mix.map((f) => `${gramosTexto(f.presentacionG)} ${formatPct(f.partePct)}`).join(", ")}`} className="flex h-6 overflow-hidden rounded-md bg-stone-100">
            {mix.map((f, i) => (
              <div key={f.presentacionG} style={{ width: `${f.partePct}%`, backgroundColor: COLORES[i % COLORES.length] }} className="flex items-center justify-center text-[11px] font-semibold text-white">
                {f.partePct >= 12 ? `${gramosTexto(f.presentacionG)} · ${formatPct(f.partePct)}` : null}
              </div>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Presentación
                  </th>
                  <th scope="col" className={TH}>
                    Libras
                  </th>
                  <th scope="col" className={TH}>
                    Ingreso
                  </th>
                  <th scope="col" className={TH}>
                    Margen por libra
                  </th>
                  <th scope="col" className={TH}>
                    Margen
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {mix.map((f) => (
                  <tr key={f.presentacionG}>
                    <th scope="row" className="px-3 py-2 text-left font-medium text-gray-800">
                      {gramosTexto(f.presentacionG)}
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums">{librasTexto(f.libras)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatCOP(f.ingreso)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.margenPorLibra === null ? "—" : formatCOP(f.margenPorLibra)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{f.margenPct === null ? "—" : formatPct(f.margenPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {frase && (
            <p className="text-sm text-gray-700">
              Cada libra vendida en {gramosTexto(frase.gramos)} deja {formatCOP(frase.masMargen)} más de margen, por menor costo de empaque.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
