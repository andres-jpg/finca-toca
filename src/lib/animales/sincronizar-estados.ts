import type { SupabaseClient } from "@supabase/supabase-js";
import { estadoProductivoPorEdad } from "@/lib/animales/estados";

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
const ORDEN_CRIANZA = ["leche", "levante_1", "levante_2"] as const;

export interface ResultadoSincronizacion {
  revisados: number;
  actualizados: { id: string; identificador: string; de: string; a: string }[];
}

/**
 * Avanza el estado productivo de los animales jóvenes según su edad:
 * `leche` → `levante_1` (5 meses) → `levante_2` (+1,5 años).
 *
 * Solo mira animales de alta que estén en `leche` o `levante_1`: quien ya llegó a
 * `levante_2`, `produccion`, `secado` o `reproductor` no debe retroceder ni avanzar
 * por edad — ese tramo lo gobiernan los eventos (parto, secado) o el usuario.
 */
export async function sincronizarEstadosPorEdad(
  supabase: ClienteSupabase,
  hoy: Date = new Date()
): Promise<ResultadoSincronizacion> {
  const { data, error } = await supabase
    .from("animales")
    .select("id, identificador, fecha_nacimiento, estado_productivo")
    .eq("alta", true)
    .in("estado_productivo", ["leche", "levante_1"])
    .not("fecha_nacimiento", "is", null);

  if (error) throw new Error("No se pudieron leer los animales para sincronizar estados");

  const candidatos = (data ?? []) as {
    id: string;
    identificador: string;
    fecha_nacimiento: string;
    estado_productivo: string;
  }[];

  const actualizados: ResultadoSincronizacion["actualizados"] = [];

  for (const animal of candidatos) {
    const objetivo = estadoProductivoPorEdad(animal.fecha_nacimiento, hoy);

    const posicionActual = ORDEN_CRIANZA.indexOf(
      animal.estado_productivo as (typeof ORDEN_CRIANZA)[number]
    );
    const posicionObjetivo = ORDEN_CRIANZA.indexOf(objetivo);

    // Solo avanzar: nunca revertir una clasificación manual más avanzada.
    if (posicionObjetivo <= posicionActual) continue;

    const { error: updateError } = await supabase
      .from("animales")
      .update({ estado_productivo: objetivo })
      .eq("id", animal.id);

    if (updateError) {
      throw new Error(`No se pudo actualizar el estado de ${animal.identificador}`);
    }

    actualizados.push({
      id: animal.id,
      identificador: animal.identificador,
      de: animal.estado_productivo,
      a: objetivo,
    });
  }

  return { revisados: candidatos.length, actualizados };
}
