// Cuentas de «Convertir presentación» (A-15 · FIN-133). Puras: dan lo mismo que `cafe.convertir_presentacion`
// (kg = unidades × presentación / 1000; la conversión cuadra cuando los gramos de origen y destino son iguales).
// Todo en GRAMOS ENTEROS para no arrastrar errores de coma flotante.
import { formatKg } from "@/modules/core/formato/numeros";

export interface TramoConversion {
  presentacionG: number;
  unidades: number;
}

export const gramosDe = (t: TramoConversion): number => Math.round(t.presentacionG) * Math.round(t.unidades);

export interface CuadreConversion {
  kgOrigen: number;
  kgDestino: number;
  /** destino − origen, en kg. */
  diferenciaKg: number;
  cuadra: boolean;
}

export function cuadreConversion(origen: TramoConversion, destino: TramoConversion): CuadreConversion {
  const go = gramosDe(origen);
  const gd = gramosDe(destino);
  return { kgOrigen: go / 1000, kgDestino: gd / 1000, diferenciaKg: (gd - go) / 1000, cuadra: go === gd };
}

/** Unidades de destino que equivalen exactamente a las de origen, o `null` si no es un entero. */
export function unidadesQueCuadran(origen: TramoConversion, presentacionDestinoG: number): number | null {
  if (presentacionDestinoG <= 0) return null;
  const u = gramosDe(origen) / presentacionDestinoG;
  return Number.isInteger(u) && u > 0 ? u : null;
}

/** Aviso cuando los kilos no cuadran; `null` si cuadran. */
export function avisoCuadre(c: CuadreConversion): string | null {
  if (c.cuadra) return null;
  const signo = c.diferenciaKg > 0 ? "más" : "menos";
  return `Los kilos no cuadran: el destino tiene ${formatKg(Math.abs(c.diferenciaKg))} ${signo} que el origen (${formatKg(c.kgOrigen)} → ${formatKg(c.kgDestino)}).`;
}
