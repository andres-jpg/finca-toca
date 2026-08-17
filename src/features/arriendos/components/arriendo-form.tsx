"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  arriendoSchema,
  type ArriendoFormValues,
} from "@/features/arriendos/schemas/arriendo.schema";
import {
  createArriendo,
  updateArriendo,
} from "@/features/arriendos/actions/arriendos.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/shared/date-picker";
import { toast } from "sonner";
import type { Arriendo } from "@/types";

const ANIO_ACTUAL = new Date().getFullYear();

interface ArriendoFormProps {
  /** Presente = modo edición. */
  arriendo?: Arriendo;
  onSuccess: () => void;
}

export function ArriendoForm({ arriendo, onSuccess }: ArriendoFormProps) {
  const isEditing = !!arriendo;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ArriendoFormValues>({
    resolver: zodResolver(arriendoSchema) as any,
    defaultValues: {
      arrendatario: arriendo?.arrendatario ?? "",
      finca_nombre: arriendo?.finca_nombre ?? "",
      fecha_inicio: arriendo
        ? new Date(arriendo.fecha_inicio + "T00:00:00")
        : new Date(),
      fecha_fin: arriendo ? new Date(arriendo.fecha_fin + "T00:00:00") : undefined,
      canon: arriendo?.canon ?? undefined,
      observaciones: arriendo?.observaciones ?? "",
    },
  });

  const fechaInicio = watch("fecha_inicio");
  const fechaFin = watch("fecha_fin");

  const onSubmit = async (values: ArriendoFormValues) => {
    try {
      if (isEditing) {
        await updateArriendo(arriendo.id, values);
        toast.success("Arriendo actualizado");
      } else {
        await createArriendo(values);
        toast.success("Arriendo registrado");
      }
      onSuccess();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo guardar el arriendo"
      );
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="arrendatario">Arrendatario</Label>
        <Input
          id="arrendatario"
          placeholder="Ej: Juan Pérez"
          {...register("arrendatario")}
        />
        {errors.arrendatario && (
          <p className="text-xs text-red-500">{errors.arrendatario.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="finca_nombre">Nombre de la finca</Label>
        <Input
          id="finca_nombre"
          placeholder="Ej: El Recodo"
          {...register("finca_nombre")}
        />
        {errors.finca_nombre && (
          <p className="text-xs text-red-500">{errors.finca_nombre.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Fecha de inicio</Label>
          <DatePicker
            value={fechaInicio}
            onChange={(date) =>
              setValue("fecha_inicio", date, { shouldValidate: true })
            }
            toYear={ANIO_ACTUAL + 10}
          />
          {errors.fecha_inicio && (
            <p className="text-xs text-red-500">{errors.fecha_inicio.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Fecha de fin</Label>
          <DatePicker
            value={fechaFin}
            onChange={(date) => setValue("fecha_fin", date, { shouldValidate: true })}
            placeholder="Seleccionar fecha"
            toYear={ANIO_ACTUAL + 10}
          />
          {errors.fecha_fin && (
            <p className="text-xs text-red-500">{errors.fecha_fin.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="canon">Valor del canon ($)</Label>
        <Input
          id="canon"
          type="number"
          min="0"
          step="1"
          placeholder="Ej: 1200000"
          {...register("canon", { valueAsNumber: true })}
        />
        {errors.canon && <p className="text-xs text-red-500">{errors.canon.message}</p>}
        <p className="text-xs text-gray-400">
          Es el total contra el que se descuentan los abonos: el saldo pendiente se calcula
          como canon menos lo abonado.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="observaciones">Observaciones</Label>
        <Textarea
          id="observaciones"
          rows={3}
          placeholder="Notas del contrato (opcional)..."
          {...register("observaciones")}
        />
      </div>

      <div className="flex justify-end pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? "Guardando..."
            : isEditing
              ? "Actualizar arriendo"
              : "Guardar arriendo"}
        </Button>
      </div>
    </form>
  );
}
