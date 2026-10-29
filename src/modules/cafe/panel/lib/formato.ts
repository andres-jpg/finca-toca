import { formatearKg } from "../../compras/lib/compra";
import { formatearPct, pctDeMerma } from "../../lotes/lib/formato";
import type { MermaTipo } from "../types";

// Formato de lo que muestra el panel. A mano (sin `Intl`, que agrupa distinto según la versión de ICU) para que el
// servidor y el navegador den el mismo texto. La merma se muestra SIEMPRE calculada desde los kilos (`pctDeMerma`) y
// formateada con `formatearPct`, igual que el listado, la ficha, la línea de tiempo y el Excel.

const conMiles = (entero: string) => entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** `332` → `332 kg`, `1234.5` → `1.234,5 kg` (hasta tres decimales, sin ceros sobrantes). Para cifras grandes y textos. */
export function kgTexto(kg: number): string {
  return `${formatearKg(kg)} kg`;
}

/** Merma % de un tipo de proceso a partir de sus kilos: `19 %`, `18,02 %`; `—` si no hubo procesos. */
export function mermaTexto(m: Pick<MermaTipo, "mermaKg" | "kgEntrada" | "procesos">): string {
  return m.procesos > 0 ? formatearPct(pctDeMerma(m.mermaKg, m.kgEntrada)) : "—";
}

/** Entero con puntos de miles: `1923000` → `1.923.000`. */
export function enteroTexto(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return `${n < 0 ? "-" : ""}${conMiles(String(Math.round(Math.abs(n))))}`;
}

/** Pesos para los ejes de los gráficos: `98000` → `$98 mil`, `1923000` → `$1,9 M`, `450` → `$450`. */
export function abreviarCOP(valor: number): string {
  if (!Number.isFinite(valor)) return "$0";
  const a = Math.abs(valor);
  const signo = valor < 0 ? "-" : "";
  const redondear = (x: number) => String(Math.round(x * 10) / 10).replace(".", ",");
  if (a >= 1_000_000) return `${signo}$${redondear(a / 1_000_000)} M`;
  if (a >= 1_000) return `${signo}$${redondear(a / 1_000)} mil`;
  return `${signo}$${Math.round(a)}`;
}

/** `2026-03-09` → `09/03`, para los ejes. */
export function diaCorto(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return m && d ? `${d}/${m}` : ymd;
}

/** «1 proceso» / «3 procesos». */
export function cuentaProcesos(n: number): string {
  return `${enteroTexto(n)} ${n === 1 ? "proceso" : "procesos"}`;
}

/** «1 lote» / «3 lotes». */
export function cuentaLotes(n: number): string {
  return `${enteroTexto(n)} ${n === 1 ? "lote" : "lotes"}`;
}
