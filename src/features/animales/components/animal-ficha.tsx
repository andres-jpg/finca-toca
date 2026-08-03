"use client";

import { useState } from "react";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EntityModal } from "@/components/shared/entity-modal";
import { AnimalForm } from "@/features/animales/components/animal-form";
import { AnimalGenealogy } from "@/features/animales/components/animal-genealogy";
import { AnimalOffspring } from "@/features/animales/components/animal-offspring";
import { EventsTimeline } from "@/features/eventos-animal/components/events-timeline";
import { EventForm } from "@/features/eventos-animal/components/event-form";
import { AlertasAnimal } from "@/features/alertas/components/alertas-animal";
import {
  ESTADO_PRODUCTIVO_COLORS,
  ESTADO_PRODUCTIVO_LABELS,
  ESTADO_REPRODUCTIVO_COLORS,
  ESTADO_REPRODUCTIVO_LABELS,
} from "@/lib/animales/estados";
import type {
  Alerta,
  AnimalDetalle,
  EventoAnimal,
  Animal,
  PajillaPorToro,
} from "@/types";

const ORIGEN_LABELS: Record<string, string> = {
  finca: "Finca",
  externa: "Externa",
};

const RAZA_LABELS: Record<string, string> = {
  holstein: "Holstein",
  jersey: "Jersey",
  jerholm: "Jerholm",
  normando: "Normando",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-800 mt-0.5">{value ?? "—"}</p>
    </div>
  );
}

interface AnimalFichaProps {
  animal: AnimalDetalle;
  eventos: EventoAnimal[];
  animales: Animal[];
  pajillasPorToro: PajillaPorToro[];
  alertas: Alerta[];
  faltaServicio: boolean;
  canEdit: boolean;
}

export function AnimalFicha({
  animal,
  eventos,
  animales,
  pajillasPorToro,
  alertas,
  faltaServicio,
  canEdit,
}: AnimalFichaProps) {
  const [editOpen, setEditOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [editEvento, setEditEvento] = useState<EventoAnimal | null>(null);

  const animalTipo = animal.sexo === "hembra" ? "vaca" : "toro";
  const toros = animales.filter((a) => a.sexo === "macho" && a.id !== animal.id);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard/animales"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver a Animales
          </Link>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{animal.nombre}</h1>
            <span className="font-mono text-gray-400 text-lg">#{animal.identificador}</span>
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge
              variant="outline"
              className={
                animal.sexo === "hembra"
                  ? "text-pink-600 border-pink-300"
                  : "text-sky-600 border-sky-300"
              }
            >
              {animal.sexo === "hembra" ? "Hembra" : "Macho"}
            </Badge>
            {animal.raza && (
              <Badge variant="outline" className="text-gray-600">
                {RAZA_LABELS[animal.raza] ?? animal.raza}
              </Badge>
            )}
            {animal.estado_productivo && (
              <Badge className={ESTADO_PRODUCTIVO_COLORS[animal.estado_productivo]}>
                {ESTADO_PRODUCTIVO_LABELS[animal.estado_productivo]}
              </Badge>
            )}
            {animal.estado_reproductivo && (
              <Badge className={ESTADO_REPRODUCTIVO_COLORS[animal.estado_reproductivo]}>
                {ESTADO_REPRODUCTIVO_LABELS[animal.estado_reproductivo]}
              </Badge>
            )}
            <Badge variant="outline" className={animal.alta ? "text-green-600 border-green-300" : "text-gray-400 border-gray-300"}>
              {animal.alta ? "Alta" : "Baja"}
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
              animal.fecha_nacimiento
                ? format(parseISO(animal.fecha_nacimiento), "dd/MM/yyyy", { locale: es })
                : "—"
            }
          />
          <Field label="Origen" value={ORIGEN_LABELS[animal.origen ?? ""] ?? animal.origen} />
          {animal.origen === "externa" && animal.fecha_compra && (
            <Field
              label="Fecha de compra"
              value={format(parseISO(animal.fecha_compra), "dd/MM/yyyy", { locale: es })}
            />
          )}
          {animal.numero_registro && (
            <Field label="Número de registro" value={animal.numero_registro} />
          )}
        </div>
      </section>

      {/* Genealogía */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Genealogía
        </h2>
        <AnimalGenealogy animal={animal} />
      </section>

      {/* Crías */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Crías ({animal.crias.length})
        </h2>
        <AnimalOffspring crias={animal.crias} />
      </section>

      {/* Alertas — derivadas de los eventos, sin horizonte para este animal */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
          Alertas{alertas.length > 0 && !faltaServicio ? ` (${alertas.length})` : ""}
        </h2>
        <AlertasAnimal
          alertas={alertas}
          faltaServicio={faltaServicio}
          canEdit={canEdit}
        />
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
        <EventsTimeline eventos={eventos} canEdit={canEdit} onEdit={(evento) => setEditEvento(evento)} />
      </section>

      {/* Modales */}
      {canEdit && (
        <>
          <EntityModal open={editOpen} onClose={() => setEditOpen(false)} title="Editar animal">
            <AnimalForm
              animal={animal}
              animales={animales.filter((a) => a.id !== animal.id)}
              pajillasPorToro={pajillasPorToro}
              onSuccess={() => setEditOpen(false)}
            />
          </EntityModal>

          <EntityModal open={eventOpen} onClose={() => setEventOpen(false)} title="Registrar evento">
            <EventForm
              animalId={animal.id}
              animalTipo={animalTipo}
              toros={toros}
              pajillasPorToro={pajillasPorToro}
              onSuccess={() => setEventOpen(false)}
            />
          </EntityModal>

          <EntityModal open={!!editEvento} onClose={() => setEditEvento(null)} title="Editar evento">
            {editEvento && (
              <EventForm
                animalId={animal.id}
                animalTipo={animalTipo}
                evento={editEvento}
                toros={toros}
                pajillasPorToro={pajillasPorToro}
                onSuccess={() => setEditEvento(null)}
              />
            )}
          </EntityModal>
        </>
      )}
    </div>
  );
}
