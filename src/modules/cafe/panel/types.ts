import type { TipoProceso } from "../lotes/types";

// Tipos del panel de gerencia («Cómo va el negocio», B-14). Son la forma ya LEÍDA y validada de lo que devuelven las
// funciones de la base: `cafe.produccion_diaria`, `cafe.ventas_diarias`, `cafe.produccion_panel`,
// `cafe.ventas_por_presentacion` y `cafe.proveedores_marca_propia` (los números llegan como `number`; los importes de la
// base son enteros de pesos o kilos con tres decimales).

/** Líneas del panel: una partición de los lotes (ver `lineaPanel`). */
export type LineaPanel = "marca_propia" | "trilla" | "maquila";

export type PeriodoPanel = "hoy" | "semana" | "mes";

/** Una fila de `cafe.produccion_diaria`: un día, una línea y un tipo de proceso. */
export interface FilaProduccion {
  fecha: string;
  linea: LineaPanel;
  tipo: TipoProceso;
  kgEntrada: number;
  kgSalida: number;
  mermaPct: number | null;
  valor: number;
}

/** Una fila de `cafe.ventas_diarias`. */
export interface VentaDiaria {
  fecha: string;
  total: number;
  nVentas: number;
  unidadesCortesia: number;
}

/** Una fila de `cafe.produccion_panel`: los kg que entran a un tipo de proceso en una línea, en el periodo. */
export interface FilaProduccionPanel {
  tipo: TipoProceso;
  linea: LineaPanel;
  procesos: number;
  kgEntrada: number;
  /** Entrada de los procesos que ya tienen salida: la base de la merma (una tanda de tostión sin cerrar no la tiene). */
  kgEntradaMedida: number;
  kgSalida: number;
}

/** Una fila de `cafe.ventas_por_presentacion`: lo vendido (sin cortesías ni anuladas) de un producto terminado. */
export interface VentaPresentacion {
  articuloId: string;
  nombre: string;
  tipoCafeId: string;
  presentacionG: number;
  unidades: number;
  libras: number;
  ingreso: number;
}

/** Un proveedor de marca propia en el panel (`cafe.proveedores_marca_propia`), de los lotes recibidos en el periodo. */
export interface ProveedorMarcaPropia {
  terceroId: string | null;
  nombre: string;
  lotes: number;
  kg: number;
  valorCompra: number;
  /** Promedio ponderado por kg. */
  precioKg: number | null;
  /** Promedio ponderado por kg de los lotes con humedad medida; `null` si ninguno la tiene. */
  humedadPct: number | null;
  kgTostionEntrada: number;
  kgTostionSalida: number;
  /** Ponderada, calculada con los kilos; `null` sin tostión. */
  mermaTostionPct: number | null;
  /** Precio por kg / (1 − merma de tostión): lo que cuesta un kilo ya tostado. `null` sin tostión. */
  costoKgTostado: number | null;
}
