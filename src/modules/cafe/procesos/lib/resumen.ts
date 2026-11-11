import { calcularValor } from "@/modules/core/tarifas/lib/calcular-valor";
import { etiquetaServicio } from "../../lotes/lib/servicios";
import type { LineaLote, NivelTueste, TipoProceso } from "../../lotes/types";
import type { EstadoLote } from "../types";
import { calcularMerma, esDesvio, estadoMerma, type EstadoMerma } from "./merma";
import { formatearCompacto, formatearPeso, formatearPorcentaje } from "./numero";

// Lo que la pantalla de planta calcula MIENTRAS el operario escribe (merma, desvío, valor) y los textos con que
// lo cuenta. Usa los mismos `calcularMerma`/`esDesvio` que las columnas generadas de `cafe.procesos`, así que lo
// que se ve en vivo es lo que se guarda. Puro, sin React ni base.

/** Referencias de merma del cliente (snapshot al guardar): solo trilla y tostión (decisión 3 de CO-20). */
export interface ConfigMerma {
  referenciaTrillaPct: number;
  /** Referencia de tostión por nivel de tueste (A-03). */
  referenciaTostionPct: Readonly<Record<NivelTueste, number>>;
  toleranciaPts: number;
}

/** Merma de referencia de un paso; `null` en molienda y empaque (sin referencia no hay desvío). */
export function referenciaDelPaso(tipo: TipoProceso, cfg: ConfigMerma, nivel?: NivelTueste | null): number | null {
  if (tipo === "trilla") return cfg.referenciaTrillaPct;
  // Sin nivel elegido todavía no hay referencia de tostión que comparar.
  if (tipo === "tostion") return nivel ? cfg.referenciaTostionPct[nivel] : null;
  return null;
}

export interface MermaEnVivo {
  mermaKg: number;
  mermaPct: number;
  desvio: boolean;
  /** `null` = sin referencia (molienda, empaque o tostión sin nivel). */
  estado: EstadoMerma | null;
  referenciaPct: number | null;
  toleranciaPts: number;
}

/** Merma y desvío con lo escrito hasta ahora (trilla: la tostión no tiene salida al registrarse, B-05); `null` mientras falte la entrada o la salida, o no sean coherentes. */
export function mermaEnVivo(
  tipo: TipoProceso,
  entradaKg: number | null,
  salidaKg: number | null,
  cfg: ConfigMerma,
  nivel?: NivelTueste | null,
): MermaEnVivo | null {
  if (entradaKg === null || salidaKg === null) return null;
  const merma = calcularMerma(entradaKg, salidaKg);
  if (!merma) return null;
  const referenciaPct = referenciaDelPaso(tipo, cfg, nivel);
  return {
    ...merma,
    referenciaPct,
    toleranciaPts: cfg.toleranciaPts,
    desvio: esDesvio(merma.mermaPct, referenciaPct, cfg.toleranciaPts),
    estado: estadoMerma(merma.mermaPct, referenciaPct, cfg.toleranciaPts),
  };
}

/** «Merma 25,0 % (referencia 19 % ± 2). Revisa el pesaje. Puedes guardar igualmente» (alta) / «Verifica…» (baja). */
export function textoDesvio(m: MermaEnVivo): string | null {
  if (!m.desvio || m.referenciaPct === null) return null;
  const base = `Merma ${formatearPorcentaje(m.mermaPct)} % (referencia ${formatearCompacto(m.referenciaPct)} % ± ${formatearCompacto(m.toleranciaPts)})`;
  const consejo = m.estado === "baja" ? "Verifica el peso y el desarrollo del tueste" : "Revisa el pesaje";
  return `${base}. ${consejo}. Puedes guardar igualmente`;
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
 * Cómo queda el lote tras guardar, para el aviso: «Lote parcial: quedan 202,0 kg por tostar», «Lote listo…».
 * `pendienteKg` = kilos que aún faltan en ese paso tras lo que se acaba de registrar.
 */
export function textoEstadoLote(estado: EstadoLote, avanceTexto: string, paso: { tipo: TipoProceso; pendienteKg: number }): string {
  switch (estado) {
    case "parcial":
      return `Lote parcial: quedan ${formatearPeso(paso.pendienteKg)} kg por ${VERBO_PASO[paso.tipo]}`;
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

const VERBO_PASO: Record<TipoProceso, string> = { trilla: "trillar", tostion: "tostar", molienda: "moler", empaque: "empacar" };

/** Concordancia con el paso: la trilla, la tostión y la molienda son «registrada/anulada»; el empaque, «registrado/anulado». */
export function participioDe(tipo: TipoProceso, base: "registrad" | "anulad"): string {
  return `${base}${tipo === "empaque" ? "o" : "a"}`;
}

/** Aviso del toast al guardar: «Trilla registrada · merma 19,0 % (95,000 kg)»; la tostión no tiene merma hasta su empaque. */
export function textoProcesoRegistrado(tipo: TipoProceso, mermaPct: number | null, mermaKg: number | null, entradaKg?: number): string {
  const base = `${etiquetaServicio(tipo)} ${participioDe(tipo, "registrad")}`;
  if (mermaPct !== null && mermaKg !== null) return `${base} · merma ${formatearPorcentaje(mermaPct)} % (${formatearPeso(mermaKg)} kg)`;
  return entradaKg !== undefined ? `${base} · ${formatearPeso(entradaKg)} kg` : base;
}
