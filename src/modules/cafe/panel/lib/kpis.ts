import type { LineaLote, TipoProceso } from "../../lotes/types";
import { pctDeMerma } from "../../lotes/lib/formato";
import type { FilaProduccion, FilaProduccionPanel, LineaPanel, VentaDiaria, VentaPresentacion } from "../types";
import { diasDelMes, diasInclusivos, LINEAS_PANEL } from "./periodo";

// Lo que el panel sabe de las cifras: a qué línea pertenece un lote, qué significa cada indicador, cómo se lee, sin fiarse, lo
// que devuelve la base y las cuentas de los tres KPIs, el mix por presentación y la producción. Puro: sin Next ni Supabase.

/**
 * Línea del panel de un lote: marca propia, o —en servicios— «trilla» si su único servicio es la trilla y «maquila» si
 * lleva tostión (molienda y empaque exigen tostión). Un lote «Trilla + maquila» es maquila: así las líneas son una
 * partición y nada se cuenta dos veces. Es `cafe.linea_panel()` de SQL; los dos tests comparten casos.
 */
export function lineaPanel(linea: LineaLote, servicios: readonly TipoProceso[]): LineaPanel {
  if (linea === "marca_propia") return "marca_propia";
  return servicios.includes("tostion") ? "maquila" : "trilla";
}

/** El `tipo` del Excel de lotes (CO-35) que reproduce una línea del panel; `null` = sin filtro de tipo. */
export function tipoDeExportacion(linea: LineaPanel | null): string | null {
  switch (linea) {
    case "marca_propia":
      return "marca_propia";
    case "trilla":
      return "solo_trilla";
    case "maquila":
      return "maquila";
    default:
      return null;
  }
}

/** Enlace del botón «Exportar»: el Excel de lotes y procesos de CO-35 con el mismo periodo. */
export function urlExportacion(desde: string, hasta: string, linea: LineaPanel | null = null): string {
  const p = new URLSearchParams();
  const tipo = tipoDeExportacion(linea);
  if (tipo) p.set("tipo", tipo);
  p.set("desde", desde);
  p.set("hasta", hasta);
  return `/api/export/cafe-lotes?${p.toString()}`;
}

/** Definición de cada indicador: es el texto del tooltip de la tarjeta. */
export const DEFINICIONES = {
  ingresos: {
    titulo: "Ingresos",
    texto:
      "Ventas de marca propia (tipo venta, no anuladas; las cortesías no suman) más los servicios a terceros (valor de los procesos de lotes de servicio, con la tarifa de la fecha de cada proceso). Se compara con el tramo equivalente anterior. Esta aplicación no emite facturas.",
  },
  libras: {
    titulo: "Libras vendidas",
    texto:
      "Libras de café de marca propia vendidas en el periodo (1 lb = 500 g; una bolsa de 2.500 g son 5 lb), sin cortesías ni ventas anuladas. Se compara con el promedio mensual de ventas (parámetro «Promedio mensual de libras vendidas»), proporcional a los días del periodo. No es una meta.",
  },
  margen: {
    titulo: "Margen bruto marca propia",
    texto:
      "Ventas de marca propia menos el costo directo de lo vendido: libras vendidas × costo por libra de cada calidad y presentación (café con la merma de tostión del lote más bolsa y etiqueta, a los precios registrados). Lo vendido sin costo calculable no entra. Energía, gas, mano de obra y arriendo no entran.",
  },
  mix: {
    titulo: "Libras vendidas por presentación",
    texto:
      "Por presentación: libras vendidas, ingreso y margen (ingreso menos el costo directo de esas libras). El margen por libra es el margen entre las libras vendidas.",
  },
  produccion: {
    titulo: "Producción",
    texto:
      "Kilos que entran a cada proceso en el periodo (procesos no anulados), con las tandas de tostión que aún no se cierran. El empaque no se cuenta. La merma de tostión de marca propia se mide solo sobre las tandas cerradas: kg de merma entre kg de entrada, contra su referencia ± tolerancia.",
  },
  proveedores: {
    titulo: "Proveedores de marca propia",
    texto:
      "Por proveedor, de los lotes de marca propia recibidos en el periodo (sin anulados): precio por kg y humedad promedio ponderados por kg, y merma de tostión ponderada (kg de merma entre kg de entrada de sus tostiones cerradas). Ámbar si la humedad sale del rango o la merma de su banda. No incluye bolsa, etiqueta, energía ni mano de obra.",
  },
  decidir: {
    titulo: "Para decidir hoy",
    texto:
      "Lo que pide una decisión hoy, con enlace a donde se resuelve: presentaciones agotadas (con el ritmo de venta de las últimas 4 semanas), insumos bajo el mínimo, lotes de terceros listos sin recoger y proveedores fuera de rango en el mes. Solo avisa; no bloquea nada.",
  },
} as const;

/** Un número del json (la base devuelve `numeric` como número o texto; un valor ausente o no numérico es 0). */
function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}
const numONull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));

const esLinea = (v: unknown): v is LineaPanel => typeof v === "string" && (LINEAS_PANEL as readonly string[]).includes(v);
const TIPOS: readonly TipoProceso[] = ["trilla", "tostion", "molienda", "empaque"];
const esTipo = (v: unknown): v is TipoProceso => typeof v === "string" && (TIPOS as readonly string[]).includes(v);

/** Filas de `cafe.produccion_diaria` ya tipadas; descarta las que no tengan línea o tipo válidos. */
export function leerProduccion(filas: readonly { fecha: string; linea: string; tipo: string; kg_entrada: number; kg_salida: number; merma_pct: number | null; valor: number }[]): FilaProduccion[] {
  return filas.flatMap((f): FilaProduccion[] =>
    esLinea(f.linea) && esTipo(f.tipo)
      ? [{ fecha: f.fecha, linea: f.linea, tipo: f.tipo, kgEntrada: num(f.kg_entrada), kgSalida: num(f.kg_salida), mermaPct: numONull(f.merma_pct), valor: num(f.valor) }]
      : [],
  );
}

export function leerVentasDiarias(filas: readonly { fecha: string; total: number; n_ventas: number; unidades_cortesia: number }[]): VentaDiaria[] {
  return filas.map((f) => ({ fecha: f.fecha, total: num(f.total), nVentas: num(f.n_ventas), unidadesCortesia: num(f.unidades_cortesia) }));
}

/** Filas de `cafe.produccion_panel`; descarta las de línea o tipo desconocidos (y el empaque, que no se cuenta). */
export function leerProduccionPanel(filas: readonly { tipo: string; linea: string; procesos: number; kg_entrada: number; kg_entrada_medida: number; kg_salida: number }[]): FilaProduccionPanel[] {
  return filas.flatMap((f): FilaProduccionPanel[] =>
    esLinea(f.linea) && esTipo(f.tipo) && f.tipo !== "empaque"
      ? [{ tipo: f.tipo, linea: f.linea, procesos: num(f.procesos), kgEntrada: num(f.kg_entrada), kgEntradaMedida: num(f.kg_entrada_medida), kgSalida: num(f.kg_salida) }]
      : [],
  );
}

/** Filas de `cafe.ventas_por_presentacion`; descarta las que no se pueden ubicar (sin tipo de café o sin presentación). */
export function leerVentasPresentacion(filas: readonly { articulo_pt_id: string; nombre: string; tipo_cafe_id: string | null; presentacion_g: number | null; unidades: number; libras: number; ingreso: number }[]): VentaPresentacion[] {
  return filas.flatMap((f): VentaPresentacion[] =>
    f.tipo_cafe_id && f.presentacion_g
      ? [{ articuloId: f.articulo_pt_id, nombre: f.nombre, tipoCafeId: f.tipo_cafe_id, presentacionG: num(f.presentacion_g), unidades: num(f.unidades), libras: num(f.libras), ingreso: num(f.ingreso) }]
      : [],
  );
}

// --- KPI 1 · Ingresos --------------------------------------------------------------------------------------------------------

export interface IngresosPeriodo {
  marcaPropia: number;
  servicios: number;
  total: number;
}

/** Ingresos de un tramo: ventas vigentes de marca propia + valor de los procesos de servicios (de las dos series diarias). */
export function ingresosDelTramo(ventas: readonly VentaDiaria[], filas: readonly FilaProduccion[], desde: string, hasta: string): IngresosPeriodo {
  const marcaPropia = ventas.filter((v) => v.fecha >= desde && v.fecha <= hasta).reduce((s, v) => s + v.total, 0);
  const servicios = filas.filter((f) => f.linea !== "marca_propia" && f.fecha >= desde && f.fecha <= hasta).reduce((s, f) => s + f.valor, 0);
  return { marcaPropia, servicios, total: marcaPropia + servicios };
}

/** Variación porcentual con 1 decimal (`+4,2` → 4.2). Sin tramo anterior con ingresos no hay variación (`null`), no un infinito. */
export function variacionPct(actual: number, anterior: number): number | null {
  if (!(anterior > 0)) return null;
  return Math.round(((actual - anterior) / anterior) * 1000) / 10;
}

// --- KPI 2 · Libras vendidas ------------------------------------------------------------------------------------------------

export interface LibrasVsPromedio {
  libras: number;
  /** El promedio mensual configurado. */
  promedioMes: number;
  /** El promedio que corresponde a los días del periodo (proporcional al mes). */
  promedioPeriodo: number;
  /** Libras ÷ promedio del periodo, en % entero. `null` sin promedio configurado. */
  pct: number | null;
  /** El periodo cubre un mes completo (no hace falta aclarar la proporción). */
  mesCompleto: boolean;
}

/** Libras vendidas frente al promedio mensual, proporcional a los días del periodo (el mes en curso no se mide contra 30 días). */
export function librasVsPromedio(libras: number, promedioMes: number, desde: string, hasta: string): LibrasVsPromedio {
  const dias = diasInclusivos(desde, hasta);
  const delMes = diasDelMes(hasta);
  const mesCompleto = desde.slice(0, 7) === hasta.slice(0, 7) && desde.endsWith("-01") && dias === delMes;
  const promedioPeriodo = promedioMes * Math.min(dias, delMes) / delMes;
  return { libras, promedioMes, promedioPeriodo, pct: promedioPeriodo > 0 ? Math.round((libras / promedioPeriodo) * 100) : null, mesCompleto };
}

// --- KPI 3 y mix · Margen bruto ---------------------------------------------------------------------------------------------

/** Costo por libra de cada calidad × presentación: clave `tipoCafeId:gramos`. `null` = sin costo calculable. */
export type CostosLibra = ReadonlyMap<string, number | null>;
export const claveCosto = (tipoCafeId: string, presentacionG: number): string => `${tipoCafeId}:${presentacionG}`;

export interface MargenBruto {
  /** Ingreso de lo vendido CON costo calculable (la base del margen). */
  ingreso: number;
  costo: number;
  margen: number;
  /** Margen ÷ ingreso, 1 decimal. `null` sin ingreso con costo. */
  margenPct: number | null;
  /** Hay ventas cuyo costo no se puede calcular y por eso no entran. */
  parcial: boolean;
  ingresoSinCosto: number;
}

const redondear = (n: number, decimales = 0): number => {
  const f = 10 ** decimales;
  return Math.round((n + Number.EPSILON) * f) / f;
};

/** Margen bruto de marca propia = ingreso − libras × costo por libra, sobre lo vendido que tiene costo. */
export function margenBruto(ventas: readonly VentaPresentacion[], costos: CostosLibra): MargenBruto {
  let ingreso = 0;
  let costo = 0;
  let sinCosto = 0;
  for (const v of ventas) {
    const c = costos.get(claveCosto(v.tipoCafeId, v.presentacionG)) ?? null;
    if (c === null) sinCosto += v.ingreso;
    else {
      ingreso += v.ingreso;
      costo += v.libras * c;
    }
  }
  const margen = ingreso - costo;
  return {
    ingreso,
    costo: redondear(costo),
    margen: redondear(margen),
    margenPct: ingreso > 0 ? redondear((margen / ingreso) * 100, 1) : null,
    parcial: sinCosto > 0,
    ingresoSinCosto: sinCosto,
  };
}

export interface FilaMix {
  presentacionG: number;
  libras: number;
  /** Parte de las libras vendidas (0..100, 1 decimal). */
  partePct: number;
  ingreso: number;
  /** Margen y margen por libra de lo vendido con costo; `null` si nada de esa presentación tiene costo. */
  margen: number | null;
  margenPorLibra: number | null;
  margenPct: number | null;
}

/** El mix de presentaciones (de menor a mayor gramaje): libras, ingreso y margen de cada una. */
export function mixPorPresentacion(ventas: readonly VentaPresentacion[], costos: CostosLibra): FilaMix[] {
  const grupos = new Map<number, VentaPresentacion[]>();
  for (const v of ventas) grupos.set(v.presentacionG, [...(grupos.get(v.presentacionG) ?? []), v]);
  const total = ventas.reduce((s, v) => s + v.libras, 0);
  return [...grupos.entries()]
    .sort(([a], [b]) => a - b)
    .map(([presentacionG, filas]) => {
      const libras = filas.reduce((s, v) => s + v.libras, 0);
      const ingreso = filas.reduce((s, v) => s + v.ingreso, 0);
      const m = margenBruto(filas, costos);
      const librasConCosto = filas.filter((v) => costos.get(claveCosto(v.tipoCafeId, v.presentacionG)) != null).reduce((s, v) => s + v.libras, 0);
      return {
        presentacionG,
        libras: redondear(libras, 3),
        partePct: total > 0 ? redondear((libras / total) * 100, 1) : 0,
        ingreso,
        margen: m.ingreso > 0 ? m.margen : null,
        margenPorLibra: m.ingreso > 0 && librasConCosto > 0 ? redondear(m.margen / librasConCosto) : null,
        margenPct: m.margenPct,
      };
    });
}

/**
 * La frase del mix: cuánto más margen deja cada libra de la presentación grande frente a la chica, por el menor costo de
 * empaque. `null` si falta alguna de las dos o la grande no deja más.
 */
export function fraseMargenGrande(mix: readonly FilaMix[], chica = 500, grande = 2500): { gramos: number; masMargen: number } | null {
  const a = mix.find((f) => f.presentacionG === chica)?.margenPorLibra;
  const b = mix.find((f) => f.presentacionG === grande)?.margenPorLibra;
  if (a == null || b == null || b <= a) return null;
  return { gramos: grande, masMargen: b - a };
}

// --- Producción del mes -----------------------------------------------------------------------------------------------------

export interface ProduccionMes {
  trillaKg: number;
  tostion: { marcaPropiaKg: number; maquilaKg: number };
  molienda: { marcaPropiaKg: number; maquilaKg: number };
  /** Merma de tostión de marca propia sobre las tandas ya cerradas (1 entrada y 1 salida). `null` sin tandas cerradas. */
  mermaTostionMarcaPropia: { entradaKg: number; mermaKg: number; pct: number } | null;
}

/** Resume `cafe.produccion_panel`: kg que entran a trilla, tostión y molienda (sin empaque) y la merma de tostión de marca propia. */
export function produccionDelMes(filas: readonly FilaProduccionPanel[]): ProduccionMes {
  const kg = (tipo: TipoProceso, lineas: readonly LineaPanel[]) => filas.filter((f) => f.tipo === tipo && lineas.includes(f.linea)).reduce((s, f) => s + f.kgEntrada, 0);
  const tostMarca = filas.filter((f) => f.tipo === "tostion" && f.linea === "marca_propia");
  const entradaMedida = tostMarca.reduce((s, f) => s + f.kgEntradaMedida, 0);
  const salida = tostMarca.reduce((s, f) => s + f.kgSalida, 0);
  return {
    trillaKg: kg("trilla", LINEAS_PANEL),
    tostion: { marcaPropiaKg: kg("tostion", ["marca_propia"]), maquilaKg: kg("tostion", ["maquila", "trilla"]) },
    molienda: { marcaPropiaKg: kg("molienda", ["marca_propia"]), maquilaKg: kg("molienda", ["maquila", "trilla"]) },
    mermaTostionMarcaPropia:
      entradaMedida > 0 ? { entradaKg: entradaMedida, mermaKg: entradaMedida - salida, pct: pctDeMerma(entradaMedida - salida, entradaMedida) ?? 0 } : null,
  };
}

/** Las presentaciones (g) vendidas, ordenadas y separadas por coma: qué costos por libra hay que pedir (`getCostosLibra`). */
export function gramosVendidosCsv(ventas: readonly VentaPresentacion[]): string {
  return [...new Set(ventas.map((v) => v.presentacionG))].sort((a, b) => a - b).join(",");
}
