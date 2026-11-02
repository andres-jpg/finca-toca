import { cn } from "@/lib/utils";
import { formatCOP, formatKg, formatPct } from "@/modules/core/formato/numeros";
import { getProveedoresMarcaPropia, getReferenciasPanel } from "../queries/panel.queries";
import { describirPeriodo } from "../lib/periodo";
import { esDesvio } from "../../procesos/lib/merma";
import { InfoDefinicion } from "./info-definicion";

const DEFINICION =
  "Por proveedor, de los lotes de marca propia recibidos en el periodo (sin anulados): precio por kg promedio ponderado por kg, humedad promedio ponderada de los lotes con humedad medida, merma de tostión ponderada (kg de merma ÷ kg de entrada de sus tostiones) y costo por kg tostado = precio por kg ÷ (1 − merma de tostión). Sin tostión no hay merma ni costo por kg tostado: no se inventa. No incluye bolsa, etiqueta, energía ni mano de obra.";

const TH = "px-3 py-2 text-right font-semibold";

/** Tabla «Proveedores de marca propia» (A-19). Con la línea de servicios no se pinta: el café de terceros no tiene proveedor. */
export async function SeccionProveedores({ desde, hasta }: { desde: string; hasta: string }) {
  const [proveedores, refs] = await Promise.all([getProveedoresMarcaPropia(desde, hasta), getReferenciasPanel()]);

  return (
    <section className="space-y-3" aria-labelledby="proveedores-titulo">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="proveedores-titulo" className="text-lg font-semibold tracking-tight text-gray-800">
            Proveedores de marca propia
          </h2>
          <p className="text-sm text-gray-500">Lotes recibidos del {describirPeriodo(desde, hasta)}.</p>
        </div>
        <InfoDefinicion titulo="Proveedores de marca propia" texto={DEFINICION} />
      </div>
      {proveedores.length === 0 ? (
        <p role="status" className="rounded-md border border-stone-200 bg-white px-3 py-3 text-sm text-gray-600">
          No se recibió café de marca propia en este periodo.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th scope="col" className="px-3 py-2 font-semibold">
                  Proveedor
                </th>
                <th scope="col" className={TH}>
                  Recibido
                </th>
                <th scope="col" className={TH}>
                  Precio / kg
                </th>
                <th scope="col" className={TH}>
                  Humedad
                </th>
                <th scope="col" className={TH}>
                  Merma tostión
                </th>
                <th scope="col" className={TH}>
                  Costo / kg tostado
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {proveedores.map((p) => {
                const fuera = p.mermaTostionPct !== null && esDesvio(p.mermaTostionPct, refs.tostion, refs.toleranciaPts);
                return (
                  <tr key={p.terceroId ?? p.nombre}>
                    <th scope="row" className="px-3 py-2 text-left font-medium text-gray-800">
                      {p.nombre}
                      <span className="block text-xs font-normal text-gray-500">{p.lotes === 1 ? "1 lote" : `${p.lotes} lotes`}</span>
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums">{formatKg(p.kg)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.precioKg === null ? "—" : formatCOP(p.precioKg)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatPct(p.humedadPct)}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", fuera && "font-semibold text-amber-700")}>
                      {formatPct(p.mermaTostionPct)}
                      {fuera && <span className="block text-xs font-normal">fuera de la referencia</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{p.costoKgTostado === null ? "—" : formatCOP(p.costoKgTostado)}</td>
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
