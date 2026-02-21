"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { vacaSchema } from "@/features/vacas/schemas/vaca.schema";
import { createVaca, updateVaca } from "@/features/vacas/actions/vacas.actions";
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
import { DatePicker } from "@/components/shared/date-picker";
import { toast } from "sonner";
import type { Vaca } from "@/types";

const ORIGEN_LABELS: Record<string, string> = {
  finca: "Finca",
  externa: "Externa",
};

const ESTADO_LABELS: Record<string, string> = {
  produccion: "Producción",
  secado: "Secado",
  pre_jardin: "Pre-jardín",
  jardin: "Jardín",
};

interface FormValues {
  vaca_id: number;
  nombre: string;
  origen: "finca" | "externa";
  estado: "produccion" | "secado" | "pre_jardin" | "jardin";
  fecha_compra?: Date | null;
  numero_registro?: string;
  madre_id?: string | null;
}

interface VacaFormProps {
  vaca?: Vaca;
  vacas: Vaca[];
  onSuccess: () => void;
}

export function VacaForm({ vaca, vacas, onSuccess }: VacaFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(vacaSchema) as any,
    defaultValues: {
      vaca_id: vaca?.vaca_id ?? 0,
      nombre: vaca?.nombre ?? "",
      origen: vaca?.origen ?? undefined,
      estado: vaca?.estado ?? undefined,
      fecha_compra: vaca?.fecha_compra ? new Date(vaca.fecha_compra + "T00:00:00") : null,
      numero_registro: vaca?.numero_registro ?? "",
      madre_id: vaca?.madre_id ?? null,
    },
  });

  const origenValue = watch("origen");
  const fechaCompraValue = watch("fecha_compra");
  const madreIdValue = watch("madre_id");

  const vacasDisponibles = vacas.filter((v) => v.id !== vaca?.id);

  const onSubmit = async (data: FormValues) => {
    try {
      const payload = {
        vaca_id: data.vaca_id,
        nombre: data.nombre,
        origen: data.origen,
        estado: data.estado,
        fecha_compra: data.origen === "externa" ? data.fecha_compra : null,
        numero_registro: data.origen === "externa" ? data.numero_registro : undefined,
        madre_id: data.madre_id || null,
      };
      if (vaca) {
        await updateVaca(vaca.id, payload);
        toast.success("Vaca actualizada");
      } else {
        await createVaca(payload);
        toast.success("Vaca creada");
      }
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="vaca_id">ID de la Vaca</Label>
          <Input
            id="vaca_id"
            type="number"
            min="1"
            max="9999"
            placeholder="Ej: 123"
            {...register("vaca_id", { valueAsNumber: true })}
          />
          {errors.vaca_id && (
            <p className="text-sm text-red-500">{errors.vaca_id.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="nombre">Nombre</Label>
          <Input
            id="nombre"
            type="text"
            placeholder="Ej: Vanessa"
            {...register("nombre")}
          />
          {errors.nombre && (
            <p className="text-sm text-red-500">{errors.nombre.message}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Origen</Label>
          <Select
            value={origenValue ?? ""}
            onValueChange={(val) => setValue("origen", val as "finca" | "externa")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar origen" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ORIGEN_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.origen && (
            <p className="text-sm text-red-500">{errors.origen.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Estado</Label>
          <Select
            value={watch("estado") ?? ""}
            onValueChange={(val) =>
              setValue("estado", val as "produccion" | "secado" | "pre_jardin" | "jardin")
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar estado" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(ESTADO_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.estado && (
            <p className="text-sm text-red-500">{errors.estado.message}</p>
          )}
        </div>
      </div>

      {origenValue === "externa" && (
        <>
          <div className="space-y-2">
            <Label>Fecha de compra</Label>
            <DatePicker
              value={fechaCompraValue ?? undefined}
              onChange={(date) => setValue("fecha_compra", date)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="numero_registro">Número de registro</Label>
            <Input
              id="numero_registro"
              type="text"
              placeholder="Ej: REG-0123 (opcional)"
              {...register("numero_registro")}
            />
          </div>
        </>
      )}

      <div className="space-y-2">
        <Label>Madre</Label>
        <Select
          value={madreIdValue ?? "none"}
          onValueChange={(val) => setValue("madre_id", val === "none" ? null : val)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Sin madre registrada" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin madre registrada</SelectItem>
            {vacasDisponibles.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                #{v.vaca_id} — {v.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex gap-2 pt-4">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : vaca ? "Actualizar" : "Crear"}
        </Button>
      </div>
    </form>
  );
}
