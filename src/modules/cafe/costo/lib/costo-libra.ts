/**
 * Costo de producir una libra (500 g) de café de marca propia (A-05 · HU-F1-17). Piezas puras: el CÁLCULO vive en la base
 * (`cafe.costo_libra_lote`, única fuente de la fórmula, con su test pgTAP); aquí solo se lee su resultado, se decide qué
 * mostrar cuando falta un dato y se promedia por calidad para el panel. Nada se inventa: un dato ausente es `null`.
 */

export const GRAMOS_LIBRA = 500;

/** Presentaciones que muestra el costo por libra (B-13): 500 g y 2.500 g. */
export const PRESENTACIONES_COSTO: readonly number[] = [500, 2500];

/** Costo directo: lo que dice la nota de la ficha. */
export const NOTA_COSTO_DIRECTO = "Costo directo; los gastos de operación se incorporan con el módulo de gastos.";

export interface CostoLibra {
  loteId: string;
  gramos: number;
  /** `false` en lotes que no son de marca propia: no hay costo que mostrar. */
  aplica: boolean;
  precioCompraKg: number | null;
  /** Procesos vigentes de tostión del lote; 0 = aún no hay tostión. */
  tostiones: number;
  /** Fracciones 0..1 (no porcentajes). `null` sin tostión / sin molienda. */
  mermaTostion: number | null;
  mermaMolienda: number | null;
  costoCafe: number | null;
  costoBolsa: number | null;
  costoEtiqueta: number | null;
  /** Bolsa + etiqueta repartidos por libra de la presentación (500 g → bolsa + etiqueta; 2.500 g → ÷ 5). */
  costoEmpaque: number | null;
  /** `registrado` = precios de los empaques del lote; `vigente` = precio actual del insumo (aún no hay empaque). */
  fuenteEmpaque: "registrado" | "vigente" | null;
  costoLibra: number | null;
  /** Precio por libra (precio de la unidad ÷ libras de la presentación). */
  precioVenta: number | null;
  margen: number | null;
  /** Porcentaje (33,6), no fracción. */
  margenPct: number | null;
}

/** Qué muestra la ficha: el cálculo completo o el motivo de que aún no se pueda. */
export type EstadoCosto = "no_aplica" | "sin_tostion" | "sin_insumos" | "sin_precio_venta" | "completo";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const obj = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Lee el jsonb de `cafe.costo_libra_lote` (o una fila de `cafe.costo_libra_panel`, que lo extiende). */
export function leerCostoLibra(raw: unknown): CostoLibra {
  const r = obj(raw);
  return {
    loteId: String(r.lote_id ?? ""),
    gramos: num(r.gramos) ?? GRAMOS_LIBRA,
    aplica: r.aplica === true,
    precioCompraKg: num(r.precio_compra_kg),
    tostiones: num(obj(r.tostion).procesos) ?? 0,
    mermaTostion: num(r.merma_tostion),
    mermaMolienda: num(r.merma_molienda),
    costoCafe: num(r.costo_cafe),
    costoBolsa: num(r.costo_bolsa),
    costoEtiqueta: num(r.costo_etiqueta),
    costoEmpaque: num(r.costo_empaque),
    fuenteEmpaque: r.fuente_empaque === "registrado" || r.fuente_empaque === "vigente" ? r.fuente_empaque : null,
    costoLibra: num(r.costo_libra),
    precioVenta: num(r.precio_libra ?? r.precio_venta),
    margen: num(r.margen),
    margenPct: num(r.margen_pct),
  };
}

export function estadoCosto(c: CostoLibra): EstadoCosto {
  if (!c.aplica) return "no_aplica";
  if (c.costoCafe === null) return "sin_tostion";
  if (c.costoLibra === null) return "sin_insumos";
  if (c.precioVenta === null) return "sin_precio_venta";
  return "completo";
}

/** Bolsa + etiqueta, o `null` si falta cualquiera de las dos (un costo a medias engaña). */
export function costoBolsaYEtiqueta(c: Pick<CostoLibra, "costoBolsa" | "costoEtiqueta">): number | null {
  return c.costoBolsa === null || c.costoEtiqueta === null ? null : c.costoBolsa + c.costoEtiqueta;
}

/**
 * Espejo TS de `cafe.costo_libra_lote` para una presentación (se prueba con los mismos casos que el pgTAP). Redondeo a pesos
 * enteros solo al final. `mermaTostion` es una fracción 0..1 (la acumulada del lote).
 */
export function calcularCostoLibra(e: { precioCompraKg: number; mermaTostion: number; bolsa: number; etiqueta: number; gramos: number; precioUnidad?: number | null }) {
  const libras = e.gramos / 500;
  const cafe = (e.precioCompraKg / (1 - e.mermaTostion)) * 0.5;
  const empaque = (e.bolsa + e.etiqueta) / libras;
  const costo = Math.round(cafe + empaque);
  const precioLibra = e.precioUnidad == null ? null : e.precioUnidad / libras;
  const margen = precioLibra === null ? null : precioLibra - costo;
  return {
    cafe,
    empaque,
    costo,
    precioLibra,
    margen: margen === null ? null : Math.round(margen),
    margenPct: margen === null || precioLibra === null ? null : Math.round((margen / precioLibra) * 1000) / 10,
  };
}

/** Una fila del panel: el costo de un lote con los kg de esa presentación que se empacaron en el periodo. */
export interface CostoLibraLotePanel extends CostoLibra {
  codigo: string;
  tipoCafeId: string;
  tipoCafe: string;
  kgEmpacados: number;
}

export function leerCostoLibraPanel(raw: unknown): CostoLibraLotePanel[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((fila) => {
    const r = obj(fila);
    return {
      ...leerCostoLibra(fila),
      codigo: String(r.codigo ?? ""),
      tipoCafeId: String(r.tipo_cafe_id ?? ""),
      tipoCafe: String(r.tipo_cafe ?? ""),
      kgEmpacados: num(r.kg_empacados) ?? 0,
    };
  });
}

/** La tarjeta de una calidad en el panel. */
export interface CostoLibraCalidad {
  tipoCafeId: string;
  tipoCafe: string;
  lotes: number;
  /** kg empacados de los lotes CON costo (el peso del promedio). */
  kg: number;
  /** Lotes empacados que aún no tienen costo (sin tostión, o sin costo de bolsa/etiqueta). */
  lotesSinCosto: number;
  costoLibra: number | null;
  precioVenta: number | null;
  margen: number | null;
  margenPct: number | null;
}

const redondear = (n: number, decimales = 0): number => {
  const f = 10 ** decimales;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/**
 * Agrupa por calidad (en el orden en que llegan) y promedia el costo por libra PONDERADO POR KG empacado. El precio de venta
 * se pondera igual entre los lotes que lo tienen (es el mismo para una calidad, sale de la última venta de ese producto);
 * el margen se calcula con los promedios, no promediando márgenes. Los lotes sin costo no entran al promedio y se cuentan.
 */
export function promedioPonderadoPorCalidad(filas: readonly CostoLibraLotePanel[]): CostoLibraCalidad[] {
  const grupos = new Map<string, CostoLibraLotePanel[]>();
  for (const f of filas) {
    if (!f.aplica) continue;
    grupos.set(f.tipoCafeId, [...(grupos.get(f.tipoCafeId) ?? []), f]);
  }
  return [...grupos.values()].map((lotes) => {
    const conCosto = lotes.filter((l) => l.costoLibra !== null && l.kgEmpacados > 0);
    const kg = conCosto.reduce((s, l) => s + l.kgEmpacados, 0);
    const costoLibra = kg > 0 ? redondear(conCosto.reduce((s, l) => s + (l.costoLibra as number) * l.kgEmpacados, 0) / kg) : null;
    const conPrecio = conCosto.filter((l) => l.precioVenta !== null);
    const kgPrecio = conPrecio.reduce((s, l) => s + l.kgEmpacados, 0);
    const precioVenta = kgPrecio > 0 ? redondear(conPrecio.reduce((s, l) => s + (l.precioVenta as number) * l.kgEmpacados, 0) / kgPrecio) : null;
    const margen = costoLibra !== null && precioVenta !== null ? precioVenta - costoLibra : null;
    return {
      tipoCafeId: lotes[0].tipoCafeId,
      tipoCafe: lotes[0].tipoCafe,
      lotes: lotes.length,
      kg: redondear(kg, 3),
      lotesSinCosto: lotes.length - conCosto.length,
      costoLibra,
      precioVenta,
      margen,
      margenPct: margen !== null && precioVenta !== null && precioVenta > 0 ? redondear((margen / precioVenta) * 100, 1) : null,
    };
  });
}

/** Texto del estado vacío de la ficha según lo que falte. */
export function mensajeSinCosto(estado: EstadoCosto): string | null {
  switch (estado) {
    case "sin_tostion":
      return "Se calcula al registrar la primera tostión.";
    case "sin_insumos":
      return "Falta el precio de la bolsa o la etiqueta de esta presentación. Fíjalo en Insumos.";
    case "sin_precio_venta":
      return "Este producto aún no tiene precio de venta (ni ventas): sin él no se puede calcular el margen.";
    default:
      return null;
  }
}
