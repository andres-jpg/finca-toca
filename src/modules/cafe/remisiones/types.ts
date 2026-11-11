import type { NivelTueste, TipoProceso } from "@/modules/cafe/lotes/types";

/**
 * Un servicio dentro del detalle de la remisión (`cafe.remisiones.detalle`, jsonb que arma `generar_remision`).
 * Los kilos son `null` cuando el servicio estaba contratado y no se hizo (entrega forzada): `pendiente = true`.
 * `incluido` es el empaque de maquila (sin coste). `tarifaKg` es la efectiva (valor / kilos de entrada).
 */
export interface DetalleServicio {
  servicio: TipoProceso;
  kgEntrada: number | null;
  kgSalida: number | null;
  mermaKg: number | null;
  tarifaKg: number | null;
  valor: number | null;
  nivelTueste: NivelTueste | null;
  /** Solo trilla (B-04): humedad (%) y densidad (g/L) medidas al terminar. */
  humedadPct?: number | null;
  densidadGl?: number | null;
  incluido: boolean;
  pendiente: boolean;
}

/** Un lote dentro de la remisión, con su snapshot (la remisión suma estos). */
export interface LoteRemisionado {
  loteId: string;
  loteCodigo: string;
  pesoRecibidoKg: number;
  pesoEntregadoKg: number;
  detalle: DetalleServicio[];
  valorServicios: number;
}

/** Una remisión de entrega: el snapshot de lo entregado al cliente (no cambia aunque se corrija el lote). */
export interface Remision {
  id: string;
  /** `REM-2026-0001`. */
  numero: string;
  /** El primer lote (compatibilidad); la remisión puede llevar varios: ver `lotes`. */
  loteId: string;
  /** Códigos de todos los lotes, separados por coma. */
  loteCodigo: string;
  /** Los lotes entregados en esta remisión (N:N, A-14), por código. */
  lotes: LoteRemisionado[];
  /** `YYYY-MM-DD`: fecha de entrega. */
  fecha: string;
  terceroId: string;
  clienteNombre: string;
  clienteIdentificacion: string | null;
  pesoRecibidoKg: number;
  pesoEntregadoKg: number;
  mermaTotalKg: number;
  detalle: DetalleServicio[];
  /** Solo referencia: la remisión no es una factura. */
  valorServicios: number;
  /** Quién recibe y su cédula (obligatorios desde A-14; las remisiones anteriores dicen «Sin registrar»). */
  recibeNombre: string;
  recibeDocumento: string;
  recibidoPor: string | null;
  observaciones: string | null;
  /** Se entregó con servicios pendientes (solo `owner`/`admin`, con observación). */
  forzada: boolean;
  anulacion: { en: string; motivo: string; por: string | null } | null;
  creadoEn: string;
  /** Id del usuario que la generó (el email lo resuelve `cafe.responsables_lote`). */
  creadoPor: string | null;
}
