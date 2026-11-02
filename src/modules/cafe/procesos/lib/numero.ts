import { formatKgNum, formatPctNum } from "@/modules/core/formato/numeros";

// Números de la planta: lectura de lo que escribe el operario (con coma decimal) y formato en pantalla. Puro,
// sin React ni base. Los campos de peso son de texto (`inputMode="decimal"`) y no `type="number"`: este último
// acepta o rechaza la coma según el idioma del navegador de la tablet.

/**
 * Lee un número escrito a mano. La COMA es el decimal (como se escribe en Colombia) y, si hay coma, los puntos
 * son separadores de miles; sin coma, un punto solo es el decimal (`13.5`) y varios puntos son miles.
 *
 *   "13,5" → 13.5      "405" → 405      "1.234,5" → 1234.5      "13.5" → 13.5      "1.234.567" → 1234567
 *
 * Devuelve `null` si está vacío o no es un número no negativo (letras, varias comas, signo). Acepta espacios.
 */
export function parsearDecimal(texto: string | number | null | undefined): number | null {
  if (typeof texto === "number") return Number.isFinite(texto) && texto >= 0 ? texto : null;
  if (typeof texto !== "string") return null;
  const limpio = texto.replace(/[\s ]/g, "");
  if (limpio === "" || !/^[0-9.,]+$/.test(limpio)) return null;

  let normalizado: string;
  if (limpio.includes(",")) {
    if (limpio.split(",").length > 2) return null;
    const [entera, decimal] = limpio.split(",");
    // Los puntos de la parte entera son miles: «1.234» sí, «1.2.3» no.
    if (entera.includes(".") && !/^\d{1,3}(\.\d{3})+$/.test(entera)) return null;
    if (decimal.includes(".")) return null;
    normalizado = `${entera.replace(/\./g, "")}.${decimal}`;
  } else if (limpio.split(".").length > 2) {
    if (!/^\d{1,3}(\.\d{3})+$/.test(limpio)) return null;
    normalizado = limpio.replace(/\./g, "");
  } else {
    normalizado = limpio;
  }

  const n = Number(normalizado);
  return Number.isFinite(n) ? n : null;
}

/** El número como lo escribiría el operario para precargar un campo: sin miles y con coma (`13.5` → `"13,5"`). */
export function aTextoDecimal(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "";
  return String(Math.round(n * 1000) / 1000).replace(".", ",");
}

function conMiles(entero: string) {
  return entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Kilos con 1 decimal y coma (FIN-122): `405` → `405,0`, `1234.56` → `1.234,6`. No añade la unidad. Se guarda con 3 decimales. */
export const formatearPeso = formatKgNum;

/** Porcentaje con coma y 1 decimal (FIN-122): `25` → `25,0`. El signo `%` lo pone quien llama. */
export const formatearPorcentaje = formatPctNum;

/** Referencia/tolerancia sin ceros sobrantes: `19` → `19`, `2.5` → `2,5`. */
export function formatearCompacto(n: number): string {
  if (!Number.isFinite(n)) return "0";
  const [entero, dec] = String(Math.round(n * 1000) / 1000).split(".");
  return `${conMiles(entero)}${dec ? `,${dec}` : ""}`;
}

/** `2026-11-06` → `06/11` (con `conAnio`, `06/11/2026`), sin pasar por `Date`: correría un día en UTC-5. */
export function fechaCorta(ymd: string, conAnio = false): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return ymd;
  return conAnio ? `${m[3]}/${m[2]}/${m[1]}` : `${m[3]}/${m[2]}`;
}
