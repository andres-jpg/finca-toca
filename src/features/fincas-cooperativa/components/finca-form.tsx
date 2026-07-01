"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { fincaSchema } from "@/features/fincas-cooperativa/schemas/finca.schema";
import { createFinca, updateFinca } from "@/features/fincas-cooperativa/actions/fincas.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { FincaCooperativa, RutaCooperativa } from "@/types";
import type { FincaFormValues } from "@/features/fincas-cooperativa/schemas/finca.schema";

interface FincaFormProps {
  finca?: FincaCooperativa;
  rutas: RutaCooperativa[];
  onSuccess: () => void;
}

export function FincaForm({ finca, rutas, onSuccess }: FincaFormProps) {
  const initialRutaId = finca?.ruta_nombre
    ? (rutas.find((r) => r.nombre === finca.ruta_nombre)?.id ?? null)
    : null;

  const [selectedRutaId, setSelectedRutaId] = useState<number | null>(initialRutaId);

  const [selectedMetodoPago, setSelectedMetodoPago] = useState<'conductor' | 'punto_venta' | 'gerente'>(
    finca?.metodo_pago ?? 'conductor'
  );

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FincaFormValues>({
    resolver: zodResolver(fincaSchema) as any,
    defaultValues: {
      nombre: finca?.nombre ?? "",
      precio_litro: finca?.precio_litro ?? 0,
      activa: finca?.activa ?? true,
      ruta_id: initialRutaId,
      metodo_pago: finca?.metodo_pago ?? 'conductor',
    },
  });

  const onSubmit = async (data: FincaFormValues) => {
    try {
      if (finca) {
        await updateFinca(finca.id, data);
        toast.success("Finca actualizada");
      } else {
        await createFinca(data);
        toast.success("Finca creada");
      }
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre</Label>
        <Input id="nombre" {...register("nombre")} placeholder="Nombre de la finca" />
        {errors.nombre && <p className="text-sm text-red-500">{errors.nombre.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="precio_litro">Precio por litro ($)</Label>
        <Input
          id="precio_litro"
          type="number"
          step="0.01"
          min="0"
          {...register("precio_litro", { valueAsNumber: true })}
          placeholder="0.00"
        />
        {errors.precio_litro && <p className="text-sm text-red-500">{errors.precio_litro.message}</p>}
      </div>

      <div className="space-y-2">
        <Label>Ruta (opcional)</Label>
        <Select
          value={selectedRutaId ? String(selectedRutaId) : "ninguna"}
          onValueChange={(val) => {
            const id = val === "ninguna" ? null : parseInt(val, 10);
            setSelectedRutaId(id);
            setValue("ruta_id", id);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Sin ruta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ninguna">Sin ruta</SelectItem>
            {rutas.map((r) => (
              <SelectItem key={r.id} value={String(r.id)}>
                {r.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Método de pago</Label>
        <Select
          value={selectedMetodoPago}
          onValueChange={(val) => {
            const v = val as 'conductor' | 'punto_venta' | 'gerente';
            setSelectedMetodoPago(v);
            setValue("metodo_pago", v);
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="conductor">Conductor</SelectItem>
            <SelectItem value="punto_venta">Punto de venta</SelectItem>
            <SelectItem value="gerente">Gerente</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <input
          id="activa"
          type="checkbox"
          className="h-4 w-4 rounded border-gray-300"
          {...register("activa")}
        />
        <Label htmlFor="activa">Finca activa</Label>
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Guardando..." : finca ? "Actualizar finca" : "Crear finca"}
      </Button>
    </form>
  );
}
