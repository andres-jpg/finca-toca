"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ingresoSchema } from "@/features/ingresos/schemas/ingreso.schema";
import { createIngreso, updateIngreso } from "@/features/ingresos/actions/ingresos.actions";
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
import type { Ingreso, ConceptoIngreso, Vaca } from "@/types";

interface FormValues {
  fecha: Date;
  concepto_id: number;
  subconcepto_id: number;
  valor: number;
  observaciones: string;
}

interface IngresoFormProps {
  ingreso?: Ingreso;
  conceptos: ConceptoIngreso[];
  vacas?: Vaca[];
  onSuccess: () => void;
}

export function IngresoForm({ ingreso, conceptos, vacas = [], onSuccess }: IngresoFormProps) {
  const initialConceptoId = ingreso
    ? (conceptos.find((c) => c.nombre === ingreso.concepto)?.id ?? 0)
    : 0;

  const [selectedConceptoId, setSelectedConceptoId] = useState<number>(initialConceptoId);
  const [selectedVacaId, setSelectedVacaId] = useState<string>("");

  const subconceptos =
    conceptos.find((c) => c.id === selectedConceptoId)?.subconceptos ?? [];

  const conceptoSeleccionado = conceptos.find((c) => c.id === selectedConceptoId);
  const isVentaVacas =
    conceptoSeleccionado?.nombre.toLowerCase() === "venta vacas";

  const selectedVaca = vacas.find((v) => v.id === selectedVacaId) ?? null;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(ingresoSchema) as any,
    defaultValues: {
      fecha: ingreso?.fecha ? new Date(ingreso.fecha + "T00:00:00") : new Date(),
      concepto_id: initialConceptoId,
      subconcepto_id: ingreso?.subconcepto_id ?? 0,
      valor: ingreso?.valor ?? 0,
      observaciones: ingreso?.observaciones ?? "",
    },
  });

  const fechaValue = watch("fecha");
  const subconceptoIdValue = watch("subconcepto_id");

  const handleConceptoChange = (val: string) => {
    const id = parseInt(val, 10);
    setSelectedConceptoId(id);
    setValue("concepto_id", id);
    setValue("subconcepto_id", 0);
    setSelectedVacaId("");
  };

  const onSubmit = async (data: FormValues) => {
    try {
      const payload = {
        fecha: data.fecha,
        subconcepto_id: data.subconcepto_id,
        valor: data.valor,
        observaciones: data.observaciones || undefined,
      };
      if (ingreso) {
        await updateIngreso(ingreso.id, payload);
        toast.success("Ingreso actualizado");
      } else {
        await createIngreso({
          ...payload,
          vacaIdToSell: isVentaVacas && selectedVacaId ? selectedVacaId : undefined,
        });
        toast.success("Ingreso creado");
      }
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label>Fecha</Label>
        <DatePicker
          value={fechaValue}
          onChange={(date) => setValue("fecha", date)}
        />
        {errors.fecha && <p className="text-sm text-red-500">{errors.fecha.message}</p>}
      </div>

      <div className="space-y-2">
        <Label>Concepto</Label>
        <Select
          value={selectedConceptoId ? String(selectedConceptoId) : ""}
          onValueChange={handleConceptoChange}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar concepto" />
          </SelectTrigger>
          <SelectContent>
            {conceptos.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.concepto_id && (
          <p className="text-sm text-red-500">{errors.concepto_id.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Subconcepto</Label>
        <Select
          value={subconceptoIdValue ? String(subconceptoIdValue) : ""}
          onValueChange={(val) => setValue("subconcepto_id", parseInt(val, 10))}
          disabled={!selectedConceptoId}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={
                selectedConceptoId
                  ? "Seleccionar subconcepto"
                  : "Primero selecciona un concepto"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {subconceptos.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.nombre}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.subconcepto_id && (
          <p className="text-sm text-red-500">{errors.subconcepto_id.message}</p>
        )}
      </div>

      {/* Selector de vaca — solo visible en "Venta vacas" y al crear */}
      {isVentaVacas && !ingreso && (
        <div className="space-y-2">
          <Label>Vaca vendida</Label>
          <Select value={selectedVacaId} onValueChange={setSelectedVacaId}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar vaca..." />
            </SelectTrigger>
            <SelectContent>
              {vacas.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  #{v.vaca_id} — {v.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedVaca && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 space-y-1 text-sm mt-1">
              <div className="flex justify-between">
                <span className="text-gray-500">Nº de registro</span>
                <span className="font-medium text-gray-800">
                  {selectedVaca.numero_registro ?? "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Estado actual</span>
                <span className="font-medium text-gray-800">
                  {selectedVaca.estado ?? "—"}
                </span>
              </div>
            </div>
          )}
          <p className="text-xs text-orange-600">
            Al guardar, esta vaca quedará marcada como baja automáticamente.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="valor">Valor ($)</Label>
        <Input
          id="valor"
          type="number"
          step="0.01"
          min="0"
          placeholder="0.00"
          {...register("valor", { valueAsNumber: true })}
        />
        {errors.valor && <p className="text-sm text-red-500">{errors.valor.message}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="observaciones">Observaciones</Label>
        <Textarea
          id="observaciones"
          placeholder="Notas opcionales..."
          {...register("observaciones")}
        />
      </div>

      <div className="flex gap-2 pt-4">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : ingreso ? "Actualizar" : "Crear"}
        </Button>
      </div>
    </form>
  );
}
