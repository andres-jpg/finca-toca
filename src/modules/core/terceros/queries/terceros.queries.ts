import { createClient } from "@/lib/supabase/server";
import { normalizarIdentificacion, normalizarNombre } from "../lib/normalizar";
import type { RolTercero } from "../lib/roles";
import type { Tercero } from "../types";

// Módulo plano (no "use server"): solo lo llama código de servidor. La autorización es el RLS: sin el
// módulo `core.terceros` activo, o sin membresía en el cliente actual, las listas salen vacías.

/** Filas por página: el tope de PostgREST (`max_rows`) es 1000 (ver *PostgREST row cap* en CLAUDE.md). */
const PAGINA = 1000;

export interface FiltrosTerceros {
  /** Solo los que tienen este rol (un tercero puede tener varios). */
  rol?: RolTercero;
  /** Texto: coincide con el nombre (contiene) o con la identificación (normalizada, contiene). */
  q?: string;
  /** `true`/`false` filtra; sin valor devuelve activos e inactivos. */
  activo?: boolean;
  /** Por defecto `true`. Los selectores lo apagan salvo que la operación admita "Consumidor final". */
  incluirConsumidorFinal?: boolean;
}

/** Quita lo que rompería la sintaxis de `.or()` de PostgREST (comas, paréntesis, comodines). */
function textoSeguro(texto: string): string {
  return texto.replace(/[,()*%\\"]/g, " ");
}

/**
 * Terceros del cliente actual ordenados por nombre. Recorre todas las páginas con `.range()`, así que no
 * se trunca a las 1000 filas de PostgREST.
 */
export async function listarTerceros(filtros: FiltrosTerceros = {}): Promise<Tercero[]> {
  const supabase = await createClient();
  const nombre = normalizarNombre(textoSeguro(filtros.q ?? ""));
  const identificacion = normalizarIdentificacion(textoSeguro(filtros.q ?? ""));

  const filas: Tercero[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    let consulta = supabase.from("terceros").select("*").order("nombre").order("id");
    if (filtros.rol) consulta = consulta.contains("roles", [filtros.rol]);
    if (filtros.activo !== undefined) consulta = consulta.eq("activo", filtros.activo);
    if (filtros.incluirConsumidorFinal === false) consulta = consulta.eq("es_consumidor_final", false);
    if (nombre) {
      consulta = identificacion
        ? consulta.or(`nombre.ilike.*${nombre}*,identificacion.ilike.*${identificacion}*`)
        : consulta.ilike("nombre", `*${nombre}*`);
    }

    const { data, error } = await consulta.range(desde, desde + PAGINA - 1);
    if (error) throw new Error("No se pudieron cargar los terceros");
    // `roles` solo contiene valores de RolTercero: lo garantiza el CHECK de la tabla.
    filas.push(...((data ?? []) as Tercero[]));
    if ((data?.length ?? 0) < PAGINA) return filas;
  }
}
