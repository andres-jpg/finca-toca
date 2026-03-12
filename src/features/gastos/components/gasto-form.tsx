"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { gastoSchema } from "@/features/gastos/schemas/gasto.schema";
import { createGasto, updateGasto } from "@/features/gastos/actions/gastos.actions";
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
import type { Gasto, ConceptoGasto } from "@/types";

interface FormValues {
  fecha: Date;
  concepto_id: number;
  subconcepto_id?: number | null;
  valor: number;
  proveedor: string;
  numero_factura: string;
  pagado: boolean;
  forma_pago?: "efectivo" | "transferencia" | null;
  tipo_cuenta: string;
  banco: string;
  numero_cuenta: string;
  observaciones: string;
}

interface GastoFormProps {
  gasto?: Gasto;
  conceptos: ConceptoGasto[];
  onSuccess: () => void;
}

export function GastoForm({ gasto, conceptos, onSuccess }: GastoFormProps) {
  const initialConceptoId = gasto
    ? (conceptos.find((c) => c.nombre === gasto.concepto)?.id ?? 0)
    : 0;

  const [selectedConceptoId, setSelectedConceptoId] = useState<number>(initialConceptoId);

  const subconceptos =
    conceptos.find((c) => c.id === selectedConceptoId)?.subconceptos ?? [];

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(gastoSchema) as any,
    defaultValues: {
      fecha: gasto?.fecha ? new Date(gasto.fecha + "T00:00:00") : new Date(),
      concepto_id: initialConceptoId,
      subconcepto_id: gasto?.subconcepto_id ?? null,
      valor: gasto?.valor ?? 0,
      proveedor: gasto?.proveedor ?? "",
      numero_factura: gasto?.numero_factura ?? "",
      pagado: gasto?.pagado ?? false,
      forma_pago: gasto?.pago?.forma_pago ?? null,
      tipo_cuenta: gasto?.pago?.tipo_cuenta ?? "",
      banco: gasto?.pago?.banco ?? "",
      numero_cuenta: gasto?.pago?.numero_cuenta ?? "",
      observaciones: gasto?.observaciones ?? "",
    },
  });

  const fechaValue = watch("fecha");
  const subconceptoIdValue = watch("subconcepto_id");
  const pagadoValue = watch("pagado");
  const formaPagoValue = watch("forma_pago");

  const handleConceptoChange = (val: string) => {
    const id = parseInt(val, 10);
    setSelectedConceptoId(id);
    setValue("concepto_id", id);
    setValue("subconcepto_id", null);
  };

  const onSubmit = async (data: FormValues) => {
    try {
      const payload = {
        fecha: data.fecha,
        subconcepto_id: data.subconcepto_id,
        valor: data.valor,
        proveedor: data.proveedor || undefined,
        numero_factura: data.numero_factura || undefined,
        pagado: data.pagado,
        forma_pago: data.pagado ? (data.forma_pago ?? null) : null,
        tipo_cuenta: data.tipo_cuenta || undefined,
        banco: data.banco || undefined,
        numero_cuenta: data.numero_cuenta || undefined,
        observaciones: data.observaciones || undefined,
      };
      if (gasto) {
        await updateGasto(gasto.id, payload);
        toast.success("Gasto actualizado");
      } else {
        await createGasto(payload);
        toast.success("Gasto creado");
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

      {subconceptos.length > 0 && (
        <div className="space-y-2">
          <Label>Subconcepto</Label>
          <Select
            value={subconceptoIdValue ? String(subconceptoIdValue) : ""}
            onValueChange={(val) => setValue("subconcepto_id", parseInt(val, 10))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar subconcepto" />
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
        <Label htmlFor="proveedor">Proveedor</Label>
        <Input
          id="proveedor"
          type="text"
          placeholder="Nombre del proveedor (opcional)"
          {...register("proveedor")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="numero_factura">Número de factura</Label>
        <Input
          id="numero_factura"
          type="text"
          placeholder="Ej: FAC-001 (opcional)"
          {...register("numero_factura")}
        />
      </div>

      <div className="flex items-center gap-3">
        <input
          id="pagado"
          type="checkbox"
          checked={pagadoValue}
          onChange={(e) => {
            setValue("pagado", e.target.checked);
            if (!e.target.checked) {
              setValue("forma_pago", null);
              setValue("tipo_cuenta", "");
              setValue("banco", "");
              setValue("numero_cuenta", "");
            }
          }}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
        />
        <Label htmlFor="pagado" className="cursor-pointer">
          Pagado
        </Label>
      </div>

      {pagadoValue && (
        <>
          <div className="space-y-2">
            <Label>Forma de pago</Label>
            <Select
              value={formaPagoValue ?? ""}
              onValueChange={(val) => {
                setValue("forma_pago", val as "efectivo" | "transferencia");
                if (val !== "transferencia") {
                  setValue("tipo_cuenta", "");
                  setValue("banco", "");
                  setValue("numero_cuenta", "");
                }
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar forma de pago" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="efectivo">Efectivo</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formaPagoValue === "transferencia" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="tipo_cuenta">Tipo de cuenta</Label>
                <Input
                  id="tipo_cuenta"
                  type="text"
                  placeholder="Ej: Ahorros, Corriente"
                  {...register("tipo_cuenta")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="banco">Banco</Label>
                <Input
                  id="banco"
                  type="text"
                  placeholder="Nombre del banco"
                  {...register("banco")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="numero_cuenta">Número de cuenta</Label>
                <Input
                  id="numero_cuenta"
                  type="text"
                  placeholder="Número de cuenta bancaria"
                  {...register("numero_cuenta")}
                />
              </div>
            </>
          )}
        </>
      )}

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
          {isSubmitting ? "Guardando..." : gasto ? "Actualizar" : "Crear"}
        </Button>
      </div>
    </form>
  );
}
