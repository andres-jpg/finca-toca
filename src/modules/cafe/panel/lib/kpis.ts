import type { LineaLote, TipoProceso } from "../../lotes/types";
import type {
  ClienteEnPlanta,
  FilaProduccion,
  IngresoMarcaPropia,
  IngresoServicios,
  InventarioPropio,
  InventarioTerceros,
  KpisPanel,
  LineaPanel,
  LineaServicio,
  MermaTipo,
  RecibidoLinea,
  VentaDiaria,
} from "../types";
import { LINEAS_PANEL } from "./periodo";

// Lo que el panel sabe de las cifras: a qué línea pertenece un lote, qué significa cada tarjeta y cómo se lee, sin
// fiarse, el json de `cafe.kpis_periodo`. Puro: sin Next ni Supabase.

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

/**
 * Enlace del botón «Exportar» del panel: el Excel de lotes y procesos de CO-35 con el mismo periodo y la misma línea.
 * `desde`/`hasta` acotan los lotes por su recepción y los procesos por su fecha, igual que el panel.
 */
export function urlExportacion(desde: string, hasta: string, linea: LineaPanel | null): string {
  const p = new URLSearchParams();
  const tipo = tipoDeExportacion(linea);
  if (tipo) p.set("tipo", tipo);
  p.set("desde", desde);
  p.set("hasta", hasta);
  return `/api/export/cafe-lotes?${p.toString()}`;
}

/** Definición de cada indicador: es el texto del tooltip de la tarjeta y la tabla de CLAUDE.md. */
export const DEFINICIONES = {
  recibido: {
    titulo: "Café recibido",
    texto:
      "Suma del peso recibido (kg) de los lotes no anulados cuya fecha de recepción cae en el periodo, separada por línea: marca propia, trilla (solo trilla) y maquila (con tostión). Nunca se suma propio con terceros.",
  },
  merma: {
    titulo: "Merma promedio",
    texto:
      "Ponderada por peso: merma en kg ÷ kilos de entrada de los procesos no anulados del periodo, por tipo de proceso (trilla, tostión, molienda, empaque). Nunca es un promedio simple de porcentajes: un bache grande pesa más que uno pequeño.",
  },
  desvios: {
    titulo: "Procesos con desvío",
    texto:
      "Cantidad de procesos del periodo cuya merma se aparta de la referencia (trilla 19 %, tostión 18 %) más que la tolerancia (±3 puntos). Se marcan pero no se bloquean.",
  },
  ingresoMarcaPropia: {
    titulo: "Ingreso marca propia",
    texto:
      "Suma del total de las ventas (tipo venta, no anuladas) del periodo. Las cortesías no suman: se muestran aparte, en unidades. Esta aplicación no emite facturas; la factura electrónica se emite en Aliados.",
  },
  ingresoServicios: {
    titulo: "Ingreso servicios",
    texto:
      "Suma del valor de los procesos de lotes de servicio del periodo. Cada proceso guarda su valor con la tarifa vigente en su fecha, así que cambiar una tarifa no altera lo ya registrado. El empaque de maquila va incluido sin costo.",
  },
  inventarioPropio: {
    titulo: "Inventario propio",
    texto:
      "Foto de ahora (no depende del periodo). Producto terminado por tipo de café y presentación (unidades y su equivalente en kg), más los kg de café de marca propia que siguen en planta sin empacar. Nunca hay un total que mezcle tipos o presentaciones.",
  },
  inventarioTerceros: {
    titulo: "Inventario de terceros",
    texto:
      "Foto de ahora (no depende del periodo). Kg de café de clientes que siguen en planta: lotes de servicio sin remisión de entrega vigente, por cliente (los cinco con más kilos).",
  },
  insumos: {
    titulo: "Insumos bajo mínimo",
    texto: "Bolsas y etiquetas activas cuyo stock está por debajo del mínimo configurado. No depende del periodo ni de la línea.",
  },
} as const;

const esObjeto = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);

/** Un número del json (la base devuelve `numeric` como número; un valor ausente o no numérico es 0). */
function num(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}
const numONull = (v: unknown): number | null => (v === null || v === undefined ? null : num(v));

const esLinea = (v: unknown): v is LineaPanel => typeof v === "string" && (LINEAS_PANEL as readonly string[]).includes(v);
const TIPOS: readonly TipoProceso[] = ["trilla", "tostion", "molienda", "empaque"];
const esTipo = (v: unknown): v is TipoProceso => typeof v === "string" && (TIPOS as readonly string[]).includes(v);
const lista = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(esObjeto) : []);

function leerMarca(v: unknown): IngresoMarcaPropia | null {
  if (!esObjeto(v)) return null;
  return { total: num(v.total), ventas: num(v.ventas), cortesias: num(v.cortesias), unidadesCortesia: num(v.unidades_cortesia) };
}

function leerServicios(v: unknown): IngresoServicios | null {
  if (!esObjeto(v)) return null;
  return {
    total: num(v.total),
    porLinea: lista(v.por_linea).flatMap((l): { linea: LineaServicio; valor: number }[] =>
      l.linea === "trilla" || l.linea === "maquila" ? [{ linea: l.linea, valor: num(l.valor) }] : [],
    ),
  };
}

function leerPropio(v: unknown): InventarioPropio | null {
  if (!esObjeto(v)) return null;
  return { cafeEnPlantaKg: num(v.cafe_en_planta_kg), lotesEnPlanta: num(v.lotes_en_planta), productoTerminadoKg: num(v.producto_terminado_kg) };
}

function leerTerceros(v: unknown): InventarioTerceros | null {
  if (!esObjeto(v)) return null;
  return {
    kgEnPlanta: num(v.kg_en_planta),
    lotes: num(v.lotes),
    clientes: num(v.clientes),
    porCliente: lista(v.por_cliente).map(
      (c): ClienteEnPlanta => ({
        terceroId: typeof c.tercero_id === "string" ? c.tercero_id : null,
        nombre: typeof c.nombre === "string" && c.nombre ? c.nombre : "Sin nombre",
        kg: num(c.kg),
        lotes: num(c.lotes),
      }),
    ),
  };
}

/**
 * Valida el json de `cafe.kpis_periodo` y lo pasa a la forma del panel. Lanza si no es un objeto (la base no devolvió lo
 * esperado); lo demás que falte o venga raro se lee como vacío, nunca como un valor inventado.
 */
export function leerKpis(json: unknown): KpisPanel {
  if (!esObjeto(json)) throw new Error("Respuesta inesperada del panel");
  const mermas = lista(json.mermas).flatMap((m): MermaTipo[] =>
    esTipo(m.tipo)
      ? [{ tipo: m.tipo, procesos: num(m.procesos), kgEntrada: num(m.kg_entrada), kgSalida: num(m.kg_salida), mermaKg: num(m.merma_kg), mermaPct: numONull(m.merma_pct), desvios: num(m.desvios) }]
      : [],
  );
  return {
    desde: String(json.desde ?? ""),
    hasta: String(json.hasta ?? ""),
    hoy: String(json.hoy ?? ""),
    linea: esLinea(json.linea) ? json.linea : null,
    recibido: lista(json.recibido).flatMap((r): RecibidoLinea[] => (esLinea(r.linea) ? [{ linea: r.linea, kg: num(r.kg), lotes: num(r.lotes) }] : [])),
    mermas,
    desvios: num(json.desvios),
    ingresoMarcaPropia: leerMarca(json.ingreso_marca_propia),
    ingresoServicios: leerServicios(json.ingreso_servicios),
    inventarioPropio: leerPropio(json.inventario_propio),
    inventarioTerceros: leerTerceros(json.inventario_terceros),
    insumosBajoMinimo: num(json.insumos_bajo_minimo),
  };
}

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
