"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  abonoSchema,
  type AbonoFormValues,
} from "@/features/arriendos/schemas/arriendo.schema";
import {
  createAbono,
  updateAbono,
} from "@/features/arriendos/actions/arriendos.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePicker } from "@/components/shared/date-picker";
import { formatMoneda } from "@/features/arriendos/lib/moneda";
import { toast } from "sonner";
import type { AbonoArriendo } from "@/types";

interface AbonoFormProps {
  arriendoId: string;
  /** Presente = modo edición. */
  abono?: AbonoArriendo;
  /** Saldo antes de este abono; solo informativo, para no pasarse sin querer. */
  saldoPendiente: number;
  onSuccess: () => void;
  onCancel: () => void;
}

export function AbonoForm({
  arriendoId,
  abono,
  saldoPendiente,
  onSuccess,
  onCancel,
}: AbonoFormProps) {
  const isEditing = !!abono;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AbonoFormValues>({
    resolver: zodResolver(abonoSchema) as any,
    defaultValues: {
      fecha: abono ? new Date(abono.fecha + "T00:00:00") : new Date(),
      valor: abono?.valor ?? undefined,
      observaciones: abono?.observaciones ?? "",
    },
  });

  const fecha = watch("fecha");

  const onSubmit = async (values: AbonoFormValues) => {
    try {
      if (isEditing) {
        await updateAbono(abono.id, values);
        toast.success("Abono actualizado");
      } else {
        await createAbono(arriendoId, values);
        toast.success("Abono registrado y contabilizado en gastos");
      }
      onSuccess();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo guardar el abono"
      );
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4 rounded-lg border border-gray-200 bg-gray-50 p-4"
    >
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
        {isEditing ? "Editar abono" : "Nuevo abono"}
      </p>

      <div className="space-y-1.5">
        <Label>Fecha del abono</Label>
        <DatePicker
          value={fecha}
          onChange={(date) => setValue("fecha", date, { shouldValidate: true })}
        />
        {errors.fecha && <p className="text-xs text-red-500">{errors.fecha.message}</p>}
        <p className="text-xs text-gray-400">
          El gasto en contabilidad se registra con esta fecha.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="valor">Valor abonado ($)</Label>
        <Input
          id="valor"
          type="number"
          min="0"
          step="1"
          placeholder="Ej: 400000"
          {...register("valor", { valueAsNumber: true })}
        />
        {errors.valor && <p className="text-xs text-red-500">{errors.valor.message}</p>}
        {saldoPendiente > 0 && (
          <p className="text-xs text-gray-400">
            Saldo pendiente: {formatMoneda(saldoPendiente)}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="abono-observaciones">Observaciones</Label>
        <Textarea
          id="abono-observaciones"
          rows={2}
          placeholder="Ej: consignación Bancolombia (opcional)"
          {...register("observaciones")}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : isEditing ? "Actualizar" : "Registrar abono"}
        </Button>
      </div>
    </form>
  );
}
