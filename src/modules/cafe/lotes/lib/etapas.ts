import type { TipoProceso } from "../types";
import { ORDEN_PROCESO } from "./servicios";
import { pctDeMerma } from "./formato";

// Resumen por etapa de la ficha (`v_lote_etapas`, por kilos: ADR 0002). Puras.

/** Fila de `v_lote_etapas` con números reales (la vista los entrega nulables). */
export interface EtapaLote {
  tipo: TipoProceso;
  /** Lo que el paso puede procesar, lo ya procesado y lo que falta (kg). */
  kgBase: number;
  kgProcesados: number;
  kgPendientes: number;
  completo: boolean;
  parcial: boolean;
  pesoEntradaKg: number;
  pesoSalidaKg: number | null;
  /** Solo trilla y tostión (con su salida): la molienda y el empaque no tienen merma. */
  mermaKg: number | null;
  valor: number;
  desvios: number;
  numProcesos: number;
}

/** Una fila de la tabla «Resumen por etapa»: hecha (con datos) o pendiente (paso requerido sin ningún proceso). */
export type FilaEtapa =
  | { pendiente: false; etapa: EtapaLote; mermaPct: number | null }
  | { pendiente: true; tipo: TipoProceso };

/**
 * Filas del resumen: una por paso requerido del lote y por cada etapa hecha aunque no fuera requerida (la
 * molienda opcional de marca propia), en el orden de la planta. Un paso requerido sin procesos sale como pendiente.
 * La merma % sale de los kilos (ver `pctDeMerma`).
 */
export function filasEtapas(requeridos: readonly TipoProceso[], etapas: readonly EtapaLote[]): FilaEtapa[] {
  const hechas = new Map(etapas.map((e) => [e.tipo, e]));
  const tipos = [...new Set<TipoProceso>([...requeridos, ...etapas.map((e) => e.tipo)])].sort(
    (a, b) => ORDEN_PROCESO[a] - ORDEN_PROCESO[b],
  );
  return tipos.map((tipo): FilaEtapa => {
    const etapa = hechas.get(tipo);
    return etapa
      ? { pendiente: false, etapa, mermaPct: pctDeMerma(etapa.mermaKg, etapa.pesoEntradaKg) }
      : { pendiente: true, tipo };
  });
}

export interface MermaProcesada {
  /** Σ entrada de los pasos con merma (trilla y tostión con salida), en kg. */
  entradaKg: number;
  mermaKg: number;
  /** Σ(entrada − salida) / Σ entrada, en %. */
  pct: number;
}

/**
 * Merma del lote SOLO sobre lo procesado: Σ(entrada − salida) / Σ entrada de trilla y tostión (esta, cuando su empaque
 * ya fijó la salida con la báscula). Molienda y empaque no tienen merma. Se suma en gramos. `null` si aún no hay nada.
 */
export function mermaProcesada(etapas: readonly Pick<EtapaLote, "tipo" | "pesoEntradaKg" | "mermaKg">[]): MermaProcesada | null {
  let entrada = 0;
  let merma = 0;
  for (const e of etapas) {
    if ((e.tipo !== "trilla" && e.tipo !== "tostion") || e.mermaKg === null) continue;
    entrada += Math.round(e.pesoEntradaKg * 1000);
    merma += Math.round(e.mermaKg * 1000);
  }
  const pct = pctDeMerma(merma / 1000, entrada / 1000);
  return pct === null ? null : { entradaKg: entrada / 1000, mermaKg: merma / 1000, pct };
}
