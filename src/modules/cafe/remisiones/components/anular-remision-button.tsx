"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { anularRemision } from "../actions/remisiones.actions";

/**
 * «Anular remisión» con motivo obligatorio. Solo se muestra a `owner`/`admin` y a una remisión vigente (cosmético: la
 * action y la RPC lo exigen). Anulada, el lote vuelve a su estado derivado y se puede generar otra; el número no se reutiliza.
 */
export function AnularRemisionButton({ remisionId, numero }: { remisionId: string; numero: string }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function confirmar() {
    setEnviando(true);
    const r = await anularRemision({ remisionId, motivo });
    setEnviando(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success(`Remisión ${numero} anulada`);
    setAbierto(false);
    setMotivo("");
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setAbierto(true)} className="h-11 text-red-700 sm:h-9">
        <Ban className="mr-2 h-4 w-4" />
        Anular remisión
      </Button>
      <Dialog open={abierto} onOpenChange={(o) => !enviando && setAbierto(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anular la remisión {numero}</DialogTitle>
            <DialogDescription>
              La remisión queda anulada (se conserva en el historial y su número no se reutiliza). El lote deja de estar
              «Entregado» y se podrá generar otra remisión.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="rem-motivo">Motivo</Label>
            <Textarea
              id="rem-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Ej.: el cliente aún no recogió el café"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setAbierto(false)} disabled={enviando} className="h-11 sm:h-9">
              Cancelar
            </Button>
            <Button type="button" variant="destructive" onClick={confirmar} disabled={enviando || motivo.trim().length < 3} className="h-11 sm:h-9">
              {enviando ? "Anulando…" : "Anular remisión"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
