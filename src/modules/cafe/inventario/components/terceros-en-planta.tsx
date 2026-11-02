import Link from "next/link";
import { cn } from "@/lib/utils";
import { formatKg } from "@/modules/core/formato/numeros";
import { LineaBadge } from "../../components/linea-badge";
import { MENSAJE_TERCEROS, resaltarSinRecoger } from "../lib/inventario";
import type { LoteTercero } from "../queries/inventario.queries";

/**
 * Café de clientes que sigue en la planta. NO es inventario de Cofradía: no hay totales ni se mezcla con la marca
 * propia. Resalta los lotes listos que llevan más de `diasSinRecoger` días (el mismo parámetro del tablero de Planta).
 */
export function TercerosEnPlanta({ lotes, diasSinRecoger }: { lotes: LoteTercero[]; diasSinRecoger: number }) {
  return (
    <section className="space-y-3" aria-labelledby="inv-terceros">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="inv-terceros" className="text-xl font-bold tracking-tight text-gray-800 sm:text-2xl">
          Lotes de clientes en planta
        </h2>
        <LineaBadge linea="servicio" />
      </div>
      <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
        {MENSAJE_TERCEROS}
      </p>

      {lotes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center text-sm text-gray-500">No hay café de terceros en planta.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Lote</th>
                <th scope="col" className="px-4 py-3 font-semibold">Cliente</th>
                <th scope="col" className="px-4 py-3 font-semibold">Etapa</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Kilos</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Días en planta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {lotes.map((l) => {
                const alerta = resaltarSinRecoger(l.estado, l.dias, diasSinRecoger);
                return (
                  <tr key={l.id} className={cn(alerta && "bg-amber-50")}>
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/dashboard/cafe/lotes/${l.id}`} className="inline-flex min-h-11 items-center text-gray-900 underline-offset-2 hover:underline sm:min-h-0">
                        {l.codigo}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{l.cliente}</td>
                    <td className="px-4 py-3 text-gray-700">
                      {l.etapa}
                      {alerta && <span className="ml-2 rounded-md bg-amber-200 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">Sin recoger</span>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatKg(l.kg)}</td>
                    <td className={cn("px-4 py-3 text-right tabular-nums", alerta && "font-semibold text-amber-900")}>{l.dias}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
