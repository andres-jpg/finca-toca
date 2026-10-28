/**
 * Piezas puras (sin base ni React) de los insumos de empaque del café: bolsas y etiquetas por tamaño.
 * Un insumo es un artículo de `public.articulos` con `tipo = 'insumo'` y `atributos = {clase, presentacion_g}`;
 * el peso nominal de la bolsa **define la presentación** del producto terminado (ver *Vertical café*).
 */
import { etiquetaPresentacion } from "../../tipos/lib/productos";

export const CLASES_INSUMO = ["bolsa", "etiqueta"] as const;
export type ClaseInsumo = (typeof CLASES_INSUMO)[number];

export const ETIQUETA_CLASE: Record<ClaseInsumo, string> = { bolsa: "Bolsa", etiqueta: "Etiqueta" };
export const ETIQUETA_CLASE_PLURAL: Record<ClaseInsumo, string> = { bolsa: "Bolsas", etiqueta: "Etiquetas" };

/** Límites de la presentación (gramos), los del formulario y los de la acción. */
export const PRESENTACION_MIN_G = 50;
export const PRESENTACION_MAX_G = 50_000;

export function esClaseInsumo(valor: unknown): valor is ClaseInsumo {
  return typeof valor === "string" && (CLASES_INSUMO as readonly string[]).includes(valor);
}

/** «bolsa» + 1000 → «Bolsa 1.000 g». Es el nombre que se sugiere al crear un insumo (editable). */
export function nombreSugeridoInsumo(clase: ClaseInsumo, presentacionG: number): string {
  return `${ETIQUETA_CLASE[clase]} ${etiquetaPresentacion(presentacionG)}`;
}

/** Los `atributos` de un insumo de empaque, o `null` si el artículo no es una bolsa/etiqueta con peso válido. */
export function leerAtributosInsumo(atributos: unknown): { clase: ClaseInsumo; presentacionG: number } | null {
  if (atributos === null || typeof atributos !== "object" || Array.isArray(atributos)) return null;
  const { clase, presentacion_g: g } = atributos as Record<string, unknown>;
  if (!esClaseInsumo(clase)) return null;
  if (typeof g !== "number" || !Number.isFinite(g) || g <= 0) return null;
  return { clase, presentacionG: g };
}

/** `atributos` que se guardan al crear un insumo: es lo que la base usa para evitar duplicados y generar productos. */
export function atributosInsumo(clase: ClaseInsumo, presentacionG: number): { clase: ClaseInsumo; presentacion_g: number } {
  return { clase, presentacion_g: presentacionG };
}

/** Agrupa por clase (bolsas primero) y ordena cada grupo por presentación y nombre. Grupos vacíos no aparecen. */
export function agruparPorClase<T extends { clase: ClaseInsumo; presentacionG: number; nombre: string }>(
  insumos: readonly T[],
): { clase: ClaseInsumo; insumos: T[] }[] {
  return CLASES_INSUMO.map((clase) => ({
    clase,
    insumos: insumos
      .filter((i) => i.clase === clase)
      .sort((a, b) => a.presentacionG - b.presentacionG || a.nombre.localeCompare(b.nombre, "es")),
  })).filter((g) => g.insumos.length > 0);
}

/** `YYYY-MM-DD` de hoy en la zona del cliente (no en la del servidor: en Vercel es UTC). */
export function fechaHoyEnZona(zona: string, ahora: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(ahora);
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";
  return `${p("year")}-${p("month")}-${p("day")}`;
}

const FECHA_YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Desfase (ms) de la zona respecto a UTC en un instante: positivo al este de Greenwich. */
function desfaseZona(zona: string, instante: Date): number {
  const p = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instante);
  const n = (tipo: string) => Number(p.find((x) => x.type === tipo)?.value);
  return Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")) - Math.floor(instante.getTime() / 1000) * 1000;
}

/**
 * Instante (ISO 8601) del mediodía de un `YYYY-MM-DD` en la zona del cliente. Una compra registrada de un
 * día anterior se fecha a esa hora para que ni el cambio de zona ni la hora del servidor la muevan de día.
 * `null` si la fecha no existe (30 de febrero, formato raro).
 */
export function instanteMediodia(fecha: string, zona: string): string | null {
  const m = FECHA_YMD.exec(fecha);
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const utc = Date.UTC(anio, mes - 1, dia, 12);
  const comprobacion = new Date(utc);
  if (comprobacion.getUTCFullYear() !== anio || comprobacion.getUTCMonth() !== mes - 1 || comprobacion.getUTCDate() !== dia) return null;
  // Una pasada basta fuera de los días de cambio de horario, y a mediodía nunca hay uno.
  return new Date(utc - desfaseZona(zona, new Date(utc))).toISOString();
}
