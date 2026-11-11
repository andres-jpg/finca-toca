import { calcularValor } from "@/modules/core/tarifas/lib/calcular-valor";
import { ordenarServicios } from "../../lotes/lib/servicios";
import type { NivelTueste, TipoProceso } from "../../lotes/types";
import { estimarMolienda, type ModoMolienda } from "../../procesos/lib/molienda";
import { referenciaDelPaso } from "../../procesos/lib/resumen";
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
  /** % de merma de referencia en tostión por nivel de tueste (A-03). */
  tostion?: Readonly<Record<NivelTueste, number>> | null;
}

export interface EntradaEstimacion {
  pesoKg: number;
  servicios: readonly TipoProceso[];
  /** Tarifa vigente por kilo de cada servicio; `null`/ausente = sin tarifa. */
  tarifas: Partial<Record<ServicioTarifado, number | null>>;
  mermasRef: MermasReferencia;
  /** Nivel de tueste elegido; sin él la merma de la tostión se toma del nivel medio. */
  nivelTueste?: NivelTueste | null;
  /**
   * Varios perfiles por kilos (B-02): la merma de la tostión es la ponderada por kg de la de cada nivel
   * (Σ kg × merma(nivel) / Σ kg). Con uno solo, o sin kilos, vale `nivelTueste`.
   */
  perfiles?: readonly { nivel: NivelTueste; kg: number | null }[];
  /** Cantidad a moler (B-03): la línea de molienda estima esos kilos, no todo el tostado. Sin ella, todo el tostado. */
  molienda?: { modo: ModoMolienda; kg?: number | null } | null;
}

export interface LineaEstimacion {
  servicio: ServicioTarifado;
  /** Peso estimado que entra a este paso. */
  pesoKg: number;
  tarifaKg: number | null;
  /** `null` si no hay tarifa para el servicio. */
  valor: number | null;
  /**
   * `false` solo en el primer proceso contratado (peso recibido × tarifa vigente); los siguientes parten de un
   * peso estimado con la merma de referencia (A-10).
   */
  estimado: boolean;
}

export interface Estimacion {
  lineas: LineaEstimacion[];
  /** Suma de los valores conocidos. */
  total: number;
  /** Algún servicio no tiene tarifa: el total es parcial. */
  incompleta: boolean;
  /** Hay tostión, así que el empaque va incluido sin coste. */
  conEmpaque: boolean;
  /** Hay al menos una línea estimada: es cuando se muestra la nota «el valor real se calcula al finalizar». */
  hayEstimadas: boolean;
}

const redondear3 = (n: number) => Math.round(n * 1000) / 1000;

function mermaValida(m: number | null | undefined): number {
  return typeof m === "number" && Number.isFinite(m) && m >= 0 && m <= 100 ? m : 0;
}

/** Merma de referencia del paso (A-03, vía `referenciaDelPaso`); la tostión sin nivel elegido usa el medio. */
function mermaDelPaso(servicio: TipoProceso, mermasRef: MermasReferencia, nivel?: NivelTueste | null): number | null {
  if (!mermasRef.tostion && servicio === "tostion") return null;
  const cfg = {
    referenciaTrillaPct: mermasRef.trilla ?? 0,
    referenciaTostionPct: mermasRef.tostion ?? { bajo: 0, medio: 0, alto: 0 },
    toleranciaPts: 0,
  };
  return referenciaDelPaso(servicio, cfg, servicio === "tostion" ? (nivel ?? "medio") : null);
}

/** Merma de la tostión ponderada por los kilos de cada perfil; `null` si no hay varios perfiles con kilos. */
export function mermaTostionPonderada(mermasRef: MermasReferencia, perfiles: EntradaEstimacion["perfiles"]): number | null {
  const conKg = (perfiles ?? []).filter((p) => typeof p.kg === "number" && Number.isFinite(p.kg) && p.kg > 0);
  if (conKg.length < 2 || !mermasRef.tostion) return null;
  const total = conKg.reduce((s, p) => s + (p.kg as number), 0);
  const suma = conKg.reduce((s, p) => s + (p.kg as number) * mermaValida(mermasRef.tostion?.[p.nivel]), 0);
  return suma / total;
}

export function estimarServicios({ pesoKg, servicios, tarifas, mermasRef, nivelTueste, perfiles, molienda }: EntradaEstimacion): Estimacion {
  const ordenados = ordenarServicios(servicios);
  const conEmpaque = ordenados.includes("tostion");

  if (!Number.isFinite(pesoKg) || pesoKg <= 0) {
    return { lineas: [], total: 0, incompleta: false, conEmpaque, hayEstimadas: false };
  }

  const lineas: LineaEstimacion[] = [];
  let pesoPaso = redondear3(pesoKg);

  for (const servicio of ordenados) {
    if (servicio === "empaque") continue;

    const tarifaKg = tarifas[servicio] ?? null;
    // La molienda se cobra sobre los kilos que se piden moler (B-03), no sobre todo el tostado.
    const pesoLinea =
      servicio === "molienda" && molienda
        ? estimarMolienda({
            kgEntrada: pesoKg,
            trilla: ordenados.includes("trilla"),
            mermaTrillaPct: mermaValida(mermasRef.trilla),
            mermaTostionPct: mermaValida(mermaTostionPonderada(mermasRef, perfiles) ?? mermaDelPaso("tostion", mermasRef, nivelTueste)),
            modo: molienda.modo,
            kg: molienda.kg,
          }).molidoKg
        : pesoPaso;
    lineas.push({
      servicio,
      pesoKg: pesoLinea,
      tarifaKg,
      valor: tarifaKg === null ? null : calcularValor(pesoLinea, tarifaKg),
      estimado: lineas.length > 0,
    });

    const merma = (servicio === "tostion" ? mermaTostionPonderada(mermasRef, perfiles) : null) ?? mermaDelPaso(servicio, mermasRef, nivelTueste);
    pesoPaso = redondear3(pesoPaso * (1 - mermaValida(merma) / 100));
  }

  return {
    lineas,
    total: lineas.reduce((suma, l) => suma + (l.valor ?? 0), 0),
    incompleta: lineas.some((l) => l.valor === null),
    conEmpaque,
    hayEstimadas: lineas.some((l) => l.estimado),
  };
}
