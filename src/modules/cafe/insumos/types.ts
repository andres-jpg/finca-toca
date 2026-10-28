import type { MovimientoKardex, StockArticulo } from "@/modules/core/inventario/types";
import type { ClaseInsumo } from "./lib/insumos";

/** Un insumo de empaque (bolsa o etiqueta): una fila de `v_stock` con su clase y presentación ya leídas. */
export interface InsumoEmpaque extends StockArticulo {
  clase: ClaseInsumo;
  /** Peso nominal en gramos: es la presentación del producto terminado que se empaca con este insumo. */
  presentacionG: number;
}

/** Kardex de un insumo con los nombres que el log solo guarda como uuid. */
export interface KardexInsumo {
  movimientos: MovimientoKardex[];
  /** `created_by` → email del miembro (solo miembros del cliente actual). */
  usuarios: Record<string, string>;
  /** `ref_id` de un movimiento con `ref_tipo = 'core.tercero'` → nombre del tercero (el proveedor). */
  proveedores: Record<string, string>;
}

/** `ref_tipo` con el que una compra guarda a su proveedor (`ref_id` = id del tercero). */
export const REF_TERCERO = "core.tercero";
