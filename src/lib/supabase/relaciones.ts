/**
 * Relaciones embebidas de PostgREST (`select("*, otra_tabla(...)")`).
 *
 * Según el tipo de relación —y si la FK es única— PostgREST devuelve la relación como un
 * objeto o como un array, y a veces `null`. El código tiene que aceptar las dos formas
 * (ver "Supabase one-to-one joins" en CLAUDE.md); estos helpers lo hacen en un solo sitio,
 * con tipos, para no repetir `Array.isArray(...)` ni caer en `any`.
 */
export type Rel<T> = T | T[] | null | undefined;

/** La relación como lista, venga como venga (vacía si no hay nada). */
export function aLista<T>(rel: Rel<T>): T[] {
  return Array.isArray(rel) ? rel : rel ? [rel] : [];
}

/** El primer (y normalmente único) elemento de la relación, o `null`. */
export function aUno<T>(rel: Rel<T>): T | null {
  return Array.isArray(rel) ? (rel[0] ?? null) : (rel ?? null);
}
