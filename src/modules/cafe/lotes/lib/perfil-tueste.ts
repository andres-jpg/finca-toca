import type { NivelTueste } from "../types";
import { etiquetaTueste } from "./servicios";

/**
 * Perfil de tueste que pide el cliente (FIN-127 · A-09): nivel (obligatorio con tostión) y, opcionales,
 * temperatura en °C y tiempo en minutos. Función pura. Mismos límites que los CHECK de `cafe.lotes`.
 */
export const TEMP_PERFIL_MAX_C = 400;
export const TIEMPO_PERFIL_MAX_MIN = 120;

/** 205 → «205», 12.5 → «12,5» (coma decimal, sin ceros sobrantes). */
const num = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

/** «medio · 205 °C · 12 min»; sin temperatura o tiempo, omite esa parte. `null` si no hay nivel. */
export function textoPerfilTueste(p: {
  nivel: NivelTueste | null | undefined;
  tempC?: number | null;
  tiempoMin?: number | null;
}): string | null {
  if (!p.nivel) return null;
  const partes: string[] = [etiquetaTueste(p.nivel).toLowerCase()];
  if (p.tempC != null) partes.push(`${num(p.tempC)} °C`);
  if (p.tiempoMin != null) partes.push(`${num(p.tiempoMin)} min`);
  return partes.join(" · ");
}
