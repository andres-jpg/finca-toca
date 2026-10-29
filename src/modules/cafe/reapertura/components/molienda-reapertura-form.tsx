"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatearKg3, formatearMermaPct } from "../../lotes/lib/formato";
import { calcularMerma } from "../../procesos/lib/merma";
import { aTextoDecimal, formatearPeso, parsearDecimal } from "../../procesos/lib/numero";
import { registrarMoliendaReapertura } from "../actions/reapertura.actions";
import { moliendaReaperturaSchema } from "../schemas/reapertura.schema";

const CAMPO = "h-11 text-base";

interface Props {
  loteId: string;
  reaperturaId: string;
  /** Todo lo reabierto: entra completo a la molienda. */
  pesoEntradaKg: number;
  /** `YYYY-MM-DD` de hoy en la zona del cliente (lo calcula el servidor). */
  fechaHoy: string;
  /** `YYYY-MM-DD` de la reapertura: la molienda no puede ser anterior. */
  fechaReapertura: string;
}

/**
 * Molienda del café reabierto (HU-F1-16): sin repetir trilla ni tostión y sin bultos. Entra todo lo reabierto; el
 * operario pesa lo que salió molido y la diferencia es la merma. Es el único paso de molienda de esta reapertura.
 * Pensado para tablet: campos de 44 px, teclado decimal con coma.
 */
export function MoliendaReaperturaForm({ loteId, reaperturaId, pesoEntradaKg, fechaHoy, fechaReapertura }: Props) {
  const router = useRouter();
  const [fecha, setFecha] = useState(fechaHoy);
  const [salidaTxt, setSalidaTxt] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const salida = parsearDecimal(salidaTxt);
  const merma = salida !== null ? calcularMerma(pesoEntradaKg, salida) : null;
  const supera = salida !== null && salida > pesoEntradaKg;

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = moliendaReaperturaSchema.safeParse({
      loteId,
      reaperturaId,
      fecha,
      pesoEntradaKg: aTextoDecimal(pesoEntradaKg),
      pesoSalidaKg: salidaTxt,
      observaciones,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Revisa los campos");
      return;
    }
    setEnviando(true);
    const r = await registrarMoliendaReapertura(parsed.data);
    setEnviando(false);
    if (!r.ok) {
      setError(r.message);
      toast.error(r.message);
      return;
    }
    toast.success("Molienda registrada", {
      description: `Merma ${formatearPeso(r.data.merma_kg)} kg (${formatearMermaPct(r.data.merma_kg, r.data.peso_entrada_kg)}). Ahora puedes empacarla.`,
    });
    router.refresh();
  }

  return (
    <form onSubmit={guardar} noValidate className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-gray-800">Moler lo reabierto</h2>
        <p className="text-xs text-gray-500">Entra todo el café reabierto. Pesa lo que salió molido: lo que falte cuenta como merma de la molienda.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="mol-entrada">Peso de entrada (kg)</Label>
          <Input id="mol-entrada" readOnly className={CAMPO} value={formatearPeso(pesoEntradaKg)} />
          <p className="text-xs text-gray-500">Todo lo reabierto.</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mol-salida">Peso de salida (kg)</Label>
          <Input
            id="mol-salida"
            inputMode="decimal"
            autoComplete="off"
            placeholder="Ej: 19,8"
            className={CAMPO}
            aria-invalid={supera}
            value={salidaTxt}
            onChange={(e) => setSalidaTxt(e.target.value)}
          />
          <p aria-live="polite" className={supera ? "text-xs font-medium text-red-600" : "text-xs tabular-nums text-gray-600"}>
            {supera
              ? "La salida no puede superar la entrada"
              : merma
                ? `Merma ${formatearKg3(merma.mermaKg)} kg · ${formatearMermaPct(merma.mermaKg, pesoEntradaKg)}`
                : "Merma: —"}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mol-fecha">Fecha de la molienda</Label>
          <Input id="mol-fecha" type="date" min={fechaReapertura} max={fechaHoy} className={CAMPO} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mol-obs">Observaciones (opcional)</Label>
        <Textarea id="mol-obs" rows={2} maxLength={500} className="text-base" value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button asChild type="button" variant="outline" className="h-11">
          <Link href="/dashboard/cafe/planta">Cancelar</Link>
        </Button>
        <Button type="submit" className="h-12 px-6 text-base" disabled={enviando || salida === null || supera}>
          {enviando ? "Guardando…" : "Registrar molienda"}
        </Button>
      </div>
    </form>
  );
}
