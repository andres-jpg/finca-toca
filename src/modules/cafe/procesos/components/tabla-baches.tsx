"use client";
import { COPY_TUESTE } from "@/modules/cafe/copy";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { etiquetaTueste } from "../../lotes/lib/servicios";
import {
  alternarSeleccion,
  alternarTodos,
  aplicarASeleccionados,
  difiereDelPerfil,
  estadoBaches,
  filaVacia,
  nivelDifiere,
  type BacheFila,
  type NivelBache,
  type PerfilBache,
} from "../lib/baches-form";
import { formatearPeso, parsearDecimal } from "../lib/numero";
import { NIVELES_TUESTE } from "../schemas/proceso.schema";

interface TablaBachesProps {
  filas: BacheFila[];
  onChange: (filas: BacheFila[]) => void;
  /** «Kilos a tostar ahora»: la suma de las entradas de los baches debe ser este. */
  entradaKg: number | null;
  /** Capacidad de la tostadora (kg por bache). */
  capacidadKg: number;
  onSugerir: () => void;
  /** Mensajes de error del formulario (general y por fila). */
  error?: string;
  erroresFila?: (string | undefined)[];
  disabled?: boolean;
  /** Perfil de tueste del lote o del tipo de café: con él se resaltan los campos que difieren. */
  perfil?: PerfilBache | null;
  /** Maquila con varios perfiles: aparece la columna «Perfil». Nunca «Receta». */
  conColumnaPerfil?: boolean;
}

const CELDA = "h-12 text-base tabular-nums";
/** Campo cuyo valor difiere del perfil: borde y fondo de acento (lleva título: no depende solo del color). */
const DIFIERE = "border-amber-500 bg-amber-50 ring-1 ring-amber-400";

/**
 * Baches de la tostión (B-05): Bache · Entra (kg) · Nivel de tueste · Temperatura · Tiempo, sin columna de salida (la planta no
 * pesa por bache). Casilla por bache y casilla general; con uno o más seleccionados aparece la barra «N baches seleccionados ·
 * Ajustar solo los campos que cambian» con «Aplicar a los seleccionados» (un campo vacío «—» no se toca). Casillas ≥ 44 px.
 */
export function TablaBaches({ filas, onChange, entradaKg, capacidadKg, onSugerir, error, erroresFila, disabled, perfil, conColumnaPerfil }: TablaBachesProps) {
  const [seleccion, setSeleccion] = useState<Set<number>>(new Set());
  const [ajuste, setAjuste] = useState<{ nivel: NivelBache | ""; tempC: string; tiempoMin: string }>({ nivel: "", tempC: "", tiempoMin: "" });
  const estado = estadoBaches(filas, entradaKg);
  const bachesIguales = filas.length > 0 && filas.every((f) => f.pesoEntradaKg === filas[0].pesoEntradaKg);

  function cambiar(i: number, campo: "pesoEntradaKg" | "temperaturaC" | "tiempoMin", valor: string) {
    onChange(filas.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));
  }
  function quitar(i: number) {
    setSeleccion(new Set());
    onChange(filas.filter((_, j) => j !== i));
  }
  function aplicar() {
    onChange(aplicarASeleccionados(filas, seleccion, { nivel: ajuste.nivel || null, tempC: ajuste.tempC, tiempoMin: ajuste.tiempoMin }));
    setAjuste({ nivel: "", tempC: "", tiempoMin: "" });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800">Baches ({filas.length})</h3>
          <p className="text-sm text-gray-600">
            Entra a la tostadora: <span className="font-semibold tabular-nums text-gray-900">{entradaKg !== null ? `${formatearPeso(entradaKg)} kg` : "—"}</span>
            {filas.length > 0 && (
              <>
                {" · "}
                {bachesIguales ? (
                  <span className="tabular-nums">
                    {filas.length} × {formatearPeso(parsearDecimal(filas[0].pesoEntradaKg) ?? 0)} kg
                  </span>
                ) : (
                  <span className="tabular-nums">{filas.length} baches</span>
                )}
              </>
            )}
            {" · "}máx. {formatearPeso(capacidadKg)} kg por bache
          </p>
        </div>
        <Button type="button" variant="outline" className="h-11" onClick={onSugerir} disabled={disabled || entradaKg === null || entradaKg <= 0}>
          Repartir baches
        </Button>
      </div>

      {seleccion.size > 0 && (
        <div role="region" aria-label="Ajustar baches seleccionados" className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-300 bg-gray-50 p-3">
          <p className="w-full text-sm font-medium text-gray-800">
            {seleccion.size} {seleccion.size === 1 ? "bache seleccionado" : "baches seleccionados"} · Ajustar solo los campos que cambian
          </p>
          <label className="space-y-1 text-xs text-gray-600">
            Nivel de tueste
            <select
              aria-label="Nivel de tueste (ajuste)"
              value={ajuste.nivel}
              onChange={(e) => setAjuste((a) => ({ ...a, nivel: e.target.value as NivelBache | "" }))}
              className="block h-11 w-36 rounded-md border border-gray-300 bg-white px-2 text-base text-gray-900"
              disabled={disabled}
            >
              <option value="">—</option>
              {NIVELES_TUESTE.map((n) => (
                <option key={n} value={n}>
                  {etiquetaTueste(n)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs text-gray-600">
            Temperatura °C
            <Input value={ajuste.tempC} onChange={(e) => setAjuste((a) => ({ ...a, tempC: e.target.value }))} inputMode="decimal" autoComplete="off" placeholder="—" className="h-11 w-28 text-base tabular-nums" disabled={disabled} />
          </label>
          <label className="space-y-1 text-xs text-gray-600">
            Tiempo min
            <Input value={ajuste.tiempoMin} onChange={(e) => setAjuste((a) => ({ ...a, tiempoMin: e.target.value }))} inputMode="decimal" autoComplete="off" placeholder="—" className="h-11 w-28 text-base tabular-nums" disabled={disabled} />
          </label>
          <Button type="button" className="h-11" onClick={aplicar} disabled={disabled || (!ajuste.nivel && !ajuste.tempC.trim() && !ajuste.tiempoMin.trim())}>
            Aplicar a los seleccionados
          </Button>
        </div>
      )}

      {filas.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-500">
          No hay baches: indicar los kilos a tostar y pulsar «Repartir baches», o añadir los baches a mano.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-separate border-spacing-y-1.5">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500">
                <th className="w-12 px-1">
                  <label className="flex h-11 w-11 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      className="h-5 w-5"
                      checked={seleccion.size === filas.length}
                      onChange={() => setSeleccion(alternarTodos(seleccion, filas.length))}
                      aria-label="Seleccionar todos los baches"
                      disabled={disabled}
                    />
                  </label>
                </th>
                <th className="w-16 px-1">Bache</th>
                {conColumnaPerfil && <th className="w-24 px-1">{COPY_TUESTE.columnaPerfil}</th>}
                <th className="px-1">Entra (kg)</th>
                <th className="w-32 px-1">{COPY_TUESTE.nivelDeTueste}</th>
                <th className="w-28 px-1">Temperatura</th>
                <th className="w-28 px-1">Tiempo</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                const mensaje = erroresFila?.[i];
                const tempDifiere = difiereDelPerfil(f.temperaturaC, perfil?.tempC);
                const tiempoDifiere = difiereDelPerfil(f.tiempoMin, perfil?.tiempoMin);
                const nivDifiere = nivelDifiere(f.nivel, perfil?.nivel ?? null);
                return (
                  <tr key={i} className={cn(mensaje && "bg-red-50", seleccion.has(i) && "bg-gray-50")}>
                    <td className="px-1">
                      <label className="flex h-11 w-11 cursor-pointer items-center justify-center">
                        <input
                          type="checkbox"
                          className="h-5 w-5"
                          checked={seleccion.has(i)}
                          onChange={() => setSeleccion(alternarSeleccion(seleccion, i))}
                          aria-label={`Seleccionar el bache ${i + 1}`}
                          disabled={disabled}
                        />
                      </label>
                    </td>
                    <td className="px-1 text-sm font-semibold tabular-nums text-gray-600">{i + 1}</td>
                    {conColumnaPerfil && <td className="px-1 text-sm text-gray-700">{f.perfil ?? "—"}</td>}
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
                      <span className={cn("flex h-12 items-center rounded-md border border-gray-200 px-3 text-base", nivDifiere && DIFIERE)} title={nivDifiere ? "Difiere del perfil" : undefined}>
                        {f.nivel ? etiquetaTueste(f.nivel) : perfil?.nivel ? etiquetaTueste(perfil.nivel) : "—"}
                      </span>
                    </td>
                    <td className="px-1">
                      <Input
                        value={f.temperaturaC}
                        onChange={(ev) => cambiar(i, "temperaturaC", ev.target.value)}
                        inputMode="decimal"
                        autoComplete="off"
                        enterKeyHint="next"
                        aria-label={`Bache ${i + 1}, temperatura en grados (opcional)`}
                        title={tempDifiere ? `Difiere del perfil (${perfil?.tempC} °C)` : undefined}
                        className={cn(CELDA, tempDifiere && DIFIERE)}
                        disabled={disabled}
                      />
                    </td>
                    <td className="px-1">
                      <Input
                        value={f.tiempoMin}
                        onChange={(ev) => cambiar(i, "tiempoMin", ev.target.value)}
                        inputMode="decimal"
                        autoComplete="off"
                        enterKeyHint="next"
                        aria-label={`Bache ${i + 1}, tiempo en minutos (opcional)`}
                        title={tiempoDifiere ? `Difiere del perfil (${perfil?.tiempoMin} min)` : undefined}
                        className={cn(CELDA, tiempoDifiere && DIFIERE)}
                        disabled={disabled}
                      />
                    </td>
                    <td className="px-1">
                      <Button type="button" variant="ghost" className="h-11 w-11 p-0 text-gray-500 hover:text-red-600" aria-label={`Quitar el bache ${i + 1}`} onClick={() => quitar(i)} disabled={disabled}>
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
        {filas.length > 0 && (
          <span
            role="status"
            className={cn("inline-flex min-h-8 items-center rounded-full px-3 text-sm font-semibold", estado.cuadra ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800")}
          >
            {estado.cuadra
              ? "Cuadra con los kilos a tostar"
              : estado.diferenciaKg === null
                ? "Falta indicar los kilos a tostar"
                : !estado.filasValidas
                  ? "Completar el peso de cada bache"
                  : estado.diferenciaKg > 0
                    ? `Faltan ${formatearPeso(estado.diferenciaKg)} kg por repartir`
                    : `Sobran ${formatearPeso(-estado.diferenciaKg)} kg`}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
