"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TipoProceso } from "../../lotes/types";
import { fechaCorta, formatearPeso } from "../lib/numero";
import { evaluarBulto, type LotePasos } from "../lib/pasos";
import type { BultoPlanta } from "../types-planta";

interface SelectorBultosProps {
  lote: LotePasos;
  tipo: TipoProceso;
  bultos: BultoPlanta[];
  seleccionados: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

/**
 * Qué bultos pasan por el paso (proceso parcial, HU-04 c3): casillas grandes «Bulto 1 · 62,500 kg». Los que ya
 * pasaron por este paso salen en gris con la fecha, y los que aún no pueden (falta el paso previo, o ya pasaron
 * por uno posterior) en gris con el motivo: nada de esto depende del hover. «Seleccionar todos» marca los
 * elegibles. El lote de un solo bulto no muestra la selección (lo decide quien lo monta).
 */
export function SelectorBultos({ lote, tipo, bultos, seleccionados, onChange, disabled }: SelectorBultosProps) {
  const evaluados = bultos.map((b) => ({ bulto: b, e: evaluarBulto(lote, tipo, b) }));
  const elegibles = evaluados.filter((x) => x.e.estado === "elegible").map((x) => x.bulto.id);
  const todos = elegibles.length > 0 && elegibles.every((id) => seleccionados.includes(id));

  function alternar(id: string) {
    onChange(seleccionados.includes(id) ? seleccionados.filter((s) => s !== id) : [...seleccionados, id]);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600" aria-live="polite">
          <span className="font-semibold tabular-nums text-gray-900">{seleccionados.length}</span> de {elegibles.length} disponibles seleccionados
        </p>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={disabled || elegibles.length === 0}
          onClick={() => onChange(todos ? [] : elegibles)}
        >
          {todos ? "Quitar todos" : "Seleccionar todos"}
        </Button>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {evaluados.map(({ bulto, e }) => {
          const marcado = seleccionados.includes(bulto.id);
          const activo = e.estado === "elegible" && !disabled;
          return (
            <li key={bulto.id}>
              <label
                className={cn(
                  "flex min-h-14 items-center gap-3 rounded-md border px-3 py-2",
                  activo ? "cursor-pointer" : "cursor-not-allowed bg-gray-50 text-gray-400",
                  marcado ? "border-gray-900 bg-gray-50" : "border-gray-200",
                )}
              >
                <input
                  type="checkbox"
                  className="h-6 w-6 shrink-0 accent-gray-800"
                  checked={marcado}
                  disabled={!activo}
                  onChange={() => alternar(bulto.id)}
                />
                <span className="min-w-0">
                  <span className={cn("block text-base font-medium", activo ? "text-gray-900" : "text-gray-500")}>
                    Bulto {bulto.numero} · {formatearPeso(bulto.pesoKg)} kg
                  </span>
                  {e.estado === "hecho" && (
                    <span className="block text-xs">
                      Ya pasó{bulto.hechos[tipo] ? ` el ${fechaCorta(bulto.hechos[tipo]!.fecha)}` : ""}
                    </span>
                  )}
                  {e.estado === "bloqueado" && <span className="block text-xs">{e.motivo}</span>}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
