"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { etiquetaServicio } from "../../lotes/lib/servicios";
import type { TipoProceso } from "../../lotes/types";
import { TarjetaReapertura } from "../../reapertura/components/tarjeta-reapertura";
import type { ReaperturaVista } from "../../reapertura/types";
import { contarPorPaso, filtrarCola, separarPorLinea } from "../lib/cola";
import type { TarjetaLotePlanta } from "../types-planta";
import { TarjetaLote } from "./tarjeta-lote";

type Pestana = "servicios" | "marca_propia";
const PASOS: TipoProceso[] = ["trilla", "tostion", "molienda", "empaque"];

const BOTON = "min-h-11 rounded-md border px-4 text-base font-medium transition-colors";
const ACTIVO = "border-gray-900 bg-gray-900 text-white";
const INACTIVO = "border-gray-300 bg-white text-gray-700 hover:bg-gray-50";

/**
 * Cola de trabajo de la planta (HU-F1-04). Servicios (clientes) y marca propia van en pestañas SEPARADAS:
 * nunca se mezclan en una lista ni se suman sus kilos (HU-12 c3). Filtro por paso pendiente y búsqueda por
 * código (o cliente); todo se filtra en el navegador sobre la lista que ya trajo el servidor. Las reaperturas de
 * producto empacado (CO-33) son café de marca propia: salen como tarjetas aparte al principio de esa pestaña, con
 * los pasos molienda y/o empaque.
 */
export function ColaPlanta({ tarjetas, reaperturas = [] }: { tarjetas: TarjetaLotePlanta[]; reaperturas?: ReaperturaVista[] }) {
  const { servicios, marcaPropia } = useMemo(() => separarPorLinea(tarjetas), [tarjetas]);
  const [pestana, setPestana] = useState<Pestana>(servicios.length === 0 && marcaPropia.length + reaperturas.length > 0 ? "marca_propia" : "servicios");
  const [paso, setPaso] = useState<TipoProceso | null>(null);
  const [q, setQ] = useState("");

  const lista = pestana === "servicios" ? servicios : marcaPropia;
  const visibles = useMemo(() => filtrarCola(lista, { paso, q }), [lista, paso, q]);
  const porPaso = useMemo(() => contarPorPaso(lista), [lista]);
  // Una reapertura solo tiene molienda y/o empaque: el filtro por trilla o tostión las esconde.
  const reaperturasVisibles = useMemo(() => {
    if (pestana !== "marca_propia" || (paso !== null && paso !== "molienda" && paso !== "empaque")) return [];
    const texto = q.trim().toLowerCase();
    return reaperturas.filter((r) => texto === "" || r.loteCodigo.toLowerCase().includes(texto));
  }, [reaperturas, pestana, paso, q]);

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Línea de negocio" className="grid grid-cols-2 gap-2 sm:max-w-xl">
        {(
          [
            ["servicios", "Servicios (clientes)", servicios.length],
            ["marca_propia", "Marca propia", marcaPropia.length + reaperturas.length],
          ] as const
        ).map(([id, etiqueta, n]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={pestana === id}
            onClick={() => setPestana(id)}
            className={cn(BOTON, "min-h-12", pestana === id ? ACTIVO : INACTIVO)}
          >
            {etiqueta} <span className="tabular-nums opacity-80">({n})</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="group" aria-label="Filtrar por paso" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={paso === null} onClick={() => setPaso(null)} className={cn(BOTON, paso === null ? ACTIVO : INACTIVO)}>
            Todos <span className="tabular-nums opacity-80">({lista.length})</span>
          </button>
          {PASOS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={paso === p}
              onClick={() => setPaso(paso === p ? null : p)}
              className={cn(BOTON, paso === p ? ACTIVO : INACTIVO)}
            >
              {etiquetaServicio(p)} <span className="tabular-nums opacity-80">({porPaso[p]})</span>
            </button>
          ))}
        </div>
        <div className="relative lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <Input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por código"
            aria-label="Buscar por código"
            className="h-11 pl-9 text-base"
          />
        </div>
      </div>

      {visibles.length === 0 && reaperturasVisibles.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 px-4 py-12 text-center text-base text-gray-500">
          {lista.length === 0 && (pestana === "servicios" || reaperturas.length === 0)
            ? pestana === "servicios"
              ? "No hay café de clientes pendiente de proceso."
              : "No hay café de marca propia pendiente de proceso."
            : "Ningún lote coincide con el filtro."}
        </p>
      ) : (
        <ul className="grid gap-3 xl:grid-cols-2">
          {reaperturasVisibles.map((r) => (
            <li key={r.id}>
              <TarjetaReapertura reapertura={r} />
            </li>
          ))}
          {visibles.map((t) => (
            <li key={t.id}>
              <TarjetaLote lote={t} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
