"use client";

import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TerceroCombobox } from "@/modules/core/terceros/components/tercero-combobox";
import { registrarCompraInsumo } from "../actions/insumos.actions";
import { compraInsumoSchema, type CompraInsumoFormInput, type CompraInsumoValues } from "../schemas/insumo.schema";
import type { InsumoEmpaque } from "../types";

const CAMPO = "h-11 text-base sm:h-9 sm:text-sm";

interface CompraInsumoFormProps {
  insumo: InsumoEmpaque;
  /** `YYYY-MM-DD` de hoy en la zona del cliente (lo calcula el servidor: el navegador puede estar en otra). */
  fechaHoy: string;
  onSuccess: () => void;
}

/** Compra de un insumo: suma al stock con motivo «compra». Proveedor y costo son opcionales. */
export function CompraInsumoForm({ insumo, fechaHoy, onSuccess }: CompraInsumoFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CompraInsumoFormInput, unknown, CompraInsumoValues>({
    resolver: zodResolver(compraInsumoSchema),
    defaultValues: { articuloId: insumo.articulo_id, fecha: fechaHoy, terceroId: null, observaciones: "" },
  });

  const onSubmit = async (values: CompraInsumoValues) => {
    const r = await registrarCompraInsumo(values);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    const stock = r.data.stocks.find((s) => s.articulo_id === insumo.articulo_id)?.stock;
    toast.success(stock === undefined ? "Compra registrada" : `Compra registrada. Stock: ${stock.toLocaleString("es-CO")}`);
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
        <span className="font-medium text-gray-800">{insumo.nombre}</span> · stock actual{" "}
        {insumo.stock.toLocaleString("es-CO")}
      </p>

      <div className="space-y-1.5">
        <Label htmlFor="compra-cantidad">Cantidad (unidades)</Label>
        <Input
          id="compra-cantidad"
          type="number"
          inputMode="numeric"
          min={1}
          step={1}
          placeholder="Ej: 500"
          autoFocus
          className={CAMPO}
          {...register("cantidad", { valueAsNumber: true })}
        />
        {errors.cantidad && <p className="text-xs text-red-500">{errors.cantidad.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="compra-costo">Costo unitario ($, opcional)</Label>
        <Input
          id="compra-costo"
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          className={CAMPO}
          {...register("costoUnitario", { setValueAs: (v) => (v === "" || v == null ? null : Number(v)) })}
        />
        {errors.costoUnitario && <p className="text-xs text-red-500">{errors.costoUnitario.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Proveedor (opcional)</Label>
        <Controller
          control={control}
          name="terceroId"
          render={({ field }) => (
            <TerceroCombobox
              value={field.value ?? null}
              onChange={(id) => field.onChange(id)}
              rol="proveedor"
              permitirCrear
              placeholder="Selecciona un proveedor"
            />
          )}
        />
        {errors.terceroId && <p className="text-xs text-red-500">{errors.terceroId.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="compra-fecha">Fecha de la compra</Label>
        <Input id="compra-fecha" type="date" max={fechaHoy} className={CAMPO} {...register("fecha")} />
        {errors.fecha && <p className="text-xs text-red-500">{errors.fecha.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="compra-observaciones">Observaciones (opcional)</Label>
        <Textarea id="compra-observaciones" rows={2} placeholder="Ej: factura 1234" {...register("observaciones")} />
        {errors.observaciones && <p className="text-xs text-red-500">{errors.observaciones.message}</p>}
      </div>

      <Button type="submit" className="h-11 w-full sm:h-9" disabled={isSubmitting}>
        {isSubmitting ? "Guardando…" : "Registrar compra"}
      </Button>
    </form>
  );
}
