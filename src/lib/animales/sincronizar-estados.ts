import { addDays } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DIAS_CELO_POST_PARTO,
  ORDEN_REPRODUCTIVO_JUVENIL,
  TIPOS_EVENTO_FIN_GESTACION,
  estadoProductivoPorEdad,
  estadoReproductivoPorCrianza,
  parseFechaDB,
} from "@/lib/animales/estados";
import type { AnimalSexo, EstadoProductivo, EstadoReproductivo } from "@/types";

/**
 * Sirve tanto para `createClient()` (sesión de usuario, desde la Server Action) como
 * para `createAdminClient()` (service role, desde la ruta de cron).
 */
type ClienteSupabase = SupabaseClient;

/**
 * Orden del tramo de crianza. La sincronización es **monótona**: solo avanza.
 * Si el ganadero clasificó a mano una cría por delante de lo que dice su fecha de
 * nacimiento (fecha aproximada, animal adelantado), el cron no debe hacerla retroceder.
 */
const ORDEN_CRIANZA = ["leche", "levante_1", "levante_2"] as const satisfies readonly EstadoProductivo[];

export interface ResultadoSincronizacion {
  revisados: number;
  actualizados: { id: string; identificador: string; de: string; a: string }[];
}

/**
 * Sincroniza el tramo de crianza, que depende solo del calendario. Mueve dos ejes:
 *
 * 1. **Productivo por edad**: `leche` → `levante_1` (5 meses) → `levante_2` (+1,5 años).
 *    Requiere `fecha_nacimiento`; sin ella el animal se queda donde está.
 * 2. **Reproductivo de la novilla** (solo hembras), derivado del productivo resultante:
 *    `leche` → pre-púber, `levante_1` → púber, `levante_2` → servicio.
 *
 * Ambos son **monótonos a propósito**: nunca retroceden, para no pisar una clasificación
 * manual más avanzada que la fecha de nacimiento (hay animales con fecha aproximada).
 * El eje reproductivo además solo se toca mientras la vaca siga dentro de la escalera
 * juvenil: en cuanto un evento la lleva a `por_confirmar`, `cargada`, `pre_servicio`…
 * deja de gobernarlo, de modo que una novilla inseminada en levante 2 no vuelve a
 * "servicio" al día siguiente.
 */
export async function sincronizarEstadosPorEdad(
  supabase: ClienteSupabase,
  hoy: Date = new Date()
): Promise<ResultadoSincronizacion> {
  const { data, error } = await supabase
    .from("animales")
    .select("id, identificador, sexo, fecha_nacimiento, estado_productivo, estado_reproductivo")
    .eq("alta", true)
    // `levante_2` entra aunque ya no pueda avanzar de tramo: puede faltarle el eje
    // reproductivo (novillas registradas antes de que existiera la escalera juvenil).
    .in("estado_productivo", ORDEN_CRIANZA);

  if (error) throw new Error("No se pudieron leer los animales para sincronizar estados");

  const candidatos = (data ?? []) as {
    id: string;
    identificador: string;
    sexo: AnimalSexo;
    fecha_nacimiento: string | null;
    estado_productivo: EstadoProductivo;
    estado_reproductivo: EstadoReproductivo | null;
  }[];

  const actualizados: ResultadoSincronizacion["actualizados"] = [];

  for (const animal of candidatos) {
    const update: {
      estado_productivo?: EstadoProductivo;
      estado_reproductivo?: EstadoReproductivo;
    } = {};

    // --- Eje productivo: avanza con la edad.
    let productivo = animal.estado_productivo;

    if (animal.fecha_nacimiento) {
      const objetivo = estadoProductivoPorEdad(animal.fecha_nacimiento, hoy);
      const posicionActual = ORDEN_CRIANZA.indexOf(
        productivo as (typeof ORDEN_CRIANZA)[number]
      );
      // Solo avanzar: nunca revertir una clasificación manual más avanzada.
      if (ORDEN_CRIANZA.indexOf(objetivo) > posicionActual) {
        update.estado_productivo = objetivo;
        productivo = objetivo;
      }
    }

    // --- Eje reproductivo: se deriva del tramo productivo ya resuelto.
    if (animal.sexo === "hembra") {
      const objetivo = estadoReproductivoPorCrianza(productivo);
      const actual = animal.estado_reproductivo;
      // `indexOf(null)` da -1, así que una hembra sin estado siempre entra.
      const dentroDeLaEscalera =
        actual === null || ORDEN_REPRODUCTIVO_JUVENIL.includes(actual);

      if (
        objetivo &&
        dentroDeLaEscalera &&
        ORDEN_REPRODUCTIVO_JUVENIL.indexOf(objetivo) >
          ORDEN_REPRODUCTIVO_JUVENIL.indexOf(actual as EstadoReproductivo)
      ) {
        update.estado_reproductivo = objetivo;
      }
    }

    if (Object.keys(update).length === 0) continue;

    const { error: updateError } = await supabase
      .from("animales")
      .update(update)
      .eq("id", animal.id);

    if (updateError) {
      throw new Error(`No se pudo actualizar el estado de ${animal.identificador}`);
    }

    // Se resume en una sola entrada por animal para que el contador del botón
    // "Recalcular estados" siga siendo "cuántos animales cambiaron".
    const desde: string[] = [];
    const hasta: string[] = [];
    if (update.estado_productivo) {
      desde.push(animal.estado_productivo);
      hasta.push(update.estado_productivo);
    }
    if (update.estado_reproductivo) {
      desde.push(animal.estado_reproductivo ?? "sin estado");
      hasta.push(update.estado_reproductivo);
    }

    actualizados.push({
      id: animal.id,
      identificador: animal.identificador,
      de: desde.join(" · "),
      a: hasta.join(" · "),
    });
  }

  return { revisados: candidatos.length, actualizados };
}

/**
 * Pasa a `servicio` las vacas que llevan `DIAS_CELO_POST_PARTO` días en `pre_servicio`,
 * contados desde el parto o aborto que cerró la gestación (nunca desde `created_at` ni
 * desde la fecha en que se cambió el estado: el ganadero puede registrar el parto tarde).
 *
 * Solo mira las que están en `pre_servicio`: cualquier otro estado reproductivo lo gobierna
 * un evento posterior (inseminación, palpación…) o el usuario, y no debe pisarse.
 * Una vaca en `pre_servicio` sin evento de fin de gestación no tiene fecha base y se
 * queda como está — igual que las alertas, que tampoco se inventan la fecha.
 */
export async function sincronizarPaseAServicio(
  supabase: ClienteSupabase,
  hoy: Date = new Date()
): Promise<ResultadoSincronizacion> {
  const { data, error } = await supabase
    .from("animales")
    .select("id, identificador")
    .eq("alta", true)
    .eq("sexo", "hembra")
    .eq("estado_reproductivo", "pre_servicio");

  if (error) throw new Error("No se pudieron leer las vacas en pre-servicio");

  const candidatas = (data ?? []) as { id: string; identificador: string }[];
  if (candidatas.length === 0) return { revisados: 0, actualizados: [] };

  const { data: eventosData, error: eventosError } = await supabase
    .from("eventos_animal")
    .select("animal_id, fecha")
    .in(
      "animal_id",
      candidatas.map((c) => c.id)
    )
    .in("tipo_evento", TIPOS_EVENTO_FIN_GESTACION);

  if (eventosError) {
    throw new Error("No se pudieron leer los partos/abortos para el pase a servicio");
  }

  // Última fecha de fin de gestación por animal (las fechas ISO se comparan lexicográficamente).
  const ultimoCierre = new Map<string, string>();
  for (const evento of (eventosData ?? []) as { animal_id: string; fecha: string }[]) {
    const previo = ultimoCierre.get(evento.animal_id);
    if (!previo || evento.fecha > previo) ultimoCierre.set(evento.animal_id, evento.fecha);
  }

  const actualizados: ResultadoSincronizacion["actualizados"] = [];

  for (const vaca of candidatas) {
    const cierre = ultimoCierre.get(vaca.id);
    if (!cierre) continue;

    const objetivo = addDays(parseFechaDB(cierre), DIAS_CELO_POST_PARTO);
    if (hoy < objetivo) continue;

    const { error: updateError } = await supabase
      .from("animales")
      .update({ estado_reproductivo: "servicio" })
      .eq("id", vaca.id)
      // Relectura defensiva: si un evento cambió el estado entre el SELECT y este UPDATE,
      // no se pisa. El cron y el botón manual pueden solaparse.
      .eq("estado_reproductivo", "pre_servicio");

    if (updateError) {
      throw new Error(`No se pudo pasar a servicio a ${vaca.identificador}`);
    }

    actualizados.push({
      id: vaca.id,
      identificador: vaca.identificador,
      de: "pre_servicio",
      a: "servicio",
    });
  }

  return { revisados: candidatas.length, actualizados };
}

/**
 * Las dos sincronizaciones automáticas que corren juntas: avance productivo por edad
 * y pase reproductivo `pre_servicio` → `servicio`. Es lo que ejecutan el cron diario
 * y el botón "Recalcular estados".
 */
export async function sincronizarEstadosAnimales(
  supabase: ClienteSupabase,
  hoy: Date = new Date()
): Promise<ResultadoSincronizacion> {
  const porEdad = await sincronizarEstadosPorEdad(supabase, hoy);
  const aServicio = await sincronizarPaseAServicio(supabase, hoy);

  return {
    revisados: porEdad.revisados + aServicio.revisados,
    actualizados: [...porEdad.actualizados, ...aServicio.actualizados],
  };
}
