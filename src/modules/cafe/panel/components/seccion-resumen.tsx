import { cn } from "@/lib/utils";
import { formatearCOP } from "../../compras/lib/compra";
import { formatearKg3, formatearPct } from "../../lotes/lib/formato";
import { etiquetaServicio } from "../../lotes/lib/servicios";
import { etiquetaLinea } from "../lib/periodo";
import { resumenPorLinea, resumenPorTipo, type ResumenProceso } from "../lib/series";
import { getProduccionDiaria } from "../queries/panel.queries";
import type { LineaPanel } from "../types";

interface Props {
  desde: string;
  hasta: string;
  linea: LineaPanel | null;
}

const TH = "px-3 py-2 text-right font-semibold";

function Filas({ filas, mostrarValor }: { filas: ResumenProceso[]; mostrarValor: boolean }) {
  return filas.map((f) => (
    <tr key={f.tipo}>
      <th scope="row" className="px-3 py-2 text-left font-normal text-gray-800">
        {etiquetaServicio(f.tipo)}
      </th>
      <td className="px-3 py-2 text-right tabular-nums">{formatearKg3(f.kgEntrada)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{formatearKg3(f.kgSalida)}</td>
      <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatearPct(f.mermaPct)}</td>
      {mostrarValor && <td className="px-3 py-2 text-right tabular-nums">{f.valor > 0 ? formatearCOP(f.valor) : "—"}</td>}
    </tr>
  ));
}

function Cabecera({ primera, mostrarValor }: { primera: string; mostrarValor: boolean }) {
  return (
    <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-gray-500">
      <tr>
        <th scope="col" className="px-3 py-2 font-semibold">
          {primera}
        </th>
        <th scope="col" className={TH}>
          Kg entrada
        </th>
        <th scope="col" className={TH}>
          Kg salida
        </th>
        <th scope="col" className={TH}>
          Merma
        </th>
        {mostrarValor && (
          <th scope="col" className={TH}>
            Valor
          </th>
        )}
      </tr>
    </thead>
  );
}

/**
 * Resumen de producción del rango (HU-14 c3): por tipo de proceso y por línea, con kg de entrada y salida, merma ponderada
 * (calculada con los kilos, como en el resto del vertical) y el valor de los servicios. Sale de `cafe.produccion_diaria`, la
 * misma fuente de los gráficos, así que suma lo mismo que las tarjetas.
 */
export async function SeccionResumen({ desde, hasta, linea }: Props) {
  const filas = await getProduccionDiaria(desde, hasta, linea);
  if (filas.length === 0) {
    return <p className="rounded-lg border border-dashed border-gray-300 px-4 py-8 text-center text-sm text-gray-500">No hay procesos registrados en este periodo.</p>;
  }
  const porTipo = resumenPorTipo(filas);
  const porLinea = resumenPorLinea(filas);
  // Con una sola línea la segunda tabla repetiría la primera.
  const verPorLinea = linea === null && porLinea.length > 1;
  const hayValor = filas.some((f) => f.valor > 0);

  return (
    <div className={cn("grid gap-3", verPorLinea && "xl:grid-cols-2")}>
      <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full text-sm">
          <caption className="border-b border-stone-100 px-3 py-2 text-left text-sm font-semibold text-gray-800">
            Por tipo de proceso{linea ? ` · ${etiquetaLinea(linea)}` : " · todas las líneas"}
          </caption>
          <Cabecera primera="Proceso" mostrarValor={hayValor} />
          <tbody className="divide-y divide-stone-100">
            <Filas filas={porTipo} mostrarValor={hayValor} />
          </tbody>
        </table>
      </div>

      {verPorLinea && (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <caption className="border-b border-stone-100 px-3 py-2 text-left text-sm font-semibold text-gray-800">Por línea</caption>
            <Cabecera primera="Línea / proceso" mostrarValor={hayValor} />
            {porLinea.map((l) => (
              <tbody key={l.linea} className="divide-y divide-stone-100 border-t border-stone-200">
                <tr className="bg-stone-50/60">
                  <th scope="rowgroup" colSpan={hayValor ? 5 : 4} className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                    {etiquetaLinea(l.linea)}
                  </th>
                </tr>
                <Filas filas={l.procesos} mostrarValor={hayValor} />
              </tbody>
            ))}
          </table>
        </div>
      )}
    </div>
  );
}
