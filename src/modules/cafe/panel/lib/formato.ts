import { formatKg, formatPct } from "@/modules/core/formato/numeros";

// Formato de lo que muestra el panel. A mano (sin `Intl`, que agrupa distinto según la versión de ICU) para que el servidor y el
// navegador den el mismo texto. Los kg, los % y los pesos salen de `core/formato/numeros` (kg con 1 decimal).

const conMiles = (entero: string) => entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** `332` → `332,0 kg`, `1234.5` → `1.234,5 kg`. */
export function kgTexto(kg: number): string {
  return formatKg(kg);
}

/** Entero con puntos de miles: `1923000` → `1.923.000`. */
export function enteroTexto(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return `${n < 0 ? "-" : ""}${conMiles(String(Math.round(Math.abs(n))))}`;
}

/** Libras enteras con la unidad: `2907` → `2.907 lb`. */
export function librasTexto(lb: number): string {
  return `${enteroTexto(lb)} lb`;
}

/** Millones con 1 decimal y coma, sin símbolo: `1234000` → `1,2`, `98000` → `0,1`. Para los ejes y el total sobre cada barra. */
export function millonesTexto(valor: number): string {
  if (!Number.isFinite(valor)) return "0,0";
  return (Math.round(Math.abs(valor) / 100_000) / 10).toFixed(1).replace(".", ",");
}

/** `2026-03-09` → `09/03`, para los ejes. */
export function diaCorto(ymd: string): string {
  const [, m, d] = ymd.split("-");
  return m && d ? `${d}/${m}` : ymd;
}

/** Variación con signo y 1 decimal: `4.2` → `+4,2 %`, `-1` → `−1,0 %`, `0` → `0,0 %`. */
export function variacionTexto(pct: number): string {
  const abs = formatPct(Math.abs(pct));
  return pct > 0 ? `+${abs}` : pct < 0 ? `−${abs}` : abs;
}
