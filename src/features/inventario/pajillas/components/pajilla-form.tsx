"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { pajillaSchema, type PajillaFormValues } from "@/features/inventario/pajillas/schemas/pajilla.schema";
import {
  createPajillas,
  updatePajilla,
} from "@/features/inventario/pajillas/actions/pajillas.actions";
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
import { RAZAS, RAZA_LABELS } from "@/lib/animales/razas";
import { toast } from "sonner";
import type { AnimalRaza, Pajilla } from "@/types";

interface PajillaFormProps {
  /** Presente = modo edición. */
  pajilla?: Pajilla;
  onSuccess: () => void;
}

export function PajillaForm({ pajilla, onSuccess }: PajillaFormProps) {
  const isEditing = !!pajilla;
  const usadas = pajilla ? pajilla.cantidad - pajilla.cantidad_disponible : 0;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PajillaFormValues>({
    resolver: zodResolver(pajillaSchema) as any,
    defaultValues: {
      toro_nombre: pajilla?.toro_nombre ?? "",
      toro_ref_id: pajilla?.toro_ref_id ?? "",
      raza: pajilla?.raza ?? null,
      proveedor: pajilla?.proveedor ?? "",
      fecha_compra: pajilla
        ? new Date(pajilla.fecha_compra + "T00:00:00")
        : new Date(),
      cantidad: pajilla?.cantidad ?? undefined,
      observaciones: pajilla?.observaciones ?? "",
    },
  });

  const fechaValue = watch("fecha_compra");

  const onSubmit = async (values: PajillaFormValues) => {
    try {
      if (isEditing) {
        await updatePajilla(pajilla.id, values);
        toast.success("Lote actualizado");
      } else {
        await createPajillas(values);
        toast.success("Pajillas registradas correctamente");
      }
      onSuccess();
    } catch (err: any) {
      toast.error(err.message ?? "Error al guardar el lote");
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
          <Label>Raza</Label>
          <Select
            value={watch("raza") ?? "none"}
            onValueChange={(val) =>
              setValue("raza", val === "none" ? null : (val as AnimalRaza))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar raza (opcional)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin definir</SelectItem>
              {RAZAS.map((r) => (
                <SelectItem key={r} value={r}>
                  {RAZA_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            min={isEditing ? usadas : 1}
            placeholder="Ej: 10"
            {...register("cantidad", { valueAsNumber: true })}
          />
          {errors.cantidad && (
            <p className="text-xs text-red-500">{errors.cantidad.message}</p>
          )}
          {isEditing && usadas > 0 && (
            <p className="text-xs text-gray-400">
              Ya se han usado {usadas} pajilla(s) de este lote; al cambiar la cantidad
              inicial se recalculan las disponibles conservando las usadas.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="proveedor">Proveedor</Label>
        <Input
          id="proveedor"
          placeholder="Ej: Genética Colombiana S.A.S."
          {...register("proveedor")}
        />
        {errors.proveedor && (
          <p className="text-xs text-red-500">{errors.proveedor.message}</p>
        )}
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
          {isSubmitting ? "Guardando..." : isEditing ? "Actualizar lote" : "Guardar"}
        </Button>
      </div>
    </form>
  );
}
