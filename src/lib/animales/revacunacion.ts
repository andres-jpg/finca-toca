import { addMonths } from "date-fns";
import type { PeriodoRevacunacion } from "@/types";

/**
 * Fuente única del control de revacunación: etiquetas, plazos y el cálculo de la fecha.
 * La comparten el formulario de eventos (para previsualizar la fecha), el Server Action
 * (que es quien la persiste, autoritativo) y el cálculo de alertas.
 */

/** Días de antelación con que se avisa una revacunación en el panel de alertas. */
export const DIAS_AVISO_REVACUNACION = 8;

export const PERIODOS_REVACUNACION: PeriodoRevacunacion[] = [
  "1_mes",
  "6_meses",
  "1_anio",
  "personalizada",
];

export const PERIODO_REVACUNACION_LABELS: Record<PeriodoRevacunacion, string> = {
  "1_mes": "1 mes",
  "6_meses": "6 meses",
  "1_anio": "1 año",
  personalizada: "Fecha concreta",
};

/** Texto para el detalle de la alerta y el historial: "revacunar a los 6 meses". */
export const PERIODO_REVACUNACION_DETALLE: Record<PeriodoRevacunacion, string> = {
  "1_mes": "revacunar al mes",
  "6_meses": "revacunar a los 6 meses",
  "1_anio": "revacunar al año",
  personalizada: "fecha de revacunación fijada a mano",
};

/** Meses que suma cada plazo. `personalizada` no suma: la fecha la escribe el usuario. */
const MESES_POR_PERIODO: Record<PeriodoRevacunacion, number | null> = {
  "1_mes": 1,
  "6_meses": 6,
  "1_anio": 12,
  personalizada: null,
};

/**
 * Fecha en la que toca revacunar. Con un plazo predefinido se cuenta desde la fecha de la
 * vacunación —así, si se corrige esa fecha, la de revacunación se recalcula sola—; con
 * `personalizada` se devuelve tal cual la que eligió el usuario.
 *
 * Devuelve `null` si faltan datos, para que quien llame decida (el formulario no muestra
 * la previsualización, el Server Action no persiste nada).
 */
export function calcularFechaRevacunacion(
  fechaVacunacion: Date | undefined,
  periodo: PeriodoRevacunacion | null | undefined,
  fechaManual?: Date | null
): Date | null {
  if (!periodo) return null;

  if (periodo === "personalizada") {
    return fechaManual && !isNaN(fechaManual.getTime()) ? fechaManual : null;
  }

  if (!fechaVacunacion || isNaN(fechaVacunacion.getTime())) return null;

  const meses = MESES_POR_PERIODO[periodo];
  return meses === null ? null : addMonths(fechaVacunacion, meses);
}
