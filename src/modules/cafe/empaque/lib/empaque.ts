// Cuentas del empaque (HU-F1-06, B-08). Puras, sin base ni React: dan lo mismo que `cafe.registrar_empaque`
// (en bolsas = Σ unidades × presentación / 1000; sobrante = báscula + incluido − bolsas; la merma de tostión es de la TANDA:
// (entró − báscula) / entró; el empaque no tiene merma propia) y las usan
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

/** Kilos de `unidades` bolsas de `presentacionG` gramos: `120 × 500 g` → `60`, `8 × 2.500 g` → `20`. */
export function kgPorUnidades(presentacionG: number, unidades: number): number {
  return Math.round(presentacionG * unidades) / 1000;
}

/** Σ de los kilos de todas las líneas (en gramos enteros). */
export function totalKgEmpacados(lineas: readonly LineaEmpaqueEntrada[]): number {
  return lineas.reduce((g, l) => g + Math.round(l.presentacionG * l.unidades), 0) / 1000;
}

/** Destino del sobrante: solo el empaque de un café reabierto lo elige; en el flujo normal es automático. */
export const DESTINOS_DIFERENCIA = ["suelto", "granel", "muestra", "perdida"] as const;
export type DestinoDiferencia = (typeof DESTINOS_DIFERENCIA)[number];

export const ETIQUETA_DESTINO: Readonly<Record<DestinoDiferencia, string>> = {
  suelto: "Se entrega a granel al cliente",
  granel: "Queda tostado sin empacar",
  muestra: "Muestra",
  perdida: "Pérdida",
};

/** Destinos que admite el empaque de un café reabierto (marca propia). */
export function destinosDeLinea(linea: "marca_propia" | "servicio"): DestinoDiferencia[] {
  return linea === "marca_propia" ? ["granel", "muestra", "perdida"] : ["suelto", "muestra", "perdida"];
}

/** Acumulado de las tandas ya cerradas del lote (Σ entró a tostión y Σ báscula). */
export interface AcumuladoTandas {
  entradaKg: number;
  basculaKg: number;
}

export interface CierreEmpaque {
  /** Σ kg de las bolsas (incluye lo incluido de tandas anteriores). */
  enBolsasKg: number;
  /** Báscula + incluido − bolsas; negativo = las bolsas suman más que la báscula (no se puede guardar). */
  sobranteKg: number;
  supera: boolean;
  /** Merma de tostión de ESTA tanda: (entró − báscula) / entró, en %; `null` sin báscula válida. */
  mermaPct: number | null;
  mermaKg: number | null;
  /** Acumulado del lote con esta tanda: Σ entró → Σ báscula y su merma. */
  acumulado: { entradaKg: number; basculaKg: number; mermaPct: number } | null;
}

/**
 * Cierre del empaque de una tanda (B-08): en bolsas, sobrante, merma de tostión de la tanda y acumulado del lote. En gramos
 * enteros. Casos: tanda 2 de MP-2026-0007 (54,0 kg; 44,0 kg en bolsas; báscula 44,3) → sobrante 0,3 y merma 18,0 %;
 * acumulado con la tanda 1 (64,0 → 52,4): 118,0 → 96,7 kg · 18,1 %.
 */
export function cierreEmpaque(args: {
  entradaKg: number;
  lineas: readonly LineaEmpaqueEntrada[];
  basculaKg: number | null;
  incluidoKg?: number;
  acumuladoPrevio?: AcumuladoTandas | null;
}): CierreEmpaque {
  const g = (kg: number) => Math.round(kg * 1000);
  const bolsasG = g(totalKgEmpacados(args.lineas));
  const incluidoG = g(args.incluidoKg ?? 0);
  const valida = args.basculaKg !== null && Number.isFinite(args.basculaKg) && args.basculaKg > 0 && args.entradaKg > 0;
  const basculaG = valida ? g(args.basculaKg as number) : 0;
  const sobranteG = valida ? basculaG + incluidoG - bolsasG : 0;
  const mermaG = valida ? g(args.entradaKg) - basculaG : 0;
  const prev = args.acumuladoPrevio ?? { entradaKg: 0, basculaKg: 0 };
  const accE = g(prev.entradaKg) + (valida ? g(args.entradaKg) : 0);
  const accB = g(prev.basculaKg) + basculaG;
  return {
    enBolsasKg: bolsasG / 1000,
    sobranteKg: sobranteG / 1000,
    supera: valida && sobranteG < 0,
    mermaPct: valida ? Math.round((mermaG / g(args.entradaKg)) * 100 * 1000) / 1000 : null,
    mermaKg: valida ? mermaG / 1000 : null,
    acumulado: valida && accE > 0 ? { entradaKg: accE / 1000, basculaKg: accB / 1000, mermaPct: Math.round(((accE - accB) / accE) * 100 * 1000) / 1000 } : null,
  };
}

/** Aviso (no bloquea): «Molido empacado: 10,0 kg · solicitado 10,0 kg». `null` si no se pidió molienda. */
export function avisoMolido(molidoKg: number, solicitadoKg: number | null): string | null {
  if (solicitadoKg === null || solicitadoKg <= 0) return null;
  return `Molido empacado: ${formatearKg3(molidoKg).replace(/,(\d)\d\d$/, ",$1")} kg · solicitado ${formatearKg3(solicitadoKg).replace(/,(\d)\d\d$/, ",$1")} kg`;
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

/**
 * Costo de los insumos (bolsa + etiqueta) de las presentaciones que se van a empacar (B-13), con el precio vigente. Ejemplo de
 * la tanda 2 de MP-2026-0007: 68 × (1.200 + 370) + 4 × (3.700 + 370) = $123.040. `completo` es false si a alguna presentación
 * empacada le falta el precio de la bolsa o de la etiqueta: entonces el total solo suma lo que sí tiene precio.
 */
export function costoInsumosEmpaque(
  presentaciones: readonly { unidades: number; bolsaPrecio: number | null; etiquetaPrecio: number | null }[],
): { total: number; completo: boolean } {
  let total = 0;
  let completo = true;
  for (const p of presentaciones) {
    if (p.unidades <= 0) continue;
    if (p.bolsaPrecio === null || p.etiquetaPrecio === null) {
      completo = false;
      continue;
    }
    total += p.unidades * (p.bolsaPrecio + p.etiquetaPrecio);
  }
  return { total: Math.round(total), completo };
}
