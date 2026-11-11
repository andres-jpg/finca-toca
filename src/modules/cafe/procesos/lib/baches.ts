import type { BacheEntrada } from "../types";

/** Reparte `totalKg` en `n` partes iguales a gramos; la ÚLTIMA absorbe el resto (misma regla que `cafe.sugerir_baches`). */
function repartirPeso(totalKg: number, n: number): number[] {
  const totalG = Math.round(totalKg * 1000);
  const base = Math.floor(totalG / n);
  const partesG = Array.from({ length: n }, () => base);
  partesG[n - 1] = totalG - base * (n - 1);
  return partesG.map((g) => g / 1000);
}

// Baches de la tostión. `sugerirBaches` es la misma regla que `cafe.sugerir_baches()` en SQL; `bachesCuadran` la
// misma comprobación que el constraint trigger de `cafe.baches` (1 g de tolerancia, solo entradas).

/**
 * Sugerencia de reparto en baches: n = ceil(peso / capacidad) y partes iguales a gramos, con el ÚLTIMO bache
 * absorbiendo el resto. La planta lo edita después.
 *
 *   81 kg / 13,5   → 6 × 13,5            100 kg / 13,5 → 8 × 12,5            405 kg / 13,5 → 30 × 13,5
 *   14 kg / 13,5   → 7 + 7               100,001 kg    → 12,5 ×7 + 12,501
 *
 * Lanza `RangeError` con peso o capacidad no positivos o no numéricos.
 */
export function sugerirBaches(pesoKg: number, capacidadKg: number): number[] {
  if (!Number.isFinite(pesoKg) || pesoKg <= 0) {
    throw new RangeError("El peso a tostar debe ser mayor que cero");
  }
  if (!Number.isFinite(capacidadKg) || capacidadKg <= 0) {
    throw new RangeError("La capacidad de la tostadora debe ser mayor que cero");
  }
  const pesoG = Math.round(pesoKg * 1000);
  const capacidadG = Math.max(Math.round(capacidadKg * 1000), 1);
  return repartirPeso(pesoKg, Math.ceil(pesoG / capacidadG));
}

/** Suma de las entradas de los baches, en kilos y sin ruido de coma flotante (a gramos). */
export function totalesBaches(baches: readonly Pick<BacheEntrada, "peso_entrada_kg">[]): { entradaKg: number } {
  let entrada = 0;
  for (const b of baches) entrada += Math.round((Number.isFinite(b.peso_entrada_kg) ? b.peso_entrada_kg : 0) * 1000);
  return { entradaKg: entrada / 1000 };
}

/**
 * ¿Los baches suman los kilos a tostar? Tolerancia de 1 g, como la base (`baches_no_cuadran`); sin baches no cuadra:
 * la tostión exige al menos uno. Los baches ya no llevan peso de salida (B-05).
 */
export function bachesCuadran(baches: readonly Pick<BacheEntrada, "peso_entrada_kg">[], entradaKg: number): boolean {
  if (baches.length === 0) return false;
  return Math.abs(Math.round(totalesBaches(baches).entradaKg * 1000) - Math.round(entradaKg * 1000)) <= 1;
}
