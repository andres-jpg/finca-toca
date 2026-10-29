// Cuentas y textos de la venta de marca propia (HU-F1-07). Puras, sin base ni React: dan lo mismo que
// `cafe.registrar_venta` (subtotal = cantidad × precio; total = Σ subtotales; la cortesía vale 0) y las usan el
// formulario (total en vivo y avisos de stock), el schema y los tests. Todo se cuenta en CENTAVOS enteros para no
// arrastrar errores de coma flotante.
import { enteroConMiles } from "../../empaque/lib/empaque";
import { formatearCOP } from "../../compras/lib/compra";
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

export interface AvisoStock {
  /** Lo que quedaría en inventario si se guarda (puede ser negativo). */
  resto: number;
  texto: string;
}

/**
 * Aviso de una línea que supera el inventario: «Hay 5 en inventario; quedarán −3. Puedes guardar igualmente.»
 * `null` si alcanza (o no hay cantidad todavía). Avisar no bloquea (decisión de la tarea): la venta se guarda y el
 * stock queda negativo, en rojo.
 */
export function avisoStock(stock: number, cantidad: number): AvisoStock | null {
  if (!Number.isFinite(cantidad) || cantidad <= 0) return null;
  const resto = stock - Math.round(cantidad);
  if (resto >= 0) return null;
  return { resto, texto: `Hay ${enteroSigno(stock)} en inventario; quedarán ${enteroSigno(resto)}. Puedes guardar igualmente.` };
}

export function etiquetaTipoVenta(tipo: TipoVenta): string {
  return tipo === "cortesia" ? "Cortesía" : "Venta";
}

export function etiquetaEstadoVenta(estado: EstadoVenta): string {
  return estado === "anulada" ? "Anulada" : "Vigente";
}

/** «Pendiente» (ámbar en la tabla), el número de la factura, o «—» si la venta no la requiere. */
export function textoFactura(estado: EstadoFactura, numero: string | null): string {
  if (estado === "pendiente") return "Pendiente";
  if (estado === "emitida") return numero ?? "—";
  return "—";
}

/** Texto del toast tras guardar: «Venta VT-2026-0001 guardada · $98.000» / «Cortesía VT-2026-0005 registrada». */
export function textoVentaGuardada(tipo: TipoVenta, numero: string, total: number): string {
  return tipo === "cortesia" ? `Cortesía ${numero} registrada` : `Venta ${numero} guardada · ${formatearCOP(total)}`;
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
