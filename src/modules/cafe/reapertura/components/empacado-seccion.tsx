import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { enteroConMiles } from "../../empaque/lib/empaque";
import { fechaCorta, formatearKg3 } from "../../lotes/lib/formato";
import { ETIQUETA_ESTADO_REAPERTURA, textoReapertura } from "../lib/reapertura";
import type { ProcesoDeReapertura, ReaperturaVista, SaldoPresentacion } from "../types";
import { ReabrirButton } from "./reabrir-button";

const COLOR_ESTADO: Record<ReaperturaVista["estado"], string> = {
  pendiente: "bg-amber-100 text-amber-800 hover:bg-amber-100",
  en_proceso: "bg-sky-100 text-sky-800 hover:bg-sky-100",
  completada: "bg-teal-100 text-teal-800 hover:bg-teal-100",
};

interface Props {
  loteId: string;
  loteCodigo: string;
  saldos: SaldoPresentacion[];
  reaperturas: ReaperturaVista[];
  procesos: ProcesoDeReapertura[];
  /** Quien opera (no `viewer`) y con `cafe.procesos` activo: ve «Reabrir» y el enlace a Planta. Cosmético: la RPC lo exige. */
  puedeOperar: boolean;
  loteAnulado: boolean;
  fechaHoy: string;
  fechaRecepcion: string;
}

/**
 * Sección «Empacado» de la ficha de un lote de MARCA PROPIA (HU-F1-16): unidades empacadas por presentación, las ya
 * reabiertas y el saldo reabrible, con el botón «Reabrir». Debajo, las reaperturas del lote con su estado y los procesos
 * que cuelgan de ellas (la molienda y el empaque del café reabierto), para que el origen no se pierda.
 *
 * El producto terminado se lleva por tipo × presentación, no por lote: por eso el saldo es lo empacado de ESTE lote menos
 * lo ya reabierto de él, y además tiene que haber stock en el inventario (no se reabre lo que ya se vendió).
 */
export function EmpacadoSeccion({ loteId, loteCodigo, saldos, reaperturas, procesos, puedeOperar, loteAnulado, fechaHoy, fechaRecepcion }: Props) {
  if (saldos.length === 0 && reaperturas.length === 0) return null;
  const procesosDe = (id: string) => procesos.filter((p) => p.reaperturaId === id);

  return (
    <section className="space-y-3" aria-labelledby="titulo-empacado">
      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <h2 id="titulo-empacado" className="text-lg font-semibold text-gray-800">
          Empacado
        </h2>
        {puedeOperar && !loteAnulado && saldos.some((s) => s.saldo > 0) && (
          <ReabrirButton loteId={loteId} loteCodigo={loteCodigo} saldos={saldos} fechaHoy={fechaHoy} fechaRecepcion={fechaRecepcion} />
        )}
      </div>

      {saldos.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-3 py-2 font-medium">Presentación</th>
                <th className="px-3 py-2 text-right font-medium">Empacadas</th>
                <th className="px-3 py-2 text-right font-medium">Reabiertas</th>
                <th className="px-3 py-2 text-right font-medium">Saldo reabrible</th>
                <th className="px-3 py-2 text-right font-medium">En inventario</th>
              </tr>
            </thead>
            <tbody>
              {saldos.map((s) => (
                <tr key={s.presentacionG} className="border-t border-gray-100 tabular-nums">
                  <td className="px-3 py-2 font-medium text-gray-900">{s.producto}</td>
                  <td className="px-3 py-2 text-right">{enteroConMiles(s.empacadas)}</td>
                  <td className="px-3 py-2 text-right">{enteroConMiles(s.reabiertas)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{enteroConMiles(s.saldo)}</td>
                  <td className={cn("px-3 py-2 text-right", s.stockGlobal < 0 ? "text-red-600" : "text-gray-700")}>{enteroConMiles(s.stockGlobal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-500">
        El producto terminado se lleva por tipo y presentación, no por lote: el saldo reabrible es lo empacado de este lote menos lo ya
        reabierto, y solo se puede reabrir lo que aún está en el inventario (lo vendido no vuelve).
      </p>

      {reaperturas.length > 0 && (
        <ul className="space-y-2" aria-label="Reaperturas del lote">
          {reaperturas.map((r) => {
            const hijos = procesosDe(r.id);
            return (
              <li key={r.id} className="space-y-1.5 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">
                    Reapertura del <span className="tabular-nums">{fechaCorta(r.fecha)}</span>: {textoReapertura(r.unidades, r.producto, r.pesoKg)}
                  </span>
                  <Badge className={COLOR_ESTADO[r.estado]}>{ETIQUETA_ESTADO_REAPERTURA[r.estado]}</Badge>
                  {puedeOperar && r.estado !== "completada" && !loteAnulado && (
                    <Link
                      href={`/dashboard/cafe/planta/reapertura/${r.id}`}
                      className="inline-flex min-h-11 items-center text-sm font-medium text-amber-900 underline underline-offset-2 sm:min-h-0"
                    >
                      Ir a planta
                    </Link>
                  )}
                </div>
                {r.motivo && <p className="text-xs italic text-gray-600">{r.motivo}</p>}
                {hijos.length > 0 && (
                  <ul className="space-y-0.5 text-sm text-gray-700">
                    {hijos.map((p) => (
                      <li key={p.id} className={cn("tabular-nums", p.anulado && "line-through opacity-70")}>
                        {p.tipo === "molienda" ? "Molienda" : "Empaque"} del {fechaCorta(p.fecha)}: {formatearKg3(p.pesoEntradaKg)} → {formatearKg3(p.pesoSalidaKg)} kg
                        <span className="text-gray-500"> · merma {formatearKg3(p.mermaKg)} kg</span>
                        {p.lineasEmpaque.length > 0 && (
                          <span className="font-medium"> · {p.lineasEmpaque.map((l) => `${enteroConMiles(l.unidades)} × ${l.producto}`).join(" · ")}</span>
                        )}
                        {p.anulado && <span className="no-underline"> (anulado)</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
