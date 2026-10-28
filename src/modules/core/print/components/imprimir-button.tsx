"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Abre el diálogo de impresión del navegador. No sale en el papel (`.no-print`). */
export function ImprimirButton({ etiqueta = "Imprimir" }: { etiqueta?: string }) {
  return (
    <Button type="button" onClick={() => window.print()} className="no-print">
      <Printer className="size-4" />
      {etiqueta}
    </Button>
  );
}
