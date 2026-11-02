"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { rutaEntregar } from "../../remisiones/lib/estado";

/**
 * «Lote listo · ¿Entregar ahora?» (A-01): se ofrece al registrar el último servicio de un lote de terceros. Lo pinta la
 * PÁGINA del lote (con `?listo=1`), fuera del formulario de empaque: la revalidación del Server Action vuelve a pintar la
 * página con otra `key` y desmonta el formulario, así que un diálogo que viviera dentro nunca llegaría a verse.
 * No se cierra con Esc ni fuera: hay que elegir (botones de 44 px, sin hover).
 */
export function LoteListoDialog({ loteId }: { loteId: string }) {
  const router = useRouter();
  return (
    <Dialog open>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Lote listo · ¿Entregar ahora?</DialogTitle>
          <DialogDescription>
            Se registró el último servicio de este lote. Puedes entregarlo al cliente ahora o dejarlo en «Por entregar» para después.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:flex-row-reverse">
          <Button type="button" className="h-11" onClick={() => router.push(rutaEntregar(loteId))}>
            Entregar ahora
          </Button>
          <Button type="button" variant="outline" className="h-11" onClick={() => router.push("/dashboard/cafe/planta")}>
            Después
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
