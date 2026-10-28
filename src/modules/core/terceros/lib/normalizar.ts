/**
 * Normalización de terceros. **Debe dar lo mismo que `public.normalizar_identificacion()` y
 * `public.normalizar_nombre()`** (migración `terceros`): `normalizar.test.ts` y
 * `supabase/tests/80_terceros.test.sql` comparten casos. Puro y sin dependencias, para usarlo tanto en
 * el formulario como en el servidor.
 *
 * La base vuelve a normalizar en un trigger, así que esto no es la frontera: sirve para comparar en el
 * cliente (p. ej. detectar duplicados en una lista ya cargada) y para que lo que se envía ya sea lo que
 * se guardará.
 */

/** Sin espacios, puntos ni guiones y en mayúsculas: `900.123.456-7` = `900 123 456 7` = `9001234567`. */
export function normalizarIdentificacion(texto: string | null | undefined): string {
  return (texto ?? "").replace(/[\s.-]/g, "").toUpperCase();
}

/** `trim` y espacios internos colapsados. No toca mayúsculas ni tildes. */
export function normalizarNombre(texto: string | null | undefined): string {
  return (texto ?? "").replace(/\s+/g, " ").trim();
}
