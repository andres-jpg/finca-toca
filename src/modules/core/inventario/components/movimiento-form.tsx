"use client";

import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { registrarMovimientos } from "../actions/inventario.actions";
import {
  ETIQUETA_MOTIVO,
  MOTIVOS,
  etiquetaArticulo,
  type MotivoMovimiento,
  type UnidadArticulo,
} from "../lib/inventario";
import { aMovimiento, movimientoFormSchema, type MovimientoFormInput, type MovimientoFormValues } from "../schemas/inventario.schemas";
import type { RespuestaMovimientos } from "../types";

export interface ArticuloOpcion {
  id: string;
  nombre: string;
  atributos: Record<string, string | number | boolean>;
  unidad: UnidadArticulo;
}

interface MovimientoFormProps {
  /** Artículos activos entre los que elegir. */
  articulos: ArticuloOpcion[];
  /** Motivos que ofrece el selector; por defecto todos. Un vertical puede limitarlos (p. ej. sin `produccion`). */
  motivos?: readonly MotivoMovimiento[];
  /** Preselecciona el artículo (p. ej. al abrir el formulario desde su kardex). */
  articuloId?: string;
  /** `true` para flujos de venta: sin stock suficiente se registra igual y se avisa. */
  permitirNegativo?: boolean;
  onSuccess?: (respuesta: RespuestaMovimientos) => void;
  onCancel?: () => void;
}

const MOTIVO_AJUSTE: MotivoMovimiento = "ajuste";

/** Movimiento simple de un artículo. Empacar (varios movimientos a la vez) lo arma el vertical con `registrarMovimientos`. */
export function MovimientoForm({
  articulos,
  motivos = MOTIVOS,
  articuloId,
  permitirNegativo = false,
  onSuccess,
  onCancel,
}: MovimientoFormProps) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<MovimientoFormInput, unknown, MovimientoFormValues>({
    resolver: zodResolver(movimientoFormSchema),
    defaultValues: { articulo_id: articuloId ?? "", observaciones: "" },
  });

  const motivo = useWatch({ control, name: "motivo" });
  const articuloElegido = useWatch({ control, name: "articulo_id" });
  const esAjuste = motivo === MOTIVO_AJUSTE;
  const unidad = articulos.find((a) => a.id === articuloElegido)?.unidad;

  const onSubmit = async (values: MovimientoFormValues) => {
    const resultado = await registrarMovimientos({ movimientos: [aMovimiento(values)], permitirNegativo });
    if (!resultado.ok) {
      toast.error(resultado.message);
      return;
    }
    if (resultado.data.advertencias.length > 0) {
      toast.warning("Movimiento registrado, pero el stock quedó en negativo.");
    } else {
      toast.success("Movimiento registrado");
    }
    onSuccess?.(resultado.data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Artículo</Label>
        <Controller
          control={control}
          name="articulo_id"
          render={({ field }) => (
            <Select value={field.value || undefined} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona un artículo" />
              </SelectTrigger>
              <SelectContent>
                {articulos.map((a) => {
                  const detalle = etiquetaArticulo(a.atributos);
                  return (
                    <SelectItem key={a.id} value={a.id}>
                      {a.nombre}
                      {detalle && ` — ${detalle}`}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
        />
        {errors.articulo_id && <p className="text-xs text-red-500">{errors.articulo_id.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Motivo</Label>
        <Controller
          control={control}
          name="motivo"
          render={({ field }) => (
            <Select value={field.value || undefined} onValueChange={field.onChange}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona el motivo" />
              </SelectTrigger>
              <SelectContent>
                {motivos.map((m) => (
                  <SelectItem key={m} value={m}>
                    {ETIQUETA_MOTIVO[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {errors.motivo && <p className="text-xs text-red-500">{errors.motivo.message}</p>}
      </div>

      {esAjuste && (
        <div className="space-y-1.5">
          <Label>El ajuste…</Label>
          <Controller
            control={control}
            name="direccion"
            render={({ field }) => (
              <Select value={field.value || undefined} onValueChange={field.onChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Aumenta o disminuye el stock" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entrada">Aumenta el stock</SelectItem>
                  <SelectItem value="salida">Disminuye el stock</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
          {errors.direccion && <p className="text-xs text-red-500">{errors.direccion.message}</p>}
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="movimiento-cantidad">Cantidad{unidad ? ` (${unidad})` : ""}</Label>
        <Input
          id="movimiento-cantidad"
          type="number"
          min="0"
          step="any"
          placeholder="Ej: 50"
          {...register("cantidad", { valueAsNumber: true })}
        />
        {errors.cantidad && <p className="text-xs text-red-500">{errors.cantidad.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="movimiento-costo">Costo unitario ($, opcional)</Label>
        <Input
          id="movimiento-costo"
          type="number"
          min="0"
          step="any"
          {...register("costo_unitario", { setValueAs: (v) => (v === "" || v == null ? null : Number(v)) })}
        />
        {errors.costo_unitario && <p className="text-xs text-red-500">{errors.costo_unitario.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="movimiento-observaciones">Observaciones{esAjuste ? "" : " (opcional)"}</Label>
        <Textarea
          id="movimiento-observaciones"
          rows={2}
          placeholder={esAjuste ? "Explica el ajuste (obligatorio)" : "Ej: factura 1234"}
          {...register("observaciones")}
        />
        {errors.observaciones && <p className="text-xs text-red-500">{errors.observaciones.message}</p>}
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : "Registrar movimiento"}
        </Button>
      </div>
    </form>
  );
}
