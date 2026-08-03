"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { eventoSchema } from "@/features/eventos-animal/schemas/evento.schema";
import {
  createEventoAnimal,
  updateEventoAnimal,
} from "@/features/eventos-animal/actions/eventos.actions";
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
import { proyeccionesServicio } from "@/lib/animales/estados";
import { toast } from "sonner";
import type {
  Animal,
  EventoAnimal,
  PajillaPorToro,
  ResultadoPalpacion,
  TipoEvento,
} from "@/types";

const TIPO_LABELS: Record<TipoEvento, string> = {
  celo: "Celo",
  inseminacion: "Inseminación",
  monta: "Monta",
  palpacion: "Palpación",
  confirmacion_prenez: "Confirmación de preñez",
  parto: "Parto",
  secado: "Secado",
  topizado: "Topizado",
  vacunacion: "Vacunación",
  vitaminacion: "Vitaminación",
  medicamento: "Medicamento",
  enfermedad: "Enfermedad",
  observacion: "Observación",
};

const RESULTADO_LABELS: Record<ResultadoPalpacion, string> = {
  cargada: "Cargada — preñez confirmada",
  rechequeo: "Rechequeo — repetir revisión",
  vacia: "Vacía — no quedó preñada",
};

/** Nota que se muestra bajo el selector para explicar el efecto en el estado del animal. */
const TIPO_EFECTO: Partial<Record<TipoEvento, string>> = {
  inseminacion: "La vaca pasará a «Por confirmar».",
  monta: "La vaca pasará a «Por confirmar».",
  parto: "La vaca pasará a «Producción» y «Pre-servicio».",
  secado: "La vaca pasará a «Secado» y dejará de contarse en producción.",
};

interface EventFormProps {
  animalId: string;
  animalTipo: "vaca" | "toro";
  evento?: EventoAnimal;
  /** Machos de alta, para el selector de toro en una monta. */
  toros?: Animal[];
  /** Inventario de pajillas agrupado por toro, para el selector de inseminación. */
  pajillasPorToro?: PajillaPorToro[];
  onSuccess: () => void;
}

interface FormValues {
  animal_id: string;
  animal_tipo: "vaca" | "toro";
  tipo_evento: TipoEvento;
  fecha: Date;
  descripcion?: string;
  responsable?: string;
  resultado?: ResultadoPalpacion | null;
  pajilla_toro_ref_id?: string | null;
  toro_id?: string | null;
}

export function EventForm({
  animalId,
  animalTipo,
  evento,
  toros = [],
  pajillasPorToro = [],
  onSuccess,
}: EventFormProps) {
  const isEditing = !!evento;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(eventoSchema) as any,
    defaultValues: {
      animal_id: animalId,
      animal_tipo: animalTipo,
      tipo_evento: evento?.tipo_evento ?? undefined,
      fecha: evento?.fecha ? new Date(evento.fecha + "T00:00:00") : undefined,
      descripcion: evento?.descripcion ?? "",
      responsable: evento?.responsable ?? "",
      resultado: evento?.resultado ?? null,
      pajilla_toro_ref_id: evento?.pajilla_toro_ref_id ?? null,
      toro_id: evento?.toro_id ?? null,
    },
  });

  const tipoValue = watch("tipo_evento");
  const fechaValue = watch("fecha");
  const resultadoValue = watch("resultado");
  const pajillaValue = watch("pajilla_toro_ref_id");
  const toroValue = watch("toro_id");

  const esServicio = tipoValue === "inseminacion" || tipoValue === "monta";
  const esConfirmacion =
    tipoValue === "palpacion" || tipoValue === "confirmacion_prenez";

  // Al registrar el servicio se muestran ya las fechas que generarán las alertas,
  // para que el usuario detecte de inmediato si se equivocó de día.
  const proyecciones = esServicio && fechaValue ? proyeccionesServicio(fechaValue) : null;

  const onSubmit = async (data: FormValues) => {
    const payload = {
      animal_id: data.animal_id,
      animal_tipo: data.animal_tipo,
      tipo_evento: data.tipo_evento,
      fecha: data.fecha,
      descripcion: data.descripcion,
      responsable: data.responsable,
      // Solo se persiste el campo que corresponde al tipo elegido.
      resultado: esConfirmacion ? data.resultado : null,
      pajilla_toro_ref_id: data.tipo_evento === "inseminacion" ? data.pajilla_toro_ref_id : null,
      toro_id: data.tipo_evento === "monta" ? data.toro_id : null,
    };

    try {
      if (isEditing) {
        await updateEventoAnimal(evento.id, payload);
        toast.success("Evento actualizado");
      } else {
        await createEventoAnimal(payload);
        toast.success("Evento registrado");
      }
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error inesperado");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label>Tipo de evento</Label>
        <Select
          value={tipoValue ?? ""}
          onValueChange={(val) => setValue("tipo_evento", val as TipoEvento)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Seleccionar tipo" />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(TIPO_LABELS) as [TipoEvento, string][]).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {tipoValue && TIPO_EFECTO[tipoValue] && (
          <p className="text-xs text-blue-600">{TIPO_EFECTO[tipoValue]}</p>
        )}
        {errors.tipo_evento && (
          <p className="text-sm text-red-500">{errors.tipo_evento.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Fecha</Label>
        <DatePicker
          value={fechaValue}
          onChange={(date) => setValue("fecha", date)}
          placeholder="Seleccionar fecha del evento"
        />
        {proyecciones && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 space-y-0.5">
            <p className="font-medium">Fechas calculadas desde este servicio</p>
            <p>
              Pasar a secado:{" "}
              <span className="font-medium">
                {format(proyecciones.secado, "dd/MM/yyyy", { locale: es })}
              </span>{" "}
              · Parto probable:{" "}
              <span className="font-medium">
                {format(proyecciones.parto, "dd/MM/yyyy", { locale: es })}
              </span>
            </p>
            <p className="text-blue-600">
              Las alertas aparecerán cuando confirmes la preñez con una palpación.
            </p>
          </div>
        )}
        {errors.fecha && <p className="text-sm text-red-500">{errors.fecha.message}</p>}
      </div>

      {/* Inseminación: qué pajilla se usó */}
      {tipoValue === "inseminacion" && (
        <div className="space-y-2">
          <Label>Pajilla utilizada</Label>
          <Select
            value={pajillaValue ?? ""}
            onValueChange={(val) => setValue("pajilla_toro_ref_id", val || null)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar toro de la pajilla (opcional)" />
            </SelectTrigger>
            <SelectContent>
              {pajillasPorToro.map((p) => (
                <SelectItem key={p.toro_ref_id} value={p.toro_ref_id}>
                  {p.toro_nombre} ({p.total_disponible} disponibles)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-gray-400">
            Queda registrado como referencia. El descuento del inventario sigue haciéndose al
            dar de alta la cría.
          </p>
        </div>
      )}

      {/* Monta: qué toro cubrió */}
      {tipoValue === "monta" && (
        <div className="space-y-2">
          <Label>Toro</Label>
          <Select
            value={toroValue ?? ""}
            onValueChange={(val) => setValue("toro_id", val || null)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar toro (opcional)" />
            </SelectTrigger>
            <SelectContent>
              {toros.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  #{t.identificador} — {t.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Palpación / confirmación: el resultado decide el estado reproductivo */}
      {esConfirmacion && (
        <div className="space-y-2">
          <Label>Resultado</Label>
          <Select
            value={resultadoValue ?? ""}
            onValueChange={(val) => setValue("resultado", val as ResultadoPalpacion)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar resultado" />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(RESULTADO_LABELS) as [ResultadoPalpacion, string][]).map(
                ([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                )
              )}
            </SelectContent>
          </Select>
          {errors.resultado && (
            <p className="text-sm text-red-500">{errors.resultado.message}</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="descripcion">Descripción</Label>
        <Textarea
          id="descripcion"
          placeholder="Detalle del evento (opcional)"
          rows={3}
          {...register("descripcion")}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="responsable">Responsable</Label>
        <Input
          id="responsable"
          type="text"
          placeholder="Nombre del responsable (opcional)"
          {...register("responsable")}
        />
      </div>

      <div className="flex gap-2 pt-4">
        <Button type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? "Guardando..." : isEditing ? "Actualizar evento" : "Registrar evento"}
        </Button>
      </div>
    </form>
  );
}
