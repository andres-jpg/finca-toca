// Cálculos puros de la compra de café para marca propia. Lo que el operario ve en pantalla (valor total, suma
// de los bultos) sale de aquí; la base lo recalcula por su cuenta (`valor_compra` es columna generada), y estas
// funciones dan lo mismo que ella: `round(peso_kg * precio_kg, 0)`.

/**
 * Valor total de la compra: peso × precio por kilo, en pesos enteros (sin decimales, como `valor_compra`).
 * Trabaja en enteros (gramos × centavos) para no arrastrar errores de coma flotante y redondea medios hacia
 * arriba, igual que `round()` de Postgres con valores positivos:
 *
 *   375 kg × $18.500 → 6.937.500        33,333 kg × $1.234,50 → 41.150 (41.149,5885)
 *
 * Devuelve 0 si falta alguno de los dos o no es un número válido (el valor en vivo no debe romper el formulario).
 */
export function calcularValorCompra(pesoKg: number, precioKg: number): number {
  if (!Number.isFinite(pesoKg) || !Number.isFinite(precioKg) || pesoKg <= 0 || precioKg <= 0) return 0;
  const gramos = BigInt(Math.round(pesoKg * 1000));
  const centavos = BigInt(Math.round(precioKg * 100));
  // gramos × centavos = (kg × 1.000) × (pesos × 100) → pesos × 100.000
  const escala = BigInt(100000);
  return Number((gramos * centavos + escala / BigInt(2)) / escala);
}

/**
 * Pesos colombianos sin decimales: `6937500` → `$6.937.500`. A mano y no con `Intl`: el agrupado de `es` cambia
 * según la versión de ICU del servidor y del navegador (un 4.000 sale a veces «4000») y el valor se renderiza
 * en los dos.
 */
export function formatearCOP(valor: number): string {
  if (!Number.isFinite(valor)) return "$0";
  const entero = Math.round(Math.abs(valor)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${valor < 0 ? "-" : ""}$${entero}`;
}

/** Kilos con hasta 3 decimales y coma decimal: `62.5` → `62,5`, `375` → `375`, `1234.5` → `1.234,5`. */
export function formatearKg(kg: number): string {
  if (!Number.isFinite(kg)) return "0";
  const [entero, decimales] = (Math.round(kg * 1000) / 1000).toString().split(".");
  const miles = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimales ? `${miles},${decimales}` : miles;
}

/** Peso total a partir de «peso por bulto × número de bultos» (ayuda con `cafe.peso_bulto_kg`), a gramos. */
export function pesoDesdeBultos(numBultos: number, pesoPorBultoKg: number): number {
  if (!Number.isFinite(numBultos) || !Number.isFinite(pesoPorBultoKg) || numBultos <= 0 || pesoPorBultoKg <= 0) return 0;
  return Math.round(numBultos * pesoPorBultoKg * 1000) / 1000;
}

/** Suma de pesos en kilos, sin deriva de coma flotante (a gramos). */
export function sumaPesos(pesos: number[]): number {
  return pesos.reduce((acc, p) => acc + Math.round((Number.isFinite(p) ? p : 0) * 1000), 0) / 1000;
}

/** Diferencia (kg) entre lo que suman los bultos y el total de la compra; 0 = cuadran (tolerancia de 1 g, como la base). */
export function diferenciaPesos(pesos: number[], totalKg: number): number {
  const dif = Math.round((sumaPesos(pesos) - totalKg) * 1000) / 1000;
  return Math.abs(dif) <= 0.001 ? 0 : dif;
}

/**
 * Número tecleado en un campo de texto: acepta coma o punto decimal (el teclado numérico de la tablet puede dar
 * cualquiera). `null` si está vacío o no es un número. No admite separador de miles: «1.234» es 1,234.
 */
export function parsearDecimal(texto: string): number | null {
  const limpio = texto.trim().replace(",", ".");
  if (limpio === "" || !/^\d*\.?\d+$|^\d+\.$/.test(limpio)) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

/**
 * Precio por kilo tecleado: como `parsearDecimal`, pero entiende el formato colombiano de miles. Un punto
 * seguido de EXACTAMENTE tres cifras es separador de miles (el precio admite 2 decimales como máximo, así que no
 * hay ambigüedad): «18.500» es 18500 y «1.234.500,50» es 1234500,5, mientras «18.5» sigue siendo 18,5. Acepta un
 * «$» al inicio. Sin esto, escribir «18.500» daría $18,5 el kilo.
 */
export function parsearPrecio(texto: string): number | null {
  const limpio = texto.trim().replace(/^\$\s*/, "");
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(limpio)) return Number(limpio.replace(/\./g, "").replace(",", "."));
  return parsearDecimal(limpio);
}

/** Número como lo escribiría el operario: coma decimal y sin separador de miles (`62.5` → `62,5`). */
export function aTextoDecimal(n: number): string {
  return Number.isFinite(n) ? String(n).replace(".", ",") : "";
}

/** ¿`valor` tiene como mucho `decimales` cifras decimales? (tolerante al error de coma flotante). */
export function tieneMaxDecimales(valor: number, decimales: number): boolean {
  const f = 10 ** decimales;
  return Math.abs(valor * f - Math.round(valor * f)) < 1e-6;
}
