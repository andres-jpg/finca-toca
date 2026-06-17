"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { X } from "lucide-react";
import { rutaSchema } from "@/features/rutas-cooperativa/schemas/ruta.schema";
import { createRuta, updateRuta } from "@/features/rutas-cooperativa/actions/rutas.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { RutaCooperativa, FincaCooperativa } from "@/types";
import type { RutaFormValues } from "@/features/rutas-cooperativa/schemas/ruta.schema";

interface RutaFormProps {
  ruta?: RutaCooperativa;
  fincas: FincaCooperativa[];
  fincaRutaMap: Map<number, string>;
  onSuccess: () => void;
}

export function RutaForm({ ruta, fincas, fincaRutaMap, onSuccess }: RutaFormProps) {
  const initialAssigned = ruta?.fincas ?? [];
  const [assignedFincas, setAssignedFincas] = useState<FincaCooperativa[]>(initialAssigned);

  const assignedIds = assignedFincas.map((f) => f.id);

  const addFinca = (finca: FincaCooperativa) => {
    setAssignedFincas((prev) => [...prev, finca]);
  };

  const removeFinca = (id: number) => {
    setAssignedFincas((prev) => prev.filter((f) => f.id !== id));
  };

  const availableFincas = fincas.filter((f) => {
    if (assignedIds.includes(f.id)) return false;
    const rutaOcupada = fincaRutaMap.get(f.id);
    return !rutaOcupada || rutaOcupada === ruta?.nombre;
  });

  const blockedFincas = fincas.filter((f) => {
    if (assignedIds.includes(f.id)) return false;
    const rutaOcupada = fincaRutaMap.get(f.id);
    return rutaOcupada && rutaOcupada !== ruta?.nombre;
  });

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RutaFormValues>({
    resolver: zodResolver(rutaSchema) as any,
    defaultValues: {
      nombre: ruta?.nombre ?? "",
      finca_ids: initialAssigned.map((f) => f.id),
    },
  });

  const onSubmit = async (data: RutaFormValues) => {
    if (assignedIds.length === 0) {
      toast.error("Debes asignar al menos una finca");
      return;
    }
    try {
      const payload = { nombre: data.nombre, finca_ids: assignedIds };
      if (ruta) {
        await updateRuta(ruta.id, payload);
        toast.success("Ruta actualizada");
      } else {
        await createRuta(payload);
        toast.success("Ruta creada");
      }
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre de la ruta</Label>
        <Input id="nombre" {...register("nombre")} placeholder="Ej: Ruta Norte" />
        {errors.nombre && (
          <p className="text-sm text-red-500">{errors.nombre.message}</p>
        )}
      </div>

      {/* Fincas asignadas */}
      <div className="space-y-2">
        <Label>Fincas asignadas</Label>

        {assignedFincas.length === 0 ? (
          <p className="text-sm text-gray-400 border rounded-lg p-3 bg-gray-50">
            Sin fincas asignadas aún
          </p>
        ) : (
          <div className="space-y-1.5 border rounded-lg p-2 bg-gray-50">
            {assignedFincas.map((finca) => (
              <div
                key={finca.id}
                className="flex items-center gap-2 rounded-lg border border-teal-100 bg-teal-50 px-2.5 py-1.5"
              >
                <span className="text-sm font-medium flex-1">{finca.nombre}</span>
                <button
                  type="button"
                  onClick={() => removeFinca(finca.id)}
                  className="text-gray-400 hover:text-red-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Fincas disponibles para añadir */}
      {availableFincas.length > 0 && (
        <div className="space-y-2">
          <Label className="text-gray-500 font-normal text-xs uppercase tracking-wide">
            Añadir fincas disponibles
          </Label>
          <div className="border rounded-lg p-3 max-h-40 overflow-y-auto space-y-1.5 bg-gray-50">
            {availableFincas.map((finca) => (
              <label key={finca.id} className="flex items-center gap-2.5 py-0.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300 text-teal-600"
                  checked={false}
                  onChange={() => addFinca(finca)}
                />
                <span className="text-sm font-medium">{finca.nombre}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Fincas ocupadas en otras rutas */}
      {blockedFincas.length > 0 && (
        <div className="space-y-1">
          <Label className="text-gray-400 font-normal text-xs uppercase tracking-wide">
            Fincas en otras rutas
          </Label>
          <div className="space-y-0.5 opacity-50">
            {blockedFincas.map((finca) => (
              <div key={finca.id} className="flex items-center gap-2.5 py-0.5">
                <input type="checkbox" className="h-4 w-4" disabled checked={false} onChange={() => {}} />
                <span className="text-sm">
                  {finca.nombre}
                  <span className="ml-1.5 text-xs text-orange-500">
                    ({fincaRutaMap.get(finca.id)})
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Guardando..." : ruta ? "Actualizar ruta" : "Crear ruta"}
      </Button>
    </form>
  );
}
