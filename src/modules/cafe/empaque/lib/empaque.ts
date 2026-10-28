// Cuentas del empaque de marca propia (HU-F1-06). Puras, sin base ni React: dan lo mismo que `cafe.registrar_empaque`
// (peso_salida = Σ unidades × presentación / 1000; la diferencia con la entrada es la merma de empaque) y las usan
// el formulario (vista previa en vivo), el schema y los tests. Todo se cuenta en GRAMOS ENTEROS para no arrastrar
// errores de coma flotante: 120 × 500 g = 60.000 g exactos.
import { formatearKg3, pctDeMerma } from "../../lotes/lib/formato";
import { etiquetaPresentacion } from "../../tipos/lib/productos";

/** Entero con punto de miles (`1200` → «1.200»), a mano: `Intl` agrupa distinto según la versión de ICU. */
export function enteroConMiles(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export interface LineaEmpaqueEntrada {
  presentacionG: number;
  unidades: number;
}

/** Kilos de `unidades` bolsas de `presentacionG` gramos: `120 × 500 g` → `60`, `8 × 2.500 g` → `20`. */
export function kgPorUnidades(presentacionG: number, unidades: number): number {
  return Math.round(presentacionG * unidades) / 1000;
}

/** Σ de los kilos de todas las líneas (en gramos enteros). */
export function totalKgEmpacados(lineas: readonly LineaEmpaqueEntrada[]): number {
  return lineas.reduce((g, l) => g + Math.round(l.presentacionG * l.unidades), 0) / 1000;
}

export interface VistaPreviaEmpaque {
  kgEmpacados: number;
  /** Entrada − empacado; negativa si se quiere empacar más de lo que hay (no se puede guardar). */
  mermaKg: number;
  /** Merma sobre la entrada, a 2 decimales (igual que el resto de la planta); `null` sin entrada válida. */
  mermaPct: number | null;
  /** Se pretende empacar más café del que entra: la base lo rechaza con `empaque_supera_peso`. */
  supera: boolean;
  /** Cuántos kg sobran del disponible (> 0 solo cuando `supera`). */
  excesoKg: number;
}

/**
 * Vista previa de la merma de un empaque: lo empacado contra el peso de entrada. `null` si aún no hay entrada o
 * unidades. La merma del empaque es polvo y muestras de control; se avisa (no se bloquea) mientras sea ≥ 0.
 */
export function vistaPreviaEmpaque(entradaKg: number | null, lineas: readonly LineaEmpaqueEntrada[]): VistaPreviaEmpaque | null {
  if (entradaKg === null || !Number.isFinite(entradaKg) || entradaKg <= 0) return null;
  if (lineas.length === 0) return null;
  const empacadoG = Math.round(totalKgEmpacados(lineas) * 1000);
  const entradaG = Math.round(entradaKg * 1000);
  const mermaKg = (entradaG - empacadoG) / 1000;
  return {
    kgEmpacados: empacadoG / 1000,
    mermaKg,
    mermaPct: mermaKg < 0 ? null : pctDeMerma(mermaKg, entradaKg),
    supera: empacadoG > entradaG,
    excesoKg: empacadoG > entradaG ? (empacadoG - entradaG) / 1000 : 0,
  };
}

/** Kilos de una línea con tres decimales y coma: `60` → «60,000». */
export function textoKgLinea(presentacionG: number, unidades: number): string {
  return formatearKg3(kgPorUnidades(presentacionG, unidades));
}

/**
 * Enteros positivos escritos a mano («120», «1.200»). Los puntos son miles; coma, letras, signo o decimales →
 * `null`. Vacío → `null` (sin unidades en esa presentación).
 */
export function parsearUnidades(texto: string | number | null | undefined): number | null {
  if (typeof texto === "number") return Number.isInteger(texto) && texto > 0 ? texto : null;
  if (typeof texto !== "string") return null;
  const limpio = texto.replace(/[\s ]/g, "");
  if (limpio === "") return null;
  if (!/^\d{1,3}(\.\d{3})+$/.test(limpio) && !/^\d+$/.test(limpio)) return null;
  const n = Number(limpio.replace(/\./g, ""));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * «Empacadas 120 × Excelso 500 g y 8 × Excelso 2.500 g». Con una sola línea no lleva «y»; con tres o más separa
 * con comas y cierra con «y». Es el texto del toast que sigue al guardar.
 */
export function textoEmpacadas(lineas: readonly { unidades: number; producto: string }[]): string {
  const partes = lineas.map((l) => `${enteroConMiles(l.unidades)} × ${l.producto}`);
  if (partes.length === 0) return "Empaque registrado";
  if (partes.length === 1) return `Empacadas ${partes[0]}`;
  return `Empacadas ${partes.slice(0, -1).join(", ")} y ${partes.at(-1)}`;
}

export type ClaseInsumoEmpaque = "bolsa" | "etiqueta";

export interface FaltanteInsumo {
  clase: ClaseInsumoEmpaque;
  presentacionG: number;
  /** Lo que quedaría en el sistema tras empacar (negativo). */
  resultante: number;
}

export interface FilaStockPresentacion {
  presentacionG: number;
  unidades: number;
  bolsaStock: number | null;
  etiquetaStock: number | null;
}

/**
 * Bolsas y etiquetas que quedarían en negativo con estas unidades. Avisa, no bloquea (decisión 14 de CO-20): el
 * empaque se registra igual y el stock queda en rojo hasta que se registre la compra que faltó.
 */
export function faltantesDeInsumo(filas: readonly FilaStockPresentacion[]): FaltanteInsumo[] {
  const faltantes: FaltanteInsumo[] = [];
  for (const f of filas) {
    if (f.unidades <= 0) continue;
    if (f.bolsaStock !== null && f.bolsaStock - f.unidades < 0) {
      faltantes.push({ clase: "bolsa", presentacionG: f.presentacionG, resultante: f.bolsaStock - f.unidades });
    }
    if (f.etiquetaStock !== null && f.etiquetaStock - f.unidades < 0) {
      faltantes.push({ clase: "etiqueta", presentacionG: f.presentacionG, resultante: f.etiquetaStock - f.unidades });
    }
  }
  return faltantes;
}

/** «Quedarían −20 bolsas de 500 g en el sistema. Puedes guardar igualmente». */
export function textoFaltante(f: FaltanteInsumo): string {
  const cantidad = Math.abs(f.resultante);
  const nombre = f.clase === "bolsa" ? (cantidad === 1 ? "bolsa" : "bolsas") : cantidad === 1 ? "etiqueta" : "etiquetas";
  return `Quedarían −${enteroConMiles(cantidad)} ${nombre} de ${etiquetaPresentacion(f.presentacionG)} en el sistema. Puedes guardar igualmente`;
}
