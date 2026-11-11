import type { LineaLote, NivelTueste, TipoProceso } from "../types";

// Línea de tiempo de la ficha (HU-F1-05 c3, HU-F1-12 c3): recepción → procesos (con sus baches) → movimientos de
// inventario ligados al lote (los empaques de CO-30) → anulación del lote. Aquí solo se ordena y se normaliza lo
// que leyó `getTimeline()`; pintarlo es de `LoteTimeline`. La remisión de entrega (CO-32) y la reapertura de
// producto empacado (CO-33) son tipos de evento propios. Pura: sin base ni React.

export interface BacheLinea {
  numero: number;
  pesoEntradaKg: number;
  temperaturaC: number | null;
  tiempoMin?: number | null;
  /** Nivel de tueste del bache (para detectar los que se apartan del perfil del lote). */
  nivelTueste?: NivelTueste | null;
  observaciones: string | null;
}

export interface ProcesoLinea {
  id: string;
  tipo: TipoProceso;
  fecha: string;
  creadoEn: string;
  creadoPor: string | null;
  pesoEntradaKg: number;
  /** `null` en una tostión sin empaque (su salida es la báscula del empaque, B-08) y en la molienda. */
  pesoSalidaKg: number | null;
  /** Solo trilla y tostión con salida; molienda y empaque no tienen merma. */
  mermaKg: number | null;
  tarifaKg: number;
  valor: number;
  mermaReferenciaPct: number | null;
  toleranciaPts: number | null;
  desvio: boolean;
  nivelTueste: NivelTueste | null;
  observaciones: string | null;
  baches: BacheLinea[];
  /** Presentaciones empacadas (solo el empaque de marca propia, CO-30): «120 × Excelso 500 g». */
  lineasEmpaque?: { presentacionG: number; unidades: number; producto: string; forma?: "grano" | "molido" }[];
  /** Solo empaque (A-01): lo que llegó y no entró en bolsas. NO es merma. */
  diferenciaKg?: number | null;
  /** `suelto` | `granel` | `muestra` | `perdida` (CHECK de la base); `null` si no hubo diferencia. */
  diferenciaDestino?: string | null;
  /** Reapertura de la que cuelga (molienda o empaque de un café reabierto, CO-33); `null`/ausente = del lote. */
  reaperturaId?: string | null;
  /** Tostión de la que sale (empaque, molienda): la tanda a la que pertenece. */
  origenProcesoId?: string | null;
  anulacion: { en: string; por: string | null; motivo: string } | null;
}

export interface MovimientoLinea {
  id: string;
  fecha: string;
  creadoEn: string;
  creadoPor: string | null;
  articulo: string;
  /** Con signo: negativo = salida de inventario. */
  cantidad: number;
  motivo: string;
  observaciones: string | null;
}

export interface RecepcionLinea {
  fecha: string;
  creadoEn: string;
  creadoPor: string | null;
  linea: LineaLote;
  tercero: string | null;
  tipoCafe: string | null;
  pesoRecibidoKg: number;
  /** Solo marca propia: precio pagado por kilo. */
  precioCompraKg?: number | null;
  /** Humedad medida al recibir (puntos porcentuales). */
  humedadPct?: number | null;
}

/** La remisión de entrega (CO-32): una tarjeta por remisión, también las anuladas (tachadas, con su motivo). */
export interface RemisionLinea {
  id: string;
  numero: string;
  /** Fecha de entrega, `YYYY-MM-DD`. */
  fecha: string;
  creadoEn: string;
  creadoPor: string | null;
  pesoRecibidoKg: number;
  pesoEntregadoKg: number;
  mermaTotalKg: number;
  valorServicios: number;
  /** Se entregó con servicios pendientes. */
  forzada: boolean;
  anulacion: { en: string; por: string | null; motivo: string } | null;
}

/** La reapertura de producto empacado (CO-33): 40 × Excelso 500 g (20 kg) devueltos a granel para moler o reempacar. */
export interface ReaperturaLinea {
  id: string;
  /** Fecha de la reapertura, `YYYY-MM-DD`. */
  fecha: string;
  creadoEn: string;
  creadoPor: string | null;
  presentacionG: number;
  unidades: number;
  producto: string;
  pesoKg: number;
  motivo: string | null;
  /** «40 × Excelso 500 g (20 kg)». */
  texto: string;
}

export interface AnulacionLoteLinea {
  en: string;
  por: string | null;
  motivo: string;
}

export type EventoLinea =
  | { clase: "recepcion"; clave: string; fecha: string; creadoEn: string; datos: RecepcionLinea }
  | {
      clase: "proceso";
      clave: string;
      fecha: string;
      creadoEn: string;
      datos: ProcesoLinea;
      /** La reapertura de la que cuelga este proceso, si es de una. */
      reapertura: ReaperturaLinea | null;
    }
  | { clase: "reapertura"; clave: string; fecha: string; creadoEn: string; datos: ReaperturaLinea }
  | { clase: "movimiento"; clave: string; fecha: string; creadoEn: string; datos: MovimientoLinea }
  | { clase: "remision"; clave: string; fecha: string; creadoEn: string; datos: RemisionLinea }
  | { clase: "anulacion_lote"; clave: string; fecha: string; creadoEn: string; datos: AnulacionLoteLinea };

// La reapertura comparte rango con los procesos: dentro del día se ordenan por instante de creación, así la
// reapertura queda antes de la molienda o el empaque que se hacen sobre ella.
const RANGO: Readonly<Record<EventoLinea["clase"], number>> = { recepcion: 0, proceso: 1, reapertura: 1, movimiento: 2, remision: 3, anulacion_lote: 4 };

/**
 * Ordena los eventos del lote de más antiguo a más reciente: por día, y dentro del día la recepción primero, luego
 * los procesos y las reaperturas (entre sí, por instante de creación), los movimientos, la remisión de entrega y la
 * anulación; a igual tipo, por instante de creación. Una anulación de lote va siempre al final aunque su fecha sea la
 * de la recepción.
 */
export function construirLineaDeTiempo(entrada: {
  recepcion: RecepcionLinea;
  procesos: readonly ProcesoLinea[];
  movimientos: readonly MovimientoLinea[];
  /** Remisiones de entrega del lote (vigente y anuladas). Opcional: un lote de marca propia no tiene. */
  remisiones?: readonly RemisionLinea[];
  /** Reaperturas de producto empacado del lote (CO-33). Opcional: solo las tiene un lote de marca propia. */
  reaperturas?: readonly ReaperturaLinea[];
  anulacionLote: AnulacionLoteLinea | null;
}): EventoLinea[] {
  const reaperturaPorId = new Map((entrada.reaperturas ?? []).map((r) => [r.id, r]));
  const eventos: EventoLinea[] = [
    { clase: "recepcion", clave: "recepcion", fecha: entrada.recepcion.fecha, creadoEn: entrada.recepcion.creadoEn, datos: entrada.recepcion },
    ...entrada.procesos.map((p): EventoLinea => ({
      clase: "proceso",
      clave: `proceso-${p.id}`,
      fecha: p.fecha,
      creadoEn: p.creadoEn,
      datos: p,
      reapertura: p.reaperturaId ? (reaperturaPorId.get(p.reaperturaId) ?? null) : null,
    })),
    ...(entrada.reaperturas ?? []).map((r): EventoLinea => ({
      clase: "reapertura",
      clave: `reapertura-${r.id}`,
      fecha: r.fecha,
      creadoEn: r.creadoEn,
      datos: r,
    })),
    ...entrada.movimientos.map((m): EventoLinea => ({
      clase: "movimiento",
      clave: `movimiento-${m.id}`,
      fecha: m.fecha,
      creadoEn: m.creadoEn,
      datos: m,
    })),
    ...(entrada.remisiones ?? []).map((r): EventoLinea => ({
      clase: "remision",
      clave: `remision-${r.id}`,
      fecha: r.fecha,
      creadoEn: r.creadoEn,
      datos: r,
    })),
  ];
  if (entrada.anulacionLote) {
    eventos.push({
      clase: "anulacion_lote",
      clave: "anulacion-lote",
      fecha: entrada.anulacionLote.en.slice(0, 10),
      creadoEn: entrada.anulacionLote.en,
      datos: entrada.anulacionLote,
    });
  }

  return eventos.sort((a, b) => {
    // La anulación del lote cierra la historia siempre.
    if (a.clase === "anulacion_lote" || b.clase === "anulacion_lote") {
      return a.clase === b.clase ? 0 : a.clase === "anulacion_lote" ? 1 : -1;
    }
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    if (RANGO[a.clase] !== RANGO[b.clase]) return RANGO[a.clase] - RANGO[b.clase];
    if (a.creadoEn !== b.creadoEn) return a.creadoEn < b.creadoEn ? -1 : 1;
    return a.clave < b.clave ? -1 : a.clave > b.clave ? 1 : 0;
  });
}

const ETIQUETA_MOTIVO: Readonly<Record<string, string>> = {
  saldo_inicial: "Saldo inicial",
  compra: "Compra",
  produccion: "Producción",
  devolucion: "Devolución",
  consumo: "Consumo",
  venta: "Venta",
  cortesia: "Cortesía",
  muestra: "Muestra",
  perdida: "Pérdida",
  reapertura: "Reapertura",
  ajuste: "Ajuste",
};

export function etiquetaMotivoMovimiento(motivo: string): string {
  return ETIQUETA_MOTIVO[motivo] ?? motivo;
}
