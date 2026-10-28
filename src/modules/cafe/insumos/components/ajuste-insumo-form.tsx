"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ajustarInsumo } from "../actions/insumos.actions";
import { ajusteFormSchema, cantidadAjuste, type AjusteFormInput, type AjusteFormValues } from "../schemas/insumo.schema";
import type { InsumoEmpaque } from "../types";

const CAMPO = "h-11 text-base sm:h-9 sm:text-sm";

interface AjusteInsumoFormProps {
  insumo: InsumoEmpaque;
  onSuccess: () => void;
}

/** Corrección de stock (solo owner/admin): un movimiento «ajuste» con observación obligatoria. */
export function AjusteInsumoForm({ insumo, onSuccess }: AjusteInsumoFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<AjusteFormInput, unknown, AjusteFormValues>({
    resolver: zodResolver(ajusteFormSchema),
    defaultValues: { observaciones: "" },
  });

  const onSubmit = async (values: AjusteFormValues) => {
    const r = await ajustarInsumo({
      articuloId: insumo.articulo_id,
      cantidad: cantidadAjuste(values),
      observaciones: values.observaciones,
    });
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success("Ajuste registrado");
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
        <span className="font-medium text-gray-800">{insumo.nombre}</span> · stock actual{" "}
        {insumo.stock.toLocaleString("es-CO")}. El stock no se edita: el ajuste queda como un movimiento en el kardex.
      </p>

      <div className="space-y-1.5">
        <Label>El ajuste…</Label>
        <Controller
          control={control}
          name="direccion"
          render={({ field }) => (
            <Select value={field.value ?? ""} onValueChange={field.onChange}>
              <SelectTrigger className={CAMPO}>
                <SelectValue placeholder="Aumenta o disminuye el stock" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aumenta">Aumenta el stock</SelectItem>
                <SelectItem value="disminuye">Disminuye el stock</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        {errors.direccion && <p className="text-xs text-red-500">{errors.direccion.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ajuste-cantidad">Cantidad (unidades)</Label>
        <Input
          id="ajuste-cantidad"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          className={CAMPO}
          {...register("cantidad", { valueAsNumber: true })}
        />
        {errors.cantidad && <p className="text-xs text-red-500">{errors.cantidad.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ajuste-observaciones">Motivo del ajuste</Label>
        <Textarea
          id="ajuste-observaciones"
          rows={3}
          placeholder="Ej: conteo físico del 02/11, faltaban 12 bolsas"
          {...register("observaciones")}
        />
        {errors.observaciones && <p className="text-xs text-red-500">{errors.observaciones.message}</p>}
      </div>

      <Button type="submit" className="h-11 w-full sm:h-9" disabled={isSubmitting}>
        {isSubmitting ? "Guardando…" : "Registrar ajuste"}
      </Button>
    </form>
  );
}
