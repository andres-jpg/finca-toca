"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { anularVenta } from "../actions/ventas.actions";

/**
 * «Anular» con motivo obligatorio. Solo se muestra a `owner`/`admin` y a una venta vigente (cosmético: la action, la RPC
 * y el trigger de `cafe.ventas` lo exigen). Anulada, el inventario se repone con movimientos de devolución y el número
 * no se reutiliza.
 */
export function AnularVentaButton({ ventaId, numero, tipo }: { ventaId: string; numero: string; tipo: "venta" | "cortesia" }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const nombre = tipo === "cortesia" ? "cortesía" : "venta";

  async function confirmar() {
    setEnviando(true);
    const r = await anularVenta({ ventaId, motivo });
    setEnviando(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success(`${nombre === "venta" ? "Venta" : "Cortesía"} ${numero} anulada: el inventario se repuso`);
    setAbierto(false);
    setMotivo("");
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setAbierto(true)} className="h-11 text-red-700 sm:h-9">
        <Ban className="mr-2 h-4 w-4" />
        Anular {nombre}
      </Button>
      <Dialog open={abierto} onOpenChange={(o) => !enviando && setAbierto(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular la {nombre} {numero}</DialogTitle>
            <DialogDescription>
              Queda anulada (se conserva en el historial y su número no se reutiliza) y las unidades vuelven al inventario del producto
              terminado. No se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="venta-motivo">Motivo</Label>
            <Textarea
              id="venta-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ej.: el cliente devolvió el café"
              className="text-base"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setAbierto(false)} disabled={enviando} className="h-11 sm:h-9">
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={confirmar} disabled={enviando || motivo.trim().length < 3} className="h-11 sm:h-9">
              {enviando ? "Anulando…" : `Anular ${nombre}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
