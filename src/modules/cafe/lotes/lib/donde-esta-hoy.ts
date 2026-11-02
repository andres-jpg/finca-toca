import type { BultoPeso, EtapaLote } from "./etapas";
import { ESTADO_FISICO } from "./etapas";
import type { TipoProceso } from "../types";

// «Dónde está hoy este café» (A-17): cada tipo de existencia por separado (bultos en verde, tostado sin empacar, granel,
// unidades empacadas por presentación y forma). NUNCA se suman entre sí: kilos de café y unidades de bolsas no se mezclan.

export interface GrupoBultos {
  /** `null` = sin procesar. */
  paso: TipoProceso | null;
  texto: string;
  bultos: number;
  pesoKg: number;
}

/** Bultos con peso por su ÚLTIMO paso, del menos al más avanzado; los bultos ya empacados (peso 0) no cuentan. */
export function bultosPorEstado(bultos: readonly BultoPeso[]): GrupoBultos[] {
  const orden: (TipoProceso | null)[] = [null, "trilla", "tostion", "molienda"];
  const grupos = new Map<TipoProceso | null, { n: number; gramos: number }>();
  for (const b of bultos) {
    if (b.ultimoTipo === "empaque" || b.pesoActualKg <= 0) continue;
    const g = grupos.get(b.ultimoTipo) ?? { n: 0, gramos: 0 };
    g.n += 1;
    g.gramos += Math.round(b.pesoActualKg * 1000);
    grupos.set(b.ultimoTipo, g);
  }
  return orden
    .filter((p) => grupos.has(p))
    .map((p) => ({ paso: p, texto: p ? ESTADO_FISICO[p] : "sin procesar", bultos: grupos.get(p)!.n, pesoKg: grupos.get(p)!.gramos / 1000 }));
}

/** El lote pasa (o pasará) por tostión: solo entonces tiene sentido hablar de café «sin tostar». */
export function llevaTostion(requeridos: readonly TipoProceso[], etapas: readonly Pick<EtapaLote, "tipo">[]): boolean {
  return requeridos.includes("tostion") || etapas.some((e) => e.tipo === "tostion");
}

/** Café que aún no se tostó: bultos sin procesar o solo trillados (kg y bultos). */
export function sinTostar(grupos: readonly GrupoBultos[]): { bultos: number; pesoKg: number } {
  let bultos = 0;
  let gramos = 0;
  for (const g of grupos) {
    if (g.paso === null || g.paso === "trilla") {
      bultos += g.bultos;
      gramos += Math.round(g.pesoKg * 1000);
    }
  }
  return { bultos, pesoKg: gramos / 1000 };
}

export interface UnidadesEmpacadas {
  presentacionG: number;
  forma: "grano" | "molido";
  unidades: number;
  producto: string;
}

interface ProcesoConLineas {
  tipo: TipoProceso;
  anulacion: unknown;
  lineasEmpaque?: { presentacionG: number; unidades: number; producto: string; forma?: "grano" | "molido" }[];
}

/**
 * Unidades empacadas VIGENTES (procesos no anulados) por presentación y forma, menos lo ya reabierto (que vuelve a
 * granel; se descuenta de «grano»). Cada fila es de un solo tipo de unidad: no hay total.
 */
export function empacadoPorPresentacion(
  procesos: readonly ProcesoConLineas[],
  reabiertasPorPresentacion: ReadonlyMap<number, number> = new Map(),
): UnidadesEmpacadas[] {
  const acc = new Map<string, UnidadesEmpacadas>();
  for (const p of procesos) {
    if (p.tipo !== "empaque" || p.anulacion !== null) continue;
    for (const l of p.lineasEmpaque ?? []) {
      const forma = l.forma ?? "grano";
      const k = `${l.presentacionG}|${forma}`;
      const f = acc.get(k) ?? { presentacionG: l.presentacionG, forma, unidades: 0, producto: l.producto };
      f.unidades += l.unidades;
      acc.set(k, f);
    }
  }
  for (const [g, n] of reabiertasPorPresentacion) {
    const f = acc.get(`${g}|grano`);
    if (f) f.unidades = Math.max(0, f.unidades - n);
  }
  return [...acc.values()].filter((f) => f.unidades > 0).sort((a, b) => a.presentacionG - b.presentacionG || a.forma.localeCompare(b.forma));
}
