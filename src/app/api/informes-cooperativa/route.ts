import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/get-user-role";
import { MESES } from "@/lib/cooperativa/recolecciones";
import {
  buildInformeData,
  resolveInformePeriodo,
  informeQuerySchema,
  InformeDataError,
  type InformeGeneralData,
  type InformeItinerarioData,
  type InformeSimpleData,
  type InformeFilaSimple,
} from "@/lib/cooperativa/informe-data";

// Colors (ARGB)
const COLOR_HEADER_BG = "FF0D9488"; // teal-600
const COLOR_HEADER_FG = "FFFFFFFF"; // white
const COLOR_SUMMARY_BG = "FFCCFBF1"; // teal-100
const COLOR_TOTALS_BG = "FF0F766E"; // teal-800
const COLOR_ROUTE_HDR_BG = "FF1E4E79"; // blue-900
const COLOR_GRAND_TOT_BG = "FF134E4A"; // teal-950
const FMT_COP = '"$"#,##0';

function colLetter(col: number): string {
  let s = "";
  while (col > 0) {
    const rem = (col - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    col = Math.floor((col - 1) / 26);
  }
  return s;
}

function styleHeader(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: COLOR_HEADER_FG } };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLOR_HEADER_BG },
  };
  cell.alignment = { vertical: "middle", horizontal: "center" };
}

function styleSummary(cell: ExcelJS.Cell) {
  cell.font = { bold: true };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLOR_SUMMARY_BG },
  };
  cell.alignment = { horizontal: "right" };
  cell.numFmt = FMT_COP;
}

function styleTotal(cell: ExcelJS.Cell, isCurrency = false) {
  cell.font = { bold: true, color: { argb: COLOR_HEADER_FG } };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLOR_TOTALS_BG },
  };
  cell.alignment = { horizontal: "right" };
  if (isCurrency) cell.numFmt = FMT_COP;
}

function styleRouteHeader(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: COLOR_HEADER_FG }, size: 11 };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLOR_ROUTE_HDR_BG },
  };
  cell.alignment = { vertical: "middle", horizontal: "left" };
}

function styleGrandTotal(cell: ExcelJS.Cell, isCurrency = false) {
  cell.font = { bold: true, color: { argb: COLOR_HEADER_FG }, size: 11 };
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLOR_GRAND_TOT_BG },
  };
  cell.alignment = { horizontal: "right" };
  if (isCurrency) cell.numFmt = FMT_COP;
}

// Layout de columnas de la Hoja 1 (resumen). "Ruta" solo aplica al tipo itinerario
// (una finca puede pertenecer a distintas rutas dentro de un mismo itinerario);
// finca/ruta/general no la necesitan porque el contexto ya es una única ruta o
// está agrupado por secciones de ruta.
type ColLayout = {
  colId: number;
  colFinca: number;
  colRuta: number | null;
  firstDayCol: number;
  lastDayCol: number;
  colPrecioL: number;
  colTotalLitros: number;
  colPrecioBruto: number;
  colDesFedegan: number;
  colDescuentoAlmacen: number;
  colPrecioNeto: number;
  totalCols: number;
};

function computeColLayout(numDates: number, hasRutaCol: boolean): ColLayout {
  const colId = 1;
  const colFinca = 2;
  const colRuta = hasRutaCol ? 3 : null;
  const firstDayCol = hasRutaCol ? 4 : 3;
  const lastDayCol = firstDayCol + numDates - 1;
  const colPrecioL = lastDayCol + 1;
  const colTotalLitros = colPrecioL + 1;
  const colPrecioBruto = colTotalLitros + 1;
  const colDesFedegan = colPrecioBruto + 1;
  const colDescuentoAlmacen = colDesFedegan + 1;
  const colPrecioNeto = colDescuentoAlmacen + 1;
  return {
    colId,
    colFinca,
    colRuta,
    firstDayCol,
    lastDayCol,
    colPrecioL,
    colTotalLitros,
    colPrecioBruto,
    colDesFedegan,
    colDescuentoAlmacen,
    colPrecioNeto,
    totalCols: colPrecioNeto,
  };
}

function setColumnWidths(ws: ExcelJS.Worksheet, layout: ColLayout, isSameMonth: boolean) {
  ws.getColumn(layout.colId).width = 6;
  ws.getColumn(layout.colFinca).width = 28;
  if (layout.colRuta) ws.getColumn(layout.colRuta).width = 20;
  for (let c = layout.firstDayCol; c <= layout.lastDayCol; c++) ws.getColumn(c).width = isSameMonth ? 8 : 10;
  ws.getColumn(layout.colPrecioL).width = 12;
  ws.getColumn(layout.colTotalLitros).width = 14;
  ws.getColumn(layout.colPrecioBruto).width = 16;
  ws.getColumn(layout.colDesFedegan).width = 15;
  ws.getColumn(layout.colDescuentoAlmacen).width = 16;
  ws.getColumn(layout.colPrecioNeto).width = 14;
}

// Título (finca/ruta/itinerario) + período generado, arriba a la izquierda — Hoja 1,
// filas 1-2 fusionadas en las columnas ID+Finca. La Hoja 2 referencia $A$2 de esta
// hoja para el período de cada comprobante.
function writeTituloPeriodo(ws: ExcelJS.Worksheet, titulo: string, periodoLabel: string) {
  ws.mergeCells(1, 1, 1, 2);
  const tituloCell = ws.getRow(1).getCell(1);
  tituloCell.value = titulo;
  styleHeader(tituloCell);
  styleHeader(ws.getRow(1).getCell(2));

  ws.mergeCells(2, 1, 2, 2);
  const periodoCell = ws.getRow(2).getCell(1);
  periodoCell.value = periodoLabel;
  styleHeader(periodoCell);
  styleHeader(ws.getRow(2).getCell(2));
}

function writeHeaderRow(
  ws: ExcelJS.Worksheet,
  layout: ColLayout,
  dayLabels: (number | string)[],
  hasRutaCol: boolean,
) {
  const row = ws.getRow(3);
  row.height = 20;
  row.getCell(layout.colId).value = "ID";
  row.getCell(layout.colFinca).value = "Finca";
  if (hasRutaCol && layout.colRuta) row.getCell(layout.colRuta).value = "Ruta";
  dayLabels.forEach((d, i) => {
    row.getCell(layout.firstDayCol + i).value = d;
  });
  row.getCell(layout.colPrecioL).value = "Precio/L";
  row.getCell(layout.colTotalLitros).value = "Total Litros";
  row.getCell(layout.colPrecioBruto).value = "Precio Bruto";
  row.getCell(layout.colDesFedegan).value = "Des. Fedegan";
  row.getCell(layout.colDescuentoAlmacen).value = "Descuento almacén";
  row.getCell(layout.colPrecioNeto).value = "Precio Neto";
  for (let c = 1; c <= layout.totalCols; c++) styleHeader(row.getCell(c));
}

// Escribe una fila de finca. Solo los días y "Descuento almacén" son datos crudos
// editables; Total Litros/Precio Bruto/Des. Fedegan/Precio Neto son fórmulas que se
// recalculan solas si se corrige un litro a mano (criterio de aceptación FIN-71).
function writeFilaFinca(
  ws: ExcelJS.Worksheet,
  layout: ColLayout,
  rowNum: number,
  id: number,
  fila: InformeFilaSimple,
  rutaNombre?: string | null,
) {
  const row = ws.getRow(rowNum);
  row.getCell(layout.colId).value = id;

  const cFinca = row.getCell(layout.colFinca);
  cFinca.value = fila.nombre;
  cFinca.font = { bold: true };
  cFinca.alignment = { vertical: "middle" };

  if (layout.colRuta) row.getCell(layout.colRuta).value = rutaNombre ?? "";

  fila.dias.forEach((v, i) => {
    row.getCell(layout.firstDayCol + i).value = v;
  });

  const lPrecioL = colLetter(layout.colPrecioL);
  const lTotalLitros = colLetter(layout.colTotalLitros);
  const lPrecioBruto = colLetter(layout.colPrecioBruto);
  const lDesFedegan = colLetter(layout.colDesFedegan);
  const lDescuentoAlmacen = colLetter(layout.colDescuentoAlmacen);
  const lDayFrom = colLetter(layout.firstDayCol);
  const lDayTo = colLetter(layout.lastDayCol);

  const cPrecioL = row.getCell(layout.colPrecioL);
  cPrecioL.value = fila.precioLitro;
  cPrecioL.numFmt = FMT_COP;

  row.getCell(layout.colTotalLitros).value = { formula: `SUM(${lDayFrom}${rowNum}:${lDayTo}${rowNum})` };

  const cBruto = row.getCell(layout.colPrecioBruto);
  cBruto.value = { formula: `${lPrecioL}${rowNum}*${lTotalLitros}${rowNum}` };
  styleSummary(cBruto);

  const cFedegan = row.getCell(layout.colDesFedegan);
  cFedegan.value = { formula: `${lPrecioBruto}${rowNum}*${fila.fedeganPct}` };
  styleSummary(cFedegan);

  const cDescuento = row.getCell(layout.colDescuentoAlmacen);
  cDescuento.value = 0;
  styleSummary(cDescuento);

  const cNeto = row.getCell(layout.colPrecioNeto);
  cNeto.value = { formula: `${lPrecioBruto}${rowNum}-${lDesFedegan}${rowNum}-${lDescuentoAlmacen}${rowNum}` };
  styleSummary(cNeto);
}

function rangeFormula(from: number, to: number) {
  return (col: number) => `SUM(${colLetter(col)}${from}:${colLetter(col)}${to})`;
}

function rowsFormula(rows: number[]) {
  return (col: number) => `SUM(${rows.map((r) => `${colLetter(col)}${r}`).join(",")})`;
}

// Fila de TOTAL / Subtotal por ruta / TOTAL GENERAL — siempre fórmulas (SUM sobre el
// rango de filas de datos, o sobre las filas de subtotal para el gran total).
function writeSummaryRow(
  ws: ExcelJS.Worksheet,
  layout: ColLayout,
  rowNum: number,
  label: string,
  formulaForCol: (col: number) => string,
  tier: "total" | "subtotal" | "grand-total",
  hasRutaCol: boolean,
) {
  const row = ws.getRow(rowNum);
  row.height = tier === "subtotal" ? 18 : 20;

  const applyTierStyle = (cell: ExcelJS.Cell, isCurrency: boolean) => {
    if (tier === "grand-total") styleGrandTotal(cell, isCurrency);
    else styleTotal(cell, isCurrency);
  };

  const labelCols = hasRutaCol && layout.colRuta
    ? [layout.colId, layout.colFinca, layout.colRuta]
    : [layout.colId, layout.colFinca];
  labelCols.forEach((c) => {
    const cell = row.getCell(c);
    if (tier === "subtotal") {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_SUMMARY_BG } };
    } else {
      applyTierStyle(cell, false);
    }
    cell.alignment = { horizontal: "left" };
  });
  row.getCell(layout.colFinca).value = label;

  for (let c = layout.firstDayCol; c <= layout.lastDayCol; c++) {
    const cell = row.getCell(c);
    cell.value = { formula: formulaForCol(c) };
    applyTierStyle(cell, false);
  }

  const cPrecioL = row.getCell(layout.colPrecioL);
  cPrecioL.value = "";
  applyTierStyle(cPrecioL, false);

  const moneyCols: [number, boolean][] = [
    [layout.colTotalLitros, false],
    [layout.colPrecioBruto, true],
    [layout.colDesFedegan, true],
    [layout.colDescuentoAlmacen, true],
    [layout.colPrecioNeto, true],
  ];
  moneyCols.forEach(([c, isCurrency]) => {
    const cell = row.getCell(c);
    cell.value = { formula: formulaForCol(c) };
    applyTierStyle(cell, isCurrency);
  });
}

function buildSheet1Simple(
  wb: ExcelJS.Workbook,
  informe: InformeSimpleData,
  dates: string[],
  isSameMonth: boolean,
): { ws: ExcelJS.Worksheet; voucherRows: VoucherRowInfo[]; layout: ColLayout } {
  const layout = computeColLayout(dates.length, false);
  const ws = wb.addWorksheet(informe.periodoLabel.slice(0, 31));
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 3, topLeftCell: "A4" }];

  setColumnWidths(ws, layout, isSameMonth);
  writeTituloPeriodo(ws, informe.titulo, informe.periodoLabel);
  writeHeaderRow(ws, layout, informe.dayLabels, false);

  const voucherRows: VoucherRowInfo[] = [];
  let rowNum = 4;
  informe.filas.forEach((fila, idx) => {
    writeFilaFinca(ws, layout, rowNum, idx + 1, fila);
    voucherRows.push({ row: rowNum, hasFedegan: fila.fedeganPct > 0 });
    rowNum++;
  });

  if (informe.filas.length > 0) {
    writeSummaryRow(ws, layout, rowNum, "TOTAL", rangeFormula(4, rowNum - 1), "total", false);
  }

  return { ws, voucherRows, layout };
}

function buildSheet1Itinerario(
  wb: ExcelJS.Workbook,
  informe: InformeItinerarioData,
  dates: string[],
  isSameMonth: boolean,
): { ws: ExcelJS.Worksheet; voucherRows: VoucherRowInfo[]; layout: ColLayout } {
  const layout = computeColLayout(dates.length, true);
  const ws = wb.addWorksheet(informe.periodoLabel.slice(0, 31));
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 3, topLeftCell: "A4" }];

  setColumnWidths(ws, layout, isSameMonth);
  const titulo = informe.itinerarioNombre ?? "Itinerario";
  const periodoTexto = informe.conductorName
    ? `${informe.periodoLabel} · Conductor: ${informe.conductorName}`
    : informe.periodoLabel;
  writeTituloPeriodo(ws, titulo, periodoTexto);
  writeHeaderRow(ws, layout, informe.dayLabels, true);

  const voucherRows: VoucherRowInfo[] = [];
  let rowNum = 4;
  informe.filas.forEach((fila, idx) => {
    writeFilaFinca(ws, layout, rowNum, idx + 1, fila, fila.rutaNombre);
    voucherRows.push({ row: rowNum, hasFedegan: fila.fedeganPct > 0 });
    rowNum++;
  });

  if (informe.filas.length > 0) {
    writeSummaryRow(ws, layout, rowNum, "TOTAL", rangeFormula(4, rowNum - 1), "total", true);
  }

  return { ws, voucherRows, layout };
}

function buildSheet1General(
  wb: ExcelJS.Workbook,
  informe: InformeGeneralData,
  dates: string[],
  isSameMonth: boolean,
): { ws: ExcelJS.Worksheet; voucherRows: VoucherRowInfo[]; layout: ColLayout } {
  const layout = computeColLayout(dates.length, false);
  const ws = wb.addWorksheet(informe.periodoLabel.slice(0, 31));
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 3, topLeftCell: "A4" }];

  setColumnWidths(ws, layout, isSameMonth);
  writeTituloPeriodo(ws, "INFORME GENERAL", informe.periodoLabel);
  writeHeaderRow(ws, layout, informe.dayLabels, false);

  const voucherRows: VoucherRowInfo[] = [];
  const subtotalRows: number[] = [];
  let rowNum = 4;
  let globalId = 1;

  for (const ruta of informe.rutas) {
    ws.mergeCells(rowNum, 1, rowNum, layout.totalCols);
    const headerRow = ws.getRow(rowNum);
    headerRow.height = 22;
    headerRow.getCell(1).value = `RUTA: ${ruta.nombre}`;
    for (let c = 1; c <= layout.totalCols; c++) styleRouteHeader(headerRow.getCell(c));
    rowNum++;

    const dataFrom = rowNum;
    for (const fila of ruta.filas) {
      writeFilaFinca(ws, layout, rowNum, globalId, fila);
      voucherRows.push({ row: rowNum, hasFedegan: fila.fedeganPct > 0 });
      globalId++;
      rowNum++;
    }
    const dataTo = rowNum - 1;

    writeSummaryRow(ws, layout, rowNum, `Subtotal ${ruta.nombre}`, rangeFormula(dataFrom, dataTo), "subtotal", false);
    subtotalRows.push(rowNum);
    rowNum++;

    rowNum++; // fila en blanco de separación entre rutas
  }

  if (subtotalRows.length > 0) {
    writeSummaryRow(ws, layout, rowNum, "TOTAL GENERAL", rowsFormula(subtotalRows), "grand-total", false);
  }

  return { ws, voucherRows, layout };
}

// --- Hoja 2: comprobantes de pago ---
// Grilla compacta de 7 comprobantes por franja horizontal x 10 filas cada uno, sin
// separación entre franjas. Cada comprobante se alimenta con fórmulas que referencian
// la Hoja 1 directamente, así que un descuento de almacén o litro corregido en la
// Hoja 1 también actualiza el comprobante sin regenerar el informe.
const VOUCHER_ROWS = 10;
const VOUCHERS_PER_BAND = 7;
const COL_WIDTH = 14;
const VOUCHER_ROW_HEIGHT = 25;
const LITROS_FMT = "#,##0";
const VOUCHER_FONT_NAME = "Calibri";
const VOUCHER_FONT_SIZE = 14;
const VOUCHER_FONT = { name: VOUCHER_FONT_NAME, size: VOUCHER_FONT_SIZE } as const;
const LABEL_FONT = {
  name: VOUCHER_FONT_NAME,
  size: VOUCHER_FONT_SIZE,
  italic: true,
  color: { argb: "FF666666" },
} as const;

// Filas del desprendible que llevan borde grueso: Consecutivo, Finca, Periodo
// (las tres primeras) y Total / valor neto a pagar (la última).
const THICK_BORDER_ROW_OFFSETS = [0, 1, 2, VOUCHER_ROWS - 1];

type Sheet1ColRefs = {
  lId: string;
  lFinca: string;
  lTotalLitros: string;
  lPrecioBruto: string;
  lDesFedegan: string;
  lDescuentoAlmacen: string;
};

// Rutas exentas de descuento Fedegan (Centro Arriba, Centro Arriba II, Tuaneca —
// ver lib/cooperativa/fedegan.ts) no muestran la fila "Fedegan" en su comprobante,
// ya que el valor siempre sería 0.
type VoucherRowInfo = { row: number; hasFedegan: boolean };

function writeVoucher(
  ws: ExcelJS.Worksheet,
  rowStart: number,
  colValue: number,
  colLabel: number,
  sheet1Name: string,
  sheet1Row: number,
  cols: Sheet1ColRefs,
  hasFedegan: boolean,
) {
  const ref = (cellAddr: string) => `'${sheet1Name}'!${cellAddr}`;
  const cell = (r: number, c: number) => ws.getRow(r).getCell(c);
  const addr = (r: number, c: number) => `${colLetter(c)}${r}`;

  const mergedCell = (rOffset: number) => {
    const r = rowStart + rOffset;
    ws.mergeCells(r, colValue, r, colLabel);
    return cell(r, colValue);
  };

  const idCell = mergedCell(0);
  idCell.value = { formula: ref(`${cols.lId}${sheet1Row}`) };
  idCell.font = VOUCHER_FONT;
  idCell.alignment = { horizontal: "center", vertical: "middle" };

  const fincaCell = mergedCell(1);
  fincaCell.value = { formula: ref(`${cols.lFinca}${sheet1Row}`) };
  fincaCell.font = { ...VOUCHER_FONT, bold: true };
  fincaCell.alignment = { horizontal: "center", vertical: "middle" };

  const periodoCell = mergedCell(2);
  periodoCell.value = { formula: ref("$A$2") };
  periodoCell.font = { ...VOUCHER_FONT, color: { argb: "FF555555" } };
  periodoCell.alignment = { horizontal: "center", vertical: "middle" };

  const rLitros = rowStart + 3;
  const litrosCell = cell(rLitros, colValue);
  litrosCell.value = { formula: ref(`${cols.lTotalLitros}${sheet1Row}`) };
  litrosCell.numFmt = LITROS_FMT;
  litrosCell.font = VOUCHER_FONT;
  litrosCell.alignment = { horizontal: "right" };
  const litrosLabel = cell(rLitros, colLabel);
  litrosLabel.value = "Ltrs";
  litrosLabel.font = LABEL_FONT;

  const rBruto = rowStart + 4;
  const brutoCell = cell(rBruto, colValue);
  brutoCell.value = { formula: ref(`${cols.lPrecioBruto}${sheet1Row}`) };
  brutoCell.numFmt = FMT_COP;
  brutoCell.font = VOUCHER_FONT;
  brutoCell.alignment = { horizontal: "right" };

  const rDescuento = rowStart + 5;
  const descuentoCell = cell(rDescuento, colValue);
  descuentoCell.value = { formula: ref(`${cols.lDescuentoAlmacen}${sheet1Row}`) };
  descuentoCell.numFmt = FMT_COP;
  descuentoCell.font = VOUCHER_FONT;
  descuentoCell.alignment = { horizontal: "right" };
  const descuentoLabel = cell(rDescuento, colLabel);
  descuentoLabel.value = "Descuento";
  descuentoLabel.font = LABEL_FONT;

  const rSubtotal = rowStart + 6;
  const subtotalCell = cell(rSubtotal, colValue);
  subtotalCell.value = { formula: `${addr(rBruto, colValue)}-${addr(rDescuento, colValue)}` };
  subtotalCell.numFmt = FMT_COP;
  subtotalCell.font = VOUCHER_FONT;
  subtotalCell.alignment = { horizontal: "right" };

  // Rutas exentas (hasFedegan = false) dejan esta fila en blanco por completo —
  // ni etiqueta ni valor — en vez de mostrar un descuento que siempre sería 0.
  const rFedegan = rowStart + 7;
  if (hasFedegan) {
    const fedeganCell = cell(rFedegan, colValue);
    fedeganCell.value = { formula: ref(`${cols.lDesFedegan}${sheet1Row}`) };
    fedeganCell.numFmt = FMT_COP;
    fedeganCell.font = VOUCHER_FONT;
    fedeganCell.alignment = { horizontal: "right" };
    const fedeganLabel = cell(rFedegan, colLabel);
    fedeganLabel.value = "Fedegan";
    fedeganLabel.font = LABEL_FONT;
  }

  const rSaldo = rowStart + 8;
  const saldoCell = cell(rSaldo, colValue);
  saldoCell.value = 0;
  saldoCell.numFmt = FMT_COP;
  saldoCell.font = VOUCHER_FONT;
  saldoCell.alignment = { horizontal: "right" };
  const saldoLabel = cell(rSaldo, colLabel);
  saldoLabel.value = "Sald. Ant.";
  saldoLabel.font = LABEL_FONT;

  const rTotal = rowStart + 9;
  const totalCell = cell(rTotal, colValue);
  const fedeganTerm = hasFedegan ? `-${addr(rFedegan, colValue)}` : "";
  totalCell.value = { formula: `${addr(rSubtotal, colValue)}${fedeganTerm}-${addr(rSaldo, colValue)}` };
  totalCell.numFmt = FMT_COP;
  totalCell.font = { ...VOUCHER_FONT, bold: true };
  totalCell.alignment = { horizontal: "right" };
  const totalLabel = cell(rTotal, colLabel);
  totalLabel.value = "Total";
  totalLabel.font = { ...VOUCHER_FONT, bold: true };

  // Recuadro fino alrededor de todo el comprobante.
  const rowEnd = rowStart + VOUCHER_ROWS - 1;
  for (let r = rowStart; r <= rowEnd; r++) {
    for (let c = colValue; c <= colLabel; c++) {
      const existing = ws.getRow(r).getCell(c).border ?? {};
      const b: Partial<ExcelJS.Borders> = { ...existing };
      if (r === rowStart) b.top = { style: "thin" };
      if (r === rowEnd) b.bottom = { style: "thin" };
      if (c === colValue) b.left = { style: "thin" };
      if (c === colLabel) b.right = { style: "thin" };
      ws.getRow(r).getCell(c).border = b;
    }
  }

  // Borde grueso en Consecutivo, Finca, Periodo y Total (valor neto a pagar).
  THICK_BORDER_ROW_OFFSETS.forEach((rOffset) => {
    const r = rowStart + rOffset;
    for (let c = colValue; c <= colLabel; c++) {
      const existing = ws.getRow(r).getCell(c).border ?? {};
      const b: Partial<ExcelJS.Borders> = { ...existing, top: { style: "thick" }, bottom: { style: "thick" } };
      if (c === colValue) b.left = { style: "thick" };
      if (c === colLabel) b.right = { style: "thick" };
      ws.getRow(r).getCell(c).border = b;
    }
  });
}

function buildSheet2Comprobantes(
  wb: ExcelJS.Workbook,
  sheet1Name: string,
  voucherRows: VoucherRowInfo[],
  layout: ColLayout,
  periodoLabel: string,
) {
  const sheetName = `Comprobantes ${periodoLabel}`.slice(0, 31);
  const ws = wb.addWorksheet(sheetName);
  ws.pageSetup.paperSize = 9;
  ws.pageSetup.orientation = "landscape";
  ws.pageSetup.fitToPage = false;

  for (let slot = 0; slot < VOUCHERS_PER_BAND; slot++) {
    const colValue = slot * 2 + 1;
    const colLabel = colValue + 1;
    ws.getColumn(colValue).width = COL_WIDTH;
    ws.getColumn(colLabel).width = COL_WIDTH;
  }

  const cols: Sheet1ColRefs = {
    lId: colLetter(layout.colId),
    lFinca: colLetter(layout.colFinca),
    lTotalLitros: colLetter(layout.colTotalLitros),
    lPrecioBruto: colLetter(layout.colPrecioBruto),
    lDesFedegan: colLetter(layout.colDesFedegan),
    lDescuentoAlmacen: colLetter(layout.colDescuentoAlmacen),
  };

  voucherRows.forEach(({ row: sheet1Row, hasFedegan }, idx) => {
    const band = Math.floor(idx / VOUCHERS_PER_BAND);
    const slot = idx % VOUCHERS_PER_BAND;
    const rowStart = band * VOUCHER_ROWS + 1;
    const colValue = slot * 2 + 1;
    const colLabel = colValue + 1;
    writeVoucher(ws, rowStart, colValue, colLabel, sheet1Name, sheet1Row, cols, hasFedegan);
  });

  const totalRows = Math.ceil(voucherRows.length / VOUCHERS_PER_BAND) * VOUCHER_ROWS;
  for (let r = 1; r <= totalRows; r++) ws.getRow(r).height = VOUCHER_ROW_HEIGHT;
}

export async function GET(req: NextRequest) {
  // Auth
  const role = await getUserRole();
  if (!role || !["cooperativa_admin"].includes(role)) {
    return new Response("No autorizado", { status: 401 });
  }

  // Params
  const { searchParams } = req.nextUrl;
  const parsed = informeQuerySchema.safeParse({
    tipo: searchParams.get("tipo"),
    id: searchParams.get("id") ?? undefined,
    quincena: searchParams.get("quincena") ?? undefined,
    mes: searchParams.get("mes") ?? undefined,
    anio: searchParams.get("anio") ?? undefined,
    fechaDesde: searchParams.get("fechaDesde") ?? undefined,
    fechaHasta: searchParams.get("fechaHasta") ?? undefined,
  });

  if (!parsed.success) {
    return new Response("Parámetros inválidos", { status: 400 });
  }

  const { tipo, id, quincena, mes, anio, fechaDesde, fechaHasta } = parsed.data;

  const periodo = resolveInformePeriodo({ quincena, mes, anio, fechaDesde, fechaHasta });
  const { startDate, endDate, isSameMonth, dates } = periodo;

  const supabase = await createClient();

  let informe;
  try {
    informe = await buildInformeData(supabase, tipo, id, periodo);
  } catch (err) {
    if (err instanceof InformeDataError) {
      return new Response(err.message, { status: err.status });
    }
    throw err;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Toca Lácteos";

  const built =
    informe.kind === "general"
      ? buildSheet1General(wb, informe, dates, isSameMonth)
      : informe.kind === "itinerario"
        ? buildSheet1Itinerario(wb, informe, dates, isSameMonth)
        : buildSheet1Simple(wb, informe, dates, isSameMonth);

  buildSheet2Comprobantes(wb, built.ws.name, built.voucherRows, built.layout, informe.periodoLabel);

  const buffer = await wb.xlsx.writeBuffer();

  let filename: string;
  if (informe.kind === "general") {
    filename =
      quincena && mes !== undefined && anio !== undefined
        ? `informe_general_Q${quincena}_${MESES[mes - 1]}_${anio}.xlsx`
        : `informe_general_${startDate}_${endDate}.xlsx`;
  } else if (informe.kind === "itinerario") {
    filename =
      quincena && mes !== undefined && anio !== undefined
        ? `informe_Q${quincena}_${MESES[mes - 1]}_${anio}_${informe.itinerarioNombre ?? id}.xlsx`
        : `informe_${startDate}_${endDate}_${informe.itinerarioNombre ?? id}.xlsx`;
  } else {
    filename =
      quincena && mes !== undefined && anio !== undefined
        ? `informe_Q${quincena}_${MESES[mes - 1]}_${anio}.xlsx`
        : `informe_${startDate}_${endDate}.xlsx`;
  }

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
