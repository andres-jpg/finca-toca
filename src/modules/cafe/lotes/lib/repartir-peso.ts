/**
 * Reparte el peso de un lote entre sus bultos. Función pura: es la misma regla que aplicará la RPC de
 * registro en SQL (CO-25/CO-26): partes iguales a gramos y el ÚLTIMO bulto absorbe el resto.
 *
 *   375 kg / 6 → 62,500 ×6        100 kg / 3 → 33,333 · 33,333 · 33,334
 *
 * Trabaja en gramos enteros para no arrastrar errores de coma flotante; los pesos de salida tienen como
 * mucho 3 decimales (la precisión de `numeric(10,3)`). Cada parte es el gramo entero hacia abajo y el
 * último recibe el resto, así que ninguna parte sale nunca negativa.
 */
export function repartirPeso(totalKg: number, n: number): number[] {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError("El número de bultos debe ser un entero de 1 en adelante");
  }
  if (!Number.isFinite(totalKg) || totalKg <= 0) {
    throw new RangeError("El peso total debe ser mayor que cero");
  }

  const totalG = Math.round(totalKg * 1000);
  const base = Math.floor(totalG / n);
  if (base < 1) {
    throw new RangeError("El peso es demasiado pequeño para repartirlo en tantos bultos");
  }

  const partesG = Array.from({ length: n }, () => base);
  partesG[n - 1] = totalG - base * (n - 1);
  return partesG.map((g) => g / 1000);
}
