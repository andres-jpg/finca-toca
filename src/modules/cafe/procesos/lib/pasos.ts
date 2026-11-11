import { ORDEN_PROCESO, etiquetaServicio } from "../../lotes/lib/servicios";
import { textoKg } from "../../lotes/lib/avance";
import type { LineaLote, TipoProceso } from "../../lotes/types";
import type { ModoMolienda } from "./molienda";
import { toleranciaSaldoKg } from "./saldo";

// Qué pasos admite un lote, en qué orden y de qué proceso consume kilos cada uno (ADR 0002). Es la MISMA regla que
// `cafe.pasos_del_lote()`, `cafe.paso_previo()`, `cafe.paso_origen()` y la que valida `cafe._insertar_proceso()`: la base
// repite estas comprobaciones, esto sirve para ofrecer solo lo válido (y decir por qué lo demás no) antes de guardar.
// Puro, sin React ni base.

export interface LotePasos {
  linea: LineaLote;
  /** Servicios contratados (solo lotes de servicio; ya incluyen `empaque` si hay tostión). */
  servicios: readonly TipoProceso[];
}

/** Un origen con saldo (fila de `cafe.v_origenes_disponibles`): `tipo`/`procesoId` null = el café tal como se recibió. */
export interface OrigenPlanta {
  procesoId: string | null;
  tipo: TipoProceso | null;
  /** Fecha del proceso de origen (`YYYY-MM-DD`); `null` en la raíz. */
  fecha: string | null;
  baseKg: number;
  consumidoKg: number;
  saldoKg: number;
  /** Tostión sin salida (tanda en curso): su peso es estimado. */
  estimado: boolean;
  /** Tostión que ya tiene su molienda vigente. */
  conMolienda: boolean;
  /** Decisión de molienda de la tanda (B-06); `null`/ausente = tanda anterior a esa decisión. */
  moliendaModo?: ModoMolienda | null;
  /** Kilos estimados a moler de la tanda; `null` = sin molienda o sin decisión. */
  moliendaKg?: number | null;
}

/**
 * ¿Esta tanda de tostión pasa por molienda? Espejo de `cafe.tanda_requiere_molienda()`: con decisión, lo que diga; sin ella
 * (tanda anterior), solo si el lote de servicio contrata molienda o la tanda ya se molió.
 */
export function tandaRequiereMolienda(lote: LotePasos, origen: Pick<OrigenPlanta, "moliendaModo" | "conMolienda">): boolean {
  if (origen.moliendaModo != null) return origen.moliendaModo !== "ninguna";
  return (lote.linea === "servicio" && lote.servicios.includes("molienda")) || origen.conMolienda;
}

const porOrden = (a: TipoProceso, b: TipoProceso) => ORDEN_PROCESO[a] - ORDEN_PROCESO[b];

/** Marca propia compra el café ya trillado: tostión, molienda (opcional) y empaque. */
const PASOS_MARCA_PROPIA: readonly TipoProceso[] = ["tostion", "molienda", "empaque"];

/** Pasos que admite el lote, en orden. Servicio: los contratados; marca propia: nunca trilla. */
export function pasosDelLote(lote: LotePasos): TipoProceso[] {
  return [...(lote.linea === "servicio" ? lote.servicios : PASOS_MARCA_PROPIA)].sort(porOrden);
}

/** Paso anterior en el ORDEN de los pasos; `null` si es el primero. Espejo de `cafe.paso_previo(lote, tipo)`. */
export function pasoPrevio(lote: LotePasos, tipo: TipoProceso): TipoProceso | null {
  if (lote.linea === "servicio") {
    return lote.servicios.filter((s) => ORDEN_PROCESO[s] < ORDEN_PROCESO[tipo]).sort(porOrden).at(-1) ?? null;
  }
  return tipo === "molienda" || tipo === "empaque" ? "tostion" : null;
}

/**
 * Tipo de proceso del que un paso consume kilos; `null` = el café recibido. Se salta la molienda (es una confirmación, no
 * un eslabón de la cadena de kilos): el empaque siempre enlaza a su tostión. Espejo de `cafe.paso_origen(lote, tipo)`.
 */
export function pasoOrigen(lote: LotePasos, tipo: TipoProceso): TipoProceso | null {
  if (tipo === "trilla") return null;
  if (lote.linea === "servicio") {
    return lote.servicios.filter((s) => s !== "molienda" && ORDEN_PROCESO[s] < ORDEN_PROCESO[tipo]).sort(porOrden).at(-1) ?? null;
  }
  return tipo === "tostion" ? null : "tostion";
}

/**
 * Pasos contra los que se mide el avance (`cafe.servicios_requeridos()`): los contratados, o tostión + empaque
 * en marca propia (la molienda cuenta solo si ya se hizo, porque es opcional).
 */
export function pasosRequeridos(lote: LotePasos, moliendaHecha: boolean): TipoProceso[] {
  if (lote.linea === "servicio") return [...lote.servicios].sort(porOrden);
  return moliendaHecha ? ["tostion", "molienda", "empaque"] : ["tostion", "empaque"];
}

/** «la trilla», «la tostión»…: para frases como «Primero registra la trilla». */
export const ARTICULO_PASO: Record<TipoProceso, string> = { trilla: "la trilla", tostion: "la tostión", molienda: "la molienda", empaque: "el empaque" };

/**
 * Nota de la tarjeta de la cola cuando el siguiente paso es el empaque de marca propia: no usa el formulario
 * genérico de proceso sino el de presentaciones (`EmpaqueForm`), que además mueve el inventario.
 */
export const NOTA_EMPAQUE_MARCA_PROPIA = "Se empaca por presentaciones: descuenta bolsas y etiquetas y suma producto terminado.";

export interface EvaluacionPaso {
  tipo: TipoProceso;
  /** Hay al menos un origen del que este paso puede consumir (y el paso se registra en la planta). */
  disponible: boolean;
  /** Por qué no está disponible; `null` si lo está. */
  motivo: string | null;
  /** Orígenes elegibles (con café por procesar). Más de uno = el operario elige la tanda. */
  origenes: OrigenPlanta[];
  /** Kilos que el paso puede procesar ahora (Σ saldo de los orígenes elegibles; en molienda, lo tostado sin moler). */
  kgDisponible: number;
}

/**
 * Evalúa un paso del lote contra sus orígenes: si se puede registrar, de cuáles puede consumir y, si no, el motivo en
 * español. Mismas comprobaciones que `cafe._resolver_origen`.
 */
export function evaluarPaso(lote: LotePasos, tipo: TipoProceso, origenes: readonly OrigenPlanta[]): EvaluacionPaso {
  const tipoOrigen = pasoOrigen(lote, tipo);
  const delTipo = origenes.filter((o) => o.tipo === tipoOrigen);
  // La molienda solo mira las tandas que la piden (B-06); el empaque espera la molienda de las que la piden.
  // Una tanda sin decisión (anterior a B-06) admite molienda como antes; una decidida «sin molienda», no.
  const piden = delTipo.filter((o) => o.moliendaModo !== "ninguna");
  const pendientesDeMoler = piden.filter((o) => !o.conMolienda);
  let elegibles = delTipo.filter((o) => o.saldoKg > toleranciaSaldoKg(o.baseKg));
  if (tipo === "molienda") elegibles = pendientesDeMoler.length > 0 ? pendientesDeMoler : piden;
  if (tipo === "empaque") elegibles = elegibles.filter((o) => !tandaRequiereMolienda(lote, o) || o.conMolienda);
  const kgDe = (o: OrigenPlanta) => (tipo === "molienda" ? (o.moliendaKg ?? o.baseKg) : o.saldoKg);
  const kgDisponible = Math.round(elegibles.reduce((a, o) => a + kgDe(o) * 1000, 0)) / 1000;
  const base = { tipo, origenes: elegibles, kgDisponible };

  if (elegibles.length > 0 && (tipo === "molienda" || kgDisponible > 0)) return { ...base, disponible: true, motivo: null };
  if (delTipo.length === 0 && tipoOrigen !== null) {
    return { ...base, disponible: false, motivo: `Primero registra ${ARTICULO_PASO[tipoOrigen]}.` };
  }
  if (tipo === "molienda" && piden.length === 0) {
    return { ...base, disponible: false, motivo: "La tostión se decidió sin molienda." };
  }
  if (tipo === "empaque" && delTipo.some((o) => o.saldoKg > toleranciaSaldoKg(o.baseKg) && tandaRequiereMolienda(lote, o) && !o.conMolienda)) {
    return { ...base, disponible: false, motivo: "Primero confirma la molienda de este café." };
  }
  return { ...base, disponible: false, motivo: "No queda café por procesar en este paso." };
}

/** Todos los pasos del lote, en orden, cada uno con su evaluación. */
export function evaluarPasos(lote: LotePasos, origenes: readonly OrigenPlanta[]): EvaluacionPaso[] {
  return pasosDelLote(lote).map((tipo) => evaluarPaso(lote, tipo, origenes));
}

/** Lo que el avance necesita de una etapa (fila de `v_lote_etapas`). */
export interface EtapaKg {
  tipo: TipoProceso;
  kgBase: number;
  kgPendientes: number;
}

export interface SiguientePaso {
  tipo: TipoProceso;
  /** Kilos que aún faltan por procesar en ese paso y de cuántos era. */
  pendienteKg: number;
  baseKg: number;
}

/**
 * El siguiente paso de la cola: el primero (en orden) de los requeridos con kilos pendientes sobre la tolerancia. Un paso
 * sin ningún proceso aún cuenta con `pesoRecibidoKg` como base. `null` si todos los requeridos están completos.
 */
export function siguientePaso(requeridos: readonly TipoProceso[], etapas: readonly EtapaKg[], pesoRecibidoKg: number): SiguientePaso | null {
  for (const tipo of [...requeridos].sort(porOrden)) {
    const e = etapas.find((x) => x.tipo === tipo);
    const baseKg = e ? e.kgBase : pesoRecibidoKg;
    const pendienteKg = e ? e.kgPendientes : pesoRecibidoKg;
    if (pendienteKg > toleranciaSaldoKg(baseKg)) return { tipo, pendienteKg, baseKg };
  }
  return null;
}

/** «Tostión · 202,0 kg por tostar · de 320,0 kg», como se ve en la tarjeta de la cola. */
export function textoSiguientePaso(s: SiguientePaso): string {
  return `${etiquetaServicio(s.tipo)} · ${textoKg(s.tipo, s.pendienteKg, s.baseKg)}`;
}

/** El paso que se preselecciona: el siguiente de la cola si se puede registrar, o el primer disponible. */
export function pasoInicial(
  lote: LotePasos,
  origenes: readonly OrigenPlanta[],
  requeridos: readonly TipoProceso[],
  etapas: readonly EtapaKg[],
  pesoRecibidoKg: number,
): TipoProceso | null {
  const evaluaciones = evaluarPasos(lote, origenes);
  const sig = siguientePaso(requeridos, etapas, pesoRecibidoKg);
  const delSiguiente = sig && evaluaciones.find((e) => e.tipo === sig.tipo && e.disponible);
  return (delSiguiente ?? evaluaciones.find((e) => e.disponible))?.tipo ?? null;
}

/** De dónde viene el café de un paso, para el texto «Viene de la trilla del 06/11»; `null` = el café recibido. */
export function origenPeso(origen: OrigenPlanta | null | undefined): { previo: TipoProceso | null; fecha: string | null } {
  return origen?.tipo ? { previo: origen.tipo, fecha: origen.fecha } : { previo: null, fecha: null };
}

/** Participio para el aviso del lote: «tostado». */
export const PARTICIPIO_PASO: Record<TipoProceso, string> = {
  trilla: "trillado",
  tostion: "tostado",
  molienda: "molido",
  empaque: "empacado",
};
