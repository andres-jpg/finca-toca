"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  Syringe,
  Pill,
  AlertCircle,
  Flame,
  FlaskConical,
  Stethoscope,
  CheckCircle2,
  Baby,
  HeartCrack,
  FileText,
  Milk,
  Scissors,
  Beef,
  Pencil,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EventoAnimal, ResultadoPalpacion, TipoEvento } from "@/types";

type TipoConfig = { label: string; icon: React.ElementType; color: string; bg: string };

const TIPO_CONFIG: Record<TipoEvento, TipoConfig> = {
  vacunacion:          { label: "Vacunación",           icon: Syringe,       color: "text-blue-600",   bg: "bg-blue-50 border-blue-200" },
  vitaminacion:        { label: "Vitaminación",         icon: Pill,          color: "text-teal-600",   bg: "bg-teal-50 border-teal-200" },
  medicamento:         { label: "Medicamento",          icon: Pill,          color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-200" },
  enfermedad:          { label: "Enfermedad",           icon: AlertCircle,   color: "text-red-600",    bg: "bg-red-50 border-red-200" },
  celo:                { label: "Celo",                 icon: Flame,         color: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
  inseminacion:        { label: "Inseminación",         icon: FlaskConical,  color: "text-pink-600",   bg: "bg-pink-50 border-pink-200" },
  monta:               { label: "Monta",                icon: Beef,          color: "text-fuchsia-600",bg: "bg-fuchsia-50 border-fuchsia-200" },
  palpacion:           { label: "Palpación",            icon: Stethoscope,   color: "text-purple-600", bg: "bg-purple-50 border-purple-200" },
  confirmacion_prenez: { label: "Confirmación preñez",  icon: CheckCircle2,  color: "text-green-600",  bg: "bg-green-50 border-green-200" },
  parto:               { label: "Parto",                icon: Baby,          color: "text-rose-600",   bg: "bg-rose-50 border-rose-200" },
  aborto:              { label: "Aborto",               icon: HeartCrack,    color: "text-red-700",    bg: "bg-red-100 border-red-300" },
  secado:              { label: "Secado",               icon: Milk,          color: "text-amber-600",  bg: "bg-amber-50 border-amber-200" },
  topizado:            { label: "Topizado",             icon: Scissors,      color: "text-violet-600", bg: "bg-violet-50 border-violet-200" },
  observacion:         { label: "Observación",          icon: FileText,      color: "text-gray-600",   bg: "bg-gray-50 border-gray-200" },
};

/** Fallback: un tipo desconocido en BD no debe tumbar la ficha entera. */
const TIPO_FALLBACK: TipoConfig = {
  label: "Evento",
  icon: FileText,
  color: "text-gray-600",
  bg: "bg-gray-50 border-gray-200",
};

const RESULTADO_LABELS: Record<ResultadoPalpacion, string> = {
  cargada: "Cargada",
  rechequeo: "Rechequeo",
  vacia: "Vacía",
};

/** Etiqueta legible de un tipo de evento, para textos fuera del timeline (diálogos, toasts). */
export function labelTipoEvento(tipo: TipoEvento): string {
  return (TIPO_CONFIG[tipo] ?? TIPO_FALLBACK).label;
}

interface EventsTimelineProps {
  eventos: EventoAnimal[];
  canEdit?: boolean;
  onEdit?: (evento: EventoAnimal) => void;
  canDelete?: boolean;
  onDelete?: (evento: EventoAnimal) => void;
}

export function EventsTimeline({
  eventos,
  canEdit,
  onEdit,
  canDelete,
  onDelete,
}: EventsTimelineProps) {
  if (eventos.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4 text-center">
        No hay eventos registrados aún.
      </p>
    );
  }

  const mostrarEditar = !!(canEdit && onEdit);
  const mostrarEliminar = !!(canDelete && onDelete);

  return (
    <div className="space-y-3">
      {eventos.map((evento) => {
        const config = TIPO_CONFIG[evento.tipo_evento] ?? TIPO_FALLBACK;
        const Icon = config.icon;
        return (
          <div
            key={evento.id}
            className={`flex gap-3 rounded-lg border p-3 ${config.bg}`}
          >
            <div className={`mt-0.5 shrink-0 ${config.color}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-semibold uppercase tracking-wide ${config.color}`}>
                  {config.label}
                </span>
                <span className="text-xs text-gray-500">
                  {format(parseISO(evento.fecha), "dd/MM/yyyy", { locale: es })}
                </span>
                {evento.resultado && (
                  <span className="text-xs font-medium rounded-full border border-current/20 px-2 py-0.5 bg-white/60 text-gray-700">
                    {RESULTADO_LABELS[evento.resultado] ?? evento.resultado}
                  </span>
                )}
              </div>
              {evento.descripcion && (
                <p className="mt-1 text-sm text-gray-700">{evento.descripcion}</p>
              )}
              {evento.responsable && (
                <p className="mt-0.5 text-xs text-gray-500">Responsable: {evento.responsable}</p>
              )}
            </div>
            {(mostrarEditar || mostrarEliminar) && (
              <div className="flex shrink-0 items-start gap-0.5">
                {mostrarEditar && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-gray-400 hover:text-gray-700"
                    onClick={() => onEdit!(evento)}
                    type="button"
                    title="Editar evento"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                {mostrarEliminar && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    onClick={() => onDelete!(evento)}
                    type="button"
                    title="Eliminar evento"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
