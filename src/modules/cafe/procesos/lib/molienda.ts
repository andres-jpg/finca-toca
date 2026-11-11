import { formatKg } from "@/modules/core/formato/numeros";

// «Molienda solicitada» (B-03, B-06, B-07): la decisión de cuánto café tostado se muele. UNA sola estimación para la
// recepción (terceros), la tostión (por tanda) y la confirmación de molienda. Es la misma cuenta que hacen
// `cafe.registrar_recepcion`, `cafe._insertar_proceso` y `cafe.confirmar_molienda` en SQL (comparten casos de prueba en
// Vitest y pgTAP): tostado estimado = entrada × (1 − merma de trilla si se contrata) × (1 − merma de tostión), a 1 decimal;
// «Mitad» = la mitad del tostado redondeado; «Otra cantidad» = lo digitado. Puro, sin React ni base.

export const MODOS_MOLIENDA = ["todo", "mitad", "kg", "ninguna"] as const;
export type ModoMolienda = (typeof MODOS_MOLIENDA)[number];

export const ETIQUETA_MODO_MOLIENDA: Readonly<Record<ModoMolienda, string>> = {
  todo: "Todo",
  mitad: "Mitad",
  kg: "Otra cantidad (kg)",
  ninguna: "Sin molienda",
};

/** Decisión tal como se guarda: el modo y, salvo «ninguna», los kilos estimados a moler. */
export interface MoliendaDecision {
  modo: ModoMolienda;
  kg: number | null;
}

export interface EntradaMolienda {
  /** Kilos que entran: el peso recibido (recepción) o los kilos a tostar de la tanda (tostión). */
  kgEntrada: number;
  /** El lote contrata trilla antes de la tostión (solo en la recepción; en la tostión el café ya está trillado). */
  trilla: boolean;
  mermaTrillaPct: number;
  mermaTostionPct: number;
  modo: ModoMolienda;
  /** Solo con modo «kg». */
  kg?: number | null;
}

export interface EstimacionMolienda {
  /** Tostado estimado (1 decimal). */
  tostadoKg: number;
  /** Kilos a moler. */
  molidoKg: number;
  /** Lo que queda en grano (tostado − molido, 1 decimal). */
  granoKg: number;
  /** Modo «kg» con más kilos que el tostado estimado (la base lo rechaza). */
  excede: boolean;
}

/** Tolerancia con la que la base acepta «Otra cantidad» sobre el tostado estimado. */
export const TOLERANCIA_MOLIENDA_KG = 0.05;

const aDecimas = (n: number) => Math.round(Math.round(n * 1e6) / 1e5);
const deDecimas = (d: number) => d / 10;
const pctValido = (n: number) => (Number.isFinite(n) && n >= 0 && n <= 100 ? n : 0);

/** Tostado estimado a 1 decimal. */
export function tostadoEstimadoKg({ kgEntrada, trilla, mermaTrillaPct, mermaTostionPct }: Pick<EntradaMolienda, "kgEntrada" | "trilla" | "mermaTrillaPct" | "mermaTostionPct">): number {
  if (!Number.isFinite(kgEntrada) || kgEntrada <= 0) return 0;
  const trillado = trilla ? kgEntrada * (1 - pctValido(mermaTrillaPct) / 100) : kgEntrada;
  return deDecimas(aDecimas(trillado * (1 - pctValido(mermaTostionPct) / 100)));
}

export function estimarMolienda(e: EntradaMolienda): EstimacionMolienda {
  const tostadoKg = tostadoEstimadoKg(e);
  const decimasTostado = aDecimas(tostadoKg);
  let molidoKg = 0;
  if (e.modo === "todo") molidoKg = tostadoKg;
  else if (e.modo === "mitad") molidoKg = deDecimas(Math.round(decimasTostado / 2));
  else if (e.modo === "kg") molidoKg = typeof e.kg === "number" && Number.isFinite(e.kg) && e.kg > 0 ? e.kg : 0;
  const excede = e.modo === "kg" && molidoKg > tostadoKg + TOLERANCIA_MOLIENDA_KG;
  const granoKg = deDecimas(Math.max(0, aDecimas(tostadoKg - molidoKg)));
  return { tostadoKg, molidoKg, granoKg, excede };
}

/** Decisión lista para guardar (los kilos de «todo»/«mitad» ya resueltos; la base los vuelve a calcular). */
export function decisionDeMolienda(modo: ModoMolienda, est: EstimacionMolienda): MoliendaDecision {
  return { modo, kg: modo === "ninguna" ? null : est.molidoKg };
}

/** Texto de la recepción (B-03). */
export function textoEstimadoRecepcion(est: EstimacionMolienda): string {
  return `Estimado: ${formatKg(est.tostadoKg)} tostados, de los cuales ${formatKg(est.molidoKg)} molidos y ${formatKg(est.granoKg)} en grano. El peso final depende de la merma.`;
}

/** Texto de la tostión (B-06). */
export function textoEstimadoTostion(est: EstimacionMolienda): string {
  return `Estimado: ${formatKg(est.tostadoKg)} tostados · ${formatKg(est.molidoKg)} a molienda · ${formatKg(est.granoKg)} en grano. El peso real se confirma en empaque.`;
}

/** Mensaje cuando «Otra cantidad» pasa del tostado estimado. */
export function mensajeMoliendaExcede(est: EstimacionMolienda): string {
  return `La cantidad a moler supera el tostado estimado (${formatKg(est.tostadoKg)}).`;
}
