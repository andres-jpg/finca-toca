"use client";

import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EntityModal } from "@/components/shared/entity-modal";
import { ToroForm } from "@/features/toros/components/toro-form";
import { ToroGenealogy } from "@/features/toros/components/toro-genealogy";
import { ToroOffspring } from "@/features/toros/components/toro-offspring";
import { EventsTimeline } from "@/features/eventos-animal/components/events-timeline";
import { EventForm } from "@/features/eventos-animal/components/event-form";
import type { ToroDetalle, EventoAnimal, Vaca, Toro } from "@/types";

const ESTADO_LABELS: Record<string, string> = {
  jardin: "Jardín",
  reproductor: "Reproductor",
};

const ESTADO_COLORS: Record<string, string> = {
  jardin: "bg-purple-100 text-purple-700",
  reproductor: "bg-green-100 text-green-700",
};

const ORIGEN_LABELS: Record<string, string> = {
  finca: "Finca",
  externa: "Externa",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-800 mt-0.5">{value ?? "—"}</p>
    </div>
  );
}

interface ToroFichaProps {
  toro: ToroDetalle;
  eventos: EventoAnimal[];
  vacas: Vaca[];
  toros: Toro[];
  canEdit: boolean;
}

export function ToroFicha({ toro, eventos, vacas, toros, canEdit }: ToroFichaProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [editEvento, setEditEvento] = useState<EventoAnimal | null>(null);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard/toros"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver a Toros
          </Link>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">
              {toro.nombre}
            </h1>
            <span className="font-mono text-gray-400 text-lg">#{toro.toro_id}</span>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {toro.estado && (
              <Badge className={`${ESTADO_COLORS[toro.estado] ?? ""} hover:${ESTADO_COLORS[toro.estado] ?? ""}`}>
                {ESTADO_LABELS[toro.estado] ?? toro.estado}
              </Badge>
            )}
            <Badge variant="outline" className={toro.alta ? "text-green-600 border-green-300" : "text-gray-400 border-gray-300"}>
              {toro.alta ? "Alta" : "Baja"}
            </Badge>
          </div>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Editar
          </Button>
        )}
      </div>

      {/* Información básica */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Información básica
        </h2>
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Field
            label="Fecha de nacimiento"
            value={
              toro.fecha_nacimiento
                ? format(parseISO(toro.fecha_nacimiento), "dd/MM/yyyy", { locale: es })
                : "—"
            }
          />
          <Field label="Origen" value={ORIGEN_LABELS[toro.origen ?? ""] ?? toro.origen} />
          {toro.origen === "externa" && toro.fecha_compra && (
            <Field
              label="Fecha de compra"
              value={format(parseISO(toro.fecha_compra), "dd/MM/yyyy", { locale: es })}
            />
          )}
          {toro.numero_registro && (
            <Field label="Número de registro" value={toro.numero_registro} />
          )}
        </div>
      </section>

      {/* Genealogía */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Genealogía
        </h2>
        <ToroGenealogy toro={toro} />
      </section>

      {/* Crías */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Crías ({toro.crias.length})
        </h2>
        <ToroOffspring crias={toro.crias} />
      </section>

      {/* Historial de eventos */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Historial de eventos ({eventos.length})
          </h2>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => setEventOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Registrar evento
            </Button>
          )}
        </div>
        <EventsTimeline
          eventos={eventos}
          canEdit={canEdit}
          onEdit={(evento) => setEditEvento(evento)}
        />
      </section>

      {/* Modales */}
      {canEdit && (
        <>
          <EntityModal open={editOpen} onClose={() => setEditOpen(false)} title="Editar toro">
            <ToroForm
              toro={toro}
              vacas={vacas}
              toros={toros.filter((t) => t.id !== toro.id)}
              onSuccess={() => setEditOpen(false)}
            />
          </EntityModal>

          <EntityModal open={eventOpen} onClose={() => setEventOpen(false)} title="Registrar evento">
            <EventForm
              animalId={toro.id}
              animalTipo="toro"
              onSuccess={() => setEventOpen(false)}
            />
          </EntityModal>

          <EntityModal
            open={!!editEvento}
            onClose={() => setEditEvento(null)}
            title="Editar evento"
          >
            {editEvento && (
              <EventForm
                animalId={toro.id}
                animalTipo="toro"
                evento={editEvento}
                onSuccess={() => setEditEvento(null)}
              />
            )}
          </EntityModal>
        </>
      )}
    </div>
  );
}
