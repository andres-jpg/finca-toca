"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { enteroConMiles, parsearUnidades } from "../../empaque/lib/empaque";
import { etiquetaPresentacion } from "../../tipos/lib/productos";
import { reabrirProducto } from "../actions/reapertura.actions";
import { maxReabrible, textoEquivale, textoReapertura, validarUnidadesReapertura } from "../lib/reapertura";
import { reabrirSchema } from "../schemas/reapertura.schema";
import type { SaldoPresentacion } from "../types";

interface Props {
  loteId: string;
  loteCodigo: string;
  /** Presentaciones que el lote empacó, con su saldo y el stock global. */
  saldos: SaldoPresentacion[];
  /** `YYYY-MM-DD` de hoy en la zona del cliente (lo calcula el servidor: el navegador puede estar en otra zona). */
  fechaHoy: string;
  /** `YYYY-MM-DD` de la compra del lote: la reapertura no puede ser anterior. */
  fechaRecepcion: string;
}

const CAMPO = "h-11 text-base";

/**
 * «Reabrir» producto empacado de un lote de marca propia (HU-F1-16): presentación de origen, unidades y motivo; dice
 * a cuántos kilos equivale y avisa del saldo del lote y de lo que hay en el inventario. Al guardar, el café queda
 * como trabajo pendiente en Planta (molienda y/o empaque). Esconderlo a quien no puede es cosmético: la action y la
 * RPC repiten módulo, rol y reglas. Pensado para tablet: campos y botones de 44 px, teclado numérico.
 */
export function ReabrirButton({ loteId, loteCodigo, saldos, fechaHoy, fechaRecepcion }: Props) {
  const router = useRouter();
  const reabribles = saldos.filter((s) => s.saldo > 0);
  const [abierto, setAbierto] = useState(false);
  const [presentacionG, setPresentacionG] = useState<number | null>(reabribles[0]?.presentacionG ?? null);
  const [unidadesTxt, setUnidadesTxt] = useState("");
  const [fecha, setFecha] = useState(fechaHoy);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const elegida = saldos.find((s) => s.presentacionG === presentacionG) ?? null;
  const unidades = parsearUnidades(unidadesTxt);
  const hayTexto = unidadesTxt.trim() !== "";
  const problema = elegida && unidades !== null ? validarUnidadesReapertura(unidades, elegida.saldo, elegida.stockGlobal) : null;
  const tope = elegida ? maxReabrible(elegida.saldo, elegida.stockGlobal) : 0;

  function abrir() {
    setError(null);
    setUnidadesTxt("");
    setMotivo("");
    setFecha(fechaHoy);
    setPresentacionG(reabribles[0]?.presentacionG ?? null);
    setAbierto(true);
  }

  async function confirmar() {
    setError(null);
    const parsed = reabrirSchema.safeParse({ loteId, presentacionG, unidades: unidadesTxt, fecha, motivo });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa los campos");
      return;
    }
    if (problema) {
      setError(problema.mensaje);
      return;
    }
    setEnviando(true);
    const r = await reabrirProducto(parsed.data);
    setEnviando(false);
    if (!r.ok) {
      setError(r.message);
      toast.error(r.message);
      return;
    }
    toast.success(`Reabiertas ${textoReapertura(r.data.unidades, r.data.producto, r.data.peso_kg)}`, {
      description: "Quedó pendiente en Planta para moler y/o reempacar.",
      action: { label: "Ir a planta", onClick: () => router.push(`/dashboard/cafe/planta/reapertura/${r.data.id}`) },
    });
    setAbierto(false);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={abrir} disabled={reabribles.length === 0} className="h-11 sm:h-9">
        <PackageOpen className="mr-2 h-4 w-4" />
        Reabrir
      </Button>
      <Dialog open={abierto} onOpenChange={(o) => !enviando && setAbierto(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir producto del lote {loteCodigo}</DialogTitle>
            <DialogDescription>
              Devuelve a granel parte de lo ya empacado para molerlo o reempacarlo en otra presentación. Se descuenta del producto
              terminado y el café conserva de qué lote viene.
            </DialogDescription>
          </DialogHeader>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-gray-800">Presentación de origen</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {saldos.map((s) => {
                const sinSaldo = s.saldo <= 0;
                const activa = s.presentacionG === presentacionG;
                return (
                  <button
                    key={s.presentacionG}
                    type="button"
                    disabled={sinSaldo}
                    aria-pressed={activa}
                    onClick={() => setPresentacionG(s.presentacionG)}
                    className={cn(
                      "min-h-14 rounded-md border px-3 py-2 text-left transition-colors",
                      activa ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-800 hover:bg-gray-50",
                      sinSaldo && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <span className="block text-base font-semibold">{s.producto}</span>
                    <span className={cn("block text-xs", activa ? "text-gray-200" : "text-gray-500")}>
                      {sinSaldo ? "Sin saldo en este lote" : `Del lote: ${enteroConMiles(s.saldo)} · En inventario: ${enteroConMiles(Math.max(0, s.stockGlobal))}`}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="reab-unidades">Unidades a reabrir</Label>
              <Input
                id="reab-unidades"
                inputMode="numeric"
                autoComplete="off"
                placeholder={tope > 0 ? `Hasta ${enteroConMiles(tope)}` : "Unidades"}
                className={cn(CAMPO, "text-right tabular-nums")}
                aria-invalid={(hayTexto && unidades === null) || problema !== null}
                value={unidadesTxt}
                onChange={(e) => setUnidadesTxt(e.target.value)}
              />
              <p
                aria-live="polite"
                className={cn("text-xs tabular-nums", (hayTexto && unidades === null) || problema ? "text-red-600" : "text-gray-600")}
              >
                {hayTexto && unidades === null
                  ? "Solo números enteros"
                  : problema
                    ? problema.mensaje
                    : elegida && unidades !== null
                      ? textoEquivale(elegida.presentacionG, unidades)
                      : elegida
                        ? `Equivale a 0,000 kg · ${etiquetaPresentacion(elegida.presentacionG)} por unidad`
                        : "Elige la presentación"}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reab-fecha">Fecha</Label>
              <Input id="reab-fecha" type="date" min={fechaRecepcion} max={fechaHoy} className={CAMPO} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>

          {elegida && elegida.stockGlobal < elegida.saldo && (
            <p role="status" className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                El lote empacó {enteroConMiles(elegida.empacadas)}, pero en el inventario solo hay {enteroConMiles(Math.max(0, elegida.stockGlobal))}: lo demás ya
                salió y no se puede reabrir. El inventario se lleva por tipo y presentación, no por lote.
              </span>
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="reab-motivo">Motivo (opcional)</Label>
            <Textarea
              id="reab-motivo"
              rows={2}
              maxLength={500}
              className="text-base"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej.: pedido de 2.500 g molido"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setAbierto(false)} disabled={enviando} className="h-11">
              Cancelar
            </Button>
            <Button type="button" onClick={confirmar} disabled={enviando || !elegida || unidades === null || problema !== null || !fecha} className="h-11">
              {enviando ? "Reabriendo…" : "Reabrir"}
            </Button>
          </DialogFooter>

          <p className="text-xs text-gray-500">
            Después, el café aparece en{" "}
            <Link href="/dashboard/cafe/planta" className="underline underline-offset-2">
              Planta
            </Link>{" "}
            para moler y/o empacar.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
