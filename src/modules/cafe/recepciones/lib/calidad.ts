/**
 * Alertas de calidad del café recibido (HU-F1-02 c3): humedad y densidad contra el rango configurado en
 * `cafe.humedad_rango_pct` / `cafe.densidad_rango`. Avisan, nunca bloquean. Función pura: es la misma regla
 * que aplica `cafe.registrar_recepcion()` en SQL (que es la que guarda el snapshot en el lote); aquí sirve
 * para el aviso en línea mientras se escribe. Los valores se redondean a 2 decimales, como la columna.
 */

export interface RangoCalidad {
  min: number;
  max: number;
}

export type MagnitudCalidad = "humedad" | "densidad";
export type AlertaCalidad = "humedad_baja" | "humedad_alta" | "densidad_baja" | "densidad_alta";

export const ETIQUETA_ALERTA_CALIDAD: Readonly<Record<AlertaCalidad, string>> = {
  humedad_baja: "Humedad baja",
  humedad_alta: "Humedad alta",
  densidad_baja: "Densidad baja",
  densidad_alta: "Densidad alta",
};

const redondear2 = (n: number) => Math.round(n * 100) / 100;

/** `"baja"`, `"alta"` o `null` (dentro del rango, sin valor o sin rango). Los límites del rango no alertan. */
export function posicionEnRango(valor: number | null | undefined, rango: RangoCalidad | null | undefined): "baja" | "alta" | null {
  if (valor === null || valor === undefined || !Number.isFinite(valor) || !rango) return null;
  const v = redondear2(valor);
  if (v < rango.min) return "baja";
  if (v > rango.max) return "alta";
  return null;
}

export interface MedicionesCalidad {
  humedadPct?: number | null;
  densidad?: number | null;
}

export interface RangosCalidad {
  humedad?: RangoCalidad | null;
  densidad?: RangoCalidad | null;
}

/** Alertas de una recepción, en el orden en que las guarda la base: humedad primero. */
export function evaluarCalidad(mediciones: MedicionesCalidad, rangos: RangosCalidad): AlertaCalidad[] {
  const alertas: AlertaCalidad[] = [];
  const h = posicionEnRango(mediciones.humedadPct, rangos.humedad);
  if (h) alertas.push(`humedad_${h}`);
  const d = posicionEnRango(mediciones.densidad, rangos.densidad);
  if (d) alertas.push(`densidad_${d}`);
  return alertas;
}

const NUMERO = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });

/** `13,2` — coma decimal, sin ceros sobrantes. */
export function formatearMedicion(n: number): string {
  return NUMERO.format(n);
}

/** `10–12 %` para la humedad, `600–700` para la densidad. */
export function formatearRango(rango: RangoCalidad, magnitud: MagnitudCalidad): string {
  const unidad = magnitud === "humedad" ? " %" : "";
  return `${formatearMedicion(rango.min)}–${formatearMedicion(rango.max)}${unidad}`;
}

/** Texto del aviso en línea: «Humedad 13,2 % fuera del rango 10–12 %. Puedes guardar igualmente». */
export function mensajeFueraDeRango(magnitud: MagnitudCalidad, valor: number, rango: RangoCalidad): string {
  const nombre = magnitud === "humedad" ? "Humedad" : "Densidad";
  const unidad = magnitud === "humedad" ? " %" : "";
  return `${nombre} ${formatearMedicion(redondear2(valor))}${unidad} fuera del rango ${formatearRango(rango, magnitud)}. Puedes guardar igualmente`;
}

/** Texto gris cuando el rango aún no se configuró: «Rango de humedad sin configurar». */
export function mensajeRangoSinConfigurar(magnitud: MagnitudCalidad): string {
  return `Rango de ${magnitud} sin configurar`;
}
