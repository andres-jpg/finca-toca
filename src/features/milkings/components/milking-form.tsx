"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { milkingSchema } from "@/features/milkings/schemas/milking.schema";
import { createMilking, updateMilking } from "@/features/milkings/actions/milkings.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/shared/date-picker";
import { toast } from "sonner";
import type { Milking } from "@/types";

interface FormValues {
  liters: number;
  date: Date;
  observations: string;
}

interface MilkingFormProps {
  milking?: Milking;
  onSuccess: () => void;
}

export function MilkingForm({ milking, onSuccess }: MilkingFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(milkingSchema) as any,
    defaultValues: {
      liters: milking?.liters ?? 0,
      date: milking?.date ? new Date(milking.date + "T00:00:00") : new Date(),
      observations: milking?.observations ?? "",
    },
  });

  const dateValue = watch("date");

  const onSubmit = async (data: FormValues) => {
    try {
      if (milking) {
        await updateMilking(milking.id, data);
        toast.success("Ordeño actualizado");
      } else {
        await createMilking(data);
        toast.success("Ordeño creado");
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
          value={dateValue}
          onChange={(date) => setValue("date", date)}
        />
        {errors.date && <p className="text-sm text-red-500">{errors.date.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="liters">Litros</Label>
        <Input
          id="liters"
          type="number"
          step="0.1"
          min="0"
          placeholder="0"
          {...register("liters", { valueAsNumber: true })}
        />
        {errors.liters && <p className="text-sm text-red-500">{errors.liters.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="observations">Observaciones</Label>
        <Textarea id="observations" placeholder="Notas opcionales..." {...register("observations")} />
      </div>
      <div className="flex gap-2 pt-4">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : milking ? "Actualizar" : "Crear"}
        </Button>
      </div>
    </form>
  );
}
