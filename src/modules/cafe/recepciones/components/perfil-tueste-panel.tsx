"use client";
import { COPY_TUESTE } from "@/modules/cafe/copy";

import { Controller, useFieldArray, useWatch, type Control, type FieldErrors, type UseFormRegister, type UseFormSetValue } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatKg } from "@/modules/core/formato/numeros";
import { etiquetaTueste } from "../../lotes/lib/servicios";
import { diferenciaKgPerfiles, sumaCuadra } from "../lib/perfiles";
import { MAX_PERFILES, NIVELES_TUESTE, type RecepcionFormInput, type RecepcionValues } from "../schemas/recepcion.schema";

const CAMPO = "h-11 text-base";
const numeroOpcional = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));

interface PerfilTuestePanelProps {
  control: Control<RecepcionFormInput, unknown, RecepcionValues>;
  register: UseFormRegister<RecepcionFormInput>;
  setValue: UseFormSetValue<RecepcionFormInput>;
  errors: FieldErrors<RecepcionFormInput>;
  /** Kilos que entran a la tostión (estimado tras la trilla si la hay); `0` mientras no hay peso. */
  kgTostar: number;
  /** Perfil de maquila vigente: valores con los que arranca cada perfil nuevo. */
  predeterminado: { nivel: RecepcionFormInput["nivelTueste"]; tempC: number | null; tiempoMin: number | null };
}

/**
 * Panel «Perfil de tueste» de la recepción de maquila (B-02): `Un perfil para todo el lote` | `Varios perfiles`.
 * Un perfil: nivel, temperatura y tiempo (precargados con el de maquila). Varios: filas «Perfil N» con sus kilos, que
 * deben sumar lo que entra a la tostión.
 */
export function PerfilTuestePanel({ control, register, setValue, errors, kgTostar, predeterminado }: PerfilTuestePanelProps) {
  const modo = useWatch({ control, name: "modoPerfil" }) ?? "uno";
  const nivelTueste = useWatch({ control, name: "nivelTueste" });
  const perfiles = useWatch({ control, name: "perfiles" }) ?? [];
  const { fields, append, remove } = useFieldArray({ control, name: "perfiles" });

  const filaNueva = () => ({
    nivel: predeterminado.nivel ?? ("medio" as const),
    tempC: predeterminado.tempC,
    tiempoMin: predeterminado.tiempoMin,
    kg: null as number | null,
  });

  function cambiarModo(nuevo: "uno" | "varios") {
    setValue("modoPerfil", nuevo, { shouldDirty: true });
    // Al pasar a varios arranca con dos filas: el perfil actual y uno nuevo.
    if (nuevo === "varios" && fields.length === 0) {
      append([
        { ...filaNueva(), nivel: nivelTueste ?? filaNueva().nivel },
        filaNueva(),
      ]);
    }
  }

  const sumaOk = sumaCuadra(perfiles.map((p) => ({ kg: typeof p?.kg === "number" && Number.isFinite(p.kg) ? p.kg : null })), kgTostar);
  const diferencia = diferenciaKgPerfiles(perfiles.map((p) => ({ kg: typeof p?.kg === "number" && Number.isFinite(p.kg) ? p.kg : null })), kgTostar);
  const errorGeneral = errors.perfiles && !Array.isArray(errors.perfiles) ? (errors.perfiles as { message?: string }).message : undefined;
  const errorRoot = (errors.perfiles as { root?: { message?: string } } | undefined)?.root?.message;

  return (
    <div className="space-y-4 rounded-md border border-gray-200 p-3" data-testid="panel-perfil-tueste">
      <div>
        <h3 className="text-sm font-semibold text-gray-800">{COPY_TUESTE.perfilDeTueste}</h3>
        <p className="text-xs text-gray-500">Predeterminado para servicios a terceros.</p>
      </div>

      <div role="radiogroup" aria-label="Perfiles del lote" className="grid grid-cols-2 gap-2">
        {([
          ["uno", "Un perfil para todo el lote"],
          ["varios", "Varios perfiles"],
        ] as const).map(([valor, etiqueta]) => (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={modo === valor}
            onClick={() => cambiarModo(valor)}
            className={cn(
              "min-h-12 rounded-md border px-3 text-sm font-medium transition-colors",
              modo === valor ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
            )}
          >
            {etiqueta}
          </button>
        ))}
      </div>

      {modo === "uno" ? (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label id="rec-tueste-label">{COPY_TUESTE.nivelDeTueste}</Label>
            <Controller
              control={control}
              name="nivelTueste"
              render={({ field }) => (
                <div role="radiogroup" aria-labelledby="rec-tueste-label" className="grid grid-cols-3 gap-2">
                  {NIVELES_TUESTE.map((n) => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={field.value === n}
                      onClick={() => field.onChange(n)}
                      className={cn(
                        "min-h-12 rounded-md border px-3 text-base font-medium transition-colors",
                        field.value === n ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
                      )}
                    >
                      {etiquetaTueste(n)}
                    </button>
                  ))}
                </div>
              )}
            />
            {errors.nivelTueste && <p className="text-xs text-red-500">{errors.nivelTueste.message}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="rec-temp">Temperatura (°C)</Label>
              <Input id="rec-temp" type="number" inputMode="decimal" min={1} max={400} step="any" placeholder="Ej: 222" className={CAMPO} {...register("perfilTempC", { setValueAs: numeroOpcional })} />
              {errors.perfilTempC && <p className="text-xs text-red-500">{errors.perfilTempC.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-tiempo">Tiempo (min)</Label>
              <Input id="rec-tiempo" type="number" inputMode="decimal" min={1} max={120} step="any" placeholder="Ej: 17" className={CAMPO} {...register("perfilTiempoMin", { setValueAs: numeroOpcional })} />
              {errors.perfilTiempoMin && <p className="text-xs text-red-500">{errors.perfilTiempoMin.message}</p>}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {fields.map((f, i) => {
            const e = Array.isArray(errors.perfiles) ? errors.perfiles[i] : undefined;
            return (
              <div key={f.id} className="space-y-3 rounded-md border border-gray-200 bg-gray-50/50 p-3" data-testid="fila-perfil">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-800">{COPY_TUESTE.perfilN(i + 1)}</span>
                  {fields.length > 2 && (
                    <Button type="button" variant="ghost" className="h-9 px-2 text-xs text-red-600" onClick={() => remove(i)}>
                      Quitar
                    </Button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="space-y-1.5">
                    <Label htmlFor={`rec-p${i}-nivel`}>{COPY_TUESTE.nivelDeTueste}</Label>
                    <select
                      id={`rec-p${i}-nivel`}
                      className="h-11 w-full rounded-md border border-gray-300 bg-white px-2 text-base"
                      {...register(`perfiles.${i}.nivel` as const)}
                    >
                      {NIVELES_TUESTE.map((n) => (
                        <option key={n} value={n}>
                          {etiquetaTueste(n)}
                        </option>
                      ))}
                    </select>
                    {e?.nivel && <p className="text-xs text-red-500">{e.nivel.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`rec-p${i}-temp`}>Temperatura (°C)</Label>
                    <Input id={`rec-p${i}-temp`} type="number" inputMode="decimal" step="any" className={CAMPO} {...register(`perfiles.${i}.tempC` as const, { setValueAs: numeroOpcional })} />
                    {e?.tempC && <p className="text-xs text-red-500">{e.tempC.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`rec-p${i}-tiempo`}>Tiempo (min)</Label>
                    <Input id={`rec-p${i}-tiempo`} type="number" inputMode="decimal" step="any" className={CAMPO} {...register(`perfiles.${i}.tiempoMin` as const, { setValueAs: numeroOpcional })} />
                    {e?.tiempoMin && <p className="text-xs text-red-500">{e.tiempoMin.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`rec-p${i}-kg`}>Kilos</Label>
                    <Input id={`rec-p${i}-kg`} type="number" inputMode="decimal" step="any" min={0} className={CAMPO} {...register(`perfiles.${i}.kg` as const, { setValueAs: numeroOpcional })} />
                    {e?.kg && <p className="text-xs text-red-500">{e.kg.message}</p>}
                  </div>
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="outline" className="h-11" disabled={fields.length >= MAX_PERFILES} onClick={() => append(filaNueva())}>
              Agregar perfil
            </Button>
            {kgTostar > 0 && (
              <p role="status" className={cn("text-sm", sumaOk ? "text-gray-600" : "text-amber-700")}>
                {sumaOk
                  ? `Los kilos suman ${formatKg(kgTostar)}.`
                  : `Deben sumar ${formatKg(kgTostar)} · ${diferencia > 0 ? "faltan" : "sobran"} ${formatKg(Math.abs(diferencia))}`}
              </p>
            )}
          </div>
          {(errorGeneral || errorRoot) && <p className="text-xs text-red-500">{errorGeneral ?? errorRoot}</p>}
        </div>
      )}
    </div>
  );
}
