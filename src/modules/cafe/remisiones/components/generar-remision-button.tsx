"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { generarRemision } from "../actions/remisiones.actions";
import { rutaTiquete } from "../lib/estado";

interface Props {
  loteId: string;
  loteCodigo: string;
  clienteNombre: string;
  /** `YYYY-MM-DD` de hoy en la zona del cliente (la calcula el servidor: el navegador puede estar en otra zona). */
  fechaHoy: string;
  /** `YYYY-MM-DD` de la recepción: la entrega no puede ser anterior. */
  fechaRecepcion: string;
  /** `forzar` = el lote tiene servicios pendientes (solo owner/admin): la observación es obligatoria. */
  modo: "normal" | "forzar";
  /** Servicios que faltan, en texto («tostión, molienda»), para el aviso del modo `forzar`. */
  pendientes?: string;
}

const CAMPO = "h-11 sm:h-9";

/**
 * «Generar remisión» con fecha de entrega, quién recibe y observaciones. Con servicios pendientes (`forzar`, solo
 * owner/admin) avisa de lo que falta y exige la observación. Al terminar ofrece imprimir. Esconderlo a quien no
 * puede es cosmético: la action y la RPC repiten módulo, rol y reglas.
 */
export function GenerarRemisionButton({ loteId, loteCodigo, clienteNombre, fechaHoy, fechaRecepcion, modo, pendientes }: Props) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(fechaHoy);
  const [recibidoPor, setRecibidoPor] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [enviando, setEnviando] = useState(false);
  const forzar = modo === "forzar";
  const faltaObservacion = forzar && observaciones.trim().length === 0;

  async function confirmar() {
    setEnviando(true);
    const r = await generarRemision({ loteId, fecha, recibidoPor, observaciones, forzar });
    setEnviando(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    const { id, numero } = r.data;
    toast.success(`Remisión ${numero} generada`, {
      action: { label: "Imprimir", onClick: () => window.open(rutaTiquete(id, 2), "_blank") },
    });
    setAbierto(false);
    router.refresh();
  }

  return (
    <>
      <Button type="button" onClick={() => setAbierto(true)} className="h-11 sm:h-9">
        <FileText className="mr-2 h-4 w-4" />
        Generar remisión
      </Button>
      <Dialog open={abierto} onOpenChange={(o) => !enviando && setAbierto(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generar la remisión del lote {loteCodigo}</DialogTitle>
            <DialogDescription>
              Entrega a {clienteNombre}. Es un documento de control interno (no es una factura): queda fijo con los kilos y la
              merma de hoy, y el lote pasa a «Entregado».
            </DialogDescription>
          </DialogHeader>

          {forzar && (
            <p role="alert" className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                El lote tiene servicios por completar{pendientes ? ` (${pendientes})` : ""}. Se entregará lo que hay y esos
                servicios saldrán como pendientes. Escribe por qué se entrega así.
              </span>
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rem-fecha">Fecha de entrega</Label>
              <Input
                id="rem-fecha"
                type="date"
                value={fecha}
                min={fechaRecepcion}
                max={fechaHoy}
                onChange={(e) => setFecha(e.target.value)}
                className={CAMPO}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rem-recibe">Recibe (opcional)</Label>
              <Input
                id="rem-recibe"
                value={recibidoPor}
                maxLength={120}
                onChange={(e) => setRecibidoPor(e.target.value)}
                placeholder="Nombre de quien recoge"
                className={CAMPO}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rem-obs">Observaciones{forzar ? "" : " (opcional)"}</Label>
            <Textarea
              id="rem-obs"
              value={observaciones}
              rows={3}
              maxLength={500}
              onChange={(e) => setObservaciones(e.target.value)}
              placeholder={forzar ? "Ej.: el cliente recoge hoy; la molienda queda para otra visita" : "Se imprime en el tiquete"}
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setAbierto(false)} disabled={enviando} className="h-11 sm:h-9">
              Cancelar
            </Button>
            <Button type="button" onClick={confirmar} disabled={enviando || !fecha || faltaObservacion} className="h-11 sm:h-9">
              {enviando ? "Generando…" : "Generar remisión"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
