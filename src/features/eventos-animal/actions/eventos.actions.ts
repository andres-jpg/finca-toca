"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { formatDate } from "@/lib/utils";
import { requireRole } from "@/lib/auth/check-permissions";
import { ajustarStockPajilla } from "@/features/inventario/pajillas/actions/pajillas.actions";
import {
  TIPOS_EVENTO_CON_TRANSICION,
  estadoDesdeEvento,
} from "@/lib/animales/estados";
import { calcularFechaRevacunacion } from "@/lib/animales/revacunacion";
import type {
  EventoAnimal,
  PeriodoRevacunacion,
  ResultadoPalpacion,
  TipoEvento,
} from "@/types";

interface EventoFormData {
  animal_id: string;
  animal_tipo: "vaca" | "toro";
  tipo_evento: TipoEvento;
  fecha: Date;
  descripcion?: string;
  responsable?: string;
  resultado?: ResultadoPalpacion | null;
  /** Inseminación: `pajillas.id` del lote utilizado. Descuenta una del stock. */
  pajilla_id?: string | null;
  /** Monta: `animales.id` del toro. */
  toro_id?: string | null;
  /** Vacunación: ¿hay que volver a vacunar? */
  requiere_revacunacion?: boolean | null;
  /** Vacunación: plazo hasta la siguiente. */
  periodo_revacunacion?: PeriodoRevacunacion | null;
  /** Vacunación: solo se usa con el plazo `personalizada`; el resto se calculan. */
  fecha_revacunacion?: Date | null;
}

/** Lo mínimo que hay que leer del evento antes de borrarlo para poder recalcular el estado. */
interface EventoBorrado {
  animal_id: string;
  animal_tipo: "vaca" | "toro";
  tipo_evento: TipoEvento;
  fecha: string;
  resultado: ResultadoPalpacion | null;
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

/**
 * Reajusta el estado del animal después de borrar un evento.
 *
 * Es el inverso del "delta hacia adelante": si el evento borrado era el que gobernaba
 * un eje (no hay ninguno posterior que lo pise), ese eje vuelve al efecto del evento
 * anterior que lo gobierne. Si no queda ninguno, el estado se deja como está: no hay
 * forma de saber qué había antes del primer evento, y es preferible conservar lo que
 * pusiera el cron de edad o una clasificación manual que inventar un valor.
 */
async function recalcularEstadoTrasBorrado(
  supabase: Awaited<ReturnType<typeof createClient>>,
  evento: EventoBorrado
) {
  const borrado = estadoDesdeEvento(evento.tipo_evento, evento.resultado);
  if (!borrado.productivo && !borrado.reproductivo) return;

  const { data } = await supabase
    .from("eventos_animal")
    .select("tipo_evento, resultado, fecha")
    .eq("animal_id", evento.animal_id)
    .in("tipo_evento", TIPOS_EVENTO_CON_TRANSICION)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false });

  const restantes = (data ?? []) as unknown as {
    tipo_evento: TipoEvento;
    resultado: ResultadoPalpacion | null;
    fecha: string;
  }[];

  const efecto = (e: (typeof restantes)[number]) =>
    estadoDesdeEvento(e.tipo_evento, e.resultado);

  // Mismo criterio que `aplicarTransicionEstado`: "posterior" es estrictamente
  // posterior en fecha; los del mismo día cuentan como candidatos a sustituto.
  const posteriores = restantes.filter((e) => e.fecha > evento.fecha);
  const previos = restantes.filter((e) => e.fecha <= evento.fecha);

  const update: Record<string, string> = {};

  if (borrado.productivo && !posteriores.some((e) => efecto(e).productivo)) {
    const anterior = previos.map(efecto).find((t) => t.productivo)?.productivo;
    if (anterior) update.estado_productivo = anterior;
  }
  if (
    borrado.reproductivo &&
    evento.animal_tipo === "vaca" &&
    !posteriores.some((e) => efecto(e).reproductivo)
  ) {
    const anterior = previos.map(efecto).find((t) => t.reproductivo)?.reproductivo;
    if (anterior) update.estado_reproductivo = anterior;
  }

  if (Object.keys(update).length === 0) return;

  const { error } = await supabase
    .from("animales")
    .update(update)
    .eq("id", evento.animal_id);

  if (error) {
    throw new Error("El evento se eliminó pero no se pudo recalcular el estado del animal");
  }
}

function revalidarAnimal(animalId: string) {
  revalidatePath(`/dashboard/animales/${animalId}`);
  // El listado y el dashboard muestran estados y alertas derivados de los eventos.
  revalidatePath("/dashboard/animales");
  revalidatePath("/dashboard");
}

/**
 * Campos de revacunación, solo para vacunaciones que la piden. La fecha se **recalcula
 * aquí** desde el plazo elegido en vez de fiarse de la que mandó el cliente: así, si se
 * corrige la fecha de la vacunación, la de revacunación la sigue sin quedar desfasada.
 * Con el plazo `personalizada` sí manda la que escribió el usuario.
 *
 * Devuelve los tres campos a NULL en cualquier otro caso, para que cambiar el tipo de
 * evento al editar no deje colgada una alerta de una vacunación que ya no existe.
 */
function filasRevacunacion(formData: EventoFormData) {
  const vacio = {
    requiere_revacunacion: null,
    periodo_revacunacion: null,
    fecha_revacunacion: null,
  };

  if (formData.tipo_evento !== "vacunacion") return vacio;
  if (!formData.requiere_revacunacion) {
    // Se guarda el "No" explícito: distingue "no hace falta" de una vacunación antigua
    // registrada antes de que existiera este control.
    return { ...vacio, requiere_revacunacion: false };
  }

  const fecha = calcularFechaRevacunacion(
    formData.fecha,
    formData.periodo_revacunacion,
    formData.fecha_revacunacion
  );

  // Sin fecha resoluble no se puede marcar como "requiere revacunación": lo rechazaría el
  // CHECK de la tabla. El formulario ya lo valida antes, esto es la red de seguridad.
  if (!fecha) {
    throw new Error("Indica en cuánto tiempo hay que revacunar o la fecha de la próxima vacuna");
  }

  return {
    requiere_revacunacion: true,
    periodo_revacunacion: formData.periodo_revacunacion ?? null,
    fecha_revacunacion: formatDate(fecha),
  };
}

function filasEvento(formData: EventoFormData) {
  return {
    tipo_evento: formData.tipo_evento,
    fecha: formatDate(formData.fecha),
    descripcion: formData.descripcion || null,
    responsable: formData.responsable || null,
    resultado: formData.resultado || null,
    pajilla_id: formData.pajilla_id || null,
    toro_id: formData.toro_id || null,
    ...filasRevacunacion(formData),
  };
}

/**
 * Solo una inseminación consume inventario. Si el usuario elige un lote y luego cambia el
 * tipo de evento, `filasEvento` ya deja `pajilla_id` a NULL, pero esta comprobación evita
 * descontar por un tipo que no corresponde.
 */
function pajillaConsumida(formData: EventoFormData): string | null {
  return formData.tipo_evento === "inseminacion" ? formData.pajilla_id || null : null;
}

export async function createEventoAnimal(formData: EventoFormData) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();

  // Se arman las filas antes de tocar inventario: `filasEvento` puede lanzar (revacunación
  // sin fecha resoluble) y hacerlo después dejaría la pajilla descontada sin evento.
  const filas = filasEvento(formData);
  const pajillaId = pajillaConsumida(formData);

  // El stock se descuenta primero: si no quedan pajillas del lote, `ajustarStockPajilla`
  // lanza y el evento no llega a crearse, en vez de quedar un evento sin respaldo de stock.
  if (pajillaId) await ajustarStockPajilla(pajillaId, -1);

  const { error } = await supabase.from("eventos_animal").insert({
    animal_id: formData.animal_id,
    animal_tipo: formData.animal_tipo,
    ...filas,
  });

  if (error) {
    // Devolver la pajilla para no dejar el inventario descuadrado por un insert fallido.
    if (pajillaId) await ajustarStockPajilla(pajillaId, 1);
    throw new Error("No se pudo registrar el evento");
  }

  await aplicarTransicionEstado(supabase, formData);
  revalidarAnimal(formData.animal_id);
}

export async function updateEventoAnimal(id: string, formData: EventoFormData) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();

  // Igual que en el alta: primero las filas, que pueden lanzar, y después el inventario.
  const filas = filasEvento(formData);

  // Se lee la pajilla anterior para compensar el inventario: cambiar de lote devuelve una
  // al viejo y descuenta del nuevo; quitar la pajilla (o cambiar de tipo de evento) devuelve.
  const { data: previo, error: readError } = await supabase
    .from("eventos_animal")
    .select("pajilla_id")
    .eq("id", id)
    .maybeSingle();

  if (readError) throw new Error("No se pudo cargar el evento a actualizar");

  const pajillaPrevia = (previo as unknown as { pajilla_id: string | null } | null)
    ?.pajilla_id ?? null;
  const pajillaNueva = pajillaConsumida(formData);

  if (pajillaPrevia !== pajillaNueva) {
    if (pajillaNueva) await ajustarStockPajilla(pajillaNueva, -1);
    if (pajillaPrevia) await ajustarStockPajilla(pajillaPrevia, 1);
  }

  const { error } = await supabase
    .from("eventos_animal")
    .update(filas)
    .eq("id", id);

  if (error) {
    if (pajillaPrevia !== pajillaNueva) {
      if (pajillaNueva) await ajustarStockPajilla(pajillaNueva, 1);
      if (pajillaPrevia) await ajustarStockPajilla(pajillaPrevia, -1);
    }
    throw new Error("No se pudo actualizar el evento");
  }

  await aplicarTransicionEstado(supabase, formData);
  revalidarAnimal(formData.animal_id);
}

export async function deleteEventoAnimal(id: string) {
  await requireRole(["admin", "user"]);
  const supabase = await createClient();

  // Se lee antes de borrar: sin el efecto del evento no se puede recalcular el estado.
  const { data, error: readError } = await supabase
    .from("eventos_animal")
    .select("animal_id, animal_tipo, tipo_evento, fecha, resultado, pajilla_id")
    .eq("id", id)
    .maybeSingle();

  if (readError) throw new Error("No se pudo cargar el evento a eliminar");
  if (!data) throw new Error("El evento ya no existe");

  const evento = data as unknown as EventoBorrado & { pajilla_id: string | null };

  const { error, count } = await supabase
    .from("eventos_animal")
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) throw new Error("No se pudo eliminar el evento");
  // Un DELETE que no encaja con la política RLS no da error: simplemente afecta a 0 filas.
  if (count === 0) throw new Error("No tienes permiso para eliminar este evento");

  // La inseminación deja de existir, así que la pajilla vuelve al lote.
  if (evento.pajilla_id) await ajustarStockPajilla(evento.pajilla_id, 1);

  await recalcularEstadoTrasBorrado(supabase, evento);
  revalidarAnimal(evento.animal_id);
}
