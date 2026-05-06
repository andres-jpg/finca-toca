"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { pajillaSchema, type PajillaFormValues } from "@/features/inventario/pajillas/schemas/pajilla.schema";
import { createPajillas } from "@/features/inventario/pajillas/actions/pajillas.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/shared/date-picker";
import { toast } from "sonner";

interface PajillaFormProps {
  onSuccess: () => void;
}

export function PajillaForm({ onSuccess }: PajillaFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PajillaFormValues>({
    resolver: zodResolver(pajillaSchema) as any,
    defaultValues: {
      toro_nombre: "",
      toro_ref_id: "",
      fecha_compra: new Date(),
      cantidad: undefined,
      observaciones: "",
    },
  });

  const fechaValue = watch("fecha_compra");

  const onSubmit = async (values: PajillaFormValues) => {
    try {
      await createPajillas(values);
      toast.success("Pajillas registradas correctamente");
      onSuccess();
    } catch (err: any) {
      toast.error(err.message ?? "Error al registrar las pajillas");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="toro_nombre">Nombre del toro</Label>
          <Input
            id="toro_nombre"
            placeholder="Ej: El Güero"
            {...register("toro_nombre")}
          />
          {errors.toro_nombre && (
            <p className="text-xs text-red-500">{errors.toro_nombre.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="toro_ref_id">ID del toro</Label>
          <Input
            id="toro_ref_id"
            placeholder="Ej: TRO-001A"
            {...register("toro_ref_id")}
          />
          {errors.toro_ref_id && (
            <p className="text-xs text-red-500">{errors.toro_ref_id.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Fecha de compra</Label>
          <DatePicker
            value={fechaValue}
            onChange={(date) => setValue("fecha_compra", date as Date, { shouldValidate: true })}
          />
          {errors.fecha_compra && (
            <p className="text-xs text-red-500">{errors.fecha_compra.message}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cantidad">Cantidad de pajillas</Label>
          <Input
            id="cantidad"
            type="number"
            min={1}
            placeholder="Ej: 10"
            {...register("cantidad", { valueAsNumber: true })}
          />
          {errors.cantidad && (
            <p className="text-xs text-red-500">{errors.cantidad.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="observaciones">Observaciones</Label>
        <Textarea
          id="observaciones"
          placeholder="Notas adicionales sobre este lote..."
          rows={3}
          {...register("observaciones")}
        />
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
