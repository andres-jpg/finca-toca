"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { actualizarTipoCafe, crearTipoCafe } from "../actions/tipos.actions";
import { tipoCafeSchema, type TipoCafeFormInput, type TipoCafeInput } from "../schemas/tipo-cafe.schema";
import type { TipoCafe } from "../types";

interface TipoCafeFormProps {
  /** Presente = modo edición. */
  tipo?: TipoCafe;
  onSuccess: () => void;
}

export function TipoCafeForm({ tipo, onSuccess }: TipoCafeFormProps) {
  const esEdicion = !!tipo;
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<TipoCafeFormInput, unknown, TipoCafeInput>({
    resolver: zodResolver(tipoCafeSchema),
    defaultValues: { nombre: tipo?.nombre ?? "" },
  });

  const onSubmit = async (values: TipoCafeInput) => {
    const r = esEdicion ? await actualizarTipoCafe(tipo.id, values) : await crearTipoCafe(values);
    if (!r.ok) {
      if (r.code === "duplicado") setError("nombre", { message: r.message });
      toast.error(r.message);
      return;
    }
    toast.success(esEdicion ? "Tipo de café actualizado" : "Tipo de café creado");
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="tipo-cafe-nombre">Nombre</Label>
        <Input id="tipo-cafe-nombre" placeholder="Ej: Excelso" autoComplete="off" autoFocus {...register("nombre")} />
        {errors.nombre && <p className="text-xs text-red-500">{errors.nombre.message}</p>}
        {!esEdicion && (
          <p className="text-xs text-gray-500">
            Al crearlo se generan sus productos terminados, uno por cada presentación de bolsa.
          </p>
        )}
        {esEdicion && (
          <p className="text-xs text-gray-500">El nombre también cambia en sus productos terminados.</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Guardando…" : esEdicion ? "Guardar cambios" : "Crear tipo de café"}
      </Button>
    </form>
  );
}
