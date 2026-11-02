import { formatCOP, formatPct } from "@/modules/core/formato/numeros";
import { costoBolsaYEtiqueta, estadoCosto, mensajeSinCosto, NOTA_COSTO_DIRECTO, type CostoLibra } from "../lib/costo-libra";

const GUION = "—";

function Fila({ etiqueta, valor, fuerte, detalle }: { etiqueta: string; valor: string; fuerte?: boolean; detalle?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className={fuerte ? "text-sm font-semibold text-gray-800" : "text-sm text-gray-600"}>
        {etiqueta}
        {detalle && <span className="ml-1 text-xs font-normal text-gray-500">{detalle}</span>}
      </dt>
      <dd className={`tabular-nums ${fuerte ? "text-base font-semibold text-gray-900" : "text-sm text-gray-800"}`}>{valor}</dd>
    </div>
  );
}

/**
 * «Cuánto nos cuesta producir una libra (500 g)» (A-05 · HU-F1-17): café, bolsa y etiqueta, costo, precio de venta y margen.
 * Solo presenta lo que calculó `cafe.costo_libra_lote`; si falta un dato muestra el motivo en vez de un número inventado.
 * Es un bloque de la ficha de marca propia (el rediseño completo de la ficha es A-17).
 */
export function CostoLibraLote({ costo }: { costo: CostoLibra }) {
  const estado = estadoCosto(costo);
  if (estado === "no_aplica") return null;

  const aviso = mensajeSinCosto(estado);
  const bolsaYEtiqueta = costoBolsaYEtiqueta(costo);
  const moneda = (v: number | null) => (v === null ? GUION : formatCOP(v));

  return (
    <section className="space-y-2 rounded-lg border border-stone-200 bg-white p-4 sm:p-5" aria-labelledby="titulo-costo-libra">
      <h2 id="titulo-costo-libra" className="text-lg font-semibold text-gray-800">
        Cuánto nos cuesta producir una libra (500 g)
      </h2>

      {estado === "sin_tostion" ? (
        <p role="status" className="rounded-md bg-stone-50 px-3 py-2 text-sm text-gray-600">
          {aviso}
        </p>
      ) : (
        <>
          <dl className="divide-y divide-stone-100">
            <Fila
              etiqueta="Café"
              valor={moneda(costo.costoCafe === null ? null : Math.round(costo.costoCafe))}
              detalle={costo.mermaTostion === null ? undefined : `merma de tostión ${formatPct(costo.mermaTostion * 100)}`}
            />
            <Fila etiqueta="Bolsa y etiqueta" valor={moneda(bolsaYEtiqueta)} />
            <Fila etiqueta="Costo" valor={moneda(costo.costoLibra)} fuerte />
            <Fila etiqueta="Precio de venta" valor={moneda(costo.precioVenta)} />
            <Fila
              etiqueta="Margen"
              valor={costo.margen === null ? GUION : `${formatCOP(costo.margen)} (${formatPct(costo.margenPct)})`}
              fuerte
            />
          </dl>
          {aviso && (
            <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {aviso}
            </p>
          )}
        </>
      )}
      <p className="text-xs text-gray-500">{NOTA_COSTO_DIRECTO}</p>
    </section>
  );
}
