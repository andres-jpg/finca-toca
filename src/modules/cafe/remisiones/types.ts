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
  incluido: boolean;
  pendiente: boolean;
}

/** Una remisión de entrega: el snapshot de lo entregado al cliente (no cambia aunque se corrija el lote). */
export interface Remision {
  id: string;
  /** `REM-2026-0001`. */
  numero: string;
  loteId: string;
  loteCodigo: string;
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
  recibidoPor: string | null;
  observaciones: string | null;
  /** Se entregó con servicios pendientes (solo `owner`/`admin`, con observación). */
  forzada: boolean;
  anulacion: { en: string; motivo: string; por: string | null } | null;
  creadoEn: string;
  /** Id del usuario que la generó (el email lo resuelve `cafe.responsables_lote`). */
  creadoPor: string | null;
}
