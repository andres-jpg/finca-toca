import { ORDEN_PROCESO } from "../../lotes/lib/servicios";
import type { TipoProceso } from "../../lotes/types";
import type { TarjetaLotePlanta } from "../types-planta";

// Tablero de la planta (A-13 · FIN-131): UNA cola por etapa, sin separar por línea de negocio (la línea es una
// etiqueta de la tarjeta). Puro: la lista llega entera del servidor (los lotes con trabajo pendiente, pocos) y el
// operario busca al instante. Un lote parcial aparece en TODAS las columnas donde aún tiene café por procesar.

/** Columnas del tablero, en el orden del flujo. «entrega» es solo de servicios (café ya procesado, sin recoger). */
export const COLUMNAS_PLANTA = ["trilla", "tostion", "molienda", "empaque", "entrega"] as const;
export type ColumnaPlanta = (typeof COLUMNAS_PLANTA)[number];

export const TITULO_COLUMNA: Readonly<Record<ColumnaPlanta, string>> = {
  trilla: "Por trillar",
  tostion: "Por tostar",
  molienda: "Por moler",
  empaque: "Por empacar",
  entrega: "Por entregar",
};

/** Texto del estado vacío de cada columna. */
export const VACIO_COLUMNA: Readonly<Record<ColumnaPlanta, string>> = {
  trilla: "Nada por trillar",
  tostion: "Nada por tostar",
  molienda: "Nada por moler",
  empaque: "Nada por empacar",
  entrega: "Nada por entregar",
};

/** Verbo del botón que lleva al proceso de esa etapa. */
export const CTA_PASO: Readonly<Record<TipoProceso, string>> = {
  trilla: "Trillar",
  tostion: "Tostar",
  molienda: "Moler",
  empaque: "Empacar",
};

export interface EntradaTablero {
  tarjeta: TarjetaLotePlanta;
  columna: ColumnaPlanta;
  /** Kilos que aún esperan esa etapa y de cuántos era (en «entrega», el peso actual). */
  pendientes: number;
  total: number;
}

const porOrden = (a: TipoProceso, b: TipoProceso) => ORDEN_PROCESO[a] - ORDEN_PROCESO[b];

/**
 * Kilos que esperan cada etapa ahora: los del paso si se puede registrar (hay café del paso anterior por procesar). Un lote
 * parcial reparte su café entre varias etapas.
 */
export function kgPorEtapa(evaluaciones: readonly { tipo: TipoProceso; disponible: boolean; kgDisponible: number }[]): Partial<Record<TipoProceso, number>> {
  const cuenta: Partial<Record<TipoProceso, number>> = {};
  for (const e of evaluaciones) if (e.disponible) cuenta[e.tipo] = e.kgDisponible;
  return cuenta;
}

/** Quita tildes y pasa a minúsculas para buscar sin importar acentos. */
const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Busca por código del lote o nombre del cliente / proveedor. */
export function filtrarCola(tarjetas: readonly TarjetaLotePlanta[], q: string): TarjetaLotePlanta[] {
  const texto = sinTildes(q.trim());
  if (!texto) return [...tarjetas];
  return tarjetas.filter((t) => sinTildes(t.codigo).includes(texto) || sinTildes(t.tercero).includes(texto));
}

/** Reparte las tarjetas en columnas. Un lote `listo` va solo a «entrega»; el resto, a cada etapa con kilos pendientes. */
export function construirTablero(tarjetas: readonly TarjetaLotePlanta[]): Record<ColumnaPlanta, EntradaTablero[]> {
  const tablero: Record<ColumnaPlanta, EntradaTablero[]> = { trilla: [], tostion: [], molienda: [], empaque: [], entrega: [] };
  for (const t of tarjetas) {
    if (t.estado === "listo") {
      if (t.linea === "servicio") tablero.entrega.push({ tarjeta: t, columna: "entrega", pendientes: t.pesoActualKg, total: t.pesoActualKg });
      continue;
    }
    for (const paso of [...t.serviciosRequeridos].sort(porOrden)) {
      const pendientes = t.kgPorEtapa[paso] ?? 0;
      if (pendientes > 0) tablero[paso].push({ tarjeta: t, columna: paso, pendientes, total: t.pesoRecibidoKg });
    }
  }
  return tablero;
}

export type EstadoChip = "hecho" | "actual" | "futuro";

/** Chips de servicios de la tarjeta: hechos (todos los kilos), la etapa de la columna (actual) y los demás (futuros). */
export function chipsServicios(t: TarjetaLotePlanta, columna: ColumnaPlanta): { tipo: TipoProceso; estado: EstadoChip }[] {
  return [...t.serviciosRequeridos].sort(porOrden).map((tipo) => ({
    tipo,
    estado: t.completos[tipo] ? "hecho" : tipo === columna ? "actual" : "futuro",
  }));
}

/** Días naturales entre dos `YYYY-MM-DD` (sin pasar por la zona horaria); 0 si alguno no es válido. */
export function diasEntre(desde: string, hasta: string): number {
  const f = (ymd: string) => {
    const [a, m, d] = ymd.split("-").map(Number);
    return a && m && d ? Date.UTC(a, m - 1, d) : NaN;
  };
  const dias = Math.round((f(hasta) - f(desde)) / 86_400_000);
  return Number.isFinite(dias) ? dias : 0;
}

/** «hoy», «ayer» o «hace N días». */
export function textoListoHace(dias: number): string {
  if (dias <= 0) return "listo hoy";
  if (dias === 1) return "listo desde ayer";
  return `listo hace ${dias} días`;
}
