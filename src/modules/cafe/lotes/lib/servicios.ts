import type { LineaLote, NivelTueste, TipoProceso } from "../types";

/**
 * Etiquetas y orden de los servicios de un lote. Función pura (sin base ni React). El orden es el de
 * `cafe.orden_proceso()` en SQL y `servicios.test.ts` fija los mismos valores que `98_cafe_lotes.test.sql`.
 */

/** trilla → tostión → molienda → empaque. */
export const ORDEN_PROCESO: Readonly<Record<TipoProceso, number>> = {
  trilla: 1,
  tostion: 2,
  molienda: 3,
  empaque: 4,
};

const ETIQUETA_LINEA: Readonly<Record<LineaLote, string>> = {
  marca_propia: "Marca propia",
  servicio: "Servicio",
};

const ETIQUETA_SERVICIO: Readonly<Record<TipoProceso, string>> = {
  trilla: "Trilla",
  tostion: "Tostión",
  molienda: "Molienda",
  empaque: "Empaque",
};

const ETIQUETA_TUESTE: Readonly<Record<NivelTueste, string>> = {
  bajo: "Bajo",
  medio: "Medio",
  alto: "Alto",
};

export function etiquetaLinea(linea: LineaLote): string {
  return ETIQUETA_LINEA[linea];
}

export function etiquetaServicio(servicio: TipoProceso): string {
  return ETIQUETA_SERVICIO[servicio];
}

export function etiquetaTueste(nivel: NivelTueste): string {
  return ETIQUETA_TUESTE[nivel];
}

/**
 * Ordena los servicios como lo hace el trigger de `cafe.lotes` (y quita repetidos), sin tocar el arreglo
 * original. No añade `empaque` a la tostión: eso lo hace la base al guardar.
 */
export function ordenarServicios(servicios: readonly TipoProceso[]): TipoProceso[] {
  return [...new Set(servicios)].sort((a, b) => ORDEN_PROCESO[a] - ORDEN_PROCESO[b]);
}
