"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { estadoBaches, filaVacia, type BacheFila } from "../lib/baches-form";
import { calcularMerma } from "../lib/merma";
import { formatearPeso, formatearPorcentaje, parsearDecimal } from "../lib/numero";

interface TablaBachesProps {
  filas: BacheFila[];
  onChange: (filas: BacheFila[]) => void;
  /** Peso de entrada de la tostión: la suma de las entradas de los baches debe ser este. */
  entradaKg: number | null;
  capacidadKg: number;
  onSugerir: () => void;
  /** Mensajes de error del formulario (general y por fila). */
  error?: string;
  erroresFila?: (string | undefined)[];
  disabled?: boolean;
}

const CELDA = "h-11 text-base tabular-nums";

/**
 * Baches de la tostión (HU-04 c2). La sugerencia reparte el peso en baches de la capacidad de la tostadora y
 * se edita a mano; la merma de cada bache se calcula en vivo y el indicador dice si las entradas suman el peso
 * del proceso (verde) o cuántos kg faltan/sobran (rojo). La salida de la tostión es la suma de las salidas.
 */
export function TablaBaches({ filas, onChange, entradaKg, capacidadKg, onSugerir, error, erroresFila, disabled }: TablaBachesProps) {
  const estado = estadoBaches(filas, entradaKg);

  function cambiar(i: number, campo: keyof BacheFila, valor: string) {
    onChange(filas.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-gray-800">Baches ({filas.length})</h3>
          <p className="text-xs text-gray-500">
            La tostadora admite {formatearPeso(capacidadKg)} kg por bache. Puedes cambiar cualquier peso.
          </p>
        </div>
        <Button type="button" variant="outline" className="h-11" onClick={onSugerir} disabled={disabled || entradaKg === null || entradaKg <= 0}>
          Sugerir baches
        </Button>
      </div>

      {filas.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-500">
          Fija el peso de entrada y pulsa «Sugerir baches», o añade los baches a mano.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-separate border-spacing-y-1.5">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500">
                <th className="w-10 px-1">Nº</th>
                <th className="px-1">Entrada (kg)</th>
                <th className="px-1">Salida (kg)</th>
                <th className="w-24 px-1">Temp. °C</th>
                <th className="w-20 px-1 text-right">Merma</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                const e = parsearDecimal(f.pesoEntradaKg);
                const s = parsearDecimal(f.pesoSalidaKg);
                const merma = e !== null && s !== null ? calcularMerma(e, s) : null;
                const mensaje = erroresFila?.[i];
                return (
                  <tr key={i} className={cn(mensaje && "bg-red-50")}>
                    <td className="px-1 text-sm font-semibold tabular-nums text-gray-600">{i + 1}</td>
                    <td className="px-1">
                      <Input
                        value={f.pesoEntradaKg}
                        onChange={(ev) => cambiar(i, "pesoEntradaKg", ev.target.value)}
                        inputMode="decimal"
                        autoComplete="off"
                        enterKeyHint="next"
                        aria-label={`Bache ${i + 1}, kg de entrada`}
                        aria-invalid={Boolean(mensaje)}
                        className={CELDA}
                        disabled={disabled}
                      />
                    </td>
                    <td className="px-1">
                      <Input
                        value={f.pesoSalidaKg}
                        onChange={(ev) => cambiar(i, "pesoSalidaKg", ev.target.value)}
                        inputMode="decimal"
                        autoComplete="off"
                        enterKeyHint="next"
                        placeholder="0,0"
                        aria-label={`Bache ${i + 1}, kg de salida`}
                        aria-invalid={Boolean(mensaje)}
                        className={CELDA}
                        disabled={disabled}
                      />
                    </td>
                    <td className="px-1">
                      <Input
                        value={f.temperaturaC}
                        onChange={(ev) => cambiar(i, "temperaturaC", ev.target.value)}
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label={`Bache ${i + 1}, temperatura en grados (opcional)`}
                        className={CELDA}
                        disabled={disabled}
                      />
                    </td>
                    <td className="px-1 text-right text-sm tabular-nums text-gray-700">
                      {merma ? `${formatearPorcentaje(merma.mermaPct)} %` : "—"}
                    </td>
                    <td className="px-1">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 w-11 p-0 text-gray-500 hover:text-red-600"
                        aria-label={`Quitar el bache ${i + 1}`}
                        onClick={() => onChange(filas.filter((_, j) => j !== i))}
                        disabled={disabled}
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button type="button" variant="outline" className="h-11" onClick={() => onChange([...filas, filaVacia()])} disabled={disabled}>
          <Plus className="mr-2 h-4 w-4" />
          Añadir bache
        </Button>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-gray-600">
            Entradas: <span className="font-semibold tabular-nums text-gray-900">{formatearPeso(estado.sumaEntradaKg)}</span>
            {entradaKg !== null && <> de {formatearPeso(entradaKg)} kg</>}
          </span>
          <span className="text-gray-600">
            Salidas: <span className="font-semibold tabular-nums text-gray-900">{formatearPeso(estado.sumaSalidaKg)} kg</span>
          </span>
          {filas.length > 0 && (
            <span
              role="status"
              className={cn(
                "inline-flex min-h-8 items-center rounded-full px-3 text-sm font-semibold",
                estado.cuadra ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800",
              )}
            >
              {estado.cuadra
                ? "Cuadra con la entrada"
                : estado.diferenciaKg === null
                  ? "Falta el peso de entrada"
                  : !estado.filasValidas
                    ? "Completa los pesos de cada bache"
                    : estado.diferenciaKg > 0
                      ? `Faltan ${formatearPeso(estado.diferenciaKg)} kg por repartir`
                      : `Sobran ${formatearPeso(-estado.diferenciaKg)} kg`}
            </span>
          )}
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
