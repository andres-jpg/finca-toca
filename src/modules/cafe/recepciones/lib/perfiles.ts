import { formatKgNum } from "@/modules/core/formato/numeros";
import type { NivelTueste, TipoProceso } from "../../lotes/types";

// Perfiles de tueste de una recepción de maquila (B-02): uno para todo el lote o varios repartidos por kilos. Puro,
// sin React ni base. Mismas cuentas que `cafe.registrar_recepcion()` (suma de kilos contra lo que entra a la tostión,
// tolerancia de 0,05 kg), para que el formulario avise antes que la base.

/** Tolerancia de la suma de kilos por perfil (kg), igual que la RPC. */
export const TOLERANCIA_SUMA_PERFILES_KG = 0.05;

export interface PerfilRecepcion {
  nivel: NivelTueste;
  tempC: number | null;
  tiempoMin: number | null;
  /** Kilos del perfil; `null` con un solo perfil (son todos los del lote). */
  kg: number | null;
}

const redondear3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Kilos que entran a la tostión: lo recibido, menos la merma de referencia de la trilla si se contrata
 * (40,5 kg sin trilla; 500 kg con trilla al 19 % → 405 kg).
 */
export function kgATostar(pesoKg: number, servicios: readonly TipoProceso[], mermaTrillaPct: number): number {
  if (!Number.isFinite(pesoKg) || pesoKg <= 0) return 0;
  const merma = Number.isFinite(mermaTrillaPct) && mermaTrillaPct >= 0 && mermaTrillaPct <= 100 ? mermaTrillaPct : 0;
  return servicios.includes("trilla") ? redondear3(pesoKg * (1 - merma / 100)) : redondear3(pesoKg);
}

/** Suma de los kilos de los perfiles (los vacíos cuentan 0). */
export function sumaKgPerfiles(perfiles: readonly Pick<PerfilRecepcion, "kg">[]): number {
  return redondear3(perfiles.reduce((s, p) => s + (p.kg ?? 0), 0));
}

/** Diferencia (kg a tostar menos la suma); positivo = faltan kilos por asignar. */
export function diferenciaKgPerfiles(perfiles: readonly Pick<PerfilRecepcion, "kg">[], kgTostar: number): number {
  return redondear3(kgTostar - sumaKgPerfiles(perfiles));
}

export function sumaCuadra(perfiles: readonly Pick<PerfilRecepcion, "kg">[], kgTostar: number): boolean {
  return Math.abs(diferenciaKgPerfiles(perfiles, kgTostar)) <= TOLERANCIA_SUMA_PERFILES_KG;
}

/** «Los kilos por perfil deben sumar 40,5 kg» (kilos con 1 decimal). */
export function mensajeSumaPerfiles(kgTostar: number): string {
  return `Los kilos por perfil deben sumar ${formatKgNum(kgTostar)} kg`;
}
