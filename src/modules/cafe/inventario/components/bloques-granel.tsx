import Link from "next/link";
import { formatKg } from "@/modules/core/formato/numeros";
import type { CafeVerdeTipo, TostadoSinEmpacar } from "../queries/inventario.queries";
import { textoDias } from "../lib/inventario";

/**
 * Los dos primeros bloques de la marca propia: 1 · café verde por tostar (kg por tipo de café, con «alcanza para N días de
 * venta») y 2 · tostado sin empacar (kg por tipo de café y forma). Los kilos NO se suman entre bloques: son etapas distintas del
 * mismo café. El sobrante de un empaque nunca vuelve a café verde. Los pinta dentro de la cuadrícula de tres bloques de la página.
 */
export function BloquesGranel({
  verde,
  tostado,
  alcance = {},
}: {
  verde: CafeVerdeTipo[];
  tostado: (Omit<TostadoSinEmpacar, "forma"> & { forma: TostadoSinEmpacar["forma"] | null })[];
  /** Días de venta que alcanza el café verde de cada tipo (nombre del tipo → días); `null` o ausente sin ventas. */
  alcance?: Record<string, number | null>;
}) {
  const conAlcance = verde.filter((v) => (alcance[v.tipoCafe] ?? null) !== null);
  return (
    <>
      <section aria-labelledby="inv-verde" className="rounded-lg border border-stone-200 bg-white p-4">
        <h3 id="inv-verde" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          1 · Café verde por tostar
        </h3>
        {verde.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No hay café verde de marca propia pendiente de tostar.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-100">
            {verde.map((v) => (
              <li key={v.tipoCafe} className="flex items-baseline justify-between gap-3 py-2">
                <span className="font-medium text-gray-800">{v.tipoCafe}</span>
                <span className="text-lg font-bold tabular-nums text-gray-900">{formatKg(v.kg)}</span>
              </li>
            ))}
          </ul>
        )}
        {conAlcance.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-gray-500">
            {conAlcance.map((v) => (
              <li key={v.tipoCafe}>
                {v.tipoCafe} alcanza para {textoDias(alcance[v.tipoCafe] ?? null)} de venta al ritmo actual
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="inv-tostado" className="rounded-lg border border-stone-200 bg-white p-4">
        <h3 id="inv-tostado" className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          2 · Tostado sin empacar
        </h3>
        {tostado.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No hay café tostado sin empacar.</p>
        ) : (
          <ul className="mt-3 divide-y divide-stone-100">
            {tostado.map((g) => (
              <li key={g.loteId ? `${g.loteId}-${g.forma}` : `ci-${g.tipoCafe}`} className="flex items-baseline justify-between gap-3 py-2">
                <span>
                  <span className="font-medium text-gray-800">
                    {g.tipoCafe ?? "Sin tipo"}
                    {g.forma ? ` · ${g.forma}` : ""}
                  </span>
                  <span className="ml-2 text-xs text-gray-500">
                    {g.loteId ? (
                      <Link href={`/dashboard/cafe/lotes/${g.loteId}`} className="underline-offset-2 hover:underline">
                        {g.codigo}
                      </Link>
                    ) : (
                      // Sin lote: viene de la carga inicial (B-15).
                      g.codigo
                    )}
                  </span>
                </span>
                <span className="text-lg font-bold tabular-nums text-gray-900">{formatKg(g.kg)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-gray-500">Sobrantes de empaque. Se ofrecen en el próximo empaque de la misma calidad y forma.</p>
      </section>
    </>
  );
}
