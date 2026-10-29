// Cuentas y textos de la reapertura de producto empacado (HU-F1-16). Puras, sin base ni React: dan lo mismo que
// `cafe.reabrir_producto` (el saldo es por LOTE y presentación; además tiene que haber stock global) y las usan el
// formulario, la ficha del lote y la cola de planta. Los kilos se cuentan en gramos enteros.
import { formatearKg } from "../../compras/lib/compra";
import { enteroConMiles } from "../../empaque/lib/empaque";
import { formatearKg3 } from "../../lotes/lib/formato";
import type { EstadoReapertura } from "../types";

/** Saldo reabrible de un lote en una presentación: lo empacado de él menos lo ya reabierto (nunca negativo). */
export function calcularSaldoReabrible(empacadas: number, reabiertas: number): number {
  return Math.max(0, Math.trunc(empacadas) - Math.trunc(reabiertas));
}

/**
 * Lo máximo que se puede reabrir hoy: el menor entre el saldo del lote y lo que hay en el inventario. El producto
 * terminado se lleva por tipo × presentación (no por lote), así que lo ya vendido no se puede reabrir aunque el
 * lote lo haya empacado.
 */
export function maxReabrible(saldoLote: number, stockGlobal: number): number {
  return Math.max(0, Math.min(Math.trunc(saldoLote), Math.floor(stockGlobal)));
}

/** Kilos de `unidades` bolsas de `presentacionG` gramos: `40 × 500 g` → `20`. */
export function kgReabiertos(presentacionG: number, unidades: number): number {
  return Math.round(presentacionG * unidades) / 1000;
}

/** «Equivale a 20,000 kg» (siempre tres decimales, como las tablas de la planta). */
export function textoEquivale(presentacionG: number, unidades: number): string {
  return `Equivale a ${formatearKg3(kgReabiertos(presentacionG, unidades))} kg`;
}

export type ErrorUnidades = "supera_saldo" | "sin_stock";

/**
 * Valida las unidades a reabrir contra el saldo del lote y el stock global (el mismo orden que la RPC: primero el
 * saldo del lote, luego el inventario). `null` = válido.
 */
export function validarUnidadesReapertura(
  unidades: number,
  saldoLote: number,
  stockGlobal: number,
): { codigo: ErrorUnidades; mensaje: string } | null {
  if (unidades > saldoLote) {
    return {
      codigo: "supera_saldo",
      mensaje: `Del lote solo quedan ${enteroConMiles(saldoLote)} por reabrir: no puedes reabrir más de lo que se empacó de él.`,
    };
  }
  if (unidades > Math.floor(stockGlobal)) {
    return {
      codigo: "sin_stock",
      mensaje: `Solo hay ${enteroConMiles(Math.max(0, Math.floor(stockGlobal)))} en el inventario: lo demás ya salió y no se puede reabrir.`,
    };
  }
  return null;
}

/** `40 × Excelso 500 g (20 kg)`: la reapertura en una línea (ficha, línea de tiempo). */
export function textoReapertura(unidades: number, producto: string, pesoKg: number): string {
  return `${enteroConMiles(unidades)} × ${producto} (${formatearKg(pesoKg)} kg)`;
}

/** Título de la tarjeta de la cola de planta: «Reapertura de MP-2026-0003 · 20 kg · Excelso». */
export function tituloTarjetaReapertura(codigoLote: string, pesoKg: number, tipoCafe: string | null): string {
  return ["Reapertura de " + codigoLote, `${formatearKg(pesoKg)} kg`, tipoCafe].filter(Boolean).join(" · ");
}

export const ETIQUETA_ESTADO_REAPERTURA: Record<EstadoReapertura, string> = {
  pendiente: "Pendiente",
  en_proceso: "Molida",
  completada: "Completada",
};

/** Pasos que quedan: sin proceso, molienda y/o empaque; molida, solo el empaque; empacada, ninguno. */
export function pasosPendientesReapertura(estado: EstadoReapertura): ("molienda" | "empaque")[] {
  if (estado === "pendiente") return ["molienda", "empaque"];
  if (estado === "en_proceso") return ["empaque"];
  return [];
}

/** «Molienda y/o empaque» (pendiente) o «Empaque» (ya molida). */
export function textoPasosReapertura(estado: EstadoReapertura): string {
  const pasos = pasosPendientesReapertura(estado);
  if (pasos.length === 0) return "Sin pasos pendientes";
  return pasos.length === 2 ? "Molienda y/o empaque" : "Empaque";
}
