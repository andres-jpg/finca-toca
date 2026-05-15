"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { usarPajillasSchema, type UsarPajillasFormValues } from "@/features/inventario/pajillas/schemas/pajilla.schema";
import { usarPajillas } from "@/features/inventario/pajillas/actions/pajillas.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { Pajilla } from "@/types";

interface UsarPajillasFormProps {
  pajilla: Pajilla;
  onSuccess: () => void;
}

export function UsarPajillasForm({ pajilla, onSuccess }: UsarPajillasFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UsarPajillasFormValues>({
    resolver: zodResolver(usarPajillasSchema) as any,
    defaultValues: { cantidad: 1 },
  });

  const onSubmit = async (values: UsarPajillasFormValues) => {
    try {
      await usarPajillas(pajilla.id, values.cantidad);
      toast.success(
        `${values.cantidad} pajilla(s) de ${pajilla.toro_nombre} registradas como usadas`
      );
      onSuccess();
    } catch (err: any) {
      toast.error(err.message ?? "Error al registrar el uso");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-1">
        <p className="text-sm font-medium text-amber-800">Lote seleccionado</p>
        <p className="text-sm text-amber-700">
          <span className="font-semibold">{pajilla.toro_nombre}</span>{" "}
          <span className="text-amber-500">({pajilla.toro_ref_id})</span>
        </p>
        <p className="text-sm text-amber-700">
          Disponibles:{" "}
          <span className="font-semibold">{pajilla.cantidad_disponible}</span> de{" "}
          {pajilla.cantidad} pajillas
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cantidad_usar">Cantidad a usar</Label>
        <Input
          id="cantidad_usar"
          type="number"
          min={1}
          max={pajilla.cantidad_disponible}
          {...register("cantidad", { valueAsNumber: true })}
        />
        {errors.cantidad && (
          <p className="text-xs text-red-500">{errors.cantidad.message}</p>
        )}
        <p className="text-xs text-gray-400">
          Máximo {pajilla.cantidad_disponible} pajilla(s) disponibles en este lote
        </p>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting || pajilla.cantidad_disponible === 0}>
          {isSubmitting ? "Registrando..." : "Registrar uso"}
        </Button>
      </div>
    </form>
  );
}
