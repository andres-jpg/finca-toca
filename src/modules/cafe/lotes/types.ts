import type { Database } from "@/lib/supabase/database.types";

/** Fila de `cafe.lotes`. */
export type Lote = Database["cafe"]["Tables"]["lotes"]["Row"];
/** Fila de `cafe.lote_bultos`. */
export type LoteBulto = Database["cafe"]["Tables"]["lote_bultos"]["Row"];

/** `cafe.linea_lote`: de dónde viene el café del lote. */
export type LineaLote = Database["cafe"]["Enums"]["linea_lote"];
/** `cafe.tipo_proceso`: los pasos de la planta (y los servicios que se contratan). */
export type TipoProceso = Database["cafe"]["Enums"]["tipo_proceso"];
/** `cafe.nivel_tueste`. */
export type NivelTueste = Database["cafe"]["Enums"]["nivel_tueste"];
