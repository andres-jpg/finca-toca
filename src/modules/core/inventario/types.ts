import type { MotivoMovimiento, TipoArticulo, UnidadArticulo } from "./lib/inventario";

/** Fila de `public.articulos`. */
export type Articulo = {
  id: string;
  tenant_id: string;
  codigo: string | null;
  nombre: string;
  tipo: TipoArticulo;
  unidad: UnidadArticulo;
  atributos: Record<string, string | number | boolean>;
  stock_minimo: number | null;
  activo: boolean;
  created_at: string;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

/** Fila de `public.v_stock`: el stock es la suma de movimientos, nunca una columna editable. */
export type StockArticulo = {
  articulo_id: string;
  tenant_id: string;
  nombre: string;
  tipo: TipoArticulo;
  atributos: Record<string, string | number | boolean>;
  stock: number;
  stock_minimo: number | null;
  bajo_minimo: boolean;
  unidad: UnidadArticulo;
  activo: boolean;
  codigo: string | null;
}

/** Fila de `public.v_kardex`: un movimiento con el saldo del artículo tras aplicarlo. */
export type MovimientoKardex = {
  id: string;
  tenant_id: string;
  articulo_id: string;
  articulo_nombre: string;
  fecha: string;
  motivo: MotivoMovimiento;
  cantidad: number;
  saldo: number;
  costo_unitario: number | null;
  ref_tipo: string | null;
  ref_id: string | null;
  observaciones: string | null;
  created_at: string;
  created_by: string | null;
  seq: number;
}

/** Lo que devuelve `public.registrar_movimientos()`. */
export type RespuestaMovimientos = {
  movimientos: string[];
  stocks: { articulo_id: string; stock: number; bajo_minimo: boolean }[];
  /** Artículos que quedaron en negativo (solo con `permitirNegativo`). */
  advertencias: { articulo_id: string; stock_resultante: number }[];
}
