"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { etiquetaTueste } from "../../lotes/lib/servicios";
import { CLASES_TUESTE } from "../../procesos/components/nivel-tueste-chip";
import { NIVELES_TUESTE } from "../../procesos/schemas/proceso.schema";
import { crearVersionPerfilTueste } from "../actions/perfiles.actions";
import { perfilTuesteSchema, type PerfilTuesteFormInput, type PerfilTuesteInput } from "../schemas/perfil-tueste.schema";
import type { PerfilTuesteTipo } from "../types";

interface PerfilTuesteFormProps {
  /** `null` = perfil predeterminado de maquila. */
  tipoCafeId: string | null;
  /** Nombre que se muestra («Excelso», «Maquila»). */
  nombre: string;
  /** Perfil vigente hoy: precarga el formulario. */
  actual: PerfilTuesteTipo | null;
  /** Fecha de hoy (`YYYY-MM-DD`, zona del cliente): fecha por defecto de la nueva versión. */
  fechaHoy: string;
  onSuccess: () => void;
}

export function PerfilTuesteForm({ tipoCafeId, nombre, actual, fechaHoy, onSuccess }: PerfilTuesteFormProps) {
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PerfilTuesteFormInput, unknown, PerfilTuesteInput>({
    resolver: zodResolver(perfilTuesteSchema),
    defaultValues: {
      tipoCafeId,
      nivel: actual?.nivel ?? "medio",
      tempC: actual?.tempC,
      tiempoMin: actual?.tiempoMin,
      vigenteDesde: fechaHoy,
    },
  });

  const onSubmit = async (values: PerfilTuesteInput) => {
    const r = await crearVersionPerfilTueste(values);
    if (!r.ok) {
      if (r.code === "duplicado") setError("vigenteDesde", { message: r.message });
      toast.error(r.message);
      return;
    }
    toast.success("Perfil de tueste guardado");
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <p className="text-sm text-gray-600">
        Perfil de tueste de <span className="font-semibold">{nombre}</span>. El cambio crea una versión nueva: la anterior
        se conserva y los lotes ya recibidos no se modifican.
      </p>

      <div className="space-y-1.5">
        <Label id="perfil-nivel-label">Nivel de tueste</Label>
        <Controller
          control={control}
          name="nivel"
          render={({ field }) => (
            <div role="radiogroup" aria-labelledby="perfil-nivel-label" className="grid grid-cols-3 gap-2">
              {NIVELES_TUESTE.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={field.value === n}
                  onClick={() => field.onChange(n)}
                  className={cn(
                    "min-h-11 rounded-md border px-3 text-base font-semibold transition-colors",
                    field.value === n ? CLASES_TUESTE[n] : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
                    field.value === n && "ring-2 ring-offset-1 ring-gray-900",
                  )}
                >
                  {etiquetaTueste(n)}
                </button>
              ))}
            </div>
          )}
        />
        {errors.nivel && <p className="text-xs text-red-500">{errors.nivel.message}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="perfil-temp">Temperatura (°C)</Label>
          <Input
            id="perfil-temp"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            className="h-11 text-base"
            {...register("tempC", { setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)) })}
          />
          {errors.tempC && <p className="text-xs text-red-500">{errors.tempC.message}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="perfil-tiempo">Tiempo (min)</Label>
          <Input
            id="perfil-tiempo"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            className="h-11 text-base"
            {...register("tiempoMin", { setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)) })}
          />
          {errors.tiempoMin && <p className="text-xs text-red-500">{errors.tiempoMin.message}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="perfil-vigente-desde">Vigente desde</Label>
        <Input id="perfil-vigente-desde" type="date" className="h-11 text-base" {...register("vigenteDesde")} />
        {errors.vigenteDesde && <p className="text-xs text-red-500">{errors.vigenteDesde.message}</p>}
        <p className="text-xs text-gray-500">Rige para los lotes que se reciban desde esta fecha.</p>
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Guardando…" : "Guardar perfil"}
      </Button>
    </form>
  );
}
