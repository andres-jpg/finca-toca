import type { MovimientoKardex } from "@/modules/core/inventario/types";

/** Bolsa o etiqueta de una presentación, con el stock que tiene ahora (la suma de sus movimientos). */
export interface InsumoPresentacion {
  id: string;
  nombre: string;
  stock: number;
  stockMinimo: number | null;
}

/** Una fila de la tabla de presentaciones del formulario de empaque. */
export interface PresentacionEmpaque {
  /** Peso nominal de la bolsa en gramos. */
  presentacionG: number;
  bolsa: InsumoPresentacion | null;
  etiqueta: InsumoPresentacion | null;
  /** El producto terminado de ESE tipo de café y presentación; `null` si aún no existe (lo crea el alta de la bolsa). */
  producto: { id: string; nombre: string; stock: number } | null;
  /** El producto MOLIDO de esa presentación (A-02); `null` mientras no se haya empacado ninguno (se crea al empacar el primero). */
  productoMolido: { id: string; nombre: string; stock: number } | null;
}

/** Lo que el formulario de empaque necesita además del lote y sus bultos. */
export interface ConfigEmpaque {
  /** Presentaciones de las bolsas ACTIVAS, de menor a mayor. */
  presentaciones: PresentacionEmpaque[];
}

/** Una presentación empacada, para el historial y la línea de tiempo del lote. */
export interface LineaEmpaqueVista {
  presentacionG: number;
  unidades: number;
  /** Nombre del producto terminado («Excelso 500 g»); en servicios a terceros, el tamaño de la bolsa («5 kg»). */
  producto: string;
  /** Marca propia: la línea movió inventario (bolsas, etiquetas, producto terminado) y el empaque no se anula. */
  mueveInventario: boolean;
  /** Servicios: la bolsa la trajo el cliente. */
  bolsaCliente: boolean;
  /** Marca propia: grano o molido. */
  forma: "grano" | "molido";
}

/** Lo que devuelve `cafe.registrar_empaque`. */
export interface ResultadoEmpaque {
  proceso_id: string;
  merma_kg: number;
  merma_pct: number;
  /** Lo que llegó a empaque y no entró en bolsas (0 si cuadra). NO es merma: va a `diferencia_destino`. */
  diferencia_kg: number;
  diferencia_destino: "suelto" | "granel" | "muestra" | "perdida" | null;
  peso_entrada_kg: number;
  peso_salida_kg: number;
  lote_estado: string;
  avance_texto: string;
  /** En servicios a terceros `producto_id` y `producto` son null (no mueven inventario propio). */
  lineas: { presentacion_g: number; unidades: number; kg: number; forma?: "grano" | "molido"; producto_id: string | null; producto: string | null }[];
  /** La molienda registrada en el mismo paso (A-02); `null` si no hubo. */
  molienda?: { proceso_id: string; merma_kg: number; merma_pct: number; peso_entrada_kg: number; peso_salida_kg: number } | null;
  stocks: { articulo_id: string; stock: number; bajo_minimo: boolean }[];
  /** Insumos que quedaron en negativo: se avisa, no se bloquea (decisión 14 de CO-20). */
  advertencias: { articulo_id: string; articulo: string | null; stock_resultante: number }[];
}

/** Lo que devuelve `cafe.convertir_presentacion` (A-15). */
export interface ResultadoConversion {
  id: string;
  lote_id: string;
  kg_origen: number;
  kg_destino: number;
  /** destino − origen, en kg. */
  diferencia_kg: number;
  cuadra: boolean;
  stocks: { articulo_id: string; stock: number; bajo_minimo: boolean }[];
  advertencias: { articulo_id: string; articulo: string | null; stock_resultante: number }[];
}

/** Origen de un movimiento del kardex del producto terminado: el lote que se empacó, la venta… */
export interface OrigenMovimiento {
  etiqueta: string;
  /** `null` si la pantalla de destino aún no existe (p. ej. la venta, de CO-31). */
  href: string | null;
}

/** Kardex de un producto terminado con los nombres que el log solo guarda como uuid. */
export interface KardexProducto {
  movimientos: MovimientoKardex[];
  /** `created_by` → email del miembro. */
  usuarios: Record<string, string>;
  /** `ref_id` → texto de la columna «Referencia» («MP-2026-0001»). */
  referencias: Record<string, string>;
  /** `ref_id` → enlace a la pantalla del origen. */
  enlaces: Record<string, string>;
}

/** `ref_tipo` de los movimientos que genera un empaque (`ref_id` = el proceso). */
export const REF_PROCESO = "cafe.proceso";
/** `ref_tipo` de la reapertura de un lote (CO-33): `ref_id` = el lote. */
export const REF_LOTE = "cafe.lote";
/** `ref_tipo` de una conversión de presentación (A-15): `ref_id` = la conversión. */
export const REF_CONVERSION = "cafe.conversion";
/** `ref_tipo` de una venta (CO-31): `ref_id` = la venta. */
export const REF_VENTA = "cafe.venta";
