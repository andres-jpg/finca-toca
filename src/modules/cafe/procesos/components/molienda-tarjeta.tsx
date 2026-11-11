"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatCOP } from "@/modules/core/formato/numeros";
import { ETIQUETA_MODO_MOLIENDA, mensajeMoliendaExcede, type EstimacionMolienda, type ModoMolienda } from "../lib/molienda";

interface MoliendaTarjetaProps {
  titulo?: string;
  modo: ModoMolienda;
  onModo: (modo: ModoMolienda) => void;
  kgTxt: string;
  onKgTxt: (texto: string) => void;
  estimacion: EstimacionMolienda | null;
  /** Texto del estimado (B-06 en la tostión, B-07 en la confirmación). */
  textoEstimado: (est: EstimacionMolienda) => string;
  /** «Sin molienda» solo se ofrece al decidir la tostión, no al modificar la cantidad de una molienda ya pedida. */
  conSinMolienda: boolean;
  /** Tarifa de molienda de terceros; con ella se muestra el valor estimado del servicio. */
  tarifaKg?: number | null;
  idBase: string;
}

/** Selector Sin molienda · Todo · Mitad · Otra cantidad (kg) con el estimado (B-06 y B-07). Controlado; sin estado propio. */
export function MoliendaTarjeta({ titulo = "Molienda", modo, onModo, kgTxt, onKgTxt, estimacion, textoEstimado, conSinMolienda, tarifaKg, idBase }: MoliendaTarjetaProps) {
  const modos: ModoMolienda[] = conSinMolienda ? ["ninguna", "todo", "mitad", "kg"] : ["todo", "mitad", "kg"];
  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby={`${idBase}-titulo`}>
      <h2 id={`${idBase}-titulo`} className="text-base font-semibold text-gray-800">
        {titulo}
      </h2>
      <div role="radiogroup" aria-labelledby={`${idBase}-titulo`} className={cn("grid gap-2", conSinMolienda ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
        {modos.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={modo === m}
            onClick={() => onModo(m)}
            className={cn(
              "min-h-12 rounded-md border px-3 text-base font-medium transition-colors",
              modo === m ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
            )}
          >
            {ETIQUETA_MODO_MOLIENDA[m]}
          </button>
        ))}
      </div>
      {modo === "kg" && (
        <div className="space-y-1.5 sm:max-w-xs">
          <Label htmlFor={`${idBase}-kg`}>Kilos a moler (kg)</Label>
          <Input
            id={`${idBase}-kg`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="Ej: 10,0"
            className="h-11 text-base"
            value={kgTxt}
            onChange={(ev) => onKgTxt(ev.target.value)}
          />
        </div>
      )}
      {modo !== "ninguna" && estimacion && estimacion.tostadoKg > 0 && (
        <p className="text-sm text-gray-700" aria-live="polite">
          {textoEstimado(estimacion)}
        </p>
      )}
      {modo !== "ninguna" && estimacion?.excede && (
        <p role="alert" className="text-xs font-medium text-red-600">
          {mensajeMoliendaExcede(estimacion)}
        </p>
      )}
      {modo !== "ninguna" && estimacion && tarifaKg != null && estimacion.molidoKg > 0 && (
        <p className="text-xs text-gray-600">
          Molienda · {formatCOP(Math.round(estimacion.molidoKg * tarifaKg))} <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-600">Estimado</span>
        </p>
      )}
    </section>
  );
}
