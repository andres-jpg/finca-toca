"use client";

import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { actualizarInsumo, crearInsumo } from "../actions/insumos.actions";
import {
  CLASES_INSUMO,
  ETIQUETA_CLASE,
  PRESENTACION_MAX_G,
  PRESENTACION_MIN_G,
  nombreSugeridoInsumo,
  type ClaseInsumo,
} from "../lib/insumos";
import {
  editarInsumoSchema,
  insumoSchema,
  type EditarInsumoFormInput,
  type EditarInsumoValues,
  type InsumoFormInput,
  type InsumoValues,
} from "../schemas/insumo.schema";
import type { InsumoEmpaque } from "../types";
import { etiquetaPresentacion } from "../../tipos/lib/productos";

const CAMPO = "h-11 text-base sm:h-9 sm:text-sm";

/** Mínimo vacío = sin alerta (`null`); un número, tal cual. */
const aMinimo = (v: unknown) => (v === "" || v == null ? null : Number(v));

interface InsumoFormProps {
  /** Presente = edición (solo nombre y mínimo: clase y presentación definen los productos terminados). */
  insumo?: InsumoEmpaque;
  onSuccess: () => void;
}

export function InsumoForm({ insumo, onSuccess }: InsumoFormProps) {
  return insumo ? <EditarInsumoForm insumo={insumo} onSuccess={onSuccess} /> : <CrearInsumoForm onSuccess={onSuccess} />;
}

function CrearInsumoForm({ onSuccess }: { onSuccess: () => void }) {
  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<InsumoFormInput, unknown, InsumoValues>({
    resolver: zodResolver(insumoSchema),
    defaultValues: { nombre: "", stock_minimo: null },
  });
  // Mientras el usuario no escriba su propio nombre, se sugiere «Bolsa 1.000 g» a partir de clase + presentación.
  const [nombreManual, setNombreManual] = useState(false);
  const clase = useWatch({ control, name: "clase" });
  const presentacion = useWatch({ control, name: "presentacion_g" });

  function sugerir(c: ClaseInsumo | undefined, g: number | undefined) {
    if (nombreManual || !c || !g || !Number.isInteger(g) || g <= 0) return;
    setValue("nombre", nombreSugeridoInsumo(c, g), { shouldValidate: false });
  }

  const onSubmit = async (values: InsumoValues) => {
    const r = await crearInsumo(values);
    if (!r.ok) {
      if (r.code === "duplicado") setError("presentacion_g", { message: r.message });
      toast.error(r.message);
      return;
    }
    toast.success("Insumo creado");
    onSuccess();
  };

  const esBolsa = clase === "bolsa";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label>Tipo de insumo</Label>
        <Controller
          control={control}
          name="clase"
          render={({ field }) => (
            <Select
              value={field.value ?? ""}
              onValueChange={(v) => {
                field.onChange(v);
                sugerir(v as ClaseInsumo, presentacion);
              }}
            >
              <SelectTrigger className={CAMPO}>
                <SelectValue placeholder="Bolsa o etiqueta" />
              </SelectTrigger>
              <SelectContent>
                {CLASES_INSUMO.map((c) => (
                  <SelectItem key={c} value={c}>
                    {ETIQUETA_CLASE[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.clase && <p className="text-xs text-red-500">{errors.clase.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="insumo-presentacion">Presentación (gramos)</Label>
        <Input
          id="insumo-presentacion"
          type="number"
          inputMode="numeric"
          min={PRESENTACION_MIN_G}
          max={PRESENTACION_MAX_G}
          step={1}
          placeholder="Ej: 1000"
          className={CAMPO}
          {...register("presentacion_g", {
            valueAsNumber: true,
            onChange: (e) => sugerir(clase, Number(e.target.value)),
          })}
        />
        {errors.presentacion_g && <p className="text-xs text-red-500">{errors.presentacion_g.message}</p>}
        {esBolsa && (
          <p className="text-xs text-gray-500">
            El peso de la bolsa define la presentación: al crearla se generan sus productos terminados (uno por tipo de
            café).
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="insumo-nombre">Nombre</Label>
        <Input
          id="insumo-nombre"
          placeholder="Ej: Bolsa 1.000 g"
          autoComplete="off"
          className={CAMPO}
          {...register("nombre", { onChange: () => setNombreManual(true) })}
        />
        {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
      </div>

      <MinimoField
        id="insumo-minimo"
        error={errors.stock_minimo?.message}
        input={<Input id="insumo-minimo" type="number" inputMode="numeric" min={0} step={1} placeholder="Sin mínimo" className={CAMPO} {...register("stock_minimo", { setValueAs: aMinimo })} />}
      />

      <Button type="submit" className="h-11 w-full sm:h-9" disabled={isSubmitting}>
        {isSubmitting ? "Guardando…" : "Crear insumo"}
      </Button>
    </form>
  );
}

function EditarInsumoForm({ insumo, onSuccess }: { insumo: InsumoEmpaque; onSuccess: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditarInsumoFormInput, unknown, EditarInsumoValues>({
    resolver: zodResolver(editarInsumoSchema),
    defaultValues: { nombre: insumo.nombre, stock_minimo: insumo.stock_minimo },
  });

  const onSubmit = async (values: EditarInsumoValues) => {
    const r = await actualizarInsumo(insumo.articulo_id, values);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success("Insumo actualizado");
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
        {ETIQUETA_CLASE[insumo.clase]} de {etiquetaPresentacion(insumo.presentacionG)}. El tipo y la presentación no se
        cambian: definen los productos terminados.
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="insumo-nombre">Nombre</Label>
        <Input id="insumo-nombre" autoComplete="off" className={CAMPO} {...register("nombre")} />
        {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
      </div>

      <MinimoField
        id="insumo-minimo"
        error={errors.stock_minimo?.message}
        input={<Input id="insumo-minimo" type="number" inputMode="numeric" min={0} step={1} placeholder="Sin mínimo" className={CAMPO} {...register("stock_minimo", { setValueAs: aMinimo })} />}
      />

      <Button type="submit" className="h-11 w-full sm:h-9" disabled={isSubmitting}>
        {isSubmitting ? "Guardando…" : "Guardar cambios"}
      </Button>
    </form>
  );
}

function MinimoField({ id, input, error }: { id: string; input: React.ReactNode; error?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>Stock mínimo (unidades, opcional)</Label>
      {input}
      {error && <p className="text-xs text-red-500">{error}</p>}
      <p className="text-xs text-gray-500">
        Avisa en ámbar cuando el stock baje de este número. Cada insumo tiene el suyo; vacío = sin aviso.
      </p>
    </div>
  );
}
