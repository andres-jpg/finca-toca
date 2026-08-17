"use client";

import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MAX_COMPONENTES_SANGRE, RAZAS, RAZA_LABELS } from "@/lib/animales/razas";
import {
  filaCompleta,
  filasDesdeSangre,
  mostrarTerceraRaza,
  normalizarSangre,
  sangreDesdeFilas,
  sumaSangre,
  type FilaSangre,
} from "@/lib/animales/sangre";
import type { AnimalRaza } from "@/types";

/**
 * Selector guiado del campo `sangre` (% de pureza por raza). Solo se usa en El Velero, y lo
 * comparten el alta/edición de animal y el subformulario de cría del evento de parto —
 * antes estaba duplicado en los dos, no lo reintroduzcas en local.
 *
 * Las reglas (autocompletado al 100%, suma que puede pasarse, tercera fila condicional)
 * viven en `lib/animales/sangre.ts`; aquí solo se pintan.
 */
interface SangreSelectorProps {
  /** Valor guardado de `animales.sangre`; solo se lee al montar. */
  value?: string | null;
  /** Recibe el texto compuesto (`"AYR:50% x HOL:50%"`) o `null` si no hay nada válido. */
  onChange: (sangre: string | null) => void;
  label?: string;
}

export function SangreSelector({
  value,
  onChange,
  label = "Sangre (% de pureza) — opcional",
}: SangreSelectorProps) {
  const [filas, setFilas] = useState<FilaSangre[]>(() => filasDesdeSangre(value));

  const actualizar = (indice: number, cambio: Partial<FilaSangre>) => {
    setFilas((previas) =>
      normalizarSangre(
        previas.map((fila, i) => (i === indice ? { ...fila, ...cambio } : fila))
      )
    );
  };

  const sangreTexto = useMemo(() => sangreDesdeFilas(filas), [filas]);

  useEffect(() => {
    onChange(sangreTexto);
    // `onChange` suele ser una lambda del padre: incluirlo dispararía el efecto en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sangreTexto]);

  const total = sumaSangre(filas);
  const visibles = mostrarTerceraRaza(filas) ? MAX_COMPONENTES_SANGRE : 2;
  const razasElegidas = filas.map((f) => f.raza);

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 p-3">
      <Label>{label}</Label>

      <div className="grid grid-cols-2 gap-3">
        {filas.slice(0, visibles).map((fila, i) => (
          <div key={i} className="space-y-1">
            <Select
              value={fila.raza || "none"}
              onValueChange={(val) =>
                actualizar(i, { raza: val === "none" ? "" : (val as AnimalRaza) })
              }
              // Cada fila se habilita cuando la anterior está completa, para que el
              // autocompletado tenga de dónde partir.
              disabled={i > 0 && !filaCompleta(filas[i - 1])}
            >
              <SelectTrigger>
                <SelectValue placeholder={i === 0 ? "Raza 1" : `Raza ${i + 1} (opcional)`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{i === 0 ? "Sin definir" : "Ninguna"}</SelectItem>
                {RAZAS.filter((r) => r === fila.raza || !razasElegidas.includes(r)).map((r) => (
                  <SelectItem key={r} value={r}>
                    {RAZA_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Input
              type="number"
              min={1}
              max={100}
              placeholder="% pureza"
              disabled={!fila.raza}
              value={fila.pct}
              onChange={(e) =>
                actualizar(i, {
                  pct: e.target.value === "" ? "" : Number(e.target.value),
                  manual: true,
                })
              }
            />
          </div>
        ))}
      </div>

      {total > 0 && (
        <p className={`text-xs ${total > 100 ? "text-amber-600" : "text-gray-500"}`}>
          Suma: <span className="font-medium">{total}%</span>
          {total > 100 && " — por encima del 100%, se guardará igual"}
          {total < 100 && ` — faltan ${100 - total}%`}
        </p>
      )}

      {sangreTexto && (
        <p className="text-xs text-gray-500">
          Se guardará como: <span className="font-medium text-gray-700">{sangreTexto}</span>
        </p>
      )}
    </div>
  );
}
