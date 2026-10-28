import { ORDEN_PROCESO, etiquetaServicio } from "../../lotes/lib/servicios";
import type { LineaLote, TipoProceso } from "../../lotes/types";

// Qué pasos admite un lote y en qué orden. Es la MISMA regla que `cafe.pasos_del_lote()` / `cafe.paso_previo()`
// y la que valida `cafe._insertar_proceso()`: la base es la frontera real y repite estas comprobaciones, esto
// sirve para ofrecer solo lo válido (y decir por qué lo demás no) antes de guardar. Puro, sin React ni base.

export interface LotePasos {
  linea: LineaLote;
  /** Servicios contratados (solo lotes de servicio; ya incluyen `empaque` si hay tostión). */
  servicios: readonly TipoProceso[];
}

/** Un bulto con los pasos por los que ya pasó (`cafe.v_bultos_estado.pasos`). */
export interface BultoPasos {
  id: string;
  numero: number;
  pasos: readonly TipoProceso[];
}

const porOrden = (a: TipoProceso, b: TipoProceso) => ORDEN_PROCESO[a] - ORDEN_PROCESO[b];

/** Marca propia compra el café ya trillado: tostión, molienda (opcional) y empaque. */
const PASOS_MARCA_PROPIA: readonly TipoProceso[] = ["tostion", "molienda", "empaque"];

/** Pasos que admite el lote, en orden. Servicio: los contratados; marca propia: nunca trilla. */
export function pasosDelLote(lote: LotePasos): TipoProceso[] {
  return [...(lote.linea === "servicio" ? lote.servicios : PASOS_MARCA_PROPIA)].sort(porOrden);
}

/**
 * Paso que ese bulto debe haber hecho antes de `tipo`; `null` si es el primero. Servicio: el contratado
 * anterior. Marca propia: la molienda sigue a la tostión y el empaque a la molienda SI el bulto pasó por ella
 * (si no, a la tostión).
 */
export function pasoPrevio(lote: LotePasos, tipo: TipoProceso, pasosBulto: readonly TipoProceso[] = []): TipoProceso | null {
  if (lote.linea === "servicio") {
    const anteriores = lote.servicios.filter((s) => ORDEN_PROCESO[s] < ORDEN_PROCESO[tipo]).sort(porOrden);
    return anteriores.at(-1) ?? null;
  }
  if (tipo === "molienda") return "tostion";
  if (tipo === "empaque") return pasosBulto.includes("molienda") ? "molienda" : "tostion";
  return null;
}

/**
 * Pasos contra los que se mide el avance (`cafe.servicios_requeridos()`): los contratados, o tostión + empaque
 * en marca propia (la molienda cuenta solo si ya se hizo, porque es opcional).
 */
export function pasosRequeridos(lote: LotePasos, moliendaHecha: boolean): TipoProceso[] {
  if (lote.linea === "servicio") return [...lote.servicios].sort(porOrden);
  return moliendaHecha ? ["tostion", "molienda", "empaque"] : ["tostion", "empaque"];
}

/** Cuántos bultos han pasado por cada paso. */
export function procesadosPorTipo(bultos: readonly BultoPasos[]): Partial<Record<TipoProceso, number>> {
  const cuenta: Partial<Record<TipoProceso, number>> = {};
  for (const b of bultos) for (const p of new Set(b.pasos)) cuenta[p] = (cuenta[p] ?? 0) + 1;
  return cuenta;
}

export interface SiguientePaso {
  tipo: TipoProceso;
  /** Bultos que aún no han pasado por ese paso. */
  pendientes: number;
  total: number;
}

/**
 * El siguiente paso de la cola: el primero (en orden) de los requeridos que aún tiene bultos pendientes.
 * `null` si todos los requeridos están completos. `procesados` = bultos que ya pasaron por cada paso.
 */
export function siguientePaso(
  requeridos: readonly TipoProceso[],
  numBultos: number,
  procesados: Partial<Record<TipoProceso, number>>,
): SiguientePaso | null {
  for (const tipo of [...requeridos].sort(porOrden)) {
    const pendientes = numBultos - (procesados[tipo] ?? 0);
    if (pendientes > 0) return { tipo, pendientes, total: numBultos };
  }
  return null;
}

/** «Tostión · 4 de 6 bultos pendientes», como se ve en la tarjeta de la cola. */
export function textoSiguientePaso(s: SiguientePaso): string {
  const pend = s.pendientes === 1 ? "1 bulto pendiente" : `${s.pendientes} bultos pendientes`;
  return s.total === 1 ? `${etiquetaServicio(s.tipo)} · ${pend}` : `${etiquetaServicio(s.tipo)} · ${s.pendientes} de ${s.total} bultos pendientes`;
}

export type EstadoBultoEnPaso =
  | { estado: "elegible" }
  /** Ya pasó por este paso. */
  | { estado: "hecho" }
  /** No puede pasar ahora: `motivo` dice por qué. */
  | { estado: "bloqueado"; motivo: string };

/** «la trilla», «la tostión»…: para frases como «Primero registra la trilla». */
export const ARTICULO_PASO: Record<TipoProceso, string> = { trilla: "la trilla", tostion: "la tostión", molienda: "la molienda", empaque: "el empaque" };

/** ¿Puede ese bulto pasar por `tipo` ahora? Mismas comprobaciones, en el mismo orden, que `_insertar_proceso`. */
export function evaluarBulto(lote: LotePasos, tipo: TipoProceso, bulto: BultoPasos): EstadoBultoEnPaso {
  if (bulto.pasos.includes(tipo)) return { estado: "hecho" };
  if (bulto.pasos.some((p) => ORDEN_PROCESO[p] > ORDEN_PROCESO[tipo])) {
    return { estado: "bloqueado", motivo: "Ya pasó por un paso posterior" };
  }
  const previo = pasoPrevio(lote, tipo, bulto.pasos);
  if (previo && !bulto.pasos.includes(previo)) {
    return { estado: "bloqueado", motivo: `Falta ${ARTICULO_PASO[previo]}` };
  }
  return { estado: "elegible" };
}

export interface EvaluacionPaso {
  tipo: TipoProceso;
  /** Hay al menos un bulto que puede pasar por este paso (y el paso se registra en la planta). */
  disponible: boolean;
  /** Por qué no está disponible; `null` si lo está. */
  motivo: string | null;
  /** Ids de los bultos que pueden pasar ahora. */
  elegibles: string[];
  /** Bultos que ya pasaron por este paso. */
  hechos: number;
  total: number;
}

/**
 * Nota de la tarjeta de la cola cuando el siguiente paso es el empaque de marca propia: no usa el formulario
 * genérico de proceso sino el de presentaciones (`EmpaqueForm`, CO-30), que además mueve el inventario.
 */
export const NOTA_EMPAQUE_MARCA_PROPIA = "Se empaca por presentaciones: descuenta bolsas y etiquetas y suma producto terminado.";

function numeros(bultos: readonly BultoPasos[]): string {
  return bultos
    .map((b) => b.numero)
    .sort((a, b) => a - b)
    .join(", ");
}

/** Evalúa un paso del lote contra sus bultos: si se puede registrar, con cuáles, y si no, el motivo en español. */
export function evaluarPaso(lote: LotePasos, tipo: TipoProceso, bultos: readonly BultoPasos[]): EvaluacionPaso {
  const evaluados = bultos.map((b) => ({ b, e: evaluarBulto(lote, tipo, b) }));
  const elegibles = evaluados.filter((x) => x.e.estado === "elegible").map((x) => x.b.id);
  const hechos = evaluados.filter((x) => x.e.estado === "hecho").length;
  const base = { tipo, elegibles, hechos, total: bultos.length };

  if (elegibles.length > 0) return { ...base, disponible: true, motivo: null };

  const pendientes = evaluados.filter((x) => x.e.estado === "bloqueado");
  if (pendientes.length === 0) {
    return { ...base, disponible: false, motivo: "Ya se registró en todos los bultos." };
  }
  const sinPrevio = pendientes.filter((x) => x.e.estado === "bloqueado" && x.e.motivo.startsWith("Falta"));
  if (sinPrevio.length > 0) {
    const previo = pasoPrevio(lote, tipo, sinPrevio[0].b.pasos);
    const donde = bultos.length === 1 ? "" : ` (bultos ${numeros(sinPrevio.map((x) => x.b))})`;
    return { ...base, disponible: false, motivo: `Primero registra ${previo ? ARTICULO_PASO[previo] : "el paso anterior"}${donde}.` };
  }
  return { ...base, disponible: false, motivo: "Los bultos pendientes ya pasaron por un paso posterior." };
}

/** Todos los pasos del lote, en orden, cada uno con su evaluación. */
export function evaluarPasos(lote: LotePasos, bultos: readonly BultoPasos[]): EvaluacionPaso[] {
  return pasosDelLote(lote).map((tipo) => evaluarPaso(lote, tipo, bultos));
}

/** El paso que se preselecciona: el siguiente de la cola si se puede registrar, o el primer disponible. */
export function pasoInicial(
  lote: LotePasos,
  bultos: readonly BultoPasos[],
  requeridos: readonly TipoProceso[],
): TipoProceso | null {
  const evaluaciones = evaluarPasos(lote, bultos);
  const sig = siguientePaso(requeridos, bultos.length, procesadosPorTipo(bultos));
  const delSiguiente = sig && evaluaciones.find((e) => e.tipo === sig.tipo && e.disponible);
  return (delSiguiente ?? evaluaciones.find((e) => e.disponible))?.tipo ?? null;
}

/**
 * De dónde viene el peso de entrada: el paso previo de los bultos elegidos y las fechas en que se hizo
 * («Viene de la trilla del 06/11»). `previo` es `null` si entran tal como llegaron (primer paso).
 */
export function origenPeso(
  lote: LotePasos,
  tipo: TipoProceso,
  seleccionados: readonly (BultoPasos & { hechos?: Partial<Record<TipoProceso, { fecha: string }>> })[],
): { previo: TipoProceso | null; fechas: string[] } {
  const previos = [...new Set(seleccionados.map((b) => pasoPrevio(lote, tipo, b.pasos)))].filter((p): p is TipoProceso => p !== null);
  // Si los bultos vienen de pasos distintos (con molienda y sin ella) no hay UN origen: se describe el más avanzado.
  const previo = previos.sort((a, b) => ORDEN_PROCESO[b] - ORDEN_PROCESO[a])[0];
  if (!previo) return { previo: null, fechas: [] };
  const fechas = [...new Set(seleccionados.flatMap((b) => b.hechos?.[previo]?.fecha ?? []))].sort();
  return { previo, fechas };
}

/** Participio para el aviso del lote: «2 de 6 bultos tostados». */
export const PARTICIPIO_PASO: Record<TipoProceso, string> = {
  trilla: "trillados",
  tostion: "tostados",
  molienda: "molidos",
  empaque: "empacados",
};
