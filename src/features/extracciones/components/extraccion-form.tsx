"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { extraccionSchema } from "@/features/extracciones/schemas/extraccion.schema";
import {
  createExtraccion,
  updateExtraccion,
} from "@/features/extracciones/actions/extracciones.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/shared/date-picker";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import type { ExtraccionLeche } from "@/types";

interface FormValues {
  fecha: string;
  litros_cantina: number;
  litros_cria: number;
}

interface ExtraccionFormProps {
  extraccion?: ExtraccionLeche;
  onSuccess: () => void;
}

export function ExtraccionForm({
  extraccion,
  onSuccess,
}: ExtraccionFormProps) {
  const [datePickerValue, setDatePickerValue] = useState<Date>(
    extraccion?.fecha ? new Date(extraccion.fecha + "T00:00:00") : new Date()
  );

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(extraccionSchema) as any,
    defaultValues: {
      fecha: extraccion?.fecha ?? formatDate(new Date()),
      litros_cantina: extraccion?.litros_cantina ?? 0,
      litros_cria: extraccion?.litros_cria ?? 0,
    },
  });

  const cantina = watch("litros_cantina");
  const cria = watch("litros_cria");
  const total = (Number(cantina) || 0) + (Number(cria) || 0);

  const onSubmit = async (data: FormValues) => {
    try {
      if (extraccion) {
        await updateExtraccion(extraccion.id, data);
        toast.success("Extracción actualizada");
      } else {
        await createExtraccion(data);
        toast.success("Extracción creada");
      }
      onSuccess();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Error inesperado"
      );
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label>Fecha</Label>
        <DatePicker
          value={datePickerValue}
          onChange={(date) => {
            setDatePickerValue(date);
            setValue("fecha", formatDate(date));
          }}
        />
        {errors.fecha && (
          <p className="text-sm text-red-500">{errors.fecha.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="litros_cantina">Cantina</Label>
          <Input
            id="litros_cantina"
            type="number"
            step="0.1"
            min="0"
            max="1000"
            placeholder="0.0"
            {...register("litros_cantina", { valueAsNumber: true })}
          />
          <p className="text-xs text-gray-400">Leche que se vende — genera el ingreso.</p>
          {errors.litros_cantina && (
            <p className="text-sm text-red-500">{errors.litros_cantina.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="litros_cria">Cría</Label>
          <Input
            id="litros_cria"
            type="number"
            step="0.1"
            min="0"
            max="1000"
            placeholder="0.0"
            {...register("litros_cria", { valueAsNumber: true })}
          />
          <p className="text-xs text-gray-400">
            Leche que se queda en la finca — genera el gasto.
          </p>
          {errors.litros_cria && (
            <p className="text-sm text-red-500">{errors.litros_cria.message}</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 flex items-center justify-between">
        <span className="text-xs text-gray-500">Total extraído</span>
        <span className="text-sm font-semibold text-gray-800">{total.toFixed(1)} L</span>
      </div>

      <div className="flex gap-2 pt-4">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting
            ? "Guardando..."
            : extraccion
              ? "Actualizar"
              : "Crear"}
        </Button>
      </div>
    </form>
  );
}
