"use client";

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
import { toast } from "sonner";
import type { ExtraccionLeche } from "@/types";

interface FormValues {
  fecha: Date;
  litros: number;
}

interface ExtraccionFormProps {
  extraccion?: ExtraccionLeche;
  onSuccess: () => void;
}

export function ExtraccionForm({
  extraccion,
  onSuccess,
}: ExtraccionFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(extraccionSchema) as any,
    defaultValues: {
      fecha: extraccion?.fecha
        ? new Date(extraccion.fecha + "T00:00:00")
        : new Date(),
      litros: extraccion?.litros ?? 0,
    },
  });

  const fechaValue = watch("fecha");

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
          value={fechaValue}
          onChange={(date) => setValue("fecha", date)}
        />
        {errors.fecha && (
          <p className="text-sm text-red-500">{errors.fecha.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="litros">Litros</Label>
        <Input
          id="litros"
          type="number"
          step="0.1"
          min="0"
          max="1000"
          placeholder="0.0"
          {...register("litros", { valueAsNumber: true })}
        />
        {errors.litros && (
          <p className="text-sm text-red-500">{errors.litros.message}</p>
        )}
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
