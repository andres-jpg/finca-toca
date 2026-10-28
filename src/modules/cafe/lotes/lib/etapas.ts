import type { TipoProceso } from "../types";
import { ORDEN_PROCESO } from "./servicios";
import { pctDeMerma } from "./formato";

// Resumen por etapa de la ficha (`v_lote_etapas`) y «lo que queda disponible» (`v_bultos_estado`). Puras.

/** Fila de `v_lote_etapas` con números reales (la vista los entrega nulables). */
export interface EtapaLote {
  tipo: TipoProceso;
  bultosProcesados: number;
  bultosTotal: number;
  completo: boolean;
  parcial: boolean;
  pesoEntradaKg: number;
  pesoSalidaKg: number;
  mermaKg: number;
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

/** Lo que el pie de la ficha necesita de un bulto (fila de `v_bultos_estado`). */
export interface BultoPeso {
  ultimoTipo: TipoProceso | null;
  pesoActualKg: number;
}

/** Cómo se dice que un bulto ya pasó por ese paso (y `null` = sin procesar). */
export const ESTADO_FISICO: Readonly<Record<TipoProceso, string>> = {
  trilla: "trillado",
  tostion: "tostado",
  molienda: "molido",
  empaque: "empacado",
};

export interface Disponible {
  /** `null` = café sin procesar todavía. */
  paso: TipoProceso | null;
  texto: string;
  pesoKg: number;
}

/**
 * «Queda disponible»: el peso de cada bulto según su ÚLTIMO paso, agrupado por ese paso. Un lote con todo en
 * tostión da un solo grupo («332,000 kg tostado»); uno a medias da varios («133,000 kg tostado» y «250,000 kg sin
 * procesar»). Se suma en gramos. Orden: del paso más avanzado al menos.
 */
export function quedaDisponible(bultos: readonly BultoPeso[]): Disponible[] {
  const grupos = new Map<TipoProceso | null, number>();
  for (const b of bultos) {
    grupos.set(b.ultimoTipo, (grupos.get(b.ultimoTipo) ?? 0) + Math.round(b.pesoActualKg * 1000));
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => (b === null ? -1 : ORDEN_PROCESO[b]) - (a === null ? -1 : ORDEN_PROCESO[a]))
    .map(([paso, gramos]) => ({
      paso,
      texto: paso ? ESTADO_FISICO[paso] : "sin procesar",
      pesoKg: gramos / 1000,
    }));
}
