"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatKg } from "@/modules/core/formato/numeros";
import { confirmarMolienda } from "../actions/procesos.actions";
import { estimarMolienda, textoEstimadoTostion, type ModoMolienda } from "../lib/molienda";
import { aTextoDecimal, fechaCorta, parsearDecimal } from "../lib/numero";
import type { OrigenPlanta } from "../lib/pasos";
import type { ConfigPlanta, ProcesoHistorial } from "../types-planta";
import { MoliendaTarjeta } from "./molienda-tarjeta";

interface MoliendaConfirmarProps {
  loteId: string;
  /** Tandas con molienda pendiente (las que la piden y aún no se muelen). */
  origenes: OrigenPlanta[];
  procesos: ProcesoHistorial[];
  config: ConfigPlanta;
  fechaHoy: string;
}

/**
 * «Confirmar molienda» (B-07): pantalla corta sin pesos ni merma. Muestra el tostado estimado, lo que va a molienda y lo que
 * queda en grano; «Modificar cantidad» cambia Todo / Mitad / Otra cantidad antes de confirmar y «Molienda realizada → Por
 * empacar» registra la molienda. El peso real se confirma en empaque.
 */
export function MoliendaConfirmar({ loteId, origenes, procesos, config, fechaHoy }: MoliendaConfirmarProps) {
  const router = useRouter();
  const [tandaId, setTandaId] = useState<string | null>(origenes[0]?.procesoId ?? null);
  const tanda = origenes.find((o) => o.procesoId === tandaId) ?? origenes[0] ?? null;
  const tostion = procesos.find((p) => p.id === tanda?.procesoId) ?? null;

  const [modificando, setModificando] = useState(false);
  const [modo, setModo] = useState<ModoMolienda>("todo");
  const [kgTxt, setKgTxt] = useState("");
  const [enviando, setEnviando] = useState(false);

  const nivel = tostion?.nivelTueste ?? "medio";
  const mermaTostionPct = config.merma.referenciaTostionPct?.[nivel] ?? 0;
  const entradaKg = tanda?.baseKg ?? 0;

  // Lo decidido para la tanda (sin decisión, anterior a B-06: todo el tostado).
  const modoActual: ModoMolienda = tanda?.moliendaModo && tanda.moliendaModo !== "ninguna" ? tanda.moliendaModo : "todo";
  const guardada = useMemo(
    () => estimarMolienda({ kgEntrada: entradaKg, trilla: false, mermaTrillaPct: 0, mermaTostionPct, modo: modoActual, kg: tanda?.moliendaKg ?? null }),
    [entradaKg, mermaTostionPct, modoActual, tanda?.moliendaKg],
  );
  const editada = useMemo(
    () => estimarMolienda({ kgEntrada: entradaKg, trilla: false, mermaTrillaPct: 0, mermaTostionPct, modo, kg: parsearDecimal(kgTxt) }),
    [entradaKg, mermaTostionPct, modo, kgTxt],
  );
  const est = modificando ? editada : guardada;

  function empezarAModificar() {
    setModo(modoActual);
    setKgTxt(modoActual === "kg" ? aTextoDecimal(tanda?.moliendaKg ?? null) : "");
    setModificando(true);
  }

  async function confirmar() {
    if (!tanda?.procesoId) return;
    if (modificando && modo === "kg" && editada.molidoKg <= 0) {
      toast.error("Indicar los kilos a moler.");
      return;
    }
    if (modificando && editada.excede) {
      toast.error("La cantidad a moler supera el tostado estimado.");
      return;
    }
    setEnviando(true);
    const r = await confirmarMolienda({
      loteId,
      tostionProcesoId: tanda.procesoId,
      fecha: fechaHoy,
      modo: modificando ? (modo === "ninguna" ? null : modo) : null,
      kg: modificando && modo === "kg" ? kgTxt : null,
    });
    setEnviando(false);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success("Molienda confirmada.", { description: "Lote listo para empacar." });
    router.push("/dashboard/cafe/planta");
    router.refresh();
  }

  if (!tanda) {
    return <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">No hay molienda por confirmar en este lote.</p>;
  }

  return (
    <div className="space-y-6">
      {origenes.length > 1 && (
        <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-gray-800">Tanda</h2>
          <div role="radiogroup" aria-label="Tanda de tostión" className="flex flex-wrap gap-2">
            {origenes.map((o) => (
              <button
                key={o.procesoId ?? "raiz"}
                type="button"
                role="radio"
                aria-checked={tandaId === o.procesoId}
                onClick={() => {
                  setTandaId(o.procesoId);
                  setModificando(false);
                }}
                className={cn("min-h-11 rounded-md border px-3 text-sm font-medium", tandaId === o.procesoId ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-800")}
              >
                Tostión del {o.fecha ? fechaCorta(o.fecha) : "—"} · {formatKg(o.baseKg)}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby="mol-confirmar-titulo">
        <h2 id="mol-confirmar-titulo" className="text-base font-semibold text-gray-800">
          Confirmar molienda
        </h2>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm text-gray-500">Tostado estimado</dt>
            <dd className="text-lg font-semibold tabular-nums text-gray-900">{formatKg(est.tostadoKg)}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">A molienda</dt>
            <dd className="text-lg font-semibold tabular-nums text-gray-900">{formatKg(est.molidoKg)}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">En grano</dt>
            <dd className="text-lg font-semibold tabular-nums text-gray-900">{formatKg(est.granoKg)}</dd>
          </div>
        </dl>
        <p className="text-sm text-gray-600">La molienda no genera merma. El peso real se confirma en empaque.</p>
      </section>

      {modificando && (
        <MoliendaTarjeta
          idBase="mol-confirmar"
          titulo="Modificar cantidad"
          modo={modo}
          onModo={setModo}
          kgTxt={kgTxt}
          onKgTxt={setKgTxt}
          estimacion={editada}
          textoEstimado={textoEstimadoTostion}
          conSinMolienda={false}
        />
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-row-reverse sm:items-center">
        <Button type="button" className="h-12 px-6 text-base" disabled={enviando} onClick={confirmar}>
          {enviando ? "Guardando…" : "Molienda realizada → Por empacar"}
        </Button>
        {!modificando ? (
          <Button type="button" variant="outline" className="h-12 px-6 text-base" disabled={enviando} onClick={empezarAModificar}>
            Modificar cantidad
          </Button>
        ) : (
          <Button type="button" variant="outline" className="h-12 px-6 text-base" disabled={enviando} onClick={() => setModificando(false)}>
            Descartar cambio
          </Button>
        )}
        <Button asChild type="button" variant="ghost" className="h-12">
          <Link href="/dashboard/cafe/planta">Cancelar</Link>
        </Button>
      </div>
    </div>
  );
}
