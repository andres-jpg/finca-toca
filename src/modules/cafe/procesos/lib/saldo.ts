// Saldo por kilos del vertical café (ADR 0002). Espejo TS de `cafe.saldo_tolerancia_kg` y de la lógica de
// `cafe.v_origenes_disponibles`; los casos de prueba son los mismos que los de pgTAP (`86_cafe_saldo_kg.test.sql`).

/** Tolerancia única del saldo: la mayor entre 0,05 kg y el 0,5 % de la base. */
export function toleranciaSaldoKg(baseKg: number): number {
  return Math.max(0.05, (Number.isFinite(baseKg) ? baseKg : 0) * 0.005);
}

/** Saldo de un origen: base menos lo consumido, a gramos (sin ruido de coma flotante). */
export function saldoDe(baseKg: number, consumidoKg: number): number {
  return (Math.round(baseKg * 1000) - Math.round(consumidoKg * 1000)) / 1000;
}

/** ¿Queda café por procesar? Solo si el saldo supera la tolerancia. */
export function quedaSaldo(baseKg: number, consumidoKg: number): boolean {
  return saldoDe(baseKg, consumidoKg) > toleranciaSaldoKg(baseKg);
}

/** Pendiente, completo y parcial de un paso (misma regla que `v_lote_etapas`). */
export function estadoPaso(baseKg: number, procesadoKg: number): { pendienteKg: number; completo: boolean; parcial: boolean } {
  const pendienteKg = Math.max(saldoDe(baseKg, procesadoKg), 0);
  const completo = pendienteKg <= toleranciaSaldoKg(baseKg);
  return { pendienteKg, completo, parcial: procesadoKg > 0 && !completo };
}

/** Merma de una tanda: (entró a tostión − báscula) / entró, en % con 3 decimales; `null` sin entrada. */
export function mermaTanda(entradaKg: number, basculaKg: number): number | null {
  if (!(entradaKg > 0)) return null;
  return Math.round(((entradaKg - basculaKg) / entradaKg) * 100 * 1000) / 1000;
}
