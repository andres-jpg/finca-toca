// Inventario del café en tres pestañas (A-15 · FIN-133). Puro: sin base ni React. Las tres pestañas NUNCA se suman
// entre sí (marca propia es de Cofradía; el café de terceros es de sus clientes), así que nada aquí devuelve un
// total que mezcle listas de pestañas distintas.
import { diasEntre } from "../../procesos/lib/cola";

export const PESTANAS_INVENTARIO = ["marca-propia", "servicios", "insumos"] as const;
export type PestanaInventario = (typeof PESTANAS_INVENTARIO)[number];

export const ETIQUETA_PESTANA: Readonly<Record<PestanaInventario, string>> = {
  "marca-propia": "Marca propia · para vender",
  servicios: "Servicios a terceros",
  insumos: "Insumos",
};

/** Mensaje fijo de la pestaña de terceros. */
export const MENSAJE_TERCEROS = "Café de clientes · no es inventario de Cofradía";

/** La pestaña de `?tab=`; cualquier otro valor cae en marca propia. */
export function parsearPestana(valor: string | string[] | undefined): PestanaInventario {
  const v = Array.isArray(valor) ? valor[0] : valor;
  return (PESTANAS_INVENTARIO as readonly string[]).includes(v ?? "") ? (v as PestanaInventario) : "marca-propia";
}

export const hrefPestana = (p: PestanaInventario): string => (p === "marca-propia" ? "/dashboard/cafe/inventario" : `/dashboard/cafe/inventario?tab=${p}`);

/** Días naturales que lleva un lote en planta (desde la recepción, ambos `YYYY-MM-DD`); nunca negativo. */
export function diasEnPlanta(fechaRecepcion: string, hoy: string): number {
  return Math.max(0, diasEntre(fechaRecepcion, hoy));
}

/** Un lote de servicio listo que lleva más de N días en planta se resalta (parámetro compartido con el tablero, A-13). */
export function resaltarSinRecoger(estado: string, dias: number, umbral: number): boolean {
  return estado === "listo" && dias > umbral;
}

export type EstadoPresentacion = "agotado" | "bajo" | "ok";

/** Stock de un producto terminado: agotado (≤ 0), bajo (≤ mínimo, si lo tiene) u ok. */
export function estadoPresentacion(stock: number, stockMinimo: number | null): EstadoPresentacion {
  if (stock <= 0) return "agotado";
  if (stockMinimo !== null && stock < stockMinimo) return "bajo";
  return "ok";
}

export interface EmpaqueSaldo {
  loteId: string;
  articuloId: string;
  unidades: number;
}
export interface ConversionSaldo {
  loteId: string;
  origenId: string;
  destinoId: string;
  unidadesOrigen: number;
  unidadesDestino: number;
}

/**
 * Unidades convertibles de cada (lote, producto): lo empacado de ese lote, menos lo reabierto y lo convertido
 * hacia otra presentación, más lo convertido hacia él. Igual que `cafe.convertir_presentacion`.
 * Solo devuelve saldos > 0.
 */
export function saldosPorLote(
  empaques: readonly EmpaqueSaldo[],
  reaperturas: readonly EmpaqueSaldo[],
  conversiones: readonly ConversionSaldo[],
): EmpaqueSaldo[] {
  const mapa = new Map<string, EmpaqueSaldo>();
  const sumar = (loteId: string, articuloId: string, n: number) => {
    const k = `${loteId}:${articuloId}`;
    const f = mapa.get(k) ?? { loteId, articuloId, unidades: 0 };
    f.unidades += n;
    mapa.set(k, f);
  };
  for (const e of empaques) sumar(e.loteId, e.articuloId, e.unidades);
  for (const r of reaperturas) sumar(r.loteId, r.articuloId, -r.unidades);
  for (const c of conversiones) {
    sumar(c.loteId, c.origenId, -c.unidadesOrigen);
    sumar(c.loteId, c.destinoId, c.unidadesDestino);
  }
  return [...mapa.values()].filter((s) => s.unidades > 0);
}
