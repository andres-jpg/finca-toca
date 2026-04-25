"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toroSchema } from "@/features/toros/schemas/toro.schema";
import { createToro, updateToro } from "@/features/toros/actions/toros.actions";
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
import type { Toro, Vaca } from "@/types";

const ORIGEN_LABELS: Record<string, string> = {
  finca: "Finca",
  externa: "Externa",
};

const ESTADO_LABELS: Record<string, string> = {
  jardin: "Jardín",
  reproductor: "Reproductor",
};

interface FormValues {
  toro_id: number;
  nombre: string;
  origen: "finca" | "externa";
  estado?: "jardin" | "reproductor" | null;
  fecha_compra?: Date | null;
  fecha_nacimiento?: Date | null;
  numero_registro?: string;
  madre_id?: string | null;
  padre_id?: string | null;
}

interface ToroFormProps {
  toro?: Toro;
  vacas: Vaca[];
  toros: Toro[];
  onSuccess: () => void;
}

export function ToroForm({ toro, vacas, toros, onSuccess }: ToroFormProps) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(toroSchema) as any,
    defaultValues: {
      toro_id: toro?.toro_id ?? 0,
      nombre: toro?.nombre ?? "",
      origen: toro?.origen ?? undefined,
      estado: toro?.estado ?? null,
      fecha_compra: toro?.fecha_compra ? new Date(toro.fecha_compra + "T00:00:00") : null,
      fecha_nacimiento: toro?.fecha_nacimiento ? new Date(toro.fecha_nacimiento + "T00:00:00") : null,
      numero_registro: toro?.numero_registro ?? "",
      madre_id: toro?.madre_id ?? null,
      padre_id: toro?.padre_id ?? null,
    },
  });

  const origenValue = watch("origen");
  const estadoValue = watch("estado");
  const fechaCompraValue = watch("fecha_compra");
  const fechaNacimientoValue = watch("fecha_nacimiento");
  const madreIdValue = watch("madre_id");
  const padreIdValue = watch("padre_id");

  const torosDisponibles = toros.filter((t) => t.id !== toro?.id);

  const onSubmit = async (data: FormValues) => {
    try {
      const payload = {
        toro_id: data.toro_id,
        nombre: data.nombre,
        origen: data.origen,
        estado: data.estado || null,
        fecha_compra: data.origen === "externa" ? data.fecha_compra : null,
        fecha_nacimiento: data.fecha_nacimiento || null,
        numero_registro: data.origen === "externa" ? data.numero_registro : undefined,
        madre_id: data.madre_id || null,
        padre_id: data.padre_id || null,
      };
      if (toro) {
        await updateToro(toro.id, payload);
        toast.success("Toro actualizado");
      } else {
        await createToro(payload);
        toast.success("Toro creado");
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
          <Label htmlFor="toro_id">ID del Toro</Label>
          <Input
            id="toro_id"
            type="number"
            min="1"
            max="9999"
            placeholder="Ej: 123"
            {...register("toro_id", { valueAsNumber: true })}
          />
          {errors.toro_id && (
            <p className="text-sm text-red-500">{errors.toro_id.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="nombre">Nombre</Label>
          <Input
            id="nombre"
            type="text"
            placeholder="Ej: Tornado"
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
            value={estadoValue ?? "none"}
            onValueChange={(val) =>
              setValue("estado", val === "none" ? null : (val as "jardin" | "reproductor"))
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin estado</SelectItem>
              {Object.entries(ESTADO_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Fecha de nacimiento</Label>
        <DatePicker
          value={fechaNacimientoValue ?? undefined}
          onChange={(date) => setValue("fecha_nacimiento", date)}
          placeholder="Seleccionar fecha de nacimiento"
        />
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

      {origenValue === "finca" && (
        <>
          <div className="space-y-2">
            <Label>Madre (vaca)</Label>
            <Select
              value={madreIdValue ?? "none"}
              onValueChange={(val) => setValue("madre_id", val === "none" ? null : val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sin madre registrada" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin madre registrada</SelectItem>
                {vacas.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    #{v.vaca_id} — {v.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Padre (toro)</Label>
            <Select
              value={padreIdValue ?? "none"}
              onValueChange={(val) => setValue("padre_id", val === "none" ? null : val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sin padre registrado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin padre registrado</SelectItem>
                {torosDisponibles.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    #{t.toro_id} — {t.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </>
      )}

      <div className="flex gap-2 pt-4">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : toro ? "Actualizar" : "Crear"}
        </Button>
      </div>
    </form>
  );
}
