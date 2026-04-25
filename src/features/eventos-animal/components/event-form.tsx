"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { eventoSchema } from "@/features/eventos-animal/schemas/evento.schema";
import { createEventoAnimal } from "@/features/eventos-animal/actions/eventos.actions";
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
import { toast } from "sonner";
import type { TipoEvento } from "@/types";

const TIPO_LABELS: Record<TipoEvento, string> = {
  vacunacion: "Vacunación",
  vitaminacion: "Vitaminación",
  medicamento: "Medicamento",
  enfermedad: "Enfermedad",
  celo: "Celo",
  inseminacion: "Inseminación",
  palpacion: "Palpación",
  confirmacion_prenez: "Confirmación de preñez",
  parto: "Parto",
  observacion: "Observación",
};

interface EventFormProps {
  animalId: string;
  animalTipo: "vaca" | "toro";
  onSuccess: () => void;
}

interface FormValues {
  animal_id: string;
  animal_tipo: "vaca" | "toro";
  tipo_evento: TipoEvento;
  fecha: Date;
  descripcion?: string;
  responsable?: string;
}

export function EventForm({ animalId, animalTipo, onSuccess }: EventFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(eventoSchema) as any,
    defaultValues: {
      animal_id: animalId,
      animal_tipo: animalTipo,
      tipo_evento: undefined,
      fecha: undefined,
      descripcion: "",
      responsable: "",
    },
  });

  const tipoValue = watch("tipo_evento");
  const fechaValue = watch("fecha");

  const onSubmit = async (data: FormValues) => {
    try {
      await createEventoAnimal({
        animal_id: data.animal_id,
        animal_tipo: data.animal_tipo,
        tipo_evento: data.tipo_evento,
        fecha: data.fecha,
        descripcion: data.descripcion,
        responsable: data.responsable,
      });
      toast.success("Evento registrado");
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label>Tipo de evento</Label>
        <Select
          value={tipoValue ?? ""}
          onValueChange={(val) => setValue("tipo_evento", val as TipoEvento)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar tipo" />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(TIPO_LABELS) as [TipoEvento, string][]).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.tipo_evento && (
          <p className="text-sm text-red-500">{errors.tipo_evento.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Fecha</Label>
        <DatePicker
          value={fechaValue}
          onChange={(date) => setValue("fecha", date)}
          placeholder="Seleccionar fecha del evento"
        />
        {errors.fecha && (
          <p className="text-sm text-red-500">{errors.fecha.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="descripcion">Descripción</Label>
        <Textarea
          id="descripcion"
          placeholder="Detalle del evento (opcional)"
          rows={3}
          {...register("descripcion")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="responsable">Responsable</Label>
        <Input
          id="responsable"
          type="text"
          placeholder="Nombre del responsable (opcional)"
          {...register("responsable")}
        />
      </div>

      <div className="flex gap-2 pt-4">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : "Registrar evento"}
        </Button>
      </div>
    </form>
  );
}
