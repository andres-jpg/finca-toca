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
} from "@/lib/cooperativa/informe-data";

// Colors (ARGB)
const COLOR_HEADER_BG = "FF0D9488"; // teal-600
const COLOR_HEADER_FG = "FFFFFFFF"; // white
const COLOR_SUMMARY_BG = "FFCCFBF1"; // teal-100
const COLOR_TOTALS_BG = "FF0F766E"; // teal-800
const COLOR_ROUTE_HDR_BG = "FF1E4E79"; // blue-900
const COLOR_GRAND_TOT_BG = "FF134E4A"; // teal-950
const FMT_COP = '"$"#,##0';

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

function buildWorkbookGeneral(
  informe: InformeGeneralData,
  dates: string[],
  isSameMonth: boolean,
): ExcelJS.Workbook {
  const wbGen = new ExcelJS.Workbook();
  wbGen.creator = "Toca Lácteos";
  const wsGen = wbGen.addWorksheet(informe.periodoLabel.slice(0, 31));

  wsGen.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

  const totalColsGen = 1 + dates.length + 5;
  const colPrecioBrutoG = totalColsGen - 2;
  const colDesFedeganG = totalColsGen - 1;
  const colPrecioNetoG = totalColsGen;
  const colTotalLitrosG = dates.length + 3;

  wsGen.getColumn(1).width = 28;
  for (let i = 2; i <= dates.length + 1; i++) wsGen.getColumn(i).width = isSameMonth ? 8 : 10;
  wsGen.getColumn(dates.length + 2).width = 12;
  wsGen.getColumn(dates.length + 3).width = 14;
  wsGen.getColumn(colPrecioBrutoG).width = 16;
  wsGen.getColumn(colDesFedeganG).width = 15;
  wsGen.getColumn(colPrecioNetoG).width = 14;

  const headerGen = [
    "Finca",
    ...informe.dayLabels,
    "Precio/L",
    "Total Litros",
    "Precio Bruto",
    "Des. Fedegan",
    "Precio Neto",
  ];
  const headerRowGen = wsGen.addRow(headerGen);
  headerRowGen.height = 20;
  headerRowGen.eachCell((cell) => styleHeader(cell));

  for (const ruta of informe.rutas) {
    const rutaHeaderRow = wsGen.addRow([`RUTA: ${ruta.nombre}`, ...Array(totalColsGen - 1).fill("")]);
    rutaHeaderRow.height = 22;
    wsGen.mergeCells(rutaHeaderRow.number, 1, rutaHeaderRow.number, totalColsGen);
    rutaHeaderRow.eachCell((cell) => styleRouteHeader(cell));

    for (const finca of ruta.filas) {
      const row = wsGen.addRow([
        finca.nombre,
        ...finca.dias,
        finca.precioLitro,
        finca.totalLitros,
        finca.precioBruto,
        finca.desFedegan,
        finca.precioNeto,
      ]);
      row.getCell(1).font = { bold: true };
      row.getCell(1).alignment = { vertical: "middle" };
      row.getCell(dates.length + 2).numFmt = FMT_COP;
      styleSummary(row.getCell(colPrecioBrutoG));
      styleSummary(row.getCell(colDesFedeganG));
      styleSummary(row.getCell(colPrecioNetoG));
    }

    const subtotalRow = wsGen.addRow([
      "Subtotal " + ruta.nombre,
      ...ruta.subtotales.dias,
      "",
      ruta.subtotales.totalLitros,
      ruta.subtotales.precioBruto,
      ruta.subtotales.desFedegan,
      ruta.subtotales.precioNeto,
    ]);
    subtotalRow.height = 18;
    subtotalRow.getCell(1).font = { bold: true };
    subtotalRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_SUMMARY_BG } };
    subtotalRow.getCell(1).alignment = { horizontal: "left" };
    for (let i = 2; i <= dates.length + 1; i++) styleTotal(subtotalRow.getCell(i));
    styleTotal(subtotalRow.getCell(colTotalLitrosG));
    styleTotal(subtotalRow.getCell(colPrecioBrutoG), true);
    styleTotal(subtotalRow.getCell(colDesFedeganG), true);
    styleTotal(subtotalRow.getCell(colPrecioNetoG), true);

    wsGen.addRow([]);
  }

  const g = informe.granTotales;
  const grandRow = wsGen.addRow(["TOTAL GENERAL", ...g.dias, "", g.totalLitros, g.precioBruto, g.desFedegan, g.precioNeto]);
  grandRow.height = 22;
  grandRow.getCell(1).font = { bold: true, color: { argb: COLOR_HEADER_FG }, size: 11 };
  grandRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_GRAND_TOT_BG } };
  grandRow.getCell(1).alignment = { horizontal: "left" };
  for (let i = 2; i <= dates.length + 1; i++) styleGrandTotal(grandRow.getCell(i));
  styleGrandTotal(grandRow.getCell(colTotalLitrosG));
  styleGrandTotal(grandRow.getCell(colPrecioBrutoG), true);
  styleGrandTotal(grandRow.getCell(colDesFedeganG), true);
  styleGrandTotal(grandRow.getCell(colPrecioNetoG), true);

  return wbGen;
}

function buildWorkbookItinerario(
  informe: InformeItinerarioData,
  dates: string[],
  isSameMonth: boolean,
): ExcelJS.Workbook {
  const wbIt = new ExcelJS.Workbook();
  wbIt.creator = "Toca Lácteos";
  const wsIt = wbIt.addWorksheet(informe.periodoLabel.slice(0, 31));

  const totalColsIt = 2 + dates.length + 5;
  const colPrecioBrutoIt = totalColsIt - 2;
  const colDesFedeganIt = totalColsIt - 1;
  const colPrecioNetoIt = totalColsIt;
  const colTotalLitrosIt = dates.length + 4;

  wsIt.getColumn(1).width = 26;
  wsIt.getColumn(2).width = 20;
  for (let i = 3; i <= dates.length + 2; i++) wsIt.getColumn(i).width = isSameMonth ? 8 : 10;
  wsIt.getColumn(dates.length + 3).width = 12;
  wsIt.getColumn(dates.length + 4).width = 14;
  wsIt.getColumn(colPrecioBrutoIt).width = 16;
  wsIt.getColumn(colDesFedeganIt).width = 15;
  wsIt.getColumn(colPrecioNetoIt).width = 14;

  const conductorRow = wsIt.addRow(["CONDUCTOR", informe.conductorName ?? "", ...Array(totalColsIt - 2).fill("")]);
  wsIt.mergeCells(1, 2, 1, totalColsIt);
  conductorRow.height = 22;
  conductorRow.getCell(1).font = { bold: true };
  conductorRow.getCell(1).alignment = { vertical: "middle" };
  conductorRow.getCell(2).font = { bold: true, size: 12 };
  conductorRow.getCell(2).alignment = { vertical: "middle", horizontal: "left" };

  wsIt.views = [{ state: "frozen", xSplit: 0, ySplit: 2 }];

  const headerIt = [
    "Finca",
    "Ruta",
    ...informe.dayLabels,
    "Precio/L",
    "Total Litros",
    "Precio Bruto",
    "Des. Fedegan",
    "Precio Neto",
  ];
  const headerRowIt = wsIt.addRow(headerIt);
  headerRowIt.height = 20;
  headerRowIt.eachCell((cell) => styleHeader(cell));

  for (const finca of informe.filas) {
    const row = wsIt.addRow([
      finca.nombre,
      finca.rutaNombre ?? "",
      ...finca.dias,
      finca.precioLitro,
      finca.totalLitros,
      finca.precioBruto,
      finca.desFedegan,
      finca.precioNeto,
    ]);
    row.getCell(1).font = { bold: true };
    row.getCell(1).alignment = { vertical: "middle" };
    row.getCell(dates.length + 3).numFmt = FMT_COP;
    styleSummary(row.getCell(colPrecioBrutoIt));
    styleSummary(row.getCell(colDesFedeganIt));
    styleSummary(row.getCell(colPrecioNetoIt));
  }

  const t = informe.totales;
  const totalsRowIt = wsIt.addRow(["TOTAL", "", ...t.dias, "", t.totalLitros, t.precioBruto, t.desFedegan, t.precioNeto]);
  totalsRowIt.height = 20;
  totalsRowIt.getCell(1).font = { bold: true, color: { argb: COLOR_HEADER_FG } };
  totalsRowIt.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_TOTALS_BG } };
  totalsRowIt.getCell(1).alignment = { horizontal: "left" };
  totalsRowIt.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_TOTALS_BG } };
  for (let i = 3; i <= dates.length + 2; i++) styleTotal(totalsRowIt.getCell(i));
  styleTotal(totalsRowIt.getCell(colTotalLitrosIt));
  styleTotal(totalsRowIt.getCell(colPrecioBrutoIt), true);
  styleTotal(totalsRowIt.getCell(colDesFedeganIt), true);
  styleTotal(totalsRowIt.getCell(colPrecioNetoIt), true);

  return wbIt;
}

function buildWorkbookSimple(
  informe: InformeSimpleData,
  dates: string[],
  isSameMonth: boolean,
): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Toca Lácteos";
  const ws = workbook.addWorksheet(informe.periodoLabel.slice(0, 31));

  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

  const totalCols = 1 + dates.length + 5;
  const colPrecioBruto = totalCols - 2;
  const colDesFedegan = totalCols - 1;
  const colPrecioNeto = totalCols;
  const colTotalLitros = dates.length + 3;

  ws.getColumn(1).width = 26;
  for (let i = 2; i <= dates.length + 1; i++) ws.getColumn(i).width = isSameMonth ? 8 : 10;
  ws.getColumn(dates.length + 2).width = 12;
  ws.getColumn(dates.length + 3).width = 14;
  ws.getColumn(colPrecioBruto).width = 16;
  ws.getColumn(colDesFedegan).width = 15;
  ws.getColumn(colPrecioNeto).width = 14;

  const header = [
    "Finca",
    ...informe.dayLabels,
    "Precio/L",
    "Total Litros",
    "Precio Bruto",
    "Des. Fedegan",
    "Precio Neto",
  ];
  const headerRow = ws.addRow(header);
  headerRow.height = 20;
  headerRow.eachCell((cell) => styleHeader(cell));

  for (const finca of informe.filas) {
    const row = ws.addRow([
      finca.nombre,
      ...finca.dias,
      finca.precioLitro,
      finca.totalLitros,
      finca.precioBruto,
      finca.desFedegan,
      finca.precioNeto,
    ]);
    row.getCell(1).font = { bold: true };
    row.getCell(1).alignment = { vertical: "middle" };
    row.getCell(dates.length + 2).numFmt = FMT_COP;
    styleSummary(row.getCell(colPrecioBruto));
    styleSummary(row.getCell(colDesFedegan));
    styleSummary(row.getCell(colPrecioNeto));
  }

  const t = informe.totales;
  const totalsRow = ws.addRow(["TOTAL", ...t.dias, "", t.totalLitros, t.precioBruto, t.desFedegan, t.precioNeto]);
  totalsRow.height = 20;
  totalsRow.getCell(1).font = { bold: true, color: { argb: COLOR_HEADER_FG } };
  totalsRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_TOTALS_BG } };
  totalsRow.getCell(1).alignment = { horizontal: "left" };
  for (let i = 2; i <= dates.length + 1; i++) styleTotal(totalsRow.getCell(i));
  styleTotal(totalsRow.getCell(colTotalLitros));
  styleTotal(totalsRow.getCell(colPrecioBruto), true);
  styleTotal(totalsRow.getCell(colDesFedegan), true);
  styleTotal(totalsRow.getCell(colPrecioNeto), true);

  return workbook;
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

  if (informe.kind === "general") {
    const wbGen = buildWorkbookGeneral(informe, dates, isSameMonth);
    const bufferGen = await wbGen.xlsx.writeBuffer();
    const filenameGen =
      quincena && mes !== undefined && anio !== undefined
        ? `informe_general_Q${quincena}_${MESES[mes - 1]}_${anio}.xlsx`
        : `informe_general_${startDate}_${endDate}.xlsx`;
    return new Response(bufferGen as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filenameGen}"`,
      },
    });
  }

  if (informe.kind === "itinerario") {
    const wbIt = buildWorkbookItinerario(informe, dates, isSameMonth);
    const bufferIt = await wbIt.xlsx.writeBuffer();
    const filenameIt =
      quincena && mes !== undefined && anio !== undefined
        ? `informe_Q${quincena}_${MESES[mes - 1]}_${anio}_${informe.itinerarioNombre ?? id}.xlsx`
        : `informe_${startDate}_${endDate}_${informe.itinerarioNombre ?? id}.xlsx`;
    return new Response(bufferIt as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filenameIt}"`,
      },
    });
  }

  const workbook = buildWorkbookSimple(informe, dates, isSameMonth);
  const buffer = await workbook.xlsx.writeBuffer();
  const filename =
    quincena && mes !== undefined && anio !== undefined
      ? `informe_Q${quincena}_${MESES[mes - 1]}_${anio}.xlsx`
      : `informe_${startDate}_${endDate}.xlsx`;

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
