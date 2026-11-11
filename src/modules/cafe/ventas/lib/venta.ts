// Cuentas y textos de la venta de marca propia (HU-F1-07). Puras, sin base ni React: dan lo mismo que
// `cafe.registrar_venta` (subtotal = cantidad × precio; total = Σ subtotales; la cortesía vale 0) y las usan el
// formulario (total en vivo y avisos de stock), el schema y los tests. Todo se cuenta en CENTAVOS enteros para no
// arrastrar errores de coma flotante.
import { formatCOP } from "@/modules/core/formato/numeros";
import { enteroConMiles, parsearUnidades } from "../../empaque/lib/empaque";
import { COPY } from "../../copy";
import type { EstadoFactura, EstadoVenta, TipoVenta } from "../types";

export interface LineaCuenta {
  cantidad: number;
  /** Precio unitario en pesos (hasta 2 decimales). */
  precio: number;
}

const aCentavos = (pesos: number) => Math.round(pesos * 100);

/** Subtotal de una línea en pesos (`3 × 23.000` → `69000`). 0 si falta la cantidad o el precio. */
export function subtotalLinea(cantidad: number, precio: number): number {
  if (!Number.isFinite(cantidad) || !Number.isFinite(precio) || cantidad <= 0 || precio < 0) return 0;
  return (Math.round(cantidad) * aCentavos(precio)) / 100;
}

/** Total de la venta en pesos: Σ de los subtotales. Una cortesía vale siempre 0. */
export function totalVenta(lineas: readonly LineaCuenta[], tipo: TipoVenta = "venta"): number {
  if (tipo === "cortesia") return 0;
  return lineas.reduce((c, l) => c + Math.round(l.cantidad) * aCentavos(l.precio), 0) / 100;
}

/** Unidades de todas las líneas. */
export function totalUnidades(lineas: readonly Pick<LineaCuenta, "cantidad">[]): number {
  return lineas.reduce((n, l) => n + (Number.isFinite(l.cantidad) && l.cantidad > 0 ? Math.round(l.cantidad) : 0), 0);
}

/** Entero con signo menos tipográfico para los negativos (`-3` → «−3»), con punto de miles. */
export function enteroSigno(n: number): string {
  const texto = enteroConMiles(Math.abs(n));
  return n < 0 ? `−${texto}` : texto;
}

/** Unidades vendibles de un producto: su stock entero, nunca negativo (un stock heredado negativo cuenta como 0). */
export function maximoVendible(stock: number): number {
  return Number.isFinite(stock) ? Math.max(0, Math.floor(stock)) : 0;
}

/** Producto sin existencias: su tarjeta se deshabilita con «Agotado» (B-11). */
export const estaAgotado = (stock: number): boolean => maximoVendible(stock) === 0;

/** «Máximo disponible: 14», la ayuda que sale cuando la línea llega al stock. */
export const textoMaximoDisponible = (stock: number): string => `Máximo disponible: ${enteroConMiles(maximoVendible(stock))}`;

/**
 * Limita la cantidad tecleada al stock (B-11). Solo toca un entero válido por encima del máximo; lo que aún no es un
 * número (vacío, letras) se deja tal cual para que el formulario lo señale. El servidor valida igual: esto es comodidad.
 */
export function limitarCantidadTexto(texto: string, stock: number): string {
  const n = parsearUnidades(texto);
  const max = maximoVendible(stock);
  return n !== null && n > max ? String(max) : texto;
}

export function etiquetaTipoVenta(tipo: TipoVenta): string {
  return tipo === "cortesia" ? "Cortesía" : "Venta";
}

/** Solo existe «Anulada»: una venta no anulada no lleva estado (A-16: «Vigente» no se entendía). `null` = sin badge. */
export function etiquetaEstadoVenta(estado: EstadoVenta): string | null {
  return estado === "anulada" ? COPY.anulada : null;
}

/** «Pendiente» (ámbar en la tabla), el número de la factura, o «—» si la venta no la requiere. */
export function textoFactura(estado: EstadoFactura, numero: string | null): string {
  if (estado === "pendiente") return "Pendiente";
  if (estado === "emitida") return numero ?? "—";
  return "—";
}

/** Texto del toast tras guardar: «Venta VT-2026-0001 guardada · $98.000» / «Cortesía VT-2026-0005 registrada». */
export function textoVentaGuardada(tipo: TipoVenta, numero: string, total: number): string {
  return tipo === "cortesia" ? `Cortesía ${numero} registrada` : `Venta ${numero} guardada · ${formatCOP(total)}`;
}

/** «Consumo 500 g × 3» para listas cortas de líneas. */
export function textoLinea(producto: string, cantidad: number): string {
  return `${producto} × ${enteroConMiles(cantidad)}`;
}

/** Texto para el movimiento del kardex de una venta anulada o con motivo (`venta`, `cortesia`, `devolucion`). */
export function etiquetaMotivoVenta(motivo: string): string {
  switch (motivo) {
    case "venta":
      return "Venta";
    case "cortesia":
      return "Cortesía";
    case "devolucion":
      return "Devolución (anulación)";
    default:
      return motivo;
  }
}
