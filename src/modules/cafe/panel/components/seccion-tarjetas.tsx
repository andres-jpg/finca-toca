import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatearCOP } from "../../compras/lib/compra";
import { formatearKg3 } from "../../lotes/lib/formato";
import { etiquetaServicio } from "../../lotes/lib/servicios";
import { DEFINICIONES } from "../lib/kpis";
import { cuentaLotes, cuentaProcesos, enteroTexto, kgTexto, mermaTexto } from "../lib/formato";
import { etiquetaLinea } from "../lib/periodo";
import { getKpisPanel } from "../queries/panel.queries";
import type { LineaPanel } from "../types";
import { Cifra, Detalle, TarjetaKpi } from "./tarjeta-kpi";

interface Props {
  desde: string;
  hasta: string;
  linea: LineaPanel | null;
}

/**
 * Fila 1 del panel: café recibido, merma promedio por proceso, ingreso de marca propia, ingreso de servicios y procesos con
 * desvío. Las tarjetas que no aplican a la línea elegida (el ingreso de servicios con «Marca propia», por ejemplo) no se
 * pintan: nunca se muestra un cero que parezca un dato. Las cifras vienen de una sola llamada a `cafe.kpis_periodo`.
 */
export async function SeccionTarjetas({ desde, hasta, linea }: Props) {
  const k = await getKpisPanel(desde, hasta, linea);
  const totalProcesos = k.mermas.reduce((s, m) => s + m.procesos, 0);

  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(15.5rem,1fr))] gap-3">
      <TarjetaKpi titulo={DEFINICIONES.recibido.titulo} definicion={DEFINICIONES.recibido.texto}>
        <ul className="space-y-2">
          {k.recibido.map((r) => (
            <li key={r.linea} className="flex items-baseline justify-between gap-3">
              <span className="text-sm text-gray-600">{etiquetaLinea(r.linea)}</span>
              <span className="text-right">
                <span className="text-xl font-semibold tabular-nums text-gray-900">{kgTexto(r.kg)}</span>
                <span className="block text-xs text-gray-500">{cuentaLotes(r.lotes)}</span>
              </span>
            </li>
          ))}
        </ul>
        {linea === null && <Detalle>Cada línea por separado: nunca se suma café propio con el de clientes.</Detalle>}
      </TarjetaKpi>

      <TarjetaKpi titulo={DEFINICIONES.merma.titulo} definicion={DEFINICIONES.merma.texto}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-gray-500">
            <tr>
              <th scope="col" className="pb-1 font-medium">
                Proceso
              </th>
              <th scope="col" className="pb-1 text-right font-medium">
                Entrada
              </th>
              <th scope="col" className="pb-1 text-right font-medium">
                Merma
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {k.mermas.map((m) => (
              <tr key={m.tipo} className={cn(m.procesos === 0 && "text-gray-400")}>
                <th scope="row" className="py-1 text-left font-normal">
                  {etiquetaServicio(m.tipo)}
                </th>
                <td className="py-1 text-right tabular-nums">{m.procesos > 0 ? `${formatearKg3(m.kgEntrada)} kg` : "—"}</td>
                <td className="py-1 text-right font-semibold tabular-nums">
                  <span className="inline-flex items-center justify-end gap-1">
                    {m.desvios > 0 && <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-label={`${m.desvios} con desvío`} />}
                    {mermaTexto(m)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Detalle>Ponderada por peso: kg de merma ÷ kg de entrada.</Detalle>
      </TarjetaKpi>

      {k.ingresoMarcaPropia && (
        <TarjetaKpi titulo={DEFINICIONES.ingresoMarcaPropia.titulo} definicion={DEFINICIONES.ingresoMarcaPropia.texto}>
          <Cifra>{formatearCOP(k.ingresoMarcaPropia.total)}</Cifra>
          <Detalle>{k.ingresoMarcaPropia.ventas === 1 ? "1 venta" : `${enteroTexto(k.ingresoMarcaPropia.ventas)} ventas`}</Detalle>
          <Detalle>
            Cortesías: {enteroTexto(k.ingresoMarcaPropia.unidadesCortesia)} {k.ingresoMarcaPropia.unidadesCortesia === 1 ? "unidad" : "unidades"} · sin valor, no suman
          </Detalle>
        </TarjetaKpi>
      )}

      {k.ingresoServicios && (
        <TarjetaKpi titulo={DEFINICIONES.ingresoServicios.titulo} definicion={DEFINICIONES.ingresoServicios.texto}>
          <Cifra>{formatearCOP(k.ingresoServicios.total)}</Cifra>
          <ul className="space-y-0.5">
            {k.ingresoServicios.porLinea.map((l) => (
              <li key={l.linea} className="flex justify-between text-xs text-gray-500">
                <span>{etiquetaLinea(l.linea)}</span>
                <span className="tabular-nums">{formatearCOP(l.valor)}</span>
              </li>
            ))}
          </ul>
          <Detalle>Valor con la tarifa de la fecha de cada proceso.</Detalle>
        </TarjetaKpi>
      )}

      <TarjetaKpi titulo={DEFINICIONES.desvios.titulo} definicion={DEFINICIONES.desvios.texto} destacar={k.desvios > 0}>
        <Cifra className={k.desvios > 0 ? "text-amber-700" : undefined}>{enteroTexto(k.desvios)}</Cifra>
        <Detalle>{totalProcesos === 0 ? "Sin procesos en el periodo" : `de ${cuentaProcesos(totalProcesos)}`}</Detalle>
      </TarjetaKpi>
    </div>
  );
}
