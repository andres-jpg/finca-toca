import type { LineaLote, TipoProceso } from "../types";
import { formatKg } from "@/modules/core/formato/numeros";
import { ORDEN_PROCESO, etiquetaServicio } from "./servicios";

// Avance de un lote (HU-F1-05): cuántos servicios van completos y, en marca propia, los kilos del último paso.
// Se calcula a partir de las vistas `v_lotes` y `v_lote_etapas`; aquí solo se decide cómo contarlo. Pura.

/** Lo que el listado necesita de una etapa (fila de `v_lote_etapas`). */
export interface EtapaAvance {
  tipo: TipoProceso;
  kgBase: number;
  kgProcesados: number;
  kgPendientes: number;
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
  /** Texto principal: «2 de 3» (servicio) o «202,0 kg por tostar · de 320,0 kg» (marca propia). */
  texto: string;
  /** Qué tanto de la barra (0..1). */
  fraccion: number;
  /** Servicio con un paso a medias: «Tostión · 202,0 kg por tostar». */
  detalle: string | null;
}

const PARTICIPIO: Readonly<Record<TipoProceso, string>> = {
  trilla: "Trillado",
  tostion: "Tostado",
  molienda: "Molido",
  empaque: "Empacado",
};

const VERBO: Readonly<Record<TipoProceso, string>> = { trilla: "trillar", tostion: "tostar", molienda: "moler", empaque: "empacar" };

/** «202,0 kg por tostar · de 320,0 kg»: lo que falta de un paso y de cuánto era. */
export function textoKg(tipo: TipoProceso, pendienteKg: number, baseKg: number): string {
  return `${formatKg(pendienteKg)} por ${VERBO[tipo]} · de ${formatKg(baseKg)}`;
}

const acotar = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * Servicio: «0 de 4», «1 de 4»… cambia solo al COMPLETARSE un paso (todos sus kilos); si hay uno a medias se
 * dice aparte en `detalle`. Marca propia no tiene «contrato»: se cuenta el último paso con procesos
 * («202,0 kg por tostar · de 320,0 kg») y la barra es la fracción de kilos de ese paso. Anulado: sin avance.
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
      detalle: parcial ? `${etiquetaServicio(parcial.tipo)} · ${textoKg(parcial.tipo, parcial.kgPendientes, parcial.kgBase)}` : null,
    };
  }

  const ultima = [...etapas].sort((a, b) => ORDEN_PROCESO[b.tipo] - ORDEN_PROCESO[a.tipo])[0];
  if (!ultima) return { texto: "Sin procesar", fraccion: 0, detalle: null };
  const pendiente = ultima.kgPendientes > 0.05;
  return {
    texto: pendiente ? textoKg(ultima.tipo, ultima.kgPendientes, ultima.kgBase) : `${PARTICIPIO[ultima.tipo]} · ${formatKg(ultima.kgBase)}`,
    fraccion: ultima.kgBase > 0 ? acotar(ultima.kgProcesados / ultima.kgBase) : 0,
    detalle: null,
  };
}

/** Solo el texto de `calcularAvance()`. */
export function textoAvance(lote: LoteAvance, etapas: readonly EtapaAvance[]): string {
  return calcularAvance(lote, etapas).texto;
}
