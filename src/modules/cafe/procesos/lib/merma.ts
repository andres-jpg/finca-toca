// Cálculos puros de la merma de un proceso. Dan lo mismo que las columnas generadas de `cafe.procesos` (la base
// SIEMPRE las recalcula; esto es la vista previa en pantalla):
//   merma_kg  = peso_entrada_kg - peso_salida_kg
//   merma_pct = round((entrada - salida) / entrada * 100, 3)
//   desvio    = abs(merma_pct - referencia) > tolerancia
// Trabaja en gramos enteros para no arrastrar errores de coma flotante.

export interface Merma {
  mermaKg: number;
  mermaPct: number;
}

const aGramos = (kg: number) => Math.round(kg * 1000);

/**
 * Merma de un proceso. `mermaPct` se redondea a 3 decimales con los medios hacia arriba, igual que `round()` de
 * Postgres con valores positivos:
 *
 *   500 → 405 kg  →  95 kg · 19 %          405 → 332 kg  →  73 kg · 18,025 %          81 → 0 kg  →  81 kg · 100 %
 *
 * Devuelve `null` cuando no se puede calcular (entrada ≤ 0, salida negativa o mayor que la entrada, o valores no
 * numéricos): la vista previa de un formulario a medio llenar no debe romperse.
 */
export function calcularMerma(entradaKg: number, salidaKg: number): Merma | null {
  if (!Number.isFinite(entradaKg) || !Number.isFinite(salidaKg)) return null;
  const entrada = aGramos(entradaKg);
  const salida = aGramos(salidaKg);
  if (entrada <= 0 || salida < 0 || salida > entrada) return null;

  const merma = entrada - salida;
  // pct × 1.000 = merma × 100.000 / entrada, redondeado medio hacia arriba con enteros (< 2^53 para < 10.000 t).
  const milesimas = Math.floor((merma * 100000 * 2 + entrada) / (2 * entrada));
  return { mermaKg: merma / 1000, mermaPct: milesimas / 1000 };
}

/**
 * ¿La merma se aleja de la referencia más que la tolerancia? Estricto: justo en el límite NO es desvío (22 % con
 * referencia 19 y tolerancia 3). Sin referencia o sin tolerancia (molienda y empaque, decisión 3 de CO-20)
 * nunca hay desvío. Es un aviso: no bloquea el guardado.
 */
export function esDesvio(
  mermaPct: number,
  referenciaPct: number | null | undefined,
  toleranciaPts: number | null | undefined,
): boolean {
  if (referenciaPct == null || toleranciaPts == null) return false;
  if (!Number.isFinite(mermaPct) || !Number.isFinite(referenciaPct) || !Number.isFinite(toleranciaPts)) return false;
  return Math.abs(aGramos(mermaPct) - aGramos(referenciaPct)) > aGramos(toleranciaPts);
}
