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

const conMiles = (entero: string) => entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/**
 * Kilos con SIEMPRE tres decimales (la precisión del gramo) y coma decimal: `332` → `332,000`, `1234.5` → `1.234,500`.
 * Es el formato de las columnas de peso de las tablas, que así alinean; los textos sueltos usan `formatearKg`.
 */
export function formatearKg3(kg: number): string {
  if (!Number.isFinite(kg)) return "0,000";
  const gramos = Math.round(Math.abs(kg) * 1000);
  const entero = Math.floor(gramos / 1000);
  const decimales = String(gramos % 1000).padStart(3, "0");
  return `${kg < 0 && gramos > 0 ? "-" : ""}${conMiles(String(entero))},${decimales}`;
}

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

/** `19` → `19 %`, `18.02` → `18,02 %`, `0.6` → `0,6 %`. Hasta 2 decimales, sin ceros sobrantes. `null` → «—». */
export function formatearPct(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  const centesimas = Math.round(Math.abs(pct) * 100);
  const entero = Math.floor(centesimas / 100);
  const dec = String(centesimas % 100).padStart(2, "0").replace(/0+$/, "");
  const signo = pct < 0 && centesimas > 0 ? "-" : "";
  return `${signo}${conMiles(String(entero))}${dec ? `,${dec}` : ""} %`;
}

/** Merma en porcentaje ya formateada desde los kilos (ver `pctDeMerma`). */
export function formatearMermaPct(mermaKg: number | null | undefined, entradaKg: number | null | undefined): string {
  return formatearPct(pctDeMerma(mermaKg, entradaKg));
}
