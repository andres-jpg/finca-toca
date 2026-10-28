import type { Database } from "@/lib/supabase/database.types";

/** Fila de `cafe.procesos`: una trilla, tostión, molienda o empaque de un lote. */
export type Proceso = Database["cafe"]["Tables"]["procesos"]["Row"];
/** Fila de `cafe.proceso_bultos`: qué bultos del lote pasaron por el proceso. */
export type ProcesoBulto = Database["cafe"]["Tables"]["proceso_bultos"]["Row"];
/** Fila de `cafe.baches`: un bache de una tostión. */
export type Bache = Database["cafe"]["Tables"]["baches"]["Row"];

/** `cafe.v_lote_etapas`: una fila por lote y tipo de proceso con al menos un proceso vigente. */
export type LoteEtapa = Database["cafe"]["Views"]["v_lote_etapas"]["Row"];
/** `cafe.v_lotes`: el lote con su avance y su estado DERIVADO de los procesos. */
export type LoteConAvance = Database["cafe"]["Views"]["v_lotes"]["Row"];
/** `cafe.v_bultos_estado`: cada bulto con los pasos por los que pasó y lo que pesa ahora. */
export type BultoEstado = Database["cafe"]["Views"]["v_bultos_estado"]["Row"];

/**
 * Estado derivado del lote (`cafe.v_lotes.estado`). `entregado` lo añadirá la remisión (CO-32).
 *   anulado · recibido (sin procesos) · en_proceso · parcial (algún paso con bultos pendientes) · listo
 */
export type EstadoLote = "anulado" | "recibido" | "en_proceso" | "parcial" | "listo";

/** Un bache tal como lo recibe `cafe.registrar_proceso` (se numeran 1..n en el orden enviado). */
export interface BacheEntrada {
  peso_entrada_kg: number;
  peso_salida_kg: number;
  temperatura_c?: number | null;
  observaciones?: string | null;
}

/** Lo que devuelve `cafe.registrar_proceso` (y `_insertar_proceso`). */
export interface ResultadoProceso {
  id: string;
  merma_kg: number;
  merma_pct: number;
  desvio: boolean;
  valor: number;
  lote_estado: EstadoLote;
  peso_entrada_kg: number;
  peso_salida_kg: number;
  tarifa_kg: number;
  avance_texto: string;
}

/** Lo que devuelve `cafe.sugerir_baches`. */
export interface BachesSugeridos {
  capacidad_kg: number;
  num_baches: number;
  baches: number[];
}
