// Formato de números en pantalla (FIN-122 · A-04). ÚNICO sitio donde se decide cómo se ve un peso, un porcentaje o
// un valor en pesos; el almacenamiento no cambia (kg con 3 decimales en la base) y los cálculos usan el valor
// completo: aquí solo se redondea lo que se MUESTRA.
//
//   kg  → 1 decimal, coma decimal, punto de miles   `156,0 kg`   `1.234,5 kg`
//   %   → 1 decimal                                 `18,3 %`
//   COP → sin decimales                             `$19.260`
//
// A mano y no con `Intl`: el agrupado de `es-CO` cambia según la versión de ICU del servidor y del navegador (un
// 4.000 sale a veces «4000») y el texto se renderiza en los dos, lo que rompería la hidratación.

const conMiles = (entero: string) => entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

/** `n` con `decimales` (0 o 1) y redondeo del medio hacia arriba sobre su valor a milésimas (la precisión guardada). */
function numeroEs(n: number, decimales: 0 | 1): string {
  const milesimas = Math.round(Math.abs(n) * 1000);
  const unidad = decimales === 1 ? 100 : 1000;
  const redondeado = Math.floor((milesimas + unidad / 2) / unidad);
  const entero = decimales === 1 ? Math.floor(redondeado / 10) : redondeado;
  const dec = decimales === 1 ? `,${redondeado % 10}` : "";
  const signo = n < 0 && redondeado > 0 ? "-" : "";
  return `${signo}${conMiles(String(entero))}${dec}`;
}

/** Kilos sin la unidad, con 1 decimal: `156` → `156,0`, `1234.56` → `1.234,6`. No finito → `0,0`. */
export function formatKgNum(kg: number): string {
  return Number.isFinite(kg) ? numeroEs(kg, 1) : "0,0";
}

/** Kilos con la unidad: `156` → `156,0 kg`. */
export function formatKg(kg: number): string {
  return `${formatKgNum(kg)} kg`;
}

/** Porcentaje sin el signo, con 1 decimal: `13.33333` → `13,3`, `19` → `19,0`. No finito → `0,0`. */
export function formatPctNum(pct: number): string {
  return Number.isFinite(pct) ? numeroEs(pct, 1) : "0,0";
}

/** Porcentaje con 1 decimal: `18.3` → `18,3 %`. `null`/no finito → «—». */
export function formatPct(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return "—";
  return `${numeroEs(pct, 1)} %`;
}

/** Pesos colombianos sin decimales: `19260` → `$19.260`, `-1500.4` → `-$1.500`. No finito → `$0`. */
export function formatCOP(valor: number): string {
  if (!Number.isFinite(valor)) return "$0";
  const texto = numeroEs(Math.abs(valor), 0);
  return `${valor < 0 && texto !== "0" ? "-" : ""}$${texto}`;
}
