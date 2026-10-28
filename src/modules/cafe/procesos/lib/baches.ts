import { repartirPeso } from "../../lotes/lib/repartir-peso";
import type { BacheEntrada } from "../types";

// Baches de la tostión. `sugerirBaches` es la misma regla que `cafe.sugerir_baches()` en SQL; `bachesCuadran` la
// misma comprobación que el constraint trigger de `cafe.baches` (1 g de tolerancia).

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

/** Suma de entradas y de salidas de los baches, en kilos y sin ruido de coma flotante (a gramos). */
export function totalesBaches(baches: readonly Pick<BacheEntrada, "peso_entrada_kg" | "peso_salida_kg">[]): {
  entradaKg: number;
  salidaKg: number;
} {
  let entrada = 0;
  let salida = 0;
  for (const b of baches) {
    entrada += Math.round((Number.isFinite(b.peso_entrada_kg) ? b.peso_entrada_kg : 0) * 1000);
    salida += Math.round((Number.isFinite(b.peso_salida_kg) ? b.peso_salida_kg : 0) * 1000);
  }
  return { entradaKg: entrada / 1000, salidaKg: salida / 1000 };
}

/**
 * ¿Los baches suman la entrada y la salida del proceso? Tolerancia de 1 g, como la base (`baches_no_cuadran`);
 * sin baches no cuadra: la tostión exige al menos uno.
 */
export function bachesCuadran(
  baches: readonly Pick<BacheEntrada, "peso_entrada_kg" | "peso_salida_kg">[],
  entradaKg: number,
  salidaKg: number,
): boolean {
  if (baches.length === 0) return false;
  const t = totalesBaches(baches);
  return (
    Math.abs(Math.round(t.entradaKg * 1000) - Math.round(entradaKg * 1000)) <= 1 &&
    Math.abs(Math.round(t.salidaKg * 1000) - Math.round(salidaKg * 1000)) <= 1
  );
}
