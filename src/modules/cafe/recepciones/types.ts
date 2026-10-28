import type { TipoProceso } from "../lotes/types";
import type { AlertaCalidad } from "./lib/calidad";

/** Servicio con tarifa por kilo: el empaque no tiene (va incluido con la tostión). */
export type ServicioTarifado = "trilla" | "tostion" | "molienda";

/** Línea de la estimación que devuelve `cafe.registrar_recepcion`. `tarifa_kg`/`valor_estimado` son `null` si no hay tarifa. */
export interface LineaEstimacionRpc {
  servicio: ServicioTarifado;
  peso_kg: number;
  tarifa_kg: number | null;
  valor_estimado: number | null;
}

/** Respuesta de `cafe.registrar_recepcion`. */
export interface RespuestaRecepcion {
  id: string;
  codigo: string;
  /** Servicios del lote tal como quedaron: ordenados y con `empaque` si hay tostión. */
  servicios: TipoProceso[];
  alertas_calidad: AlertaCalidad[];
  estimacion: LineaEstimacionRpc[];
}
