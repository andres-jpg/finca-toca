import type { EtapaLote } from "./etapas";
import type { TipoProceso } from "../types";

// «Dónde está hoy este café» (A-17): cada tipo de existencia por separado (café sin tostar, tostado sin empacar, unidades
// empacadas por presentación y forma). NUNCA se suman entre sí: kilos de café y unidades de bolsas no se mezclan. Todo en
// kilos (B-01): el saldo sale de `v_origenes_disponibles`.

/** Un origen con saldo (fila de `v_origenes_disponibles`): `tipo` null = el café tal como se recibió. */
export interface OrigenSaldo {
  tipo: TipoProceso | null;
  saldoKg: number;
  /** Tostión sin salida (tanda en curso): su peso es estimado. */
  estimado?: boolean;
}

export interface GrupoSaldo {
  /** `null` = sin procesar. */
  paso: TipoProceso | null;
  texto: string;
  pesoKg: number;
  estimado: boolean;
}

const TEXTO_PASO: Record<string, string> = { sin: "sin procesar", trilla: "trillado", tostion: "tostado por empacar", molienda: "molido" };

/** Saldos por su paso de origen, del menos al más avanzado; el empaque (ya envasado) y lo agotado no cuentan. */
export function saldoPorEstado(origenes: readonly OrigenSaldo[]): GrupoSaldo[] {
  const orden: (TipoProceso | null)[] = [null, "trilla", "tostion"];
  const grupos = new Map<TipoProceso | null, { gramos: number; estimado: boolean }>();
  for (const o of origenes) {
    if (o.tipo === "empaque" || o.saldoKg <= 0.05) continue;
    const g = grupos.get(o.tipo) ?? { gramos: 0, estimado: false };
    g.gramos += Math.round(o.saldoKg * 1000);
    g.estimado = g.estimado || Boolean(o.estimado);
    grupos.set(o.tipo, g);
  }
  return orden
    .filter((p) => grupos.has(p))
    .map((p) => ({ paso: p, texto: TEXTO_PASO[p ?? "sin"], pesoKg: grupos.get(p)!.gramos / 1000, estimado: grupos.get(p)!.estimado }));
}

/** El lote pasa (o pasará) por tostión: solo entonces tiene sentido hablar de café «sin tostar». */
export function llevaTostion(requeridos: readonly TipoProceso[], etapas: readonly Pick<EtapaLote, "tipo">[]): boolean {
  return requeridos.includes("tostion") || etapas.some((e) => e.tipo === "tostion");
}

/** Café que aún no se tostó: sin procesar o solo trillado (kg). */
export function sinTostar(grupos: readonly GrupoSaldo[]): { pesoKg: number } {
  let gramos = 0;
  for (const g of grupos) if (g.paso === null || g.paso === "trilla") gramos += Math.round(g.pesoKg * 1000);
  return { pesoKg: gramos / 1000 };
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
