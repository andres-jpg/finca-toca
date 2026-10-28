import { calcularValor } from "@/modules/core/tarifas/lib/calcular-valor";
import { ordenarServicios } from "../../lotes/lib/servicios";
import type { TipoProceso } from "../../lotes/types";
import type { ServicioTarifado } from "../types";

/**
 * Estimación del valor de los servicios de una recepción (HU-F1-02 c5, HU-F1-03 c4). Función pura (sin base
 * ni React); es la misma cuenta que hace `cafe.registrar_recepcion()` en SQL y la que muestra el panel
 * «Estimación» mientras se llena el formulario. Es solo una **estimación**: el valor real se calcula y se
 * congela al registrar cada proceso (CO-27), con la tarifa de ese día y el peso que realmente entra.
 *
 * Peso que entra a cada paso: el recibido, menos la merma de referencia de los pasos anteriores que también
 * se contratan (500 kg → trilla 19 % → 405 kg para la tostión → tostión 18 % → 332,1 kg para la molienda).
 * Sin trilla contratada, el cliente trae el café ya trillado y la tostión parte del peso recibido. Sin merma
 * de referencia (`null`, p. ej. molienda) el peso pasa sin cambio. El empaque no tiene tarifa: no es una línea.
 */

export interface MermasReferencia {
  /** % de merma de referencia en trilla (19 por defecto en `PARAMETROS_CAFE`). */
  trilla?: number | null;
  /** % de merma de referencia en tostión (18 por defecto). */
  tostion?: number | null;
}

export interface EntradaEstimacion {
  pesoKg: number;
  servicios: readonly TipoProceso[];
  /** Tarifa vigente por kilo de cada servicio; `null`/ausente = sin tarifa. */
  tarifas: Partial<Record<ServicioTarifado, number | null>>;
  mermasRef: MermasReferencia;
}

export interface LineaEstimacion {
  servicio: ServicioTarifado;
  /** Peso estimado que entra a este paso. */
  pesoKg: number;
  tarifaKg: number | null;
  /** `null` si no hay tarifa para el servicio. */
  valor: number | null;
}

export interface Estimacion {
  lineas: LineaEstimacion[];
  /** Suma de los valores conocidos. */
  total: number;
  /** Algún servicio no tiene tarifa: el total es parcial. */
  incompleta: boolean;
  /** Hay tostión, así que el empaque va incluido sin coste. */
  conEmpaque: boolean;
}

const redondear3 = (n: number) => Math.round(n * 1000) / 1000;

function mermaValida(m: number | null | undefined): number {
  return typeof m === "number" && Number.isFinite(m) && m >= 0 && m <= 100 ? m : 0;
}

export function estimarServicios({ pesoKg, servicios, tarifas, mermasRef }: EntradaEstimacion): Estimacion {
  const ordenados = ordenarServicios(servicios);
  const conEmpaque = ordenados.includes("tostion");

  if (!Number.isFinite(pesoKg) || pesoKg <= 0) {
    return { lineas: [], total: 0, incompleta: false, conEmpaque };
  }

  const lineas: LineaEstimacion[] = [];
  let pesoPaso = redondear3(pesoKg);

  for (const servicio of ordenados) {
    if (servicio === "empaque") continue;

    const tarifaKg = tarifas[servicio] ?? null;
    lineas.push({
      servicio,
      pesoKg: pesoPaso,
      tarifaKg,
      valor: tarifaKg === null ? null : calcularValor(pesoPaso, tarifaKg),
    });

    const merma = servicio === "trilla" ? mermasRef.trilla : servicio === "tostion" ? mermasRef.tostion : null;
    pesoPaso = redondear3(pesoPaso * (1 - mermaValida(merma) / 100));
  }

  return {
    lineas,
    total: lineas.reduce((suma, l) => suma + (l.valor ?? 0), 0),
    incompleta: lineas.some((l) => l.valor === null),
    conEmpaque,
  };
}
