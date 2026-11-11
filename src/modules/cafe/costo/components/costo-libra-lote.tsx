import { etiquetaPresentacion } from "../../tipos/lib/productos";
import { formatCOP, formatPct } from "@/modules/core/formato/numeros";
import { estadoCosto, mensajeSinCosto, NOTA_COSTO_DIRECTO, type CostoLibra } from "../lib/costo-libra";

const GUION = "—";
const moneda = (v: number | null) => (v === null ? GUION : formatCOP(Math.round(v)));

/**
 * «Costo de producir una libra» por presentación (B-13): una columna por presentación (500 g, 2.500 g…) y las filas Café por
 * libra · Empaque por libra · Costo por libra · Precio por libra · Margen por libra. Solo presenta lo que calculó
 * `cafe.costo_libra_lote`; si falta un dato muestra el motivo en vez de un número inventado.
 */
export function CostoLibraLote({ costos }: { costos: CostoLibra[] }) {
  const aplican = costos.filter((c) => estadoCosto(c) !== "no_aplica");
  if (aplican.length === 0) return null;

  const avisos = [...new Set(aplican.flatMap((c) => (estadoCosto(c) === "sin_tostion" ? [] : [mensajeSinCosto(estadoCosto(c))])).filter((m): m is string => m !== null))];
  const sinTostion = aplican.every((c) => estadoCosto(c) === "sin_tostion");
  const mermaAcumulada = aplican[0].mermaTostion;

  const filas: { etiqueta: string; fuerte?: boolean; valor: (c: CostoLibra) => string }[] = [
    { etiqueta: "Café por libra", valor: (c) => moneda(c.costoCafe) },
    { etiqueta: "Empaque por libra", valor: (c) => moneda(c.costoEmpaque) },
    { etiqueta: "Costo por libra", fuerte: true, valor: (c) => moneda(c.costoLibra) },
    { etiqueta: "Precio por libra", valor: (c) => moneda(c.precioVenta) },
    { etiqueta: "Margen por libra", fuerte: true, valor: (c) => (c.margen === null ? GUION : `${formatCOP(c.margen)} (${formatPct(c.margenPct)})`) },
  ];

  return (
    <section className="space-y-2 rounded-lg border border-stone-200 bg-white p-4 sm:p-5" aria-labelledby="titulo-costo-libra">
      <h2 id="titulo-costo-libra" className="text-lg font-semibold text-gray-800">
        Costo de producir una libra
      </h2>
      {mermaAcumulada !== null && <p className="text-xs text-gray-500">Con la merma de tostión acumulada del lote: {formatPct(mermaAcumulada * 100)}.</p>}

      {sinTostion ? (
        <p role="status" className="rounded-md bg-stone-50 px-3 py-2 text-sm text-gray-600">
          {mensajeSinCosto("sin_tostion")}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    &nbsp;
                  </th>
                  {aplican.map((c) => (
                    <th key={c.gramos} scope="col" className="px-3 py-2 text-right font-semibold">
                      {etiquetaPresentacion(c.gramos)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filas.map((f) => (
                  <tr key={f.etiqueta}>
                    <th scope="row" className={f.fuerte ? "py-2 pr-3 text-left font-semibold text-gray-800" : "py-2 pr-3 text-left font-normal text-gray-600"}>
                      {f.etiqueta}
                    </th>
                    {aplican.map((c) => (
                      <td key={c.gramos} className={`px-3 py-2 text-right tabular-nums ${f.fuerte ? "font-semibold text-gray-900" : "text-gray-800"}`}>
                        {f.valor(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {avisos.map((aviso) => (
            <p key={aviso} role="status" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {aviso}
            </p>
          ))}
        </>
      )}
      <p className="text-xs text-gray-500">{NOTA_COSTO_DIRECTO}</p>
    </section>
  );
}
