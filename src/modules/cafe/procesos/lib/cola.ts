import { ORDEN_PROCESO } from "../../lotes/lib/servicios";
import type { TipoProceso } from "../../lotes/types";
import type { TarjetaLotePlanta } from "../types-planta";

// Tablero de la planta (A-13 · FIN-131): UNA cola por etapa, sin separar por línea de negocio (la línea es una
// etiqueta de la tarjeta). Puro: la lista llega entera del servidor (los lotes con trabajo pendiente, pocos) y el
// operario busca al instante. Un lote parcial aparece en TODAS las columnas donde aún tiene bultos.

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
  /** Bultos que aún esperan esa etapa (en «entrega», todos). */
  pendientes: number;
  total: number;
}

const porOrden = (a: TipoProceso, b: TipoProceso) => ORDEN_PROCESO[a] - ORDEN_PROCESO[b];

/**
 * En qué etapa está cada bulto: la primera de las requeridas por la que aún no pasó. Devuelve cuántos bultos
 * esperan cada etapa (un lote parcial reparte sus bultos entre varias).
 */
export function bultosPorEtapa(requeridos: readonly TipoProceso[], bultos: readonly { pasos: readonly TipoProceso[] }[]): Partial<Record<TipoProceso, number>> {
  const ordenadas = [...requeridos].sort(porOrden);
  const cuenta: Partial<Record<TipoProceso, number>> = {};
  for (const b of bultos) {
    const siguiente = ordenadas.find((t) => !b.pasos.includes(t));
    if (siguiente) cuenta[siguiente] = (cuenta[siguiente] ?? 0) + 1;
  }
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

/** Reparte las tarjetas en columnas. Un lote `listo` va solo a «entrega»; el resto, a cada etapa con bultos pendientes. */
export function construirTablero(tarjetas: readonly TarjetaLotePlanta[]): Record<ColumnaPlanta, EntradaTablero[]> {
  const tablero: Record<ColumnaPlanta, EntradaTablero[]> = { trilla: [], tostion: [], molienda: [], empaque: [], entrega: [] };
  for (const t of tarjetas) {
    if (t.estado === "listo") {
      if (t.linea === "servicio") tablero.entrega.push({ tarjeta: t, columna: "entrega", pendientes: t.numBultos, total: t.numBultos });
      continue;
    }
    for (const paso of [...t.serviciosRequeridos].sort(porOrden)) {
      const pendientes = t.bultosPorEtapa[paso] ?? 0;
      if (pendientes > 0) tablero[paso].push({ tarjeta: t, columna: paso, pendientes, total: t.numBultos });
    }
  }
  return tablero;
}

export type EstadoChip = "hecho" | "actual" | "futuro";

/** Chips de servicios de la tarjeta: hechos (todos los bultos), la etapa de la columna (actual) y los demás (futuros). */
export function chipsServicios(t: TarjetaLotePlanta, columna: ColumnaPlanta): { tipo: TipoProceso; estado: EstadoChip }[] {
  return [...t.serviciosRequeridos].sort(porOrden).map((tipo) => ({
    tipo,
    estado: (t.procesados[tipo] ?? 0) >= t.numBultos ? "hecho" : tipo === columna ? "actual" : "futuro",
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

export interface AvisoPlanta {
  id: "desvio" | "insumo" | "sin_recoger";
  tono: "rojo" | "ambar" | "gris";
  titulo: string;
  /** Detalle corto (códigos o nombres); vacío si no hay nada que avisar. */
  detalle: string;
  /** Cuántos elementos tiene el aviso; 0 = todo en orden. */
  cantidad: number;
}

const unir = (xs: readonly string[], max = 3) => (xs.length <= max ? xs.join(", ") : `${xs.slice(0, max).join(", ")} y ${xs.length - max} más`);

/**
 * Los tres avisos de la fila superior: desvío de merma (rojo), insumo bajo mínimo (ámbar) y lote listo sin recoger
 * más de `diasSinRecoger` días (gris). Solo AVISAN. `hoy` = `YYYY-MM-DD` en la zona del cliente.
 */
export function calcularAvisos(args: { tarjetas: readonly TarjetaLotePlanta[]; insumosBajoMinimo: readonly string[]; diasSinRecoger: number; hoy: string }): AvisoPlanta[] {
  const { tarjetas, insumosBajoMinimo, diasSinRecoger, hoy } = args;
  const conDesvio = [...new Set(tarjetas.filter((t) => t.tieneDesvio).map((t) => t.codigo))];
  const sinRecoger = tarjetas.filter((t) => t.estado === "listo" && t.linea === "servicio" && t.listoDesde && diasEntre(t.listoDesde, hoy) > diasSinRecoger).map((t) => t.codigo);
  const n = (c: number, uno: string, varios: string) => `${c} ${c === 1 ? uno : varios}`;
  return [
    { id: "desvio", tono: "rojo", titulo: conDesvio.length ? `Desvío de merma en ${n(conDesvio.length, "lote", "lotes")}` : "Sin desvíos de merma", detalle: unir(conDesvio), cantidad: conDesvio.length },
    { id: "insumo", tono: "ambar", titulo: insumosBajoMinimo.length ? `${n(insumosBajoMinimo.length, "insumo bajo", "insumos bajo")} el mínimo` : "Insumos por encima del mínimo", detalle: unir(insumosBajoMinimo), cantidad: insumosBajoMinimo.length },
    {
      id: "sin_recoger",
      tono: "gris",
      titulo: sinRecoger.length ? `${n(sinRecoger.length, "lote listo", "lotes listos")} sin recoger` : "Nada sin recoger",
      detalle: sinRecoger.length ? `${unir(sinRecoger)} · más de ${diasSinRecoger} días` : "",
      cantidad: sinRecoger.length,
    },
  ];
}
