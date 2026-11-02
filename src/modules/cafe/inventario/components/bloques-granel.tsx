import Link from "next/link";
import { formatKg } from "@/modules/core/formato/numeros";
import type { CafeVerdeTipo, GranelLote } from "../queries/inventario.queries";

/**
 * Los dos bloques de café a granel de la marca propia: café verde (bultos y kg, aún sin tostar) y tostado a granel
 * (kg por lote). El empacado, por calidad × presentación × forma, es la matriz de abajo. Los kilos NO se suman entre
 * bloques: son etapas distintas del mismo café.
 */
export function BloquesGranel({ verde, granel }: { verde: CafeVerdeTipo[]; granel: GranelLote[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section aria-labelledby="inv-verde" className="rounded-lg border border-stone-200 bg-white p-4">
        <h3 id="inv-verde" className="text-base font-semibold text-gray-800">
          Café verde
        </h3>
        <p className="text-xs text-gray-500">Sin tostar · bultos y kilos por calidad</p>
        {verde.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No hay café verde de marca propia pendiente de tostar.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-100">
            {verde.map((v) => (
              <li key={v.tipoCafe} className="flex items-baseline justify-between gap-3 py-2">
                <span className="font-medium text-gray-800">{v.tipoCafe}</span>
                <span className="text-right tabular-nums">
                  <span className="text-lg font-bold text-gray-900">{formatKg(v.kg)}</span>
                  <span className="ml-2 text-xs text-gray-500">{v.bultos === 1 ? "1 bulto" : `${v.bultos} bultos`}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="inv-granel" className="rounded-lg border border-stone-200 bg-white p-4">
        <h3 id="inv-granel" className="text-base font-semibold text-gray-800">
          Tostado a granel
        </h3>
        <p className="text-xs text-gray-500">Tostado sin empacar · kilos por lote</p>
        {granel.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No hay café tostado a granel.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-100">
            {granel.map((g) => (
              <li key={g.loteId} className="flex items-baseline justify-between gap-3 py-2">
                <span>
                  <Link href={`/dashboard/cafe/lotes/${g.loteId}`} className="font-medium text-gray-800 underline-offset-2 hover:underline">
                    {g.codigo}
                  </Link>
                  {g.tipoCafe && <span className="ml-2 text-xs text-gray-500">{g.tipoCafe}</span>}
                </span>
                <span className="text-lg font-bold tabular-nums text-gray-900">{formatKg(g.kg)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
