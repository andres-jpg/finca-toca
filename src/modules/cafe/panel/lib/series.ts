import { pctDeMerma } from "../../lotes/lib/formato";
import { ORDEN_PROCESO } from "../../lotes/lib/servicios";
import type { TipoProceso } from "../../lotes/types";
import type { FilaProduccion, LineaPanel, VentaDiaria } from "../types";
import { LINEAS_PANEL } from "./periodo";

// Series de los gráficos y tablas de resumen. Se arman en el servidor a partir de las filas de `cafe.produccion_diaria`
// y `cafe.ventas_diarias`; el cliente (Recharts) solo las pinta. Puro.

export const TIPOS_PROCESO: readonly TipoProceso[] = ["trilla", "tostion", "molienda", "empaque"];

/** Color de cada tipo de proceso: el mismo en los gráficos y en sus leyendas. */
export const COLOR_PROCESO: Readonly<Record<TipoProceso, string>> = { trilla: "#78716c", tostion: "#b45309", molienda: "#0d9488", empaque: "#2563eb" };

export type PuntoKg = { fecha: string } & Record<TipoProceso, number>;

/** Gráfico 1: kg que entraron a cada tipo de proceso, por día. Los días sin procesos salen en 0. */
export function serieKgPorDia(filas: readonly FilaProduccion[], dias: readonly string[]): PuntoKg[] {
  const porDia = new Map<string, Record<TipoProceso, number>>();
  for (const d of dias) porDia.set(d, { trilla: 0, tostion: 0, molienda: 0, empaque: 0 });
  for (const f of filas) {
    const dia = porDia.get(f.fecha);
    if (dia) dia[f.tipo] += f.kgEntrada;
  }
  return dias.map((fecha) => ({ fecha, ...porDia.get(fecha)! }));
}

export interface PuntoMerma {
  fecha: string;
  /** Merma % del día (2 decimales, calculada con los kilos); `null` si ese día no hubo procesos de ese tipo. */
  trilla: number | null;
  tostion: number | null;
}

/** Gráfico 2: merma ponderada de trilla y tostión por día (suma kg de todas las líneas del día y recalcula el %). */
export function serieMermaPorDia(filas: readonly FilaProduccion[], dias: readonly string[]): PuntoMerma[] {
  const acum = new Map<string, { trilla: [number, number]; tostion: [number, number] }>();
  for (const d of dias) acum.set(d, { trilla: [0, 0], tostion: [0, 0] });
  for (const f of filas) {
    const dia = acum.get(f.fecha);
    if (!dia || (f.tipo !== "trilla" && f.tipo !== "tostion")) continue;
    dia[f.tipo][0] += f.kgEntrada;
    dia[f.tipo][1] += f.kgEntrada - f.kgSalida;
  }
  const pct = ([entrada, merma]: [number, number]) => (entrada > 0 ? pctDeMerma(merma, entrada) : null);
  return dias.map((fecha) => {
    const d = acum.get(fecha)!;
    return { fecha, trilla: pct(d.trilla), tostion: pct(d.tostion) };
  });
}

export interface PuntoIngreso {
  fecha: string;
  marcaPropia: number;
  servicios: number;
}

/** Gráfico 3: ingreso diario. Marca propia = ventas vigentes; servicios = valor de los procesos de lotes de servicio. */
export function serieIngresoPorDia(filas: readonly FilaProduccion[], ventas: readonly VentaDiaria[], dias: readonly string[]): PuntoIngreso[] {
  const servicios = new Map<string, number>();
  for (const f of filas) if (f.linea !== "marca_propia") servicios.set(f.fecha, (servicios.get(f.fecha) ?? 0) + f.valor);
  const marca = new Map(ventas.map((v) => [v.fecha, v.total]));
  return dias.map((fecha) => ({ fecha, marcaPropia: marca.get(fecha) ?? 0, servicios: servicios.get(fecha) ?? 0 }));
}

export interface ResumenProceso {
  tipo: TipoProceso;
  kgEntrada: number;
  kgSalida: number;
  mermaKg: number;
  /** Ponderada, calculada con los kilos (2 decimales); `null` sin kilos de entrada. */
  mermaPct: number | null;
  valor: number;
}

/** Suma las filas por tipo de proceso (en orden de proceso) para el resumen del rango. Solo trae los tipos con kilos. */
export function resumenPorTipo(filas: readonly FilaProduccion[]): ResumenProceso[] {
  const mapa = new Map<TipoProceso, ResumenProceso>();
  for (const f of filas) {
    const r = mapa.get(f.tipo) ?? { tipo: f.tipo, kgEntrada: 0, kgSalida: 0, mermaKg: 0, mermaPct: null, valor: 0 };
    r.kgEntrada += f.kgEntrada;
    r.kgSalida += f.kgSalida;
    r.mermaKg += f.kgEntrada - f.kgSalida;
    r.valor += f.valor;
    mapa.set(f.tipo, r);
  }
  return [...mapa.values()].map((r) => ({ ...r, mermaPct: pctDeMerma(r.mermaKg, r.kgEntrada) })).sort((a, b) => ORDEN_PROCESO[a.tipo] - ORDEN_PROCESO[b.tipo]);
}

export interface ResumenLinea {
  linea: LineaPanel;
  procesos: ResumenProceso[];
}

/** Lo mismo por línea: cada línea con sus tipos de proceso (nunca se suman kilos de líneas distintas). */
export function resumenPorLinea(filas: readonly FilaProduccion[]): ResumenLinea[] {
  return LINEAS_PANEL.map((linea) => ({ linea, procesos: resumenPorTipo(filas.filter((f) => f.linea === linea)) })).filter((l) => l.procesos.length > 0);
}
