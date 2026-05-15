"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
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
  /** finca_id → nombre de la ruta a la que ya pertenece */
  fincaRutaMap: Map<number, string>;
  onSuccess: () => void;
}

export function RutaForm({ ruta, fincas, fincaRutaMap, onSuccess }: RutaFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RutaFormValues>({
    resolver: zodResolver(rutaSchema) as any,
    defaultValues: {
      nombre: ruta?.nombre ?? "",
      finca_ids: ruta?.fincas.map((f) => f.id) ?? [],
    },
  });

  const selectedIds = useWatch({ control, name: "finca_ids" }) ?? [];

  const toggleFinca = (id: number, checked: boolean) => {
    if (checked) {
      setValue("finca_ids", [...selectedIds, id]);
    } else {
      setValue("finca_ids", selectedIds.filter((fid) => fid !== id));
    }
  };

  const onSubmit = async (data: RutaFormValues) => {
    try {
      if (ruta) {
        await updateRuta(ruta.id, data);
        toast.success("Ruta actualizada");
      } else {
        await createRuta(data);
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
        <Input
          id="nombre"
          {...register("nombre")}
          placeholder="Ej: Ruta Norte"
        />
        {errors.nombre && (
          <p className="text-sm text-red-500">{errors.nombre.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Fincas asignadas</Label>
        <div className="border rounded-lg p-3 max-h-52 overflow-y-auto space-y-2 bg-gray-50">
          {fincas.length === 0 ? (
            <p className="text-sm text-gray-400">No hay fincas registradas</p>
          ) : (
            fincas.map((finca) => {
              const rutaOcupada = fincaRutaMap.get(finca.id);
              // Finca ya en otra ruta (no la que estamos editando)
              const disabled = Boolean(rutaOcupada && rutaOcupada !== ruta?.nombre);
              return (
                <label
                  key={finca.id}
                  className={`flex items-center gap-2.5 py-0.5 ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-teal-600"
                    checked={selectedIds.includes(finca.id)}
                    disabled={disabled}
                    onChange={(e) => toggleFinca(finca.id, e.target.checked)}
                  />
                  <span className="text-sm">
                    <span className="font-medium">{finca.nombre}</span>
                    {disabled && (
                      <span className="ml-1.5 text-xs text-orange-500">
                        ({rutaOcupada})
                      </span>
                    )}
                  </span>
                </label>
              );
            })
          )}
        </div>
        {errors.finca_ids && (
          <p className="text-sm text-red-500">{errors.finca_ids.message}</p>
        )}
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Guardando..." : ruta ? "Actualizar ruta" : "Crear ruta"}
      </Button>
    </form>
  );
}
