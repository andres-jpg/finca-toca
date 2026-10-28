import type { ParametroDef } from "../registry";

export type OrigenParametro = "guardado" | "defecto";

export interface ValorResuelto<T> {
  valor: T;
  origen: OrigenParametro;
  /** Había un valor guardado pero no cumple el `schema` de la definición (se devolvió el defecto). */
  invalido: boolean;
}

/**
 * Función pura: el valor efectivo de un parámetro a partir de lo guardado (`undefined` = no hay fila).
 * Lo guardado manda si cumple el `schema` de la definición; si falta o no lo cumple, el defecto. No lanza.
 */
export function resolverParametro<T>(def: ParametroDef<T>, guardado: unknown): ValorResuelto<T> {
  if (guardado === undefined) return { valor: def.defecto, origen: "defecto", invalido: false };
  const r = def.schema.safeParse(guardado);
  if (r.success) return { valor: r.data, origen: "guardado", invalido: false };
  return { valor: def.defecto, origen: "defecto", invalido: true };
}
