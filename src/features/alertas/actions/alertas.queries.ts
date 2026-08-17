import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { TIPOS_EVENTO_PARA_ALERTAS } from "@/lib/animales/estados";
import {
  calcularAlertas,
  dentroDelHorizonte,
  faltaRegistrarServicio,
  type AnimalParaAlertas,
  type EventoParaAlertas,
} from "@/features/alertas/lib/calcular-alertas";
import type { Alerta } from "@/types";

const CAMPOS_ANIMAL =
  "id, nombre, identificador, sexo, origen, fecha_nacimiento, estado_productivo, estado_reproductivo";
const CAMPOS_EVENTO =
  "animal_id, tipo_evento, fecha, resultado, requiere_revacunacion, periodo_revacunacion, fecha_revacunacion";

/** Horizonte por defecto (días) de campana y dashboard: vencidas + la próxima semana. */
export const HORIZONTE_ALERTAS_DIAS = 7;

/**
 * Una sola lectura por request compartida por la campana del header, el dashboard y la
 * ficha del animal. Con 78 animales y ~200 eventos no hace falta paginar ni filtrar en SQL.
 */
const cargarDatos = cache(async function cargarDatos() {
  const supabase = await createClient();

  const [animalesRes, eventosRes] = await Promise.all([
    supabase.from("animales").select(CAMPOS_ANIMAL).eq("alta", true),
    supabase
      .from("eventos_animal")
      .select(CAMPOS_EVENTO)
      .in("tipo_evento", TIPOS_EVENTO_PARA_ALERTAS),
  ]);

  if (animalesRes.error || eventosRes.error) {
    throw new Error("No se pudieron cargar las alertas");
  }

  return {
    animales: (animalesRes.data ?? []) as unknown as AnimalParaAlertas[],
    eventos: (eventosRes.data ?? []) as unknown as EventoParaAlertas[],
  };
});

/**
 * Alertas vencidas y las que caen dentro del horizonte indicado. La revacunación tiene
 * ventana propia (8 días) y `dentroDelHorizonte` la respeta en vez de recortarla a 7.
 */
export const getAlertas = cache(async function getAlertas(
  horizonteDias: number = HORIZONTE_ALERTAS_DIAS
): Promise<Alerta[]> {
  const { animales, eventos } = await cargarDatos();
  return calcularAlertas(animales, eventos).filter((a) => dentroDelHorizonte(a, horizonteDias));
});

/** Todas las alertas pendientes de un animal, sin horizonte, para su ficha. */
export const getAlertasAnimal = cache(async function getAlertasAnimal(
  animalId: string
): Promise<{ alertas: Alerta[]; faltaServicio: boolean }> {
  const { animales, eventos } = await cargarDatos();

  const animal = animales.find((a) => a.id === animalId);
  if (!animal) return { alertas: [], faltaServicio: false };

  const suyos = eventos.filter((e) => e.animal_id === animalId);
  return {
    alertas: calcularAlertas([animal], suyos),
    faltaServicio: faltaRegistrarServicio(animal, suyos),
  };
});
