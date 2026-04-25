"use client";

import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  Syringe,
  Pill,
  HeartPulse,
  AlertCircle,
  Flame,
  FlaskConical,
  Stethoscope,
  CheckCircle2,
  Baby,
  FileText,
} from "lucide-react";
import type { EventoAnimal, TipoEvento } from "@/types";

const TIPO_CONFIG: Record<
  TipoEvento,
  { label: string; icon: React.ElementType; color: string; bg: string }
> = {
  vacunacion:         { label: "Vacunación",           icon: Syringe,       color: "text-blue-600",   bg: "bg-blue-50 border-blue-200" },
  vitaminacion:       { label: "Vitaminación",         icon: Pill,          color: "text-teal-600",   bg: "bg-teal-50 border-teal-200" },
  medicamento:        { label: "Medicamento",          icon: Pill,          color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-200" },
  enfermedad:         { label: "Enfermedad",           icon: AlertCircle,   color: "text-red-600",    bg: "bg-red-50 border-red-200" },
  celo:               { label: "Celo",                 icon: Flame,         color: "text-orange-600", bg: "bg-orange-50 border-orange-200" },
  inseminacion:       { label: "Inseminación",         icon: FlaskConical,  color: "text-pink-600",   bg: "bg-pink-50 border-pink-200" },
  palpacion:          { label: "Palpación",            icon: Stethoscope,   color: "text-purple-600", bg: "bg-purple-50 border-purple-200" },
  confirmacion_prenez:{ label: "Confirmación preñez",  icon: CheckCircle2,  color: "text-green-600",  bg: "bg-green-50 border-green-200" },
  parto:              { label: "Parto",                icon: Baby,          color: "text-rose-600",   bg: "bg-rose-50 border-rose-200" },
  observacion:        { label: "Observación",          icon: FileText,      color: "text-gray-600",   bg: "bg-gray-50 border-gray-200" },
};

interface EventsTimelineProps {
  eventos: EventoAnimal[];
}

export function EventsTimeline({ eventos }: EventsTimelineProps) {
  if (eventos.length === 0) {
    return (
      <p className="text-sm text-gray-400 py-4 text-center">
        No hay eventos registrados aún.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {eventos.map((evento) => {
        const config = TIPO_CONFIG[evento.tipo_evento];
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
              </div>
              {evento.descripcion && (
                <p className="mt-1 text-sm text-gray-700">{evento.descripcion}</p>
              )}
              {evento.responsable && (
                <p className="mt-0.5 text-xs text-gray-500">Responsable: {evento.responsable}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
