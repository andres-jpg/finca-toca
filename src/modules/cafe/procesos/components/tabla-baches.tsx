"use client";

import { useState } from "react";
import { Link2, Link2Off, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  agrupar,
  aplicarPedidoATodos,
  desagrupar,
  difiereDelPedido,
  estadoBaches,
  filaVacia,
  gruposDe,
  normalizarGrupos,
  type BacheFila,
} from "../lib/baches-form";
import { MermaBadge } from "../../components/merma-badge";
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
  /** Referencia y tolerancia de la tostión elegida: con ellas cada bache muestra su estado (A-03). */
  referenciaPct?: number | null;
  toleranciaPts?: number | null;
  /** Perfil pedido por el cliente (A-09): con él se resaltan los baches que difieren y se habilita «Aplicar a todos». */
  pedido?: { nivelEtiqueta: string | null; tempC: number | null; tiempoMin: number | null; esCliente: boolean };
}

const CELDA = "h-12 text-base tabular-nums";
/** Campo cuyo valor real difiere del pedido: borde y fondo de acento (no depende solo del color: lleva título y marca). */
const DIFIERE = "border-amber-500 bg-amber-50 ring-1 ring-amber-400";

/**
 * Baches de la tostión (HU-04 c2). La sugerencia reparte el peso en baches de la capacidad de la tostadora y
 * se edita a mano; la merma de cada bache se calcula en vivo y el indicador dice si las entradas suman el peso
 * del proceso (verde) o cuántos kg faltan/sobran (rojo). La salida de la tostión es la suma de las salidas.
 */
export function TablaBaches({
  filas,
  onChange,
  entradaKg,
  capacidadKg,
  onSugerir,
  error,
  erroresFila,
  disabled,
  referenciaPct,
  toleranciaPts,
  pedido,
}: TablaBachesProps) {
  const [modo, setModo] = useState<"individual" | "agrupado">("individual");
  const [seleccion, setSeleccion] = useState<number[]>([]);
  const estado = estadoBaches(filas, entradaKg);
  const grupos = gruposDe(filas);
  const agrupado = modo === "agrupado";
  const mermaLote =
    estado.sumaEntradaKg > 0 && filas.every((f) => parsearDecimal(f.pesoSalidaKg) !== null)
      ? calcularMerma(estado.sumaEntradaKg, estado.sumaSalidaKg)
      : null;

  // Todo cambio pasa por `normalizarGrupos`: reparte el peso de cada grupo entre sus baches y renumera.
  const emitir = (nuevas: BacheFila[]) => onChange(normalizarGrupos(nuevas));
  function cambiar(i: number, campo: "pesoEntradaKg" | "pesoSalidaKg" | "temperaturaC" | "tiempoMin", valor: string) {
    emitir(filas.map((f, j) => (j === i ? { ...f, [campo]: valor } : f)));
  }
  function cambiarGrupo(grupo: number, valor: string) {
    emitir(filas.map((f) => (f.grupo === grupo ? { ...f, pesoGrupoKg: valor } : f)));
  }
  function alternar(i: number) {
    setSeleccion((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]));
  }
  function cambiarModo(m: "individual" | "agrupado") {
    setModo(m);
    setSeleccion([]);
  }
  function quitar(i: number) {
    setSeleccion([]);
    emitir(filas.filter((_, j) => j !== i));
  }

  const hayPedido = pedido && (pedido.tempC !== null || pedido.tiempoMin !== null);
  const textoPedido = pedido
    ? [pedido.nivelEtiqueta, pedido.tempC !== null ? `${formatearPeso(pedido.tempC)} °C` : null, pedido.tiempoMin !== null ? `${formatearPeso(pedido.tiempoMin)} min` : null]
        .filter(Boolean)
        .join(" · ")
    : "";
  const bachesIguales = filas.length > 0 && filas.every((f) => f.pesoEntradaKg === filas[0].pesoEntradaKg);

  return (
    <div className="space-y-4">
      {/* Pedido del cliente (o receta) y referencia de merma. El pedido no se modifica desde aquí. */}
      {(hayPedido || referenciaPct != null) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <div className="space-y-0.5">
            {hayPedido && (
              <p className="text-sm text-amber-950">
                <span className="font-semibold">{pedido?.esCliente ? "Pedido del cliente" : "Receta"}:</span> {textoPedido}
              </p>
            )}
            {referenciaPct != null && (
              <p className="text-sm text-amber-900">
                Merma de referencia: <span className="font-semibold tabular-nums">{formatearPorcentaje(referenciaPct)} %</span>
                {toleranciaPts != null && <span className="tabular-nums"> ± {formatearPeso(toleranciaPts)}</span>}
              </p>
            )}
          </div>
          {hayPedido && (
            <Button
              type="button"
              variant="outline"
              className="h-11 border-amber-300 bg-white"
              disabled={disabled || filas.length === 0}
              onClick={() => emitir(aplicarPedidoATodos(filas, { tempC: pedido?.tempC, tiempoMin: pedido?.tiempoMin }))}
            >
              Aplicar a todos los baches
            </Button>
          )}
        </div>
      )}

      {/* Resumen y modo de pesaje. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800">Baches ({filas.length})</h3>
          <p className="text-sm text-gray-600">
            Entra a la tostadora: <span className="font-semibold tabular-nums text-gray-900">{entradaKg !== null ? `${formatearPeso(entradaKg)} kg` : "—"}</span>
            {filas.length > 0 && (
              <>
                {" · "}
                {bachesIguales ? (
                  <span className="tabular-nums">{filas.length} × {formatearPeso(parsearDecimal(filas[0].pesoEntradaKg) ?? 0)} kg</span>
                ) : (
                  <span className="tabular-nums">{filas.length} baches</span>
                )}
              </>
            )}
            {" · "}máx. {formatearPeso(capacidadKg)} kg por bache
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="radiogroup" aria-label="Pesaje de salida" className="inline-flex overflow-hidden rounded-md border border-gray-300">
            {(["individual", "agrupado"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={modo === m}
                disabled={disabled}
                onClick={() => cambiarModo(m)}
                className={cn(
                  "min-h-11 px-4 text-sm font-medium transition-colors",
                  modo === m ? "bg-gray-900 text-white" : "bg-white text-gray-700 hover:bg-gray-50",
                )}
              >
                {m === "individual" ? "Individual" : "Agrupado"}
              </button>
            ))}
          </div>
          <Button type="button" variant="outline" className="h-11" onClick={onSugerir} disabled={disabled || entradaKg === null || entradaKg <= 0}>
            Sugerir baches
          </Button>
        </div>
      </div>

      {agrupado && (
        <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-gray-600">Marca los baches que pesaste juntos y únelos en un grupo con un solo peso de salida.</p>
            <Button
              type="button"
              className="h-11"
              disabled={disabled || seleccion.length < 2}
              onClick={() => {
                emitir(agrupar(filas, seleccion));
                setSeleccion([]);
              }}
            >
              <Link2 className="mr-2 h-4 w-4" aria-hidden />
              Agrupar seleccionados{seleccion.length >= 2 ? ` (${seleccion.length})` : ""}
            </Button>
          </div>
          {grupos.map((g) => {
            const s = parsearDecimal(g.pesoGrupoKg);
            const merma = s !== null ? calcularMerma(g.entradaKg, s) : null;
            return (
              <div key={g.grupo} className="flex flex-wrap items-center gap-3 rounded-md border border-gray-200 bg-white p-3">
                <div className="min-w-32">
                  <p className="text-sm font-semibold text-gray-800">Grupo {g.grupo}</p>
                  <p className="text-xs text-gray-600">
                    Baches {g.indices.map((i) => i + 1).join(" + ")} · entran {formatearPeso(g.entradaKg)} kg
                  </p>
                </div>
                <Input
                  value={g.pesoGrupoKg}
                  onChange={(ev) => cambiarGrupo(g.grupo, ev.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  enterKeyHint="next"
                  placeholder="Peso conjunto (kg)"
                  aria-label={`Grupo ${g.grupo}, kg de salida del grupo`}
                  className="h-12 w-48 text-lg tabular-nums"
                  disabled={disabled}
                />
                <span className="text-sm tabular-nums text-gray-700">
                  {merma ? `${formatearPorcentaje(merma.mermaPct)} %` : "—"}
                  {merma && (
                    <MermaBadge mermaPct={merma.mermaPct} referenciaPct={referenciaPct} toleranciaPts={toleranciaPts} tipo="tostion" conAyuda={false} className="ml-2" />
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  className="ml-auto h-11"
                  onClick={() => emitir(desagrupar(filas, g.grupo))}
                  disabled={disabled}
                >
                  <Link2Off className="mr-2 h-4 w-4" aria-hidden />
                  Deshacer grupo
                </Button>
              </div>
            );
          })}
          <p className="text-xs text-gray-500">El peso del grupo se reparte entre sus baches en proporción a lo que entró en cada uno.</p>
        </div>
      )}

      {filas.length === 0 ? (
        <p className="rounded-md border border-dashed border-gray-300 px-3 py-6 text-center text-sm text-gray-500">
          No hay baches: indica el peso de entrada y pulsa «Sugerir baches», o añade los baches a mano.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-separate border-spacing-y-1.5">
            <thead>
              <tr className="text-left text-xs font-medium text-gray-500">
                {agrupado && <th className="w-12 px-1"><span className="sr-only">Seleccionar</span></th>}
                <th className="w-10 px-1">Bache</th>
                <th className="px-1">Entra (kg)</th>
                <th className="px-1">Sale (kg)</th>
                <th className="w-32 px-1 text-right">Merma</th>
                <th className="w-28 px-1">Temp. real °C</th>
                <th className="w-28 px-1">Tiempo real min</th>
                <th className="w-12" />
              </tr>
            </thead>
            <tbody>
              {filas.map((f, i) => {
                const e = parsearDecimal(f.pesoEntradaKg);
                const s = parsearDecimal(f.pesoSalidaKg);
                const merma = e !== null && s !== null ? calcularMerma(e, s) : null;
                const mensaje = erroresFila?.[i];
                const enGrupo = f.grupo !== null;
                const tempDifiere = difiereDelPedido(f.temperaturaC, pedido?.tempC);
                const tiempoDifiere = difiereDelPedido(f.tiempoMin, pedido?.tiempoMin);
                return (
                  <tr key={i} className={cn(mensaje && "bg-red-50")}>
                    {agrupado && (
                      <td className="px-1">
                        <label className="flex h-11 w-11 cursor-pointer items-center justify-center">
                          <input
                            type="checkbox"
                            className="h-5 w-5"
                            checked={seleccion.includes(i)}
                            onChange={() => alternar(i)}
                            aria-label={`Seleccionar el bache ${i + 1} para agrupar`}
                            disabled={disabled}
                          />
                        </label>
                      </td>
                    )}
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
                      {enGrupo ? (
                        <div className="flex h-12 items-center gap-2 rounded-md border border-dashed border-gray-300 bg-gray-50 px-3 text-base tabular-nums text-gray-700">
                          {f.pesoSalidaKg || "—"}
                          <span className="rounded-full bg-gray-200 px-2 text-xs font-semibold text-gray-700">Grupo {f.grupo}</span>
                        </div>
                      ) : (
                        <Input
                          value={f.pesoSalidaKg}
                          onChange={(ev) => cambiar(i, "pesoSalidaKg", ev.target.value)}
                          inputMode="decimal"
                          autoComplete="off"
                          enterKeyHint="next"
                          placeholder="Pesar"
                          aria-label={`Bache ${i + 1}, kg de salida`}
                          aria-invalid={Boolean(mensaje)}
                          className={cn(CELDA, "text-lg font-semibold")}
                          disabled={disabled}
                        />
                      )}
                    </td>
                    <td className="px-1 text-right text-sm tabular-nums text-gray-700">
                      {merma ? `${formatearPeso(merma.mermaKg)} kg · ${formatearPorcentaje(merma.mermaPct)} %` : "—"}
                      {merma && (
                        <MermaBadge
                          mermaPct={merma.mermaPct}
                          referenciaPct={referenciaPct}
                          toleranciaPts={toleranciaPts}
                          tipo="tostion"
                          conAyuda={false}
                          className="mt-0.5 block"
                        />
                      )}
                    </td>
                    <td className="px-1">
                      <Input
                        value={f.temperaturaC}
                        onChange={(ev) => cambiar(i, "temperaturaC", ev.target.value)}
                        inputMode="decimal"
                        autoComplete="off"
                        enterKeyHint="next"
                        aria-label={`Bache ${i + 1}, temperatura real en grados (opcional)`}
                        title={tempDifiere ? `Difiere del pedido (${pedido?.tempC} °C)` : undefined}
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
                        aria-label={`Bache ${i + 1}, tiempo real en minutos (opcional)`}
                        title={tiempoDifiere ? `Difiere del pedido (${pedido?.tiempoMin} min)` : undefined}
                        className={cn(CELDA, tiempoDifiere && DIFIERE)}
                        disabled={disabled}
                      />
                    </td>
                    <td className="px-1">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-11 w-11 p-0 text-gray-500 hover:text-red-600"
                        aria-label={`Quitar el bache ${i + 1}`}
                        onClick={() => quitar(i)}
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
        <Button type="button" variant="outline" className="h-11" onClick={() => emitir([...filas, filaVacia()])} disabled={disabled}>
          <Plus className="mr-2 h-4 w-4" />
          Añadir bache
        </Button>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="text-gray-600">
            Entró: <span className="font-semibold tabular-nums text-gray-900">{formatearPeso(estado.sumaEntradaKg)}</span>
            {entradaKg !== null && <> de {formatearPeso(entradaKg)} kg</>}
          </span>
          <span className="text-gray-600">
            Salió: <span className="font-semibold tabular-nums text-gray-900">{formatearPeso(estado.sumaSalidaKg)} kg</span>
          </span>
          <span className="text-gray-600">
            Merma del lote:{" "}
            <span className="font-semibold tabular-nums text-gray-900">{mermaLote ? `${formatearPorcentaje(mermaLote.mermaPct)} %` : "—"}</span>
            {mermaLote && (
              <MermaBadge mermaPct={mermaLote.mermaPct} referenciaPct={referenciaPct} toleranciaPts={toleranciaPts} tipo="tostion" conAyuda={false} className="ml-2" />
            )}
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

      <p className="text-xs text-gray-500">
        Estado de la merma: gris «En rango», rojo «Revisar · alta», ámbar «Verificar · baja». Solo avisa, nunca impide guardar.
        {pedido && hayPedido && " Un campo de temperatura o tiempo resaltado en ámbar difiere del pedido."}
      </p>

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
