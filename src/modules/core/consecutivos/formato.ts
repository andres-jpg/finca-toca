/**
 * Formato de consecutivos, **solo para previsualizar** ("Próximo número: MP-2026-0013").
 *
 * El número real lo genera `public.siguiente_consecutivo()` en Postgres, atómicamente; esto no reserva
 * nada. Tiene que dar lo mismo que `public.formatear_consecutivo()` (supabase/migrations/
 * 20261029120000_consecutivos.sql): los dos se prueban con los mismos casos (`formato.test.ts` y
 * `supabase/tests/60_consecutivos.test.sql`).
 *
 * Marcadores: `{serie}`, `{anio}` y `{n:4}` (número relleno con ceros hasta 4 cifras; `{n}` sin relleno,
 * ancho de 1 o 2 cifras como mucho). Si el número supera el ancho sigue creciendo, nunca se trunca.
 */
export function formatearConsecutivo(formato: string, serie: string, anio: number, n: number): string {
  // `{n}` primero y `{serie}` al final, para que un texto de la serie no se vuelva a interpretar.
  return formato
    .replace(/\{n(?::(\d{1,2}))?\}/g, (_marcador, ancho?: string) => String(n).padStart(Number(ancho ?? 0), "0"))
    .replace(/\{anio\}/g, () => String(anio))
    .replace(/\{serie\}/g, () => serie);
}
