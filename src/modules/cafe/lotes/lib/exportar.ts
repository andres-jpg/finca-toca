import type { HojaExcel } from "@/modules/core/export/generar-excel";
import { ETIQUETA_ALERTA_CALIDAD } from "@/modules/cafe/recepciones/lib/calidad";
import type { LineaLote, NivelTueste, TipoProceso } from "../types";
import { etiquetaEstado } from "./estado";
import { pctDeMerma } from "./formato";
import { etiquetaLinea, etiquetaServicio, etiquetaTueste, ORDEN_PROCESO } from "./servicios";
import { etiquetaTipoLote, tipoVisibleLote } from "./tipo-lote";

// Exportación a Excel de lotes y procesos (HU-F1-15). Aquí solo se decide QUÉ columnas lleva cada hoja y cómo se
// escribe cada valor; leer la base es de `queries/exportar.queries.ts`. Pura: se prueba con un dataset fijo.

/** Un lote de la hoja «Lotes» (fila de `cafe.v_lotes` ya normalizada: nunca `undefined`). */
export interface LoteExport {
  id: string;
  codigo: string;
  linea: LineaLote;
  servicios: readonly TipoProceso[];
  tercero: string | null;
  identificacion: string | null;
  tipoCafe: string | null;
  /** `YYYY-MM-DD`. */
  fechaRecepcion: string;
  numBultos: number;
  pesoRecibidoKg: number;
  /** En puntos porcentuales tal como se guarda (11,5 = 11,5 %). */
  humedadPct: number | null;
  densidad: number | null;
  alertasCalidad: readonly string[];
  nivelTueste: NivelTueste | null;
  precioCompraKg: number | null;
  valorCompra: number | null;
  pesoActualKg: number;
  mermaTotalKg: number;
  valorServicios: number;
  estado: string;
  avanceTexto: string | null;
  /** Código de la remisión. Lo rellenará CO-32 cuando exista; hasta entonces la columna sale vacía. */
  remision: string | null;
}

/** Un proceso de la hoja «Procesos». */
export interface ProcesoExport {
  loteCodigo: string;
  linea: LineaLote;
  /** `YYYY-MM-DD`. */
  fecha: string;
  tipo: TipoProceso;
  /** Bultos que pasaron; `null` en un proceso anulado (la anulación libera sus bultos). */
  numBultos: number | null;
  pesoEntradaKg: number;
  pesoSalidaKg: number;
  mermaKg: number;
  /** Merma de referencia (puntos porcentuales) con la que se midió; `null` en molienda y empaque. */
  mermaReferenciaPct: number | null;
  desvio: boolean;
  nivelTueste: NivelTueste | null;
  tarifaKg: number;
  valor: number;
  registradoPor: string | null;
  /** Instante de creación, solo para ordenar procesos del mismo día. */
  creadoEn: string;
  anulado: boolean;
  motivoAnulacion: string | null;
}

const NOMBRE_HOJA_LOTES = "Lotes";
const NOMBRE_HOJA_PROCESOS = "Procesos";

/** Kilos de merma como porcentaje, en fracción para el formato `porcentaje` de Excel (18,02 → 0,1802); `null` si no hay entrada. */
export function fraccionMerma(mermaKg: number, entradaKg: number): number | null {
  const pct = pctDeMerma(mermaKg, entradaKg);
  return pct === null ? null : pct / 100;
}

/** Alertas de calidad en palabras («Humedad alta, Densidad baja»); un código desconocido se deja tal cual. */
export function textoAlertasCalidad(alertas: readonly string[]): string {
  const etiquetas = ETIQUETA_ALERTA_CALIDAD as Readonly<Record<string, string>>;
  return alertas.map((a) => etiquetas[a] ?? a).join(", ");
}

/** Servicios contratados en el orden de la planta («Trilla, Tostión, Empaque»); vacío en marca propia (no hay contrato). */
export function textoServicios(linea: LineaLote, servicios: readonly TipoProceso[]): string {
  if (linea === "marca_propia") return "";
  return [...servicios]
    .sort((a, b) => ORDEN_PROCESO[a] - ORDEN_PROCESO[b])
    .map(etiquetaServicio)
    .join(", ");
}

/** Orden de las filas de «Procesos»: por lote (en el orden de la hoja «Lotes»), luego fecha y hora de registro. */
export function ordenarProcesos<T extends Pick<ProcesoExport, "loteCodigo" | "fecha" | "creadoEn" | "tipo">>(
  procesos: readonly T[],
  codigosEnOrden: readonly string[],
): T[] {
  const posicion = new Map(codigosEnOrden.map((c, i) => [c, i]));
  const pos = (c: string) => posicion.get(c) ?? Number.MAX_SAFE_INTEGER;
  return [...procesos].sort(
    (a, b) =>
      pos(a.loteCodigo) - pos(b.loteCodigo) ||
      a.fecha.localeCompare(b.fecha) ||
      a.creadoEn.localeCompare(b.creadoEn) ||
      ORDEN_PROCESO[a.tipo] - ORDEN_PROCESO[b.tipo],
  );
}

/** «Sí» / «No» para las columnas de bandera. */
const siNo = (v: boolean) => (v ? "Sí" : "No");

/**
 * Las dos hojas del Excel. «Lotes» lleva subtotales **por línea** (marca propia y servicios, con su `SUM` propio) y
 * ningún total general: los kilos propios y los de clientes no se mezclan. `descripcionFiltros` es el texto de
 * `describirFiltros()` y va en la fila 2 de las dos hojas.
 */
export function construirHojasLotes(
  lotes: readonly LoteExport[],
  procesos: readonly ProcesoExport[],
  descripcionFiltros: string,
): HojaExcel[] {
  const hojaLotes = {
    nombre: NOMBRE_HOJA_LOTES,
    titulo: "Lotes",
    subtitulo: descripcionFiltros,
    filas: [...lotes],
    columnas: [
      { header: "Código", key: "codigo" as const, width: 15 },
      { header: "Línea", key: (l: LoteExport) => etiquetaLinea(l.linea), width: 14 },
      { header: "Tipo", key: (l: LoteExport) => etiquetaTipoLote(tipoVisibleLote(l.linea, l.servicios)), width: 17 },
      { header: "Cliente / Proveedor", key: "tercero" as const, width: 30 },
      { header: "Identificación", key: "identificacion" as const, width: 16 },
      { header: "Tipo de café", key: "tipoCafe" as const, width: 14 },
      { header: "Fecha recepción", key: "fechaRecepcion" as const, formato: "fecha" as const },
      { header: "Bultos", key: "numBultos" as const, formato: "entero" as const, width: 9 },
      { header: "Kg recibidos", key: "pesoRecibidoKg" as const, formato: "peso" as const },
      { header: "Humedad %", key: (l: LoteExport) => (l.humedadPct === null ? null : l.humedadPct / 100), formato: "porcentaje" as const },
      { header: "Densidad", key: "densidad" as const, formato: "decimal" as const, width: 11 },
      { header: "Alertas de calidad", key: (l: LoteExport) => textoAlertasCalidad(l.alertasCalidad), width: 26 },
      { header: "Servicios contratados", key: (l: LoteExport) => textoServicios(l.linea, l.servicios), width: 28 },
      { header: "Nivel de tueste", key: (l: LoteExport) => (l.nivelTueste ? etiquetaTueste(l.nivelTueste) : ""), width: 14 },
      { header: "Precio compra/kg", key: "precioCompraKg" as const, formato: "moneda" as const },
      { header: "Valor compra", key: "valorCompra" as const, formato: "moneda" as const },
      { header: "Kg actuales", key: "pesoActualKg" as const, formato: "peso" as const },
      { header: "Merma total kg", key: "mermaTotalKg" as const, formato: "peso" as const },
      { header: "Merma total %", key: (l: LoteExport) => fraccionMerma(l.mermaTotalKg, l.pesoRecibidoKg), formato: "porcentaje" as const },
      { header: "Valor servicios", key: "valorServicios" as const, formato: "moneda" as const },
      { header: "Estado", key: (l: LoteExport) => etiquetaEstado(l.estado), width: 13 },
      { header: "Avance", key: "avanceTexto" as const, width: 10 },
      { header: "Remisión", key: "remision" as const, width: 14 },
    ],
    totales: ["numBultos", "pesoRecibidoKg", "valorCompra", "pesoActualKg", "mermaTotalKg", "valorServicios"] as (keyof LoteExport)[],
    subtotales: {
      agruparPor: (l: LoteExport) => l.linea,
      etiqueta: (g: string) => (g === "marca_propia" ? "Subtotal marca propia" : "Subtotal servicios (clientes)"),
    },
  } satisfies HojaExcel;

  const hojaProcesos = {
    nombre: NOMBRE_HOJA_PROCESOS,
    titulo: "Procesos",
    subtitulo: descripcionFiltros,
    filas: [...procesos],
    columnas: [
      { header: "Código lote", key: "loteCodigo" as const, width: 15 },
      { header: "Línea", key: (p: ProcesoExport) => etiquetaLinea(p.linea), width: 14 },
      { header: "Fecha", key: "fecha" as const, formato: "fecha" as const },
      { header: "Proceso", key: (p: ProcesoExport) => etiquetaServicio(p.tipo), width: 12 },
      { header: "Bultos", key: "numBultos" as const, formato: "entero" as const, width: 9 },
      { header: "Kg entrada", key: "pesoEntradaKg" as const, formato: "peso" as const },
      { header: "Kg salida", key: "pesoSalidaKg" as const, formato: "peso" as const },
      { header: "Merma kg", key: "mermaKg" as const, formato: "peso" as const },
      { header: "Merma %", key: (p: ProcesoExport) => fraccionMerma(p.mermaKg, p.pesoEntradaKg), formato: "porcentaje" as const },
      { header: "Referencia %", key: (p: ProcesoExport) => (p.mermaReferenciaPct === null ? null : p.mermaReferenciaPct / 100), formato: "porcentaje" as const },
      { header: "Desvío", key: (p: ProcesoExport) => siNo(p.desvio), width: 9 },
      { header: "Nivel de tueste", key: (p: ProcesoExport) => (p.nivelTueste ? etiquetaTueste(p.nivelTueste) : ""), width: 14 },
      { header: "Tarifa/kg", key: "tarifaKg" as const, formato: "moneda" as const },
      { header: "Valor", key: "valor" as const, formato: "moneda" as const },
      { header: "Registrado por", key: "registradoPor" as const, width: 30 },
      { header: "Anulado", key: (p: ProcesoExport) => siNo(p.anulado), width: 10 },
      { header: "Motivo de anulación", key: "motivoAnulacion" as const, width: 30 },
    ],
  } satisfies HojaExcel;

  return [hojaLotes, hojaProcesos];
}
