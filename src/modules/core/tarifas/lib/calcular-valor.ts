/**
 * Valor a cobrar por un proceso: `pesoKg × tarifa`, redondeado a pesos enteros (`Math.round`). Función
 * pura; el valor resultante se guarda en el proceso, así que un cambio posterior de tarifa no lo toca.
 *
 * El producto se limpia a 6 decimales antes de redondear para que el ruido de la coma flotante
 * (p. ej. 1.005 × 1000 = 1004.9999999999999) no decida el redondeo de un medio exacto.
 * Rechaza pesos o tarifas negativos o no finitos: cobrar NaN o un valor negativo es un error de quien llama.
 */
export function calcularValor(pesoKg: number, tarifa: number): number {
  if (!Number.isFinite(pesoKg) || pesoKg < 0) throw new RangeError("El peso debe ser un número mayor o igual a cero.");
  if (!Number.isFinite(tarifa) || tarifa < 0) throw new RangeError("La tarifa debe ser un número mayor o igual a cero.");
  return Math.round(Number((pesoKg * tarifa).toFixed(6)));
}
