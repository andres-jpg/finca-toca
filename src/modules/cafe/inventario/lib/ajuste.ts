// Ajustar inventario y carga inicial (B-15 · FIN-157). Puro: sin base ni React. Las mismas cuentas las hace
// `cafe.ajustar_inventario` en SQL (la frontera real); aquí sirven para mostrar el resultado antes de guardar.
import { formatKg } from "@/modules/core/formato/numeros";
import { enteroConMiles } from "../../empaque/lib/empaque";

export const MOTIVOS_AJUSTE = ["conteo_fisico", "dano", "muestra", "correccion"] as const;
export type MotivoAjuste = (typeof MOTIVOS_AJUSTE)[number];

export const ETIQUETA_MOTIVO_AJUSTE: Readonly<Record<MotivoAjuste | "carga_inicial", string>> = {
  conteo_fisico: "Conteo físico",
  dano: "Daño",
  muestra: "Muestra",
  correccion: "Corrección",
  carga_inicial: "Carga inicial",
};

export type ModoAjuste = "nueva" | "diferencia";
export type DireccionAjuste = "suma" | "resta";

/** Stock que queda tras el ajuste: la cantidad nueva tal cual, o el actual más/menos la diferencia. */
export function stockTrasAjuste(actual: number, modo: ModoAjuste, cantidad: number, direccion: DireccionAjuste | null): number {
  if (modo === "nueva") return cantidad;
  return direccion === "resta" ? actual - cantidad : actual + cantidad;
}

/** Diferencia (con signo) entre el stock resultante y el actual. */
export const deltaAjuste = (actual: number, despues: number): number => despues - actual;

/** Entero con punto de miles y el signo menos tipográfico para los negativos (`-3` → «−3»). */
export function enteroConSigno(n: number): string {
  const texto = enteroConMiles(Math.abs(n));
  return n < 0 ? `−${texto}` : texto;
}

/** «14 → 12 u (−2)»: lo que había, lo que queda y la diferencia. */
export function textoAntesDespues(antes: number, despues: number): string {
  const delta = despues - antes;
  const signo = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return `${enteroConSigno(antes)} → ${enteroConSigno(despues)} u (${signo}${enteroConMiles(Math.abs(delta))})`;
}

/** Clases de inventario que admite la carga inicial. */
export const CLASES_CARGA = ["producto", "tostado", "verde"] as const;
export type ClaseCarga = (typeof CLASES_CARGA)[number];

export const ETIQUETA_CLASE_CARGA: Readonly<Record<ClaseCarga, string>> = {
  producto: "Producto terminado",
  tostado: "Tostado sin empacar",
  verde: "Café verde por tostar",
};

/** Cantidad con su unidad: unidades enteras del producto terminado; kg con 1 decimal en las otras dos clases. */
export const textoCantidadCarga = (clase: ClaseCarga, cantidad: number): string =>
  clase === "producto" ? `${enteroConMiles(cantidad)} u` : formatKg(cantidad);

/** Unidad del costo: por unidad (producto terminado) o por kg. */
export const unidadCostoCarga = (clase: ClaseCarga): string => (clase === "producto" ? "unidad" : "kg");

/** Café verde por tipo: lo que dan los lotes (kg) más la carga inicial (kg). */
export function sumarCargaVerde<T extends { tipoCafe: string; kg: number }>(
  verde: readonly T[],
  carga: ReadonlyMap<string, number>,
): { tipoCafe: string; kg: number }[] {
  const porTipo = new Map(verde.map((v) => [v.tipoCafe, { tipoCafe: v.tipoCafe, kg: v.kg }]));
  for (const [tipo, kg] of carga) {
    const f = porTipo.get(tipo) ?? { tipoCafe: tipo, kg: 0 };
    f.kg += kg;
    porTipo.set(tipo, f);
  }
  return [...porTipo.values()].sort((a, b) => a.tipoCafe.localeCompare(b.tipoCafe, "es"));
}

/** Etiqueta de las filas del tostado sin empacar que vienen de la carga inicial (no tienen lote). */
export const CODIGO_CARGA_INICIAL = "Carga inicial";

/** Tostado sin empacar: las filas por lote y forma y, al final, una fila de «Carga inicial» por tipo de café (sin lote ni forma). */
export function sumarCargaTostado<T extends { loteId: string; codigo: string; tipoCafe: string | null; forma: "grano" | "molido"; kg: number }>(
  tostado: readonly T[],
  carga: ReadonlyMap<string, number>,
): { loteId: string; codigo: string; tipoCafe: string | null; forma: "grano" | "molido" | null; kg: number }[] {
  const filas: { loteId: string; codigo: string; tipoCafe: string | null; forma: "grano" | "molido" | null; kg: number }[] = tostado.map((g) => ({
    loteId: g.loteId, codigo: g.codigo, tipoCafe: g.tipoCafe, forma: g.forma, kg: g.kg,
  }));
  const cargas = [...carga].filter(([, kg]) => kg > 0).sort(([a], [b]) => a.localeCompare(b, "es"));
  for (const [tipo, kg] of cargas) filas.push({ loteId: "", codigo: CODIGO_CARGA_INICIAL, tipoCafe: tipo, forma: null, kg });
  return filas;
}
