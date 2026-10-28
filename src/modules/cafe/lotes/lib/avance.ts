import type { LineaLote, TipoProceso } from "../types";
import { ORDEN_PROCESO, etiquetaServicio } from "./servicios";

// Avance de un lote (HU-F1-05): cuántos servicios van completos y, en marca propia, cuántos bultos del último paso.
// Se calcula a partir de las vistas `v_lotes` y `v_lote_etapas`; aquí solo se decide cómo contarlo. Pura.

/** Lo que el listado necesita de una etapa (fila de `v_lote_etapas`). */
export interface EtapaAvance {
  tipo: TipoProceso;
  bultosProcesados: number;
  bultosTotal: number;
  completo: boolean;
  parcial: boolean;
}

/** Lo que el listado necesita del lote (fila de `v_lotes`). */
export interface LoteAvance {
  linea: LineaLote;
  estado: string | null;
  /** `avance_texto` de la vista: «2 de 3». */
  avanceTexto: string | null;
  serviciosCompletados: number;
  serviciosRequeridos: readonly TipoProceso[];
}

export interface Avance {
  /** Texto principal: «2 de 3» (servicio) o «Tostado 4/6 bultos» (marca propia). */
  texto: string;
  /** Qué tanto de la barra (0..1). */
  fraccion: number;
  /** Servicio con un paso a medias: «Tostión 2/6 bultos». */
  detalle: string | null;
}

const PARTICIPIO: Readonly<Record<TipoProceso, string>> = {
  trilla: "Trillado",
  tostion: "Tostado",
  molienda: "Molido",
  empaque: "Empacado",
};

/** «4/6 bultos» (o «1/1 bulto»). */
export function textoBultos(procesados: number, total: number): string {
  return `${procesados}/${total} ${total === 1 ? "bulto" : "bultos"}`;
}

const acotar = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * Servicio: «0 de 4», «1 de 4»… cambia solo al COMPLETARSE un paso (todos sus bultos); si hay uno a medias se
 * dice aparte en `detalle`. Marca propia no tiene «contrato»: se cuenta el último paso en que hay bultos
 * («Tostado 4/6 bultos») y la barra es la fracción de bultos de ese paso. Anulado: sin avance.
 */
export function calcularAvance(lote: LoteAvance, etapas: readonly EtapaAvance[]): Avance {
  if (lote.estado === "anulado") return { texto: "Anulado", fraccion: 0, detalle: null };

  if (lote.linea === "servicio") {
    const total = lote.serviciosRequeridos.length;
    const parcial = etapas
      .filter((e) => e.parcial)
      .sort((a, b) => ORDEN_PROCESO[a.tipo] - ORDEN_PROCESO[b.tipo])[0];
    return {
      texto: lote.avanceTexto ?? `${lote.serviciosCompletados} de ${total}`,
      fraccion: total > 0 ? acotar(lote.serviciosCompletados / total) : 0,
      detalle: parcial ? `${etiquetaServicio(parcial.tipo)} ${textoBultos(parcial.bultosProcesados, parcial.bultosTotal)}` : null,
    };
  }

  const ultima = [...etapas].sort((a, b) => ORDEN_PROCESO[b.tipo] - ORDEN_PROCESO[a.tipo])[0];
  if (!ultima) return { texto: "Sin procesar", fraccion: 0, detalle: null };
  return {
    texto: `${PARTICIPIO[ultima.tipo]} ${textoBultos(ultima.bultosProcesados, ultima.bultosTotal)}`,
    fraccion: ultima.bultosTotal > 0 ? acotar(ultima.bultosProcesados / ultima.bultosTotal) : 0,
    detalle: null,
  };
}

/** Solo el texto de `calcularAvance()`. */
export function textoAvance(lote: LoteAvance, etapas: readonly EtapaAvance[]): string {
  return calcularAvance(lote, etapas).texto;
}
