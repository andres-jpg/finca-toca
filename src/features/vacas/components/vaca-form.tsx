"use client";

import { useState } from "react";
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
import type { Vaca, Toro, PajillaPorToro } from "@/types";

const ORIGEN_LABELS: Record<string, string> = {
  finca: "Finca",
  externa: "Externa",
};

const ESTADO_LABELS: Record<string, string> = {
  produccion: "Producción",
  secado: "Secado",
  pre_jardin: "Pre-jardín",
  jardin: "Jardín",
  transicion: "Transición",
};

type PadreTipo = "none" | "toro" | "pajilla";

interface FormValues {
  vaca_id: string;
  nombre: string;
  origen: "finca" | "externa";
  estado: "produccion" | "secado" | "pre_jardin" | "jardin" | "transicion";
  fecha_compra?: Date | null;
  fecha_nacimiento?: Date | null;
  numero_registro?: string;
  madre_id?: string | null;
  padre_id?: string | null;
}

interface VacaFormProps {
  vaca?: Vaca;
  vacas: Vaca[];
  toros: Toro[];
  pajillasPorToro: PajillaPorToro[];
  onSuccess: () => void;
}

export function VacaForm({ vaca, vacas, toros, pajillasPorToro, onSuccess }: VacaFormProps) {
  const getInitialPadreTipo = (): PadreTipo => {
    if (!vaca) return "none";
    if (vaca.padre_id) return "toro";
    if (vaca.padre_pajilla_nombre) return "pajilla";
    return "none";
  };

  const [padreTipo, setPadreTipo] = useState<PadreTipo>(getInitialPadreTipo);
  const [selectedPajillaToro, setSelectedPajillaToro] = useState<string>("");

  const pajillasDisponibles = pajillasPorToro.filter((p) => p.total_disponible > 0);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(vacaSchema) as any,
    defaultValues: {
      vaca_id: vaca?.vaca_id ?? "",
      nombre: vaca?.nombre ?? "",
      origen: vaca?.origen ?? undefined,
      estado: vaca?.estado ?? undefined,
      fecha_compra: vaca?.fecha_compra ? new Date(vaca.fecha_compra + "T00:00:00") : null,
      fecha_nacimiento: vaca?.fecha_nacimiento ? new Date(vaca.fecha_nacimiento + "T00:00:00") : null,
      numero_registro: vaca?.numero_registro ?? "",
      madre_id: vaca?.madre_id ?? null,
      padre_id: vaca?.padre_id ?? null,
    },
  });

  const origenValue = watch("origen");
  const fechaCompraValue = watch("fecha_compra");
  const fechaNacimientoValue = watch("fecha_nacimiento");
  const madreIdValue = watch("madre_id");
  const padreIdValue = watch("padre_id");

  const vacasDisponibles = vacas.filter((v) => v.id !== vaca?.id);

  const handlePadreTipoChange = (tipo: PadreTipo) => {
    setPadreTipo(tipo);
    setValue("padre_id", null);
    setSelectedPajillaToro("");
  };

  const onSubmit = async (data: FormValues) => {
    try {
      const base = {
        vaca_id: data.vaca_id,
        nombre: data.nombre,
        origen: data.origen,
        estado: data.estado,
        fecha_compra: data.origen === "externa" ? data.fecha_compra : null,
        fecha_nacimiento: data.fecha_nacimiento || null,
        numero_registro: data.origen === "externa" ? data.numero_registro : undefined,
        madre_id: data.madre_id || null,
        padre_id: padreTipo === "toro" ? (data.padre_id || null) : null,
        padre_pajilla_toro_ref_id:
          padreTipo === "pajilla" && selectedPajillaToro ? selectedPajillaToro : null,
        padre_pajilla_nombre_keep:
          padreTipo === "pajilla" && !selectedPajillaToro
            ? (vaca?.padre_pajilla_nombre ?? null)
            : null,
      };

      if (vaca) {
        await updateVaca(vaca.id, base);
        toast.success("Vaca actualizada");
      } else {
        if (padreTipo === "pajilla" && !selectedPajillaToro) {
          toast.error("Selecciona una pajilla para el padre");
          return;
        }
        await createVaca(base);
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
            type="text"
            placeholder="Ej: 123, A-01, VL-007"
            {...register("vaca_id")}
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
              setValue(
                "estado",
                val as "produccion" | "secado" | "pre_jardin" | "jardin" | "transicion"
              )
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
          {/* Madre */}
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

          {/* Tipo de padre */}
          <div className="space-y-2">
            <Label>Padre</Label>
            <div className="flex gap-2">
              {(["none", "toro", "pajilla"] as PadreTipo[]).map((tipo) => (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => handlePadreTipoChange(tipo)}
                  className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                    padreTipo === tipo
                      ? "bg-gray-900 text-white border-gray-900"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  {tipo === "none" && "Sin padre"}
                  {tipo === "toro" && "Toro de finca"}
                  {tipo === "pajilla" && "Pajilla"}
                </button>
              ))}
            </div>
          </div>

          {/* Toro de finca */}
          {padreTipo === "toro" && (
            <div className="space-y-2">
              <Select
                value={padreIdValue ?? "none"}
                onValueChange={(val) => setValue("padre_id", val === "none" ? null : val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar toro" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin toro seleccionado</SelectItem>
                  {toros.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      #{t.toro_id} — {t.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Pajilla */}
          {padreTipo === "pajilla" && (
            <div className="space-y-2">
              {vaca?.padre_pajilla_nombre && !selectedPajillaToro && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                  <p className="text-xs text-blue-600 font-medium">Padre actual por pajilla</p>
                  <p className="text-sm text-blue-800 font-semibold">{vaca.padre_pajilla_nombre}</p>
                  <p className="text-xs text-blue-500 mt-0.5">
                    Selecciona otra pajilla abajo para cambiarlo (descontará del inventario)
                  </p>
                </div>
              )}
              {pajillasDisponibles.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-sm text-amber-700">
                    No hay pajillas disponibles en el inventario.
                  </p>
                </div>
              ) : (
                <Select
                  value={selectedPajillaToro || "none"}
                  onValueChange={(val) =>
                    setSelectedPajillaToro(val === "none" ? "" : val)
                  }
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        vaca?.padre_pajilla_nombre
                          ? "Cambiar pajilla (opcional)..."
                          : "Seleccionar toro de la pajilla"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      {vaca?.padre_pajilla_nombre ? "Mantener actual" : "Sin selección"}
                    </SelectItem>
                    {pajillasDisponibles.map((p) => (
                      <SelectItem key={p.toro_ref_id} value={p.toro_ref_id}>
                        {p.toro_nombre}{" "}
                        <span className="text-gray-400">
                          ({p.toro_ref_id}) — {p.total_disponible} disponibles
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </>
      )}

      <div className="flex gap-2 pt-4">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : vaca ? "Actualizar" : "Crear"}
        </Button>
      </div>
    </form>
  );
}
