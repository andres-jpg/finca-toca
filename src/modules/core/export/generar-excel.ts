import ExcelJS from "exceljs";
import {
  anchoPorDefecto,
  FORMATOS_SUMABLES,
  NUM_FMT,
  nombreHojaValido,
  valorCelda,
  ZONA_POR_DEFECTO,
  type FormatoColumna,
} from "./lib/celdas";

export type { FormatoColumna } from "./lib/celdas";

// Mismos colores que el informe de cooperativa (`informes-cooperativa/route.ts`).
const COLOR_HEADER_BG = "FF0D9488"; // teal-600
const COLOR_HEADER_FG = "FFFFFFFF";
const COLOR_TOTALS_BG = "FF0F766E"; // teal-800

/** Filas fijas arriba de cada hoja: cliente (1), título y filtros (2), cabecera de columnas (3). */
const FILA_CABECERA = 3;

export interface Columna<T> {
  header: string;
  /** Nombre del campo de la fila o función que lo calcula. Los `totales` se refieren a las columnas por `key`. */
  key: keyof T | ((row: T) => unknown);
  width?: number;
  formato?: FormatoColumna;
}

export interface Hoja<T> {
  nombre: string;
  columnas: Columna<T>[];
  filas: T[];
  titulo?: string;
  subtitulo?: string;
  /** Claves (`Columna.key`) de las columnas numéricas que llevan fila de totales con fórmula `SUM`. */
  totales?: (keyof T)[];
}

export interface OpcionesExcel {
  tenant: { nombre: string; /** IANA; por defecto `America/Bogota`. */ zonaHoraria?: string };
  /** Filtros de pantalla que se aplicaron, ya en texto legible (`{ Estado: "Activos" }`). Salen en la fila 2. */
  filtrosAplicados?: Record<string, string>;
  /** Fecha de generación del libro; por defecto ahora. Solo metadatos del archivo. */
  generadoEn?: Date;
}

/** `any` a propósito y solo aquí: cada hoja tiene su propio tipo de fila y el arreglo mezcla varios. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type HojaExcel = Hoja<any>;

type Celda = ExcelJS.Cell;

function estiloCabecera(celda: Celda): void {
  celda.font = { bold: true, color: { argb: COLOR_HEADER_FG } };
  celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER_BG } };
  celda.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

function textoFiltros(filtros: Record<string, string> | undefined): string {
  const pares = Object.entries(filtros ?? {}).filter(([, v]) => v !== "");
  return pares.length ? `Filtros: ${pares.map(([k, v]) => `${k}: ${v}`).join("; ")}` : "";
}

/**
 * Libro de Excel con una hoja por entrada: cliente en la fila 1, título + filtros en la 2, cabecera
 * congelada en la 3 y los datos debajo. `totales` añade una fila final con fórmulas `SUM` reales, de modo que
 * editar un valor a mano recalcula el total. Los formatos (`moneda` COP, `peso` kg, `porcentaje`, fechas en la
 * zona del cliente) los fija la columna. No conoce ningún dominio: sirve a cualquier vertical.
 */
export async function generarExcel(hojas: readonly HojaExcel[], opciones: OpcionesExcel): Promise<Buffer> {
  const zona = opciones.tenant.zonaHoraria ?? ZONA_POR_DEFECTO;
  const libro = new ExcelJS.Workbook();
  libro.creator = opciones.tenant.nombre;
  libro.created = opciones.generadoEn ?? new Date();
  libro.modified = libro.created;

  const usados = new Set<string>();
  for (const hoja of hojas) {
    const nombre = nombreHojaValido(hoja.nombre, usados);
    usados.add(nombre);
    escribirHoja(libro, nombre, hoja, opciones, zona);
  }
  // Un libro sin hojas es un archivo que Excel considera dañado.
  if (hojas.length === 0) escribirHoja(libro, "Hoja", { nombre: "Hoja", columnas: [{ header: "Sin datos", key: "x" }], filas: [] }, opciones, zona);

  return Buffer.from(await libro.xlsx.writeBuffer());
}

function escribirHoja(libro: ExcelJS.Workbook, nombre: string, hoja: HojaExcel, opciones: OpcionesExcel, zona: string): void {
  const { columnas, filas } = hoja;
  if (columnas.length === 0) throw new Error(`La hoja "${hoja.nombre}" no tiene columnas`);
  const ws = libro.addWorksheet(nombre);
  const nCols = columnas.length;
  const formatoDe = (c: HojaExcel["columnas"][number]): FormatoColumna => c.formato ?? "texto";

  // Anchos y formato por columna (el de fecha/moneda se aplica a toda la columna: también a celdas nuevas).
  columnas.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.width ?? anchoPorDefecto(formatoDe(c));
  });

  // Fila 1: cliente. Fila 2: título · subtítulo · filtros.
  const fila1 = ws.getRow(1);
  fila1.getCell(1).value = opciones.tenant.nombre;
  fila1.getCell(1).font = { bold: true, size: 14 };
  const fila2 = ws.getRow(2);
  fila2.getCell(1).value = [hoja.titulo ?? hoja.nombre, hoja.subtitulo, textoFiltros(opciones.filtrosAplicados)].filter(Boolean).join("  ·  ");
  fila2.getCell(1).font = { italic: true, color: { argb: "FF475569" } };
  if (nCols > 1) {
    ws.mergeCells(1, 1, 1, nCols);
    ws.mergeCells(2, 1, 2, nCols);
  }

  // Fila 3: cabecera.
  const cabecera = ws.getRow(FILA_CABECERA);
  columnas.forEach((c, i) => {
    const celda = cabecera.getCell(i + 1);
    celda.value = c.header;
    estiloCabecera(celda);
  });
  cabecera.height = 22;

  // Datos.
  filas.forEach((fila, r) => {
    const row = ws.getRow(FILA_CABECERA + 1 + r);
    columnas.forEach((c, i) => {
      const formato = formatoDe(c);
      const bruto = typeof c.key === "function" ? c.key(fila) : fila[c.key];
      const celda = row.getCell(i + 1);
      celda.value = valorCelda(bruto, formato, zona);
      const numFmt = NUM_FMT[formato];
      if (numFmt) celda.numFmt = numFmt;
    });
  });

  // Totales: `SUM` real sobre el rango de datos. Sin filas no hay nada que sumar (y el rango apuntaría a la propia fila).
  const claveTotales = hoja.totales ?? [];
  if (claveTotales.length > 0 && filas.length > 0) {
    const primera = FILA_CABECERA + 1;
    const ultima = FILA_CABECERA + filas.length;
    const filaTotal = ws.getRow(ultima + 1);

    columnas.forEach((_, i) => {
      const celda = filaTotal.getCell(i + 1);
      celda.font = { bold: true, color: { argb: COLOR_HEADER_FG } };
      celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_TOTALS_BG } };
    });
    filaTotal.getCell(1).value = "TOTAL";

    for (const clave of claveTotales) {
      const idx = columnas.findIndex((c) => c.key === clave);
      if (idx < 0) throw new Error(`totales: la hoja "${hoja.nombre}" no tiene una columna con key "${String(clave)}"`);
      const formato = formatoDe(columnas[idx]);
      if (!FORMATOS_SUMABLES.includes(formato)) {
        throw new Error(`totales: la columna "${columnas[idx].header}" tiene formato "${formato}", que no se puede sumar`);
      }
      if (idx === 0) throw new Error(`totales: la primera columna de "${hoja.nombre}" lleva la etiqueta TOTAL, no puede sumarse`);

      const letra = ws.getColumn(idx + 1).letter;
      let suma = 0;
      for (let r = primera; r <= ultima; r++) {
        const v = ws.getCell(r, idx + 1).value;
        if (typeof v === "number") suma += v;
      }
      const celda = filaTotal.getCell(idx + 1);
      // `result` es solo el valor en caché para visores que no recalculan (vista previa, móvil); Excel recalcula la fórmula.
      celda.value = { formula: `SUM(${letra}${primera}:${letra}${ultima})`, result: suma };
      celda.numFmt = NUM_FMT[formato] ?? "General";
    }
  }

  ws.views = [{ state: "frozen", xSplit: 0, ySplit: FILA_CABECERA, topLeftCell: `A${FILA_CABECERA + 1}` }];
}
