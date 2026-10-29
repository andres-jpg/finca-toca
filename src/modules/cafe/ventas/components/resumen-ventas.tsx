import { formatearCOP } from "@/modules/cafe/compras/lib/compra";
import { enteroConMiles } from "@/modules/cafe/empaque/lib/empaque";
import type { ResumenVentas } from "../types";

/**
 * Totales del periodo filtrado. «Total vendido» suma SOLO ventas vigentes: las cortesías valen $0 (se cuentan aparte, en
 * unidades) y las anuladas no suman. Las cifras son las de `cafe.resumen_ventas`, con los mismos filtros del listado.
 */
export function ResumenVentasCards({ resumen }: { resumen: ResumenVentas }) {
  const tarjetas = [
    { titulo: "Total vendido", valor: formatearCOP(resumen.totalVentas), detalle: resumen.nVentas === 1 ? "1 venta" : `${enteroConMiles(resumen.nVentas)} ventas` },
    {
      titulo: "Cortesías",
      valor: enteroConMiles(resumen.unidadesCortesia),
      detalle: `${resumen.unidadesCortesia === 1 ? "unidad" : "unidades"} en ${resumen.nCortesias === 1 ? "1 cortesía" : `${enteroConMiles(resumen.nCortesias)} cortesías`} · sin valor`,
    },
    {
      titulo: "Facturas pendientes",
      valor: enteroConMiles(resumen.nFacturaPendiente),
      detalle: "requieren factura y falta el número de Aliados",
      destacar: resumen.nFacturaPendiente > 0,
    },
    { titulo: "Anuladas", valor: enteroConMiles(resumen.nAnuladas), detalle: "no suman al total" },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tarjetas.map((t) => (
        <div key={t.titulo} className="rounded-lg border border-stone-200 bg-white p-3 sm:p-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">{t.titulo}</dt>
          <dd className={`mt-1 text-xl font-semibold tabular-nums sm:text-2xl ${t.destacar ? "text-amber-700" : "text-gray-900"}`}>{t.valor}</dd>
          <dd className="mt-0.5 text-xs text-gray-500">{t.detalle}</dd>
        </div>
      ))}
    </dl>
  );
}
