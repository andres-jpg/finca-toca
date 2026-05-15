"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { recoleccionSchema } from "@/features/recolecciones/schemas/recoleccion.schema";
import {
  createRecoleccion,
  updateRecoleccion,
} from "@/features/recolecciones/actions/recolecciones.actions";
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
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import type { Recoleccion, FincaCooperativa } from "@/types";
import type { RecoleccionFormValues } from "@/features/recolecciones/schemas/recoleccion.schema";

interface RecoleccionFormProps {
  recoleccion?: Recoleccion;
  fincas: FincaCooperativa[];
  lockDate?: boolean;
  showPricing?: boolean;
  onSuccess: () => void;
}

export function RecoleccionForm({
  recoleccion,
  fincas,
  lockDate = false,
  showPricing = true,
  onSuccess,
}: RecoleccionFormProps) {
  const initialFincaId = recoleccion?.finca_id ?? 0;
  const [selectedFincaId, setSelectedFincaId] = useState<number>(initialFincaId);
  const [datePickerValue, setDatePickerValue] = useState<Date>(
    recoleccion?.fecha ? new Date(recoleccion.fecha + "T00:00:00") : new Date()
  );

  const selectedFinca = fincas.find((f) => f.id === selectedFincaId) ?? null;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RecoleccionFormValues>({
    resolver: zodResolver(recoleccionSchema) as any,
    defaultValues: {
      finca_id: initialFincaId || undefined,
      fecha: recoleccion?.fecha ?? formatDate(new Date()),
      litros: recoleccion?.litros ?? undefined,
    },
  });

  const litrosValue = watch("litros");

  const valorEstimado =
    selectedFinca && litrosValue > 0
      ? litrosValue * selectedFinca.precio_litro
      : null;

  const onSubmit = async (data: RecoleccionFormValues) => {
    try {
      if (recoleccion) {
        await updateRecoleccion(recoleccion.id, data);
        toast.success("Recolección actualizada");
      } else {
        await createRecoleccion(data);
        toast.success("Recolección registrada");
      }
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label>Finca</Label>
        <Select
          value={selectedFincaId ? String(selectedFincaId) : ""}
          onValueChange={(val) => {
            const id = parseInt(val, 10);
            setSelectedFincaId(id);
            setValue("finca_id", id);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecciona una finca" />
          </SelectTrigger>
          <SelectContent>
            {fincas.map((f) => (
              <SelectItem key={f.id} value={String(f.id)}>
                {f.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.finca_id && (
          <p className="text-sm text-red-500">{errors.finca_id.message}</p>
        )}
      </div>

      {selectedFinca && showPricing && (
        <div className="rounded-lg bg-teal-50 border border-teal-100 px-3 py-2 text-sm text-teal-800">
          Precio por litro:{" "}
          <span className="font-semibold">
            ${selectedFinca.precio_litro.toLocaleString("es-CO", { minimumFractionDigits: 2 })}
          </span>
        </div>
      )}

      <div className="space-y-2">
        <Label>Fecha</Label>
        {lockDate ? (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            {new Date().toLocaleDateString("es-CO", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })}
          </div>
        ) : (
          <DatePicker
            value={datePickerValue}
            onChange={(date) => {
              setDatePickerValue(date);
              setValue("fecha", formatDate(date));
            }}
          />
        )}
        {errors.fecha && (
          <p className="text-sm text-red-500">{errors.fecha.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="litros">Litros recolectados</Label>
        <Input
          id="litros"
          type="number"
          step="0.01"
          min="0"
          {...register("litros", { valueAsNumber: true })}
          placeholder="0.00"
        />
        {errors.litros && (
          <p className="text-sm text-red-500">{errors.litros.message}</p>
        )}
      </div>

      {valorEstimado !== null && showPricing && (
        <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-sm text-gray-700">
          Valor estimado:{" "}
          <span className="font-semibold text-gray-900">
            ${valorEstimado.toLocaleString("es-CO", { minimumFractionDigits: 0 })}
          </span>
        </div>
      )}

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting
          ? "Guardando..."
          : recoleccion
          ? "Actualizar recolección"
          : "Registrar recolección"}
      </Button>
    </form>
  );
}
