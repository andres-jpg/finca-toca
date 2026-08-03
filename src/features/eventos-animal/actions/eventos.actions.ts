"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/utils";
import { requireRole } from "@/lib/auth/check-permissions";
import {
  TIPOS_EVENTO_CON_TRANSICION,
  estadoDesdeEvento,
} from "@/lib/animales/estados";
import type { EventoAnimal, ResultadoPalpacion, TipoEvento } from "@/types";

interface EventoFormData {
  animal_id: string;
  animal_tipo: "vaca" | "toro";
  tipo_evento: TipoEvento;
  fecha: Date;
  descripcion?: string;
  responsable?: string;
  resultado?: ResultadoPalpacion | null;
  /** Inseminación: `pajillas.toro_ref_id` de la pajilla utilizada. */
  pajilla_toro_ref_id?: string | null;
  /** Monta: `animales.id` del toro. */
  toro_id?: string | null;
}

export async function getEventosAnimal(
  animalId: string,
  animalTipo: "vaca" | "toro"
): Promise<EventoAnimal[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("eventos_animal")
    .select("*")
    .eq("animal_id", animalId)
    .eq("animal_tipo", animalTipo)
    .order("fecha", { ascending: false });

  if (error) throw new Error("No se pudieron cargar los eventos del animal");
  return (data ?? []) as EventoAnimal[];
}

/**
 * Mueve el estado del animal según el evento recién registrado.
 *
 * Modelo "delta hacia adelante": se aplica el cambio del evento salvo que ya exista
 * un evento **posterior** que gobierne el mismo eje. Así, registrar con retraso una
 * inseminación de hace seis meses no revierte a "por confirmar" una vaca que entre
 * medias ya parió, y a la vez un estado puesto a mano solo lo pisa un evento nuevo.
 */
async function aplicarTransicionEstado(
  supabase: Awaited<ReturnType<typeof createClient>>,
  formData: EventoFormData
) {
  const transicion = estadoDesdeEvento(formData.tipo_evento, formData.resultado);
  if (!transicion.productivo && !transicion.reproductivo) return;

  const fecha = formatDate(formData.fecha);

  const { data } = await supabase
    .from("eventos_animal")
    .select("tipo_evento, resultado")
    .eq("animal_id", formData.animal_id)
    .in("tipo_evento", TIPOS_EVENTO_CON_TRANSICION)
    .gt("fecha", fecha);

  const posteriores = (data ?? []) as unknown as {
    tipo_evento: TipoEvento;
    resultado: ResultadoPalpacion | null;
  }[];

  const efectosPosteriores = posteriores.map((e) =>
    estadoDesdeEvento(e.tipo_evento, e.resultado)
  );

  const update: Record<string, string> = {};

  if (transicion.productivo && !efectosPosteriores.some((e) => e.productivo)) {
    update.estado_productivo = transicion.productivo;
  }
  // El eje reproductivo solo existe en hembras.
  if (
    transicion.reproductivo &&
    formData.animal_tipo === "vaca" &&
    !efectosPosteriores.some((e) => e.reproductivo)
  ) {
    update.estado_reproductivo = transicion.reproductivo;
  }

  if (Object.keys(update).length === 0) return;

  const { error } = await supabase
    .from("animales")
    .update(update)
    .eq("id", formData.animal_id);

  if (error) {
    throw new Error("El evento se registró pero no se pudo actualizar el estado del animal");
  }
}

function revalidarAnimal(animalId: string) {
  revalidatePath(`/dashboard/animales/${animalId}`);
  // El listado y el dashboard muestran estados y alertas derivados de los eventos.
  revalidatePath("/dashboard/animales");
  revalidatePath("/dashboard");
}

function filasEvento(formData: EventoFormData) {
  return {
    tipo_evento: formData.tipo_evento,
    fecha: formatDate(formData.fecha),
    descripcion: formData.descripcion || null,
    responsable: formData.responsable || null,
    resultado: formData.resultado || null,
    pajilla_toro_ref_id: formData.pajilla_toro_ref_id || null,
    toro_id: formData.toro_id || null,
  };
}

export async function createEventoAnimal(formData: EventoFormData) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();

  const { error } = await supabase.from("eventos_animal").insert({
    animal_id: formData.animal_id,
    animal_tipo: formData.animal_tipo,
    ...filasEvento(formData),
  });

  if (error) throw new Error("No se pudo registrar el evento");

  await aplicarTransicionEstado(supabase, formData);
  revalidarAnimal(formData.animal_id);
}

export async function updateEventoAnimal(id: string, formData: EventoFormData) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();

  const { error } = await supabase
    .from("eventos_animal")
    .update(filasEvento(formData))
    .eq("id", id);

  if (error) throw new Error("No se pudo actualizar el evento");

  await aplicarTransicionEstado(supabase, formData);
  revalidarAnimal(formData.animal_id);
}
