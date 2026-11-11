import { formatearCOP } from "@/modules/cafe/compras/lib/compra";
import { COPY_TUESTE } from "@/modules/cafe/copy";
import { pctDeMerma } from "@/modules/cafe/lotes/lib/formato";
import { etiquetaServicio } from "@/modules/cafe/lotes/lib/servicios";
import { formatKg, formatKgNum, formatPct } from "@/modules/core/formato/numeros";
import type { DetalleServicio, Remision } from "../types";

// Texto del tiquete de la remisión (HU-F1-13). Todo se formatea AQUÍ, en el servidor y a mano (sin `Intl` del
// navegador): un tiquete se calibra mirando el papel y el texto debe salir igual en cualquier zona o versión de
// ICU. La merma se muestra calculada desde los kilos, como en el listado y la ficha (ver `pctDeMerma`). Pura.

export const TITULO_REMISION = "REMISIÓN DE ENTREGA";
export const LEYENDA_REMISION = "Documento de control interno — no es factura";
/** Merma con UN solo redondeo, a 1 decimal (4,9 de 27,0 kg = 18,148 → 18,1 %; redondear antes a 2 decimales daría 18,2). */
function mermaTiquete(mermaKg: number | null, entradaKg: number | null): string {
  if (mermaKg === null || entradaKg === null || entradaKg <= 0) return formatPct(null);
  return formatPct((mermaKg / entradaKg) * 100);
}

/** Una línea del tiquete: etiqueta a la izquierda y valor a la derecha. */
export interface LineaTiquete {
  etiqueta: string;
  valor: string;
}

/** Un servicio del tiquete, ya como texto: título y sus líneas (sirve igual para 58 y 80 mm). */
export interface BloqueServicio {
  titulo: string;
  lineas: LineaTiquete[];
}

/**
 * Un servicio del tiquete (B-17). Trilla: kg entra → sale y merma de trilla. Tostión: perfil de tueste (si se
 * conoce), kg entra → sale y merma de tostión. Molienda: kg molidos y valor, SIN merma. Empaque: «Incluido». Un
 * servicio contratado que no se hizo (entrega forzada) sale «Pendiente»: nunca cifras inventadas.
 * TODO(B-08): la salida de tostión será el peso en báscula; hoy es la salida registrada del proceso.
 */
export function bloqueServicio(d: DetalleServicio, perfil: string | null = null): BloqueServicio {
  const titulo = etiquetaServicio(d.servicio);
  if (d.pendiente && d.kgEntrada === null) return { titulo, lineas: [{ etiqueta: "Estado", valor: "Pendiente" }] };
  if (d.servicio === "empaque") return { titulo, lineas: [{ etiqueta: "Costo", valor: d.incluido ? "Incluido" : valorReferencia(d.valor ?? 0) }] };
  if (d.servicio === "molienda") {
    const molido = d.kgSalida ?? d.kgEntrada;
    return { titulo, lineas: [{ etiqueta: "Molido", valor: `${molido === null ? "—" : formatKg(molido)} · ${valorReferencia(d.valor ?? 0)}` }] };
  }
  const lineas: LineaTiquete[] = [];
  if (d.servicio === "tostion" && perfil) lineas.push({ etiqueta: COPY_TUESTE.perfilDeTueste, valor: perfil });
  const entra = d.kgEntrada === null ? "—" : formatKgNum(d.kgEntrada);
  const sale = d.kgSalida === null ? "—" : formatKg(d.kgSalida);
  lineas.push({ etiqueta: "Entra → sale", valor: `${entra} → ${sale}` });
  lineas.push({ etiqueta: d.servicio === "tostion" ? "Merma de tostión" : "Merma de trilla", valor: mermaTiquete(d.mermaKg, d.kgEntrada) });
  if (d.servicio === "trilla" && d.humedadPct != null) lineas.push({ etiqueta: "Humedad", valor: formatPct(d.humedadPct) });
  if (d.servicio === "trilla" && d.densidadGl != null) lineas.push({ etiqueta: "Densidad", valor: `${formatKgNum(d.densidadGl)} g/L` });
  return { titulo, lineas };
}

export function bloquesServicios(detalle: readonly DetalleServicio[], perfil: string | null = null): BloqueServicio[] {
  return detalle.map((d) => bloqueServicio(d, perfil));
}

/** Peso entregado y merma total del cliente, como los muestra el pie de la tabla. */
export function resumenEntrega(r: Pick<Remision, "pesoRecibidoKg" | "pesoEntregadoKg" | "mermaTotalKg">) {
  return {
    recibido: `${formatKgNum(r.pesoRecibidoKg)} kg`,
    entregado: `${formatKgNum(r.pesoEntregadoKg)} kg`,
    mermaKg: `${formatKgNum(r.mermaTotalKg)} kg`,
    mermaPct: formatPct(pctDeMerma(r.mermaTotalKg, r.pesoRecibidoKg)),
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
