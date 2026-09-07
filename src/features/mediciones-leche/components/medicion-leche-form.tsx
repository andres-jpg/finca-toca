"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  medicionLecheSchema,
  type MedicionLecheFormValues,
} from "@/features/mediciones-leche/schemas/medicion-leche.schema";
import {
  createMedicionLeche,
  updateMedicionLeche,
  type MedicionLecheRow,
} from "@/features/mediciones-leche/actions/mediciones-leche.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/shared/date-picker";
import { calcularDiasEnLecheEnFecha, type EventoParaDiasEnLeche } from "@/lib/animales/estados";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";

interface MedicionLecheFormProps {
  animalId: string;
  /** Presente = modo edición. */
  medicion?: MedicionLecheRow;
  /** Historial de eventos del animal, para copiar los días en leche a la fecha elegida. */
  eventosPrevios: EventoParaDiasEnLeche[];
  onSuccess: () => void;
  onCancel: () => void;
}

export function MedicionLecheForm({
  animalId,
  medicion,
  eventosPrevios,
  onSuccess,
  onCancel,
}: MedicionLecheFormProps) {
  const isEditing = !!medicion;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<MedicionLecheFormValues>({
    resolver: zodResolver(medicionLecheSchema) as any,
    defaultValues: {
      fecha: medicion ? new Date(medicion.fecha + "T00:00:00") : new Date(),
      litros: medicion?.litros ?? undefined,
    },
  });

  const fecha = watch("fecha");
  // Se recalcula en cada cambio de fecha, en el navegador: es un valor puramente reactivo
  // dentro de un formulario "use client", nunca renderizado en el servidor, así que no hay
  // riesgo de desajuste de hidratación por zona horaria (a diferencia del DEL de la ficha).
  const diasEnLeche =
    fecha && !isNaN(fecha.getTime())
      ? calcularDiasEnLecheEnFecha(eventosPrevios, formatDate(fecha))
      : null;

  const onSubmit = async (values: MedicionLecheFormValues) => {
    try {
      if (isEditing) {
        await updateMedicionLeche(medicion.id, animalId, values);
        toast.success("Medición actualizada");
      } else {
        await createMedicionLeche(animalId, values);
        toast.success("Medición registrada");
      }
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar la medición");
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4"
    >
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {isEditing ? "Editar medición" : "Nueva medición"}
      </p>

      <div className="space-y-1.5">
        <Label>Fecha de la medición</Label>
        <DatePicker
          value={fecha}
          onChange={(date) => setValue("fecha", date, { shouldValidate: true })}
          disableFuture
        />
        {errors.fecha && <p className="text-xs text-red-500">{errors.fecha.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="litros">Litros</Label>
        <Input
          id="litros"
          type="number"
          min="0"
          step="0.1"
          placeholder="Ej: 14.5"
          {...register("litros", { valueAsNumber: true })}
        />
        {errors.litros && <p className="text-xs text-red-500">{errors.litros.message}</p>}
      </div>

      <div className="rounded-md bg-white border border-gray-200 px-3 py-2">
        <p className="text-xs text-gray-500">Días en leche a esa fecha</p>
        <p className="text-sm font-medium text-gray-800 mt-0.5">
          {diasEnLeche === null ? (
            <span className="text-gray-400">Sin parto/aborto registrado antes de esa fecha</span>
          ) : (
            `${diasEnLeche} ${diasEnLeche === 1 ? "día" : "días"}`
          )}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          Se copia solo, a partir del historial de eventos del animal.
        </p>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : isEditing ? "Actualizar" : "Registrar medición"}
        </Button>
      </div>
    </form>
  );
}
