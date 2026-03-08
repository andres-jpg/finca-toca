"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { precioSchema, type PrecioFormValues } from "@/features/precios/schemas/precio.schema";
import { setPrecio } from "@/features/precios/actions/precios.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Precio } from "@/types";

interface PrecioConfigProps {
  precioActual: Precio | null;
  historial: Precio[];
}

export function PrecioConfig({ precioActual, historial }: PrecioConfigProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PrecioFormValues>({
    resolver: zodResolver(precioSchema),
  });

  const onSubmit = async (data: PrecioFormValues) => {
    try {
      await setPrecio(data.valor);
      toast.success("Precio actualizado correctamente");
      reset();
    } catch {
      toast.error("Error al guardar el precio");
    }
  };

  return (
    <div className="space-y-6 max-w-lg">
      {/* Precio actual */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">Precio actual por litro</h2>
        {precioActual ? (
          <p className="text-3xl font-bold text-green-600">
            ${precioActual.valor.toLocaleString("es-CO")}
          </p>
        ) : (
          <p className="text-gray-400 italic">Sin precio configurado</p>
        )}
        {precioActual && (
          <p className="text-xs text-gray-400 mt-1">
            Establecido el{" "}
            {format(new Date(precioActual.created_at), "dd/MM/yyyy HH:mm", { locale: es })}
          </p>
        )}
      </div>

      {/* Formulario */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Establecer nuevo precio</h3>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="valor">Precio por litro (COP)</Label>
            <Input
              id="valor"
              type="number"
              step="1"
              min="1"
              placeholder="Ej: 1500"
              {...register("valor", { valueAsNumber: true })}
            />
            {errors.valor && (
              <p className="text-xs text-red-500">{errors.valor.message}</p>
            )}
          </div>
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Guardando..." : "Guardar nuevo precio"}
          </Button>
        </form>
      </div>

      {/* Historial */}
      {historial.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Historial de precios</h3>
          <ul className="divide-y divide-gray-100">
            {historial.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <span className="font-medium text-gray-800">
                  ${p.valor.toLocaleString("es-CO")}
                </span>
                <span className="text-gray-400">
                  {format(new Date(p.created_at), "dd/MM/yyyy HH:mm", { locale: es })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
