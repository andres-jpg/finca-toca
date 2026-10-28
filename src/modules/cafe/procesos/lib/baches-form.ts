import { sugerirBaches, totalesBaches } from "./baches";
import { aTextoDecimal, parsearDecimal } from "./numero";

// Los baches tal como los edita el operario en la tabla de la tostión: TEXTO (con coma decimal), no números, para
// no pelear con el cursor mientras escribe. `lib/baches.ts` (CO-27) tiene las cuentas con números; esto las
// aplica a lo escrito. Puro, sin React ni base.

export interface BacheFila {
  pesoEntradaKg: string;
  pesoSalidaKg: string;
  /** Opcional. */
  temperaturaC: string;
}

export const filaVacia = (): BacheFila => ({ pesoEntradaKg: "", pesoSalidaKg: "", temperaturaC: "" });

/**
 * Baches sugeridos para tostar `pesoKg` en una tostadora de `capacidadKg` (misma regla que
 * `cafe.sugerir_baches()`): solo rellena la ENTRADA de cada bache; la salida la pesa el operario.
 * `[]` si el peso o la capacidad no sirven.
 */
export function filasSugeridas(pesoKg: number | null, capacidadKg: number): BacheFila[] {
  if (pesoKg === null) return [];
  try {
    return sugerirBaches(pesoKg, capacidadKg).map((kg) => ({ ...filaVacia(), pesoEntradaKg: aTextoDecimal(kg) }));
  } catch {
    return [];
  }
}

export interface EstadoBaches {
  sumaEntradaKg: number;
  sumaSalidaKg: number;
  /** Entrada del proceso menos la suma de entradas de los baches (positivo = faltan kg por repartir); `null` sin entrada. */
  diferenciaKg: number | null;
  /** Todas las filas tienen entrada > 0 y salida entre 0 y su entrada. */
  filasValidas: boolean;
  /** Hay baches, son válidos y suman la entrada del proceso (tolerancia de 1 g, como la base). */
  cuadra: boolean;
}

/** Cuentas en vivo de la tabla de baches contra el peso de entrada del proceso. */
export function estadoBaches(filas: readonly BacheFila[], entradaKg: number | null): EstadoBaches {
  const leidas = filas.map((f) => ({ e: parsearDecimal(f.pesoEntradaKg), s: parsearDecimal(f.pesoSalidaKg) }));
  const { entradaKg: sumaEntradaKg, salidaKg: sumaSalidaKg } = totalesBaches(
    leidas.map((f) => ({ peso_entrada_kg: f.e ?? 0, peso_salida_kg: f.s ?? 0 })),
  );
  const filasValidas =
    filas.length > 0 && leidas.every((f) => f.e !== null && f.e > 0 && f.s !== null && f.s >= 0 && f.s <= f.e);
  const diferenciaKg = entradaKg === null ? null : Math.round((entradaKg - sumaEntradaKg) * 1000) / 1000;
  return {
    sumaEntradaKg,
    sumaSalidaKg,
    diferenciaKg,
    filasValidas,
    cuadra: filasValidas && diferenciaKg !== null && Math.abs(diferenciaKg) <= 0.001,
  };
}
