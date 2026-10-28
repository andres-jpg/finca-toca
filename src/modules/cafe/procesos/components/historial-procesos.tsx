"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatearPesos } from "@/modules/core/tarifas/lib/formato";
import { ORDEN_PROCESO, etiquetaServicio, etiquetaTueste } from "../../lotes/lib/servicios";
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

/** `1, 2, 3` → «1 a 3»; `1, 3` → «1 y 3»; muchos → «1 a 8». */
function textoBultos(numeros: number[]): string {
  if (numeros.length === 0) return "—";
  const label = numeros.length === 1 ? "Bulto" : "Bultos";
  const consecutivos = numeros.every((n, i) => i === 0 || n === numeros[i - 1] + 1);
  if (numeros.length > 2 && consecutivos) return `${label} ${numeros[0]} a ${numeros.at(-1)}`;
  if (numeros.length === 2) return `${label} ${numeros[0]} y ${numeros[1]}`;
  return `${label} ${numeros.join(", ")}`;
}

/**
 * Procesos ya registrados del lote, en el orden en que se hicieron. Un proceso se puede anular (solo
 * owner/admin, con motivo) únicamente si ningún proceso posterior vigente usa alguno de sus bultos: se anula de
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
    p.lineasEmpaque.length === 0 &&
    !vigentes.some((o) => ORDEN_PROCESO[o.tipo] > ORDEN_PROCESO[p.tipo] && o.bultoIds.some((id) => p.bultoIds.includes(id)));

  async function confirmar() {
    if (!objetivo) return;
    setEnviando(true);
    const r = await anularProceso({ procesoId: objetivo.id, motivo });
    setEnviando(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success(`${etiquetaServicio(objetivo.tipo)} ${participioDe(objetivo.tipo, "anulad")}: los bultos quedaron libres para volver a registrar el paso`);
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
                  {fechaCorta(p.fecha, true)} · {p.anulado ? "anulado" : textoBultos(p.bultos)}
                </span>
              </p>
              <p className="text-sm tabular-nums text-gray-700">
                {formatearPeso(p.pesoEntradaKg)} kg → {formatearPeso(p.pesoSalidaKg)} kg · merma {formatearPorcentaje(p.mermaPct)} % (
                {formatearPeso(p.mermaKg)} kg)
                {mostrarValor && p.tarifaKg > 0 && <> · {formatearPesos(p.valor)}</>}
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-gray-600">
                {p.nivelTueste && <span className="rounded bg-gray-100 px-2 py-0.5">Tueste {etiquetaTueste(p.nivelTueste).toLowerCase()}</span>}
                {p.numBaches > 0 && <span className="rounded bg-gray-100 px-2 py-0.5">{p.numBaches} baches</span>}
                {p.desvio && !p.anulado && (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
                    <AlertTriangle className="h-3 w-3" aria-hidden /> Merma desviada
                  </span>
                )}
              </div>
              {p.lineasEmpaque.length > 0 && (
                <p className="text-sm text-gray-700">
                  {p.lineasEmpaque.map((l) => `${l.unidades} × ${l.producto}`).join(" · ")}
                  <span className="block text-xs text-gray-500">Mueve inventario: no se anula, se corrige con un ajuste.</span>
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
              El proceso se conserva en el historial como anulado y sus bultos quedan libres para registrarlo de nuevo.
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
