import type { TipoProceso } from "../lotes/types";

// Tipos del panel operativo de gerencia (FIN-115 · CO-34). Son la forma ya LEÍDA y validada de lo que devuelven
// `cafe.kpis_periodo`, `cafe.produccion_diaria` y `cafe.ventas_diarias` (los números llegan como `number`; los
// importes de la base son enteros de pesos o kilos con tres decimales).

/** Líneas del panel: una partición de los lotes (ver `lineaPanel`). */
export type LineaPanel = "marca_propia" | "trilla" | "maquila";
/** Líneas de servicio (las que cobran con tarifa). */
export type LineaServicio = Exclude<LineaPanel, "marca_propia">;

export type PeriodoPanel = "hoy" | "semana" | "mes" | "rango";

export interface RecibidoLinea {
  linea: LineaPanel;
  kg: number;
  lotes: number;
}

/** Merma de un tipo de proceso en el periodo. `mermaPct` es la guardada (3 decimales): para MOSTRAR se usa `pctDeMerma` con los kg. */
export interface MermaTipo {
  tipo: TipoProceso;
  procesos: number;
  kgEntrada: number;
  kgSalida: number;
  mermaKg: number;
  mermaPct: number | null;
  desvios: number;
}

export interface IngresoMarcaPropia {
  total: number;
  ventas: number;
  cortesias: number;
  unidadesCortesia: number;
}

export interface IngresoServicios {
  total: number;
  porLinea: { linea: LineaServicio; valor: number }[];
}

export interface InventarioPropio {
  cafeEnPlantaKg: number;
  lotesEnPlanta: number;
  productoTerminadoKg: number;
}

export interface ClienteEnPlanta {
  terceroId: string | null;
  nombre: string;
  kg: number;
  lotes: number;
}

export interface InventarioTerceros {
  kgEnPlanta: number;
  lotes: number;
  clientes: number;
  /** Los cinco con más kilos, de mayor a menor. */
  porCliente: ClienteEnPlanta[];
}

/** Todas las tarjetas del panel. `null` = «no aplica con la línea elegida» (no es cero). */
export interface KpisPanel {
  desde: string;
  hasta: string;
  hoy: string;
  linea: LineaPanel | null;
  recibido: RecibidoLinea[];
  mermas: MermaTipo[];
  desvios: number;
  ingresoMarcaPropia: IngresoMarcaPropia | null;
  ingresoServicios: IngresoServicios | null;
  inventarioPropio: InventarioPropio | null;
  inventarioTerceros: InventarioTerceros | null;
  insumosBajoMinimo: number;
}

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
