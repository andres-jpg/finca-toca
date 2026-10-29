"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completarFacturaVenta } from "../actions/ventas.actions";

/**
 * Completa (o corrige) el número de la factura emitida en Aliados de una venta que la requiere. Es lo único que se
 * edita de una venta ya guardada. Esta app no emite facturas: solo guarda el número.
 */
export function CompletarFacturaForm({ ventaId, numeroActual }: { ventaId: string; numeroActual: string | null }) {
  const router = useRouter();
  const [numero, setNumero] = useState(numeroActual ?? "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEnviando(true);
    const r = await completarFacturaVenta({ ventaId, numeroFactura: numero });
    setEnviando(false);
    if (!r.ok) {
      setError(r.message);
      toast.error(r.message);
      return;
    }
    toast.success("Número de factura guardado");
    router.refresh();
  }

  return (
    <form onSubmit={guardar} noValidate className="space-y-2">
      <Label htmlFor="factura-numero">{numeroActual ? "Corregir el número de factura" : "Número de la factura emitida en Aliados"}</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="factura-numero"
          autoComplete="off"
          maxLength={40}
          placeholder="Ej: FE-1001"
          className="h-11 text-base sm:max-w-xs"
          value={numero}
          disabled={enviando}
          onChange={(e) => setNumero(e.target.value)}
        />
        <Button type="submit" className="h-11" disabled={enviando || numero.trim() === "" || numero.trim() === (numeroActual ?? "")}>
          {enviando ? "Guardando…" : "Guardar número"}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
