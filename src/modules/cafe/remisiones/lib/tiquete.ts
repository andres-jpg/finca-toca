import { formatearCOP } from "@/modules/cafe/compras/lib/compra";
import { fechaCorta, formatearKg3, formatearMermaPct, formatearPct, pctDeMerma } from "@/modules/cafe/lotes/lib/formato";
import { etiquetaServicio, etiquetaTueste } from "@/modules/cafe/lotes/lib/servicios";
import type { DetalleServicio, Remision } from "../types";

// Texto del tiquete de la remisión (HU-F1-13). Todo se formatea AQUÍ, en el servidor y a mano (sin `Intl` del
// navegador): un tiquete se calibra mirando el papel y el texto debe salir igual en cualquier zona o versión de
// ICU. La merma se muestra calculada desde los kilos, como en el listado y la ficha (ver `pctDeMerma`). Pura.

export const TITULO_REMISION = "REMISIÓN DE ENTREGA";
export const LEYENDA_REMISION = "Documento de control interno — no es factura";
export const COLUMNAS_SERVICIOS = ["Servicio", "Entra kg", "Sale kg", "Merma"] as const;

/** Una fila de la tabla de servicios del tiquete, ya como texto. */
export interface FilaServicioTiquete {
  /** «Tostión · tueste medio». */
  servicio: string;
  entra: string;
  sale: string;
  merma: string;
}

/**
 * Fila de un servicio. El empaque de maquila va incluido sin coste («incluido», sin cifras); un servicio
 * contratado que no se hizo (entrega forzada) sale «Pendiente» con guiones: nunca cifras inventadas.
 */
export function filaServicio(d: DetalleServicio): FilaServicioTiquete {
  const nombre = etiquetaServicio(d.servicio);
  const servicio = d.nivelTueste ? `${nombre} · tueste ${etiquetaTueste(d.nivelTueste).toLowerCase()}` : nombre;
  if (d.pendiente && d.kgEntrada === null) return { servicio, entra: "—", sale: "—", merma: "Pendiente" };
  if (d.incluido) return { servicio, entra: "incluido", sale: "", merma: "" };
  return {
    servicio,
    entra: d.kgEntrada === null ? "—" : formatearKg3(d.kgEntrada),
    sale: d.kgSalida === null ? "—" : formatearKg3(d.kgSalida),
    merma: formatearMermaPct(d.mermaKg, d.kgEntrada),
  };
}

export function filasServicios(detalle: readonly DetalleServicio[]): FilaServicioTiquete[] {
  return detalle.map(filaServicio);
}

/**
 * El mismo servicio para el rollo ESTRECHO (58 mm, ~30 caracteres): la tabla de cuatro columnas no cabe (la columna de
 * texto se queda en una letra por renglón), así que va apilado: el servicio en una línea y, debajo, los kilos con la
 * merma a la derecha. El empaque incluido y los pendientes caben en una sola línea (`cuerpo = null`).
 */
export interface LineaApilada {
  titulo: string;
  /** «405,000 → 332,000» (kg, lo dice `ENCABEZADO_APILADO`); `null` si el servicio va en una sola línea (incluido o pendiente). */
  cuerpo: string | null;
  derecha: string;
}

export function lineaApilada(d: DetalleServicio): LineaApilada {
  const f = filaServicio(d);
  if (f.merma === "Pendiente") return { titulo: f.servicio, cuerpo: null, derecha: "Pendiente" };
  if (f.entra === "incluido") return { titulo: f.servicio, cuerpo: null, derecha: "incluido" };
  return { titulo: f.servicio, cuerpo: `${f.entra} → ${f.sale}`, derecha: f.merma };
}

/** Rótulo de las líneas apiladas (sin «kg» en cada una: en 58 mm no cabría junto a la merma). */
export const ENCABEZADO_APILADO = "Kg entra → sale · merma";

/** Peso entregado y merma total del cliente, como los muestra el pie de la tabla. */
export function resumenEntrega(r: Pick<Remision, "pesoRecibidoKg" | "pesoEntregadoKg" | "mermaTotalKg">) {
  return {
    recibido: `${formatearKg3(r.pesoRecibidoKg)} kg`,
    entregado: `${formatearKg3(r.pesoEntregadoKg)} kg`,
    mermaKg: `${formatearKg3(r.mermaTotalKg)} kg`,
    mermaPct: formatearPct(pctDeMerma(r.mermaTotalKg, r.pesoRecibidoKg)),
  };
}

/** «Juan Pérez · 1234567» (identificación tal como se guardó, sin inventar puntos de miles). */
export function lineaCliente(r: Pick<Remision, "clienteNombre" | "clienteIdentificacion">): string {
  return r.clienteIdentificacion ? `${r.clienteNombre} · ${r.clienteIdentificacion}` : r.clienteNombre;
}

/** Valor de referencia de los servicios: `$1.923.000`. No es una factura (HU-13 c4). */
export function valorReferencia(valor: number): string {
  return formatearCOP(valor);
}

/** «500,000 kg · 8 bultos» para la línea «Recibido». */
export function lineaRecibido(fechaRecepcion: string, pesoKg: number, numBultos: number): string {
  return `${fechaCorta(fechaRecepcion)} · ${formatearKg3(pesoKg)} kg · ${numBultos} ${numBultos === 1 ? "bulto" : "bultos"}`;
}
