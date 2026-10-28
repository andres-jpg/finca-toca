"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { anularLote } from "../actions/lotes.actions";

/** «Anular lote» con motivo obligatorio. Solo se muestra a `owner`/`admin` y a un lote sin procesos (cosmético). */
export function AnularLoteButton({ loteId, codigo }: { loteId: string; codigo: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    setEnviando(true);
    const r = await anularLote({ loteId, motivo });
    setEnviando(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success(`Lote ${codigo} anulado`);
    setAbierto(false);
    setMotivo("");
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setAbierto(true)} className="h-11 text-red-700 sm:h-9">
        <Ban className="mr-2 h-4 w-4" />
        Anular lote
      </Button>
      <Dialog open={abierto} onOpenChange={(o) => !enviando && setAbierto(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular el lote {codigo}</DialogTitle>
            <DialogDescription>
              El lote queda anulado y ya no se puede modificar. No se puede deshacer, y solo es posible mientras no tenga procesos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-anulacion">Motivo</Label>
            <Textarea id="motivo-anulacion" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={500} placeholder="Ej.: se registró dos veces por error" />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setAbierto(false)} disabled={enviando} className="h-11 sm:h-9">
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={confirmar} disabled={enviando || motivo.trim().length < 3} className="h-11 sm:h-9">
              {enviando ? "Anulando…" : "Anular lote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
