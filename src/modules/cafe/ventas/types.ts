// Tipos de las ventas y cortesías de marca propia (FIN-112 · CO-31). El estado de la venta y el de su factura son
// DERIVADOS (vista `cafe.v_ventas`), nunca columnas editables.

export type TipoVenta = "venta" | "cortesia";
export type EstadoVenta = "vigente" | "anulada";
/** `no_requerida` | `pendiente` (requiere factura y aún no hay número de Aliados) | `emitida` (ya tiene número). */
export type EstadoFactura = "no_requerida" | "pendiente" | "emitida";

/** Una fila del listado (`cafe.v_ventas`). */
export interface VentaFila {
  id: string;
  /** `VT-2026-0001`. */
  numero: string;
  tipo: TipoVenta;
  /** `YYYY-MM-DD`. */
  fecha: string;
  terceroId: string;
  clienteNombre: string;
  esConsumidorFinal: boolean;
  nLineas: number;
  unidades: number;
  /** COP; 0 en una cortesía. */
  total: number;
  requiereFactura: boolean;
  /** Número de la factura emitida en Aliados (esta app no emite facturas). */
  numeroFactura: string | null;
  facturaEstado: EstadoFactura;
  estado: EstadoVenta;
}

/** Una línea de la venta: el precio es el de ese momento (snapshot). */
export interface LineaVentaVista {
  id: string;
  articuloId: string;
  /** «Excelso 500 g». */
  producto: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

/** Un movimiento de inventario que generó la venta (o su anulación). */
export interface MovimientoVenta {
  id: string;
  fecha: string;
  producto: string;
  motivo: string;
  /** Con signo: negativo = salió del inventario. */
  cantidad: number;
}

export interface VentaDetalle extends VentaFila {
  observaciones: string | null;
  anulacion: { en: string; motivo: string; por: string | null } | null;
  creadoEn: string;
  creadoPor: string | null;
  lineas: LineaVentaVista[];
  movimientos: MovimientoVenta[];
}

/** Un producto terminado que se puede vender, con su stock y el precio que rige ahora (`null` = sin precio). */
export interface ProductoVenta {
  articuloId: string;
  nombre: string;
  tipoCafe: string;
  presentacionG: number;
  /** Puede ser negativo. */
  stock: number;
  precio: number | null;
}

/** Totales del periodo filtrado (`cafe.resumen_ventas`). Las cortesías no suman al total; las anuladas tampoco. */
export interface ResumenVentas {
  totalVentas: number;
  nVentas: number;
  nCortesias: number;
  unidadesCortesia: number;
  nAnuladas: number;
  nFacturaPendiente: number;
}

/** Lo que devuelve `cafe.registrar_venta`. */
export interface ResultadoVenta {
  id: string;
  numero: string;
  total: number;
  /** Productos que quedaron en negativo: se avisa, no se bloquea. */
  advertencias: { articulo_id: string; articulo: string | null; stock_resultante: number }[];
}

/** `ref_tipo` de los movimientos de una venta o de su anulación (`ref_id` = la venta). Lo define el inventario de producto terminado. */
export { REF_VENTA } from "../empaque/types";
