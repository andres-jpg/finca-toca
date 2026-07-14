import { Fragment } from "react";
import type {
  InformeData,
  InformeFilaSimple,
  InformeFilaItinerario,
  InformeTotales,
} from "@/lib/cooperativa/informe-data";

function cop(valor: number) {
  return `$${valor.toLocaleString("es-CO", { minimumFractionDigits: 0 })}`;
}

function FilaSimple({ fila }: { fila: InformeFilaSimple }) {
  return (
    <tr className="border-b border-stone-100 hover:bg-stone-50">
      <td className="sticky left-0 bg-white px-3 py-2 text-sm font-medium text-stone-800 whitespace-nowrap">
        {fila.nombre}
      </td>
      {fila.dias.map((v, i) => (
        <td key={i} className="px-2 py-2 text-sm text-stone-600 text-right tabular-nums">
          {v || ""}
        </td>
      ))}
      <td className="px-3 py-2 text-sm text-stone-600 text-right tabular-nums">{cop(fila.precioLitro)}</td>
      <td className="px-3 py-2 text-sm font-medium text-stone-700 text-right tabular-nums">{fila.totalLitros}</td>
      <td className="px-3 py-2 text-sm text-stone-700 text-right tabular-nums bg-teal-50/60">{cop(fila.precioBruto)}</td>
      <td className="px-3 py-2 text-sm text-stone-700 text-right tabular-nums bg-teal-50/60">{cop(fila.desFedegan)}</td>
      <td className="px-3 py-2 text-sm font-semibold text-stone-800 text-right tabular-nums bg-teal-50/60">
        {cop(fila.precioNeto)}
      </td>
    </tr>
  );
}

function FilaTotales({
  label,
  totales,
  incluyeRuta,
  variant = "total",
}: {
  label: string;
  totales: InformeTotales;
  incluyeRuta?: boolean;
  variant?: "total" | "subtotal" | "gran-total";
}) {
  const bg = variant === "gran-total" ? "bg-teal-900" : variant === "total" ? "bg-teal-800" : "bg-teal-100";
  const fg = variant === "subtotal" ? "text-teal-900" : "text-white";
  return (
    <tr className={`${bg} ${fg} font-semibold`}>
      <td className="sticky left-0 px-3 py-2 text-sm whitespace-nowrap" style={{ backgroundColor: "inherit" }}>
        {label}
      </td>
      {incluyeRuta && <td className="px-3 py-2 text-sm" />}
      {totales.dias.map((v, i) => (
        <td key={i} className="px-2 py-2 text-sm text-right tabular-nums">
          {v || ""}
        </td>
      ))}
      {/* Placeholder de la columna Precio/L, que no aplica a la fila de totales */}
      <td className="px-3 py-2 text-sm" />
      <td className="px-3 py-2 text-sm text-right tabular-nums">{totales.totalLitros}</td>
      <td className="px-3 py-2 text-sm text-right tabular-nums">{cop(totales.precioBruto)}</td>
      <td className="px-3 py-2 text-sm text-right tabular-nums">{cop(totales.desFedegan)}</td>
      <td className="px-3 py-2 text-sm text-right tabular-nums">{cop(totales.precioNeto)}</td>
    </tr>
  );
}

function HeaderRow({ dayLabels, incluyeRuta }: { dayLabels: (number | string)[]; incluyeRuta?: boolean }) {
  return (
    <tr className="bg-teal-600 text-white">
      <th className="sticky left-0 bg-teal-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-left whitespace-nowrap">
        Finca
      </th>
      {incluyeRuta && (
        <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-left whitespace-nowrap">Ruta</th>
      )}
      {dayLabels.map((d, i) => (
        <th key={i} className="px-2 py-2 text-xs font-semibold text-center whitespace-nowrap">
          {d}
        </th>
      ))}
      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-right whitespace-nowrap">Precio/L</th>
      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-right whitespace-nowrap">
        Total Litros
      </th>
      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-right whitespace-nowrap">
        Precio Bruto
      </th>
      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-right whitespace-nowrap">
        Des. Fedegan
      </th>
      <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-right whitespace-nowrap">
        Precio Neto
      </th>
    </tr>
  );
}

function FilaItinerario({ fila }: { fila: InformeFilaItinerario }) {
  return (
    <tr className="border-b border-stone-100 hover:bg-stone-50">
      <td className="sticky left-0 bg-white px-3 py-2 text-sm font-medium text-stone-800 whitespace-nowrap">
        {fila.nombre}
      </td>
      <td className="px-3 py-2 text-sm text-stone-600 whitespace-nowrap">{fila.rutaNombre ?? ""}</td>
      {fila.dias.map((v, i) => (
        <td key={i} className="px-2 py-2 text-sm text-stone-600 text-right tabular-nums">
          {v || ""}
        </td>
      ))}
      <td className="px-3 py-2 text-sm text-stone-600 text-right tabular-nums">{cop(fila.precioLitro)}</td>
      <td className="px-3 py-2 text-sm font-medium text-stone-700 text-right tabular-nums">{fila.totalLitros}</td>
      <td className="px-3 py-2 text-sm text-stone-700 text-right tabular-nums bg-teal-50/60">{cop(fila.precioBruto)}</td>
      <td className="px-3 py-2 text-sm text-stone-700 text-right tabular-nums bg-teal-50/60">{cop(fila.desFedegan)}</td>
      <td className="px-3 py-2 text-sm font-semibold text-stone-800 text-right tabular-nums bg-teal-50/60">
        {cop(fila.precioNeto)}
      </td>
    </tr>
  );
}

export function InformePreviewTable({ data }: { data: InformeData }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b border-stone-200 flex items-center justify-between">
        <p className="text-sm font-medium text-stone-700">{data.periodoLabel}</p>
        {data.kind === "itinerario" && (
          <p className="text-xs text-stone-500">
            {data.itinerarioNombre} · Conductor: {data.conductorName ?? "sin asignar"}
          </p>
        )}
      </div>

      <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
        {(data.kind === "finca" || data.kind === "ruta") && (
          <table className="min-w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <HeaderRow dayLabels={data.dayLabels} />
            </thead>
            <tbody>
              {data.filas.length === 0 ? (
                <tr>
                  <td colSpan={data.dayLabels.length + 6} className="px-3 py-6 text-center text-sm text-stone-400 italic">
                    Sin recolecciones en el período seleccionado
                  </td>
                </tr>
              ) : (
                data.filas.map((fila) => <FilaSimple key={fila.fincaId} fila={fila} />)
              )}
            </tbody>
            {data.filas.length > 0 && (
              <tfoot>
                <FilaTotales label="TOTAL" totales={data.totales} />
              </tfoot>
            )}
          </table>
        )}

        {data.kind === "itinerario" && (
          <table className="min-w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <HeaderRow dayLabels={data.dayLabels} incluyeRuta />
            </thead>
            <tbody>
              {data.filas.length === 0 ? (
                <tr>
                  <td colSpan={data.dayLabels.length + 7} className="px-3 py-6 text-center text-sm text-stone-400 italic">
                    Sin recolecciones en el período seleccionado
                  </td>
                </tr>
              ) : (
                data.filas.map((fila) => <FilaItinerario key={fila.fincaId} fila={fila} />)
              )}
            </tbody>
            {data.filas.length > 0 && (
              <tfoot>
                <FilaTotales label="TOTAL" totales={data.totales} incluyeRuta />
              </tfoot>
            )}
          </table>
        )}

        {data.kind === "general" && (
          <table className="min-w-full border-collapse">
            <thead className="sticky top-0 z-10">
              <HeaderRow dayLabels={data.dayLabels} />
            </thead>
            <tbody>
              {data.rutas.length === 0 ? (
                <tr>
                  <td colSpan={data.dayLabels.length + 6} className="px-3 py-6 text-center text-sm text-stone-400 italic">
                    Sin recolecciones en el período seleccionado
                  </td>
                </tr>
              ) : (
                data.rutas.map((ruta) => (
                  <Fragment key={ruta.id}>
                    <tr className="bg-blue-900 text-white">
                      <td
                        colSpan={data.dayLabels.length + 6}
                        className="sticky left-0 px-3 py-2 text-sm font-semibold whitespace-nowrap"
                      >
                        RUTA: {ruta.nombre}
                      </td>
                    </tr>
                    {ruta.filas.map((fila) => (
                      <FilaSimple key={fila.fincaId} fila={fila} />
                    ))}
                    <FilaTotales label={`Subtotal ${ruta.nombre}`} totales={ruta.subtotales} variant="subtotal" />
                  </Fragment>
                ))
              )}
            </tbody>
            {data.rutas.length > 0 && (
              <tfoot>
                <FilaTotales label="TOTAL GENERAL" totales={data.granTotales} variant="gran-total" />
              </tfoot>
            )}
          </table>
        )}
      </div>
    </div>
  );
}
