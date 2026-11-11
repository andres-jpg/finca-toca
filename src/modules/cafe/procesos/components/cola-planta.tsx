"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TarjetaReapertura } from "../../reapertura/components/tarjeta-reapertura";
import type { ReaperturaVista } from "../../reapertura/types";
import { COLUMNAS_PLANTA, TITULO_COLUMNA, VACIO_COLUMNA, construirTablero, filtrarCola, type ColumnaPlanta } from "../lib/cola";
import type { TarjetaLotePlanta } from "../types-planta";
import { TarjetaLote } from "./tarjeta-lote";

/**
 * Tablero de la planta (A-13): una sola cola por etapa (Por trillar · Por tostar · Por moler · Por empacar · Por
 * entregar), sin pestañas por línea; la línea es una etiqueta de la tarjeta. Un lote parcial sale en cada columna donde
 * aún tiene café por procesar. Las reaperturas de producto empacado (CO-33) van en Por moler (pendientes) o Por empacar (ya molidas).
 * En tablet las columnas se desplazan en horizontal; en pantallas angostas se apilan. La búsqueda es local.
 */
export function ColaPlanta({ tarjetas, reaperturas = [], zonaHoraria, hoy }: { tarjetas: TarjetaLotePlanta[]; reaperturas?: ReaperturaVista[]; zonaHoraria: string; hoy: string }) {
  const [q, setQ] = useState("");
  const tablero = useMemo(() => construirTablero(filtrarCola(tarjetas, q)), [tarjetas, q]);
  const reaperturasPorColumna = useMemo(() => {
    const texto = q.trim().toLowerCase();
    const visibles = reaperturas.filter((r) => texto === "" || r.loteCodigo.toLowerCase().includes(texto));
    const mapa: Partial<Record<ColumnaPlanta, ReaperturaVista[]>> = {};
    for (const r of visibles) {
      const col: ColumnaPlanta = r.estado === "pendiente" ? "molienda" : "empaque";
      mapa[col] = [...(mapa[col] ?? []), r];
    }
    return mapa;
  }, [reaperturas, q]);

  return (
    <div className="space-y-3">
      <div className="relative sm:w-72">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
        <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por código" aria-label="Buscar por código" className="h-11 pl-9 text-base" />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:overflow-x-auto lg:pb-2">
        {COLUMNAS_PLANTA.map((col) => {
          const entradas = tablero[col];
          const reaps = reaperturasPorColumna[col] ?? [];
          const n = entradas.length + reaps.length;
          return (
            <section key={col} aria-label={TITULO_COLUMNA[col]} className={cn("flex min-w-0 flex-1 flex-col gap-3 rounded-lg bg-gray-50 p-3 lg:min-w-72", col === "entrega" && "bg-amber-50/60")}>
              <h2 className="flex items-center justify-between text-sm font-semibold uppercase tracking-wide text-gray-700">
                {TITULO_COLUMNA[col]}
                <span className="rounded-full bg-white px-2 py-0.5 text-xs tabular-nums text-gray-700 shadow-sm" aria-label={`${n} en total`}>
                  {n}
                </span>
              </h2>
              {n === 0 ? (
                <p className="rounded-md border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-500">{VACIO_COLUMNA[col]}</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {reaps.map((r) => (
                    <li key={r.id}>
                      <TarjetaReapertura reapertura={r} />
                    </li>
                  ))}
                  {entradas.map((e) => (
                    <li key={`${e.tarjeta.id}-${col}`}>
                      <TarjetaLote entrada={e} zonaHoraria={zonaHoraria} hoy={hoy} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
