// Cuentas del empaque de marca propia (HU-F1-06). Puras, sin base ni React: dan lo mismo que `cafe.registrar_empaque`
// (peso_salida = Σ unidades × presentación / 1000; la diferencia con lo que llega NO es merma: se clasifica por destino) y las usan
// el formulario (vista previa en vivo), el schema y los tests. Todo se cuenta en GRAMOS ENTEROS para no arrastrar
// errores de coma flotante: 120 × 500 g = 60.000 g exactos.
import { formatearKg3 } from "../../lotes/lib/formato";
import { etiquetaPresentacion } from "../../tipos/lib/productos";

/** Entero con punto de miles (`1200` → «1.200»), a mano: `Intl` agrupa distinto según la versión de ICU. */
export function enteroConMiles(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Forma del café empacado de marca propia (A-02): en grano o molido. En servicios a terceros siempre es grano. */
export type FormaCafe = "grano" | "molido";
export const FORMAS_CAFE: readonly FormaCafe[] = ["grano", "molido"];
export const ETIQUETA_FORMA: Readonly<Record<FormaCafe, string>> = { grano: "Grano", molido: "Molido" };

export interface LineaEmpaqueEntrada {
  presentacionG: number;
  unidades: number;
  /** Por defecto `grano`. */
  forma?: FormaCafe;
}

/** Kilos de las líneas de una forma (en gramos enteros). */
export function kgDeForma(lineas: readonly LineaEmpaqueEntrada[], forma: FormaCafe): number {
  return totalKgEmpacados(lineas.filter((l) => (l.forma ?? "grano") === forma));
}

/** La molienda que se registra junto con el empaque: cuánto café entró a moler y cuánto salió. */
export interface MoliendaEntrada {
  entradaKg: number;
  salidaKg: number;
}

/**
 * Cuánto café llega de verdad a empaque cuando se muele en el mismo paso: lo que no se molió más lo que salió de la
 * molienda (`llega − entra + sale`). Mismo cálculo que `cafe.registrar_empaque`. En gramos enteros.
 */
export function llegaConMolienda(llegaKg: number, m: MoliendaEntrada): number {
  return (Math.round(llegaKg * 1000) - Math.round(m.entradaKg * 1000) + Math.round(m.salidaKg * 1000)) / 1000;
}

/**
 * Reparto del café entre lo molido y lo que sigue en grano. Las líneas molidas no pueden pasar de lo que salió de la
 * molienda ni las de grano de lo que no se molió (la base repite estas dos comprobaciones). `null` sin molienda válida.
 */
export function cuadreMolienda(
  llegaKg: number,
  m: MoliendaEntrada | null,
  lineas: readonly LineaEmpaqueEntrada[],
): { molidoKg: number; granoKg: number; sinMolerKg: number; molidoSupera: boolean; granoSupera: boolean } | null {
  if (!m || !(m.entradaKg > 0) || m.salidaKg < 0 || m.salidaKg > m.entradaKg || m.entradaKg > llegaKg * 1.005) return null;
  const molidoKg = kgDeForma(lineas, "molido");
  const granoKg = kgDeForma(lineas, "grano");
  const sinMolerKg = Math.max(Math.round(llegaKg * 1000) - Math.round(m.entradaKg * 1000), 0) / 1000;
  return {
    molidoKg,
    granoKg,
    sinMolerKg,
    molidoSupera: molidoKg > m.salidaKg + 0.0005,
    granoSupera: granoKg > sinMolerKg + llegaKg * 0.005,
  };
}

/** Kilos de `unidades` bolsas de `presentacionG` gramos: `120 × 500 g` → `60`, `8 × 2.500 g` → `20`. */
export function kgPorUnidades(presentacionG: number, unidades: number): number {
  return Math.round(presentacionG * unidades) / 1000;
}

/** Σ de los kilos de todas las líneas (en gramos enteros). */
export function totalKgEmpacados(lineas: readonly LineaEmpaqueEntrada[]): number {
  return lineas.reduce((g, l) => g + Math.round(l.presentacionG * l.unidades), 0) / 1000;
}

/** A dónde va el café que llega a empaque y no entra en bolsas (`cafe.procesos.diferencia_destino`). */
export const DESTINOS_DIFERENCIA = ["suelto", "granel", "muestra", "perdida"] as const;
export type DestinoDiferencia = (typeof DESTINOS_DIFERENCIA)[number];

export const ETIQUETA_DESTINO: Readonly<Record<DestinoDiferencia, string>> = {
  suelto: "Se entrega suelto al cliente",
  granel: "Queda a granel",
  muestra: "Muestra",
  perdida: "Pérdida",
};

/** Destinos que admite cada línea de negocio: «suelto» solo en terceros y «granel» solo en marca propia (A-01). */
export function destinosDeLinea(linea: "marca_propia" | "servicio"): DestinoDiferencia[] {
  return linea === "marca_propia" ? ["granel", "muestra", "perdida"] : ["suelto", "muestra", "perdida"];
}

export interface ResumenEmpaque {
  /** Lo que llega a empaque: la salida del paso anterior pendiente de empacar. */
  llegaKg: number;
  /** Σ unidades × tamaño de las líneas de bolsas. */
  usadoKg: number;
  /** Llega − usado. Negativo = las bolsas suman más de lo que llega (no se puede guardar). */
  diferenciaKg: number;
  /** Hay café sin meter en bolsas: exige elegir su destino. */
  haySobrante: boolean;
  /** Las bolsas suman más de lo que llega: la base lo rechaza con `empaque_supera_peso`. */
  supera: boolean;
  /** Cuántos kg se pasan (> 0 solo cuando `supera`). */
  excesoKg: number;
}

/**
 * Cuadre de un empaque: llega = usado en bolsas + diferencia. La diferencia NO es merma: se clasifica por destino
 * (suelto, granel, muestra o pérdida). Todo en gramos enteros. `null` sin un peso de llegada válido.
 */
export function resumenEmpaque(llegaKg: number | null, lineas: readonly LineaEmpaqueEntrada[]): ResumenEmpaque | null {
  if (llegaKg === null || !Number.isFinite(llegaKg) || llegaKg <= 0) return null;
  const usadoG = Math.round(totalKgEmpacados(lineas) * 1000);
  const llegaG = Math.round(llegaKg * 1000);
  const difG = llegaG - usadoG;
  return {
    llegaKg: llegaG / 1000,
    usadoKg: usadoG / 1000,
    diferenciaKg: difG / 1000,
    haySobrante: difG > 0,
    supera: difG < 0,
    excesoKg: difG < 0 ? -difG / 1000 : 0,
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
