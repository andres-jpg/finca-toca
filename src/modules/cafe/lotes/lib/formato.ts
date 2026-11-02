import { formatKgNum, formatPct } from "@/modules/core/formato/numeros";

// Formato de lo que muestran el listado y la ficha de lotes. Funciones puras: se formatea a mano (no con `Intl`
// salvo la zona horaria) para que el servidor y el navegador den el mismo texto.

/** `2026-11-05` → `05/11/2026`, sin pasar por `Date` (correría un día en UTC-5). */
export function fechaCorta(ymd: string): string {
  const [a, m, d] = ymd.split("-");
  return a && m && d ? `${d}/${m}/${a}` : ymd;
}

/**
 * Un instante (`timestamptz`) como `05/11/2026 14:32` en la zona del cliente. Con zona explícita porque la
 * página se renderiza en el servidor (UTC en Vercel) y el cliente está en UTC-5. Devuelve «—» si no es una fecha.
 */
export function fechaHoraZona(iso: string, zona: string): string {
  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return "—";
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: zona,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(instante);
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "";
  return `${p("day")}/${p("month")}/${p("year")} ${p("hour")}:${p("minute")}`;
}

/**
 * Hora de llegada de un instante en la zona del cliente, en 12 h: `7:15 a. m.`, `12:05 p. m.`, `12:30 a. m.` (FIN-129 · A-11).
 * Se arma a mano (hora 0-23 de `Intl` + sufijo propio) para que no dependa de los datos de ICU del servidor.
 * Devuelve «—» si no es una fecha.
 */
export function horaLlegada(iso: string | null | undefined, zona: string): string {
  if (!iso) return "—";
  const instante = new Date(iso);
  if (Number.isNaN(instante.getTime())) return "—";
  const partes = new Intl.DateTimeFormat("en-GB", { timeZone: zona, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(instante);
  const hora24 = Number(partes.find((x) => x.type === "hour")?.value);
  const minutos = partes.find((x) => x.type === "minute")?.value;
  if (!Number.isFinite(hora24) || !minutos) return "—";
  const hora12 = hora24 % 12 === 0 ? 12 : hora24 % 12;
  return `${hora12}:${minutos} ${hora24 < 12 ? "a. m." : "p. m."}`;
}

/** Kilos con 1 decimal y coma (`332` → `332,0`, `1234.56` → `1.234,6`), sin la unidad. Los pesos se guardan con 3 decimales; aquí solo se muestran (FIN-122). */
export const formatearKg3 = formatKgNum;

/**
 * Porcentaje de merma = merma / entrada, redondeado a 2 decimales (medios hacia arriba) y calculado con los KILOS,
 * no con el `merma_pct` guardado. La base guarda 3 decimales (`18,025` para 73 de 405 kg) y redondear ese valor otra
 * vez daría 18,03; el cociente exacto es 18,0247 → 18,02, que es lo que dice el informe. Todo lo que se MUESTRA
 * pasa por aquí para que el mismo dato salga igual en el listado, la ficha, la línea de tiempo y el Excel.
 *
 *   95 de 500 kg → 19    73 de 405 kg → 18,02    2 de 332 kg → 0,6    168 de 500 kg → 33,6
 *
 * `null` si la entrada no es positiva o los valores no son números.
 */
export function pctDeMerma(mermaKg: number | null | undefined, entradaKg: number | null | undefined): number | null {
  if (mermaKg == null || entradaKg == null || !Number.isFinite(mermaKg) || !Number.isFinite(entradaKg)) return null;
  const entrada = Math.round(entradaKg * 1000);
  if (entrada <= 0) return null;
  const merma = Math.round(mermaKg * 1000);
  // centésimas de punto = merma × 10.000 / entrada, medio hacia arriba con enteros
  const centesimas = Math.floor((merma * 10000 * 2 + entrada) / (2 * entrada));
  return centesimas / 100;
}

/** `19` → `19,0 %`, `18.02` → `18,0 %`, `0.6` → `0,6 %`. 1 decimal (FIN-122). `null` → «—». */
export const formatearPct = formatPct;

/** Merma en porcentaje ya formateada desde los kilos (ver `pctDeMerma`). */
export function formatearMermaPct(mermaKg: number | null | undefined, entradaKg: number | null | undefined): string {
  return formatearPct(pctDeMerma(mermaKg, entradaKg));
}
