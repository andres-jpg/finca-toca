"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { MermaBadge } from "../../components/merma-badge";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatCOP, formatKg } from "@/modules/core/formato/numeros";
import { ETIQUETA_DESTINO } from "../../empaque/lib/empaque";
import { etiquetaServicio, etiquetaTueste } from "../../lotes/lib/servicios";
import { anularProceso } from "../actions/procesos.actions";
import { fechaCorta, formatearPeso, formatearPorcentaje } from "../lib/numero";
import { participioDe } from "../lib/resumen";
import type { ProcesoHistorial } from "../types-planta";

interface HistorialProcesosProps {
  procesos: ProcesoHistorial[];
  /** owner/admin: ven «Anular». Esconderlo es cosmético: la acción y la RPC lo vuelven a exigir. */
  puedeAnular: boolean;
  /** Los procesos de un servicio de maquila llevan valor; los de marca propia no se cobran. */
  mostrarValor: boolean;
}

/**
 * Procesos ya registrados del lote, en el orden en que se hicieron. Un proceso se puede anular (solo
 * owner/admin, con motivo) únicamente si ningún proceso posterior vigente parte de él (su tanda): se anula de
 * atrás hacia delante. Los anulados se quedan a la vista, tachados y con su motivo (auditoría).
 */
export function HistorialProcesos({ procesos, puedeAnular, mostrarValor }: HistorialProcesosProps) {
  const router = useRouter();
  const [objetivo, setObjetivo] = useState<ProcesoHistorial | null>(null);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  const vigentes = procesos.filter((p) => !p.anulado);
  // Un empaque con líneas movió inventario (bolsas, etiquetas, producto terminado): no se anula, se corrige con un ajuste.
  const sePuedeAnular = (p: ProcesoHistorial) =>
    puedeAnular &&
    !p.anulado &&
    !p.lineasEmpaque.some((l) => l.mueveInventario) &&
    !vigentes.some((o) => o.origenProcesoId === p.id);

  async function confirmar() {
    if (!objetivo) return;
    setEnviando(true);
    const r = await anularProceso({ procesoId: objetivo.id, motivo });
    setEnviando(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success(`${etiquetaServicio(objetivo.tipo)} ${participioDe(objetivo.tipo, "anulad")}: los kilos quedaron libres para volver a registrar el paso`);
    setObjetivo(null);
    setMotivo("");
    router.refresh();
  }

  if (procesos.length === 0) {
    return (
      <section aria-labelledby="hist-titulo" className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 id="hist-titulo" className="text-base font-semibold text-gray-800">
          Procesos registrados
        </h2>
        <p className="mt-2 text-sm text-gray-500">Este lote aún no tiene procesos.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="hist-titulo" className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <h2 id="hist-titulo" className="text-base font-semibold text-gray-800">
        Procesos registrados
      </h2>

      <ul className="divide-y divide-gray-100">
        {procesos.map((p) => (
          <li key={p.id} className={cn("flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between", p.anulado && "opacity-70")}>
            <div className="min-w-0 space-y-1">
              <p className={cn("text-base font-semibold text-gray-900", p.anulado && "line-through")}>
                {etiquetaServicio(p.tipo)}
                <span className="ml-2 text-sm font-normal text-gray-500">
                  {fechaCorta(p.fecha, true)}{p.anulado ? " · anulado" : ""}
                </span>
              </p>
              {p.tipo === "empaque" ? (
                // El empaque no tiene merma (B-08): la báscula incluye el sobrante; la merma de tostión es de la tanda.
                <p className="text-sm tabular-nums text-gray-700">
                  Báscula {formatKg(p.pesoEntradaKg)} · en bolsas {formatKg(p.pesoSalidaKg ?? 0)}
                  {p.diferenciaKg !== null && p.diferenciaKg > 0 && (
                    <>
                      {" "}
                      · sobrante {formatKg(p.diferenciaKg)}
                      {p.diferenciaDestino ? ` (${ETIQUETA_DESTINO[p.diferenciaDestino].toLowerCase()})` : ""}
                    </>
                  )}
                </p>
              ) : (
                <p className="text-sm tabular-nums text-gray-700">
                  {p.tipo === "tostion" && p.pesoSalidaKg === null
                    ? `${formatearPeso(p.pesoEntradaKg)} kg a tostar · peso final al empacar`
                    : p.pesoSalidaKg === null
                      ? `${formatearPeso(p.pesoEntradaKg)} kg`
                      : `${formatearPeso(p.pesoEntradaKg)} kg → ${formatearPeso(p.pesoSalidaKg)} kg`}
                  {p.mermaPct !== null && p.mermaKg !== null && (
                    <>
                      {" "}
                      · merma {formatearPorcentaje(p.mermaPct)} % ({formatearPeso(p.mermaKg)} kg)
                    </>
                  )}
                  {mostrarValor && p.tarifaKg > 0 && <> · {formatCOP(p.valor)}</>}
                </p>
              )}
              <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                {p.nivelTueste && <span className="rounded bg-gray-100 px-2 py-0.5">Tueste {etiquetaTueste(p.nivelTueste).toLowerCase()}</span>}
                {p.numBaches > 0 && <span className="rounded bg-gray-100 px-2 py-0.5">{p.numBaches} baches</span>}
                {!p.anulado && p.mermaPct !== null && (
                  <MermaBadge mermaPct={p.mermaPct} referenciaPct={p.mermaReferenciaPct} toleranciaPts={p.toleranciaPts} tipo={p.tipo} />
                )}
              </div>
              {p.lineasEmpaque.length > 0 && (
                <p className="text-sm text-gray-700">
                  {p.lineasEmpaque.map((l) => `${l.unidades} × ${l.producto}${l.bolsaCliente ? " (bolsa del cliente)" : ""}`).join(" · ")}
                  {p.lineasEmpaque.some((l) => l.mueveInventario) && (
                    <span className="block text-xs text-gray-500">Mueve inventario: no se anula, se corrige con un ajuste.</span>
                  )}
                </p>
              )}
              {p.observaciones && <p className="text-xs text-gray-500">{p.observaciones}</p>}
              {p.anulado && p.motivoAnulacion && <p className="text-xs text-gray-600">Motivo de la anulación: {p.motivoAnulacion}</p>}
            </div>

            {sePuedeAnular(p) && (
              <Button type="button" variant="outline" className="h-11 shrink-0" onClick={() => setObjetivo(p)}>
                Anular proceso
              </Button>
            )}
          </li>
        ))}
      </ul>

      <Dialog
        open={objetivo !== null}
        onOpenChange={(abierto) => {
          if (!abierto && !enviando) {
            setObjetivo(null);
            setMotivo("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular {objetivo ? etiquetaServicio(objetivo.tipo).toLowerCase() : "proceso"}</DialogTitle>
            <DialogDescription>
              El proceso se conserva en el historial como anulado y sus kilos quedan libres para registrarlo de nuevo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="anular-motivo">Motivo (obligatorio)</Label>
            <Textarea
              id="anular-motivo"
              rows={3}
              className="text-base"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: error de pesaje en la báscula"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={() => setObjetivo(null)} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="button" className="h-11" onClick={confirmar} disabled={enviando || motivo.trim() === ""}>
              {enviando ? "Anulando…" : "Anular proceso"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
