import { formatCOP } from "@/modules/core/formato/numeros";
import type { EtapaLote, MermaProcesada } from "./etapas";
import { pctDeMerma } from "./formato";

// KPIs de la ficha (B-12): Comprado · Procesado · Merma de tostión acumulada · Tostado sin empacar · Por tostar.
// Puras: cada cifra es de un solo concepto y no se suman entre sí.

/** Merma acumulada de las tostiones con salida (empacadas): Σ(entrada − salida) / Σ entrada. `null` si ninguna cerró. */
export function mermaTostionAcumulada(etapas: readonly Pick<EtapaLote, "tipo" | "pesoEntradaKg" | "mermaKg">[]): MermaProcesada | null {
  const t = etapas.find((e) => e.tipo === "tostion");
  if (!t || t.mermaKg === null) return null;
  const pct = pctDeMerma(t.mermaKg, t.pesoEntradaKg);
  return pct === null ? null : { entradaKg: t.pesoEntradaKg, mermaKg: t.mermaKg, pct };
}

/** «$28.500/kg · $9.120.000»; `null` si el lote no tiene precio de compra (servicio). */
export function notaComprado(precioKg: number | null, valorCompra: number | null): string | null {
  if (precioKg === null) return null;
  return valorCompra === null ? `${formatCOP(precioKg)}/kg` : `${formatCOP(precioKg)}/kg · ${formatCOP(valorCompra)}`;
}

/** «2 tandas de tostión» / «1 tanda de tostión». */
export function textoTandas(n: number): string {
  return `${n} ${n === 1 ? "tanda" : "tandas"} de tostión`;
}
