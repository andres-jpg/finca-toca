import { cn } from "@/lib/utils";
import { formatCOP, formatPct } from "@/modules/core/formato/numeros";
import { DEFINICIONES } from "../lib/kpis";
import { kgTexto } from "../lib/formato";
import { describirPeriodo } from "../lib/periodo";
import { estadoProveedor } from "../lib/proveedores";
import { getProveedoresMarcaPropia, getRangoHumedad, getReferenciasPanel } from "../queries/panel.queries";
import { InfoDefinicion } from "./info-definicion";

const TH = "px-3 py-2 text-right font-semibold";
const AMBAR = "font-semibold text-amber-700";

/** «Proveedores de marca propia»: comprado (kg y $), precio/kg, humedad y merma de tostión con semáforo (gris en rango, ámbar fuera). */
export async function SeccionProveedores({ desde, hasta }: { desde: string; hasta: string }) {
  const [proveedores, refs, humedad] = await Promise.all([getProveedoresMarcaPropia(desde, hasta), getReferenciasPanel(), getRangoHumedad()]);

  return (
    <section className="space-y-3" aria-labelledby="proveedores-titulo">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 id="proveedores-titulo" className="text-lg font-semibold tracking-tight text-gray-800">
            Proveedores de marca propia
          </h2>
          <p className="text-sm text-gray-500">
            Lotes recibidos del {describirPeriodo(desde, hasta)}. Ámbar: humedad fuera de {humedad.min}–{humedad.max} %
            {refs.tostion !== null ? ` o merma fuera de ${formatPct(refs.tostion)} ± ${refs.toleranciaPts} pts` : ""}.
          </p>
        </div>
        <InfoDefinicion titulo={DEFINICIONES.proveedores.titulo} texto={DEFINICIONES.proveedores.texto} />
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
                  Comprado
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
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {proveedores.map((p) => {
                const e = estadoProveedor(p, humedad, refs.tostion, refs.toleranciaPts);
                return (
                  <tr key={p.terceroId ?? p.nombre}>
                    <th scope="row" className="px-3 py-2 text-left font-medium text-gray-800">
                      {p.nombre}
                      <span className="block text-xs font-normal text-gray-500">{p.lotes === 1 ? "1 lote" : `${p.lotes} lotes`}</span>
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {kgTexto(p.kg)}
                      <span className="block text-xs text-gray-500">{formatCOP(p.valorCompra)}</span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.precioKg === null ? "—" : formatCOP(p.precioKg)}</td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", e.humedad === "fuera" && AMBAR)} data-estado={e.humedad ?? "sin_dato"}>
                      {formatPct(p.humedadPct)}
                      {e.humedad === "fuera" && <span className="block text-xs font-normal">fuera de rango</span>}
                    </td>
                    <td className={cn("px-3 py-2 text-right tabular-nums", e.merma === "fuera" && AMBAR)} data-estado={e.merma ?? "sin_dato"}>
                      {formatPct(p.mermaTostionPct)}
                      {e.merma === "fuera" && <span className="block text-xs font-normal">fuera de rango</span>}
                    </td>
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
