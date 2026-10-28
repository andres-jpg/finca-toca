import { calcularValor } from "@/modules/core/tarifas/lib/calcular-valor";
import { etiquetaServicio } from "../../lotes/lib/servicios";
import type { LineaLote, TipoProceso } from "../../lotes/types";
import type { EstadoLote } from "../types";
import { calcularMerma, esDesvio } from "./merma";
import { formatearCompacto, formatearPeso, formatearPorcentaje } from "./numero";
import { PARTICIPIO_PASO } from "./pasos";

// Lo que la pantalla de planta calcula MIENTRAS el operario escribe (merma, desvío, valor) y los textos con que
// lo cuenta. Usa los mismos `calcularMerma`/`esDesvio` que las columnas generadas de `cafe.procesos`, así que lo
// que se ve en vivo es lo que se guarda. Puro, sin React ni base.

/** Referencias de merma del cliente (snapshot al guardar): solo trilla y tostión (decisión 3 de CO-20). */
export interface ConfigMerma {
  referenciaTrillaPct: number;
  referenciaTostionPct: number;
  toleranciaPts: number;
}

/** Merma de referencia de un paso; `null` en molienda y empaque (sin referencia no hay desvío). */
export function referenciaDelPaso(tipo: TipoProceso, cfg: ConfigMerma): number | null {
  if (tipo === "trilla") return cfg.referenciaTrillaPct;
  if (tipo === "tostion") return cfg.referenciaTostionPct;
  return null;
}

export interface MermaEnVivo {
  mermaKg: number;
  mermaPct: number;
  desvio: boolean;
  referenciaPct: number | null;
  toleranciaPts: number;
}

/** Merma y desvío con lo escrito hasta ahora; `null` mientras falte la entrada o la salida, o no sean coherentes. */
export function mermaEnVivo(
  tipo: TipoProceso,
  entradaKg: number | null,
  salidaKg: number | null,
  cfg: ConfigMerma,
): MermaEnVivo | null {
  if (entradaKg === null || salidaKg === null) return null;
  const merma = calcularMerma(entradaKg, salidaKg);
  if (!merma) return null;
  const referenciaPct = referenciaDelPaso(tipo, cfg);
  return {
    ...merma,
    referenciaPct,
    toleranciaPts: cfg.toleranciaPts,
    desvio: esDesvio(merma.mermaPct, referenciaPct, cfg.toleranciaPts),
  };
}

/** «Merma 25,0 % (referencia 19 % ± 3). Revisa el pesaje. Puedes guardar igualmente». */
export function textoDesvio(m: MermaEnVivo): string | null {
  if (!m.desvio || m.referenciaPct === null) return null;
  return `Merma ${formatearPorcentaje(m.mermaPct)} % (referencia ${formatearCompacto(m.referenciaPct)} % ± ${formatearCompacto(m.toleranciaPts)}). Revisa el pesaje. Puedes guardar igualmente`;
}

export interface ValorServicio {
  /** Tarifa vigente por kilo; `null` si el cliente no la ha definido. */
  tarifaKg: number | null;
  /** Valor a cobrar con la entrada escrita; `null` sin tarifa o sin entrada. */
  valor: number | null;
}

/**
 * Valor del servicio de un proceso. Solo se cobra en lotes de SERVICIO y no el empaque (va incluido); marca
 * propia no se cobra. `null` = no aplica y no se muestra. El valor se calcula sobre el peso de ENTRADA
 * (`valor = round(peso_entrada × tarifa)`, como la columna generada).
 */
export function valorDelServicio(
  linea: LineaLote,
  tipo: TipoProceso,
  entradaKg: number | null,
  tarifaKg: number | null,
): ValorServicio | null {
  if (linea !== "servicio" || tipo === "empaque") return null;
  const valor = tarifaKg !== null && entradaKg !== null && entradaKg > 0 ? calcularValor(entradaKg, tarifaKg) : null;
  return { tarifaKg, valor };
}

/**
 * Cómo queda el lote tras guardar, para el aviso: «Lote parcial: 2 de 6 bultos tostados», «Lote listo…».
 * `procesados` = bultos que ya pasaron por ese paso incluyendo los que se acaban de registrar.
 */
export function textoEstadoLote(
  estado: EstadoLote,
  avanceTexto: string,
  paso: { tipo: TipoProceso; procesados: number; total: number },
): string {
  switch (estado) {
    case "parcial":
      return `Lote parcial: ${paso.procesados} de ${paso.total} bultos ${PARTICIPIO_PASO[paso.tipo]}`;
    case "listo":
      return "Lote listo: todos los pasos están completos";
    case "en_proceso":
      return `Lote en proceso: ${avanceTexto}`;
    case "recibido":
      return "Lote recibido, sin procesos";
    case "anulado":
      return "Lote anulado";
  }
}

/** Concordancia con el paso: la trilla, la tostión y la molienda son «registrada/anulada»; el empaque, «registrado/anulado». */
export function participioDe(tipo: TipoProceso, base: "registrad" | "anulad"): string {
  return `${base}${tipo === "empaque" ? "o" : "a"}`;
}

/** Aviso del toast al guardar: «Tostión registrada · merma 18,0 % (73,000 kg)». */
export function textoProcesoRegistrado(tipo: TipoProceso, mermaPct: number, mermaKg: number): string {
  return `${etiquetaServicio(tipo)} ${participioDe(tipo, "registrad")} · merma ${formatearPorcentaje(mermaPct)} % (${formatearPeso(mermaKg)} kg)`;
}
