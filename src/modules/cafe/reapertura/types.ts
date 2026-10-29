// Formas de la reapertura de producto empacado (FIN-114 · CO-33, HU-F1-16). Lo que se guarda vive en
// `cafe.reaperturas`; el estado de cada una (pendiente → en proceso → completada) y el saldo reabrible de cada
// lote se DERIVAN en las vistas `cafe.v_reaperturas` y `cafe.v_saldo_reabrible`: nada se guarda a mano.

/** Estado derivado de una reapertura: sin proceso, molida (falta empacar) o empacada. */
export type EstadoReapertura = "pendiente" | "en_proceso" | "completada";

/** Una presentación de un lote de marca propia: lo empacado, lo ya reabierto y lo que se puede reabrir. */
export interface SaldoPresentacion {
  presentacionG: number;
  /** Producto terminado (tipo × presentación) que se descuenta al reabrir. */
  articuloId: string;
  producto: string;
  empacadas: number;
  reabiertas: number;
  /** empacadas − reabiertas (≥ 0): el tope por LOTE. */
  saldo: number;
  /** Existencias de ese producto en el inventario (todos los lotes): el tope GLOBAL, lo vendido ya no se reabre. */
  stockGlobal: number;
}

/** Una reapertura con su avance derivado. */
export interface ReaperturaVista {
  id: string;
  loteId: string;
  loteCodigo: string;
  tipoCafe: string | null;
  producto: string;
  presentacionG: number;
  unidades: number;
  pesoKg: number;
  /** `YYYY-MM-DD`. */
  fecha: string;
  motivo: string | null;
  estado: EstadoReapertura;
  moliendaId: string | null;
  empaqueId: string | null;
  /** Kilos que entran al siguiente paso: todo lo reabierto o, si ya se molió, la salida de la molienda. */
  pesoDisponibleKg: number;
  creadoEn: string;
  creadoPor: string | null;
}

/** Lo que devuelve `cafe.reabrir_producto`. */
export interface ResultadoReapertura {
  id: string;
  peso_kg: number;
  lote_id: string;
  presentacion_g: number;
  unidades: number;
  producto: string;
  /** Stock del producto que queda tras reabrir. */
  stock: number;
}

/** Un proceso (molienda o empaque) que cuelga de una reapertura, para la ficha del lote. */
export interface ProcesoDeReapertura {
  id: string;
  reaperturaId: string;
  tipo: "molienda" | "empaque";
  fecha: string;
  pesoEntradaKg: number;
  pesoSalidaKg: number;
  mermaKg: number;
  anulado: boolean;
  /** «7 × Excelso 2.500 g», solo en el empaque. */
  lineasEmpaque: { presentacionG: number; unidades: number; producto: string }[];
}
