import type { Json } from "@/lib/supabase/database.types";
import type { MagnitudCalidad, RangoCalidad } from "@/modules/cafe/recepciones/lib/calidad";

// Cómo se ve la calidad del pergamino en la ficha: el valor medido, el rango contra el que se midió (el SNAPSHOT que
// guardó el lote, no el parámetro de hoy) y la alerta que dio. Pura.

export interface CalidadMedida {
  magnitud: MagnitudCalidad;
  valor: number;
  /** Rango vigente cuando se registró el lote; `null` si no había rango configurado. */
  rango: RangoCalidad | null;
  /** `baja` / `alta` si salió del rango. */
  alerta: "baja" | "alta" | null;
}

/** Lee un rango `{min, max}` del snapshot `rangos_calidad`; `null` si falta o no tiene la forma esperada. */
export function leerRangoSnapshot(rangos: Json | null, magnitud: MagnitudCalidad): RangoCalidad | null {
  if (rangos === null || typeof rangos !== "object" || Array.isArray(rangos)) return null;
  const r = rangos[magnitud];
  if (r === null || r === undefined || typeof r !== "object" || Array.isArray(r)) return null;
  const { min, max } = r;
  return typeof min === "number" && typeof max === "number" ? { min, max } : null;
}

/** Las mediciones del lote (humedad y/o densidad) que se tomaron, con su rango y su alerta. */
export function medicionesDeCalidad(lote: {
  humedadPct: number | null;
  densidad: number | null;
  rangosCalidad: Json | null;
  alertasCalidad: readonly string[];
}): CalidadMedida[] {
  const alerta = (m: MagnitudCalidad): "baja" | "alta" | null =>
    lote.alertasCalidad.includes(`${m}_alta`) ? "alta" : lote.alertasCalidad.includes(`${m}_baja`) ? "baja" : null;
  const medidas: CalidadMedida[] = [];
  if (lote.humedadPct !== null) {
    medidas.push({ magnitud: "humedad", valor: lote.humedadPct, rango: leerRangoSnapshot(lote.rangosCalidad, "humedad"), alerta: alerta("humedad") });
  }
  if (lote.densidad !== null) {
    medidas.push({ magnitud: "densidad", valor: lote.densidad, rango: leerRangoSnapshot(lote.rangosCalidad, "densidad"), alerta: alerta("densidad") });
  }
  return medidas;
}
