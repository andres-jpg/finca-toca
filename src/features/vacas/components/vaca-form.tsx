"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { vacaSchema } from "@/features/vacas/schemas/vaca.schema";
import {
  createVaca,
  updateVaca,
} from "@/features/vacas/actions/vacas.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Vaca } from "@/types";

interface FormValues {
  vaca_id: number;
  nombre: string;
}

interface VacaFormProps {
  vaca?: Vaca;
  onSuccess: () => void;
}

export function VacaForm({ vaca, onSuccess }: VacaFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(vacaSchema) as any,
    defaultValues: {
      vaca_id: vaca?.vaca_id ?? 0,
      nombre: vaca?.nombre ?? "",
    },
  });

  const onSubmit = async (data: FormValues) => {
    try {
      if (vaca) {
        await updateVaca(vaca.id, data);
        toast.success("Vaca actualizada");
      } else {
        await createVaca(data);
        toast.success("Vaca creada");
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
        <Label htmlFor="vaca_id">ID de la Vaca</Label>
        <Input
          id="vaca_id"
          type="number"
          min="1"
          max="9999"
          placeholder="Ej: 123"
          {...register("vaca_id", { valueAsNumber: true })}
        />
        {errors.vaca_id && (
          <p className="text-sm text-red-500">{errors.vaca_id.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre</Label>
        <Input
          id="nombre"
          type="text"
          placeholder="Ej: Vanessa"
          {...register("nombre")}
        />
        {errors.nombre && (
          <p className="text-sm text-red-500">{errors.nombre.message}</p>
        )}
      </div>

      <div className="flex gap-2 pt-4">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : vaca ? "Actualizar" : "Crear"}
        </Button>
      </div>
    </form>
  );
}
