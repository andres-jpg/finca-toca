import type { UnidadTarifa } from "./registry";

/** Tarifa que rige ahora para un concepto (`v_tarifas_vigentes`). */
export interface TarifaVigente {
  concepto: string;
  valor: number;
  unidad: UnidadTarifa;
  vigenteDesde: string;
}

/** Fila del historial (`tarifas_historial()`): vigentes, pasadas y programadas, con quién la creó. */
export interface TarifaHistorial {
  id: string;
  concepto: string;
  valor: number;
  unidad: UnidadTarifa;
  vigenteDesde: string;
  /** Aún no rige (`vigente_desde` en el futuro): la única que se puede eliminar. */
  programada: boolean;
  observaciones: string | null;
  createdAt: string;
  /** `null` si la creó el sistema (seed, SQL editor) o quien ya no pertenece al cliente. */
  email: string | null;
}
