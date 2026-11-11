import type { PerfilTuesteFila, PerfilTuesteTipo } from "../types";

// Resolución del perfil de tueste vigente a una fecha (B-18). Pura y sin zona horaria: las fechas son
// `YYYY-MM-DD` ya calculadas en la zona del cliente, y se comparan como texto. Misma regla que
// `cafe.perfil_tueste_vigente(p_tipo, p_fecha)` en SQL (los dos comparten casos de prueba).

/** Fila de la base → versión de perfil. */
export function aPerfilTueste(f: PerfilTuesteFila): PerfilTuesteTipo {
  return {
    id: f.id,
    tipoCafeId: f.tipo_cafe_id,
    nivel: f.nivel,
    tempC: Number(f.temp_c),
    tiempoMin: Number(f.tiempo_min),
    vigenteDesde: f.vigente_desde,
  };
}

/**
 * Versiones de un tipo (o de maquila con `tipoCafeId = null`), de la más reciente a la más antigua.
 * No modifica el arreglo recibido.
 */
export function historialPerfil(perfiles: readonly PerfilTuesteTipo[], tipoCafeId: string | null): PerfilTuesteTipo[] {
  return perfiles
    .filter((p) => p.tipoCafeId === tipoCafeId)
    .sort((a, b) => (a.vigenteDesde < b.vigenteDesde ? 1 : a.vigenteDesde > b.vigenteDesde ? -1 : 0));
}

/**
 * Perfil vigente de un tipo de café en una fecha: la versión más reciente con `vigenteDesde <= fecha`.
 * `tipoCafeId = null` resuelve el predeterminado de maquila. `null` si el tipo no tiene perfil a esa fecha
 * (no hay perfil de respaldo: quien lo consume decide qué hacer).
 */
export function resolverPerfilVigente(
  perfiles: readonly PerfilTuesteTipo[],
  tipoCafeId: string | null,
  fecha: string,
): PerfilTuesteTipo | null {
  return historialPerfil(perfiles, tipoCafeId).find((p) => p.vigenteDesde <= fecha) ?? null;
}

/** Próxima versión aún no vigente (para avisar «cambia el …»), o `null` si no hay ninguna futura. */
export function proximoPerfil(
  perfiles: readonly PerfilTuesteTipo[],
  tipoCafeId: string | null,
  fecha: string,
): PerfilTuesteTipo | null {
  const futuras = historialPerfil(perfiles, tipoCafeId).filter((p) => p.vigenteDesde > fecha);
  return futuras.length > 0 ? futuras[futuras.length - 1] : null;
}
