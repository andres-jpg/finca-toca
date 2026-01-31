"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ingresoSchema } from "@/features/ingresos/schemas/ingreso.schema";
import { createIngreso, updateIngreso } from "@/features/ingresos/actions/ingresos.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePicker } from "@/components/shared/date-picker";
import { toast } from "sonner";
import { CONCEPTO_OPTIONS } from "@/types";
import type { Ingreso } from "@/types";

interface FormValues {
  fecha: Date;
  concepto: string;
  valor: number;
  observaciones: string;
}

interface IngresoFormProps {
  ingreso?: Ingreso;
  onSuccess: () => void;
}

export function IngresoForm({ ingreso, onSuccess }: IngresoFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(ingresoSchema) as any,
    defaultValues: {
      fecha: ingreso?.fecha ? new Date(ingreso.fecha + "T00:00:00") : new Date(),
      concepto: ingreso?.concepto ?? "",
      valor: ingreso?.valor ?? 0,
      observaciones: ingreso?.observaciones ?? "",
    },
  });

  const fechaValue = watch("fecha");
  const conceptoValue = watch("concepto");

  const onSubmit = async (data: FormValues) => {
    try {
      if (ingreso) {
        await updateIngreso(ingreso.id, data);
        toast.success("Ingreso actualizado");
      } else {
        await createIngreso(data);
        toast.success("Ingreso creado");
      }
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
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
        {errors.fecha && <p className="text-sm text-red-500">{errors.fecha.message}</p>}
      </div>
      <div className="space-y-2">
        <Label>Concepto</Label>
        <Select value={conceptoValue} onValueChange={(val) => setValue("concepto", val)}>
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar concepto" />
          </SelectTrigger>
          <SelectContent>
            {CONCEPTO_OPTIONS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.concepto && <p className="text-sm text-red-500">{errors.concepto.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="valor">Valor ($)</Label>
        <Input
          id="valor"
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          {...register("valor", { valueAsNumber: true })}
        />
        {errors.valor && <p className="text-sm text-red-500">{errors.valor.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="observaciones">Observaciones</Label>
        <Textarea id="observaciones" placeholder="Notas opcionales..." {...register("observaciones")} />
      </div>
      <div className="flex gap-2 pt-4">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : ingreso ? "Actualizar" : "Crear"}
        </Button>
      </div>
    </form>
  );
}
