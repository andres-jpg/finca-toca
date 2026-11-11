"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCOP } from "@/modules/core/formato/numeros";
import { fijarPrecioInsumo } from "../actions/insumos.actions";
import { precioInsumoSchema, type PrecioInsumoFormInput, type PrecioInsumoValues } from "../schemas/insumo.schema";
import type { InsumoEmpaque } from "../types";

const CAMPO = "h-11 text-base sm:h-9 sm:text-sm";

/** Precio unitario vigente de un insumo (solo owner/admin). Aplica a los empaques posteriores, no a los ya registrados. */
export function PrecioInsumoForm({ insumo, onSuccess }: { insumo: InsumoEmpaque; onSuccess: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PrecioInsumoFormInput, unknown, PrecioInsumoValues>({
    resolver: zodResolver(precioInsumoSchema),
    defaultValues: { articuloId: insumo.articulo_id, precio: insumo.precio ?? undefined },
  });

  const onSubmit = async (values: PrecioInsumoValues) => {
    const r = await fijarPrecioInsumo(values);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success(`Precio de ${insumo.nombre}: ${formatCOP(r.data.precio)}`);
    onSuccess();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <p className="rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-600">
        <span className="font-medium text-gray-800">{insumo.nombre}</span> · precio actual {insumo.precio === null ? "sin definir" : formatCOP(insumo.precio)}. El nuevo precio aplica a los empaques que se registren desde ahora; los ya registrados no cambian.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="precio-insumo">Precio por unidad (COP)</Label>
        <Input id="precio-insumo" type="number" inputMode="decimal" min={0} step="any" className={CAMPO} {...register("precio", { valueAsNumber: true })} />
        {errors.precio && <p className="text-xs text-red-500">{errors.precio.message}</p>}
      </div>
      <Button type="submit" className="h-11 w-full sm:h-9" disabled={isSubmitting}>
        {isSubmitting ? "Guardando…" : "Guardar precio"}
      </Button>
    </form>
  );
}
