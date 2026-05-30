import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/get-user-role";

const querySchema = z.object({
  tipo: z.enum(["finca", "ruta", "general"]),
  id: z.coerce.number().int().positive().optional(),
  mes: z.coerce.number().int().min(1).max(12),
  anio: z.coerce.number().int().min(2000).max(2100),
  quincena: z.enum(["1", "2"]).transform(Number) as z.ZodType<1 | 2>,
}).refine((d) => d.tipo === "general" || d.id !== undefined, {
  message: "id requerido para tipo finca o ruta",
});

const FEDEGAN_PCT = 0.0075;
const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// Colors (ARGB)
const COLOR_HEADER_BG    = "FF0D9488"; // teal-600
const COLOR_HEADER_FG    = "FFFFFFFF"; // white
const COLOR_SUMMARY_BG   = "FFCCFBF1"; // teal-100
const COLOR_TOTALS_BG    = "FF0F766E"; // teal-800
const COLOR_ROUTE_HDR_BG = "FF1E4E79"; // blue-900 — cabecera de sección por ruta
const COLOR_GRAND_TOT_BG = "FF134E4A"; // teal-950 — total general
const FMT_COP = '"$"#,##0';            // pesos colombianos

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function styleHeader(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: COLOR_HEADER_FG } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER_BG } };
  cell.alignment = { vertical: "middle", horizontal: "center" };
}

function styleSummary(cell: ExcelJS.Cell) {
  cell.font = { bold: true };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_SUMMARY_BG } };
  cell.alignment = { horizontal: "right" };
  cell.numFmt = FMT_COP;
}

function styleTotal(cell: ExcelJS.Cell, isCurrency = false) {
  cell.font = { bold: true, color: { argb: COLOR_HEADER_FG } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_TOTALS_BG } };
  cell.alignment = { horizontal: "right" };
  if (isCurrency) cell.numFmt = FMT_COP;
}

function styleRouteHeader(cell: ExcelJS.Cell) {
  cell.font = { bold: true, color: { argb: COLOR_HEADER_FG }, size: 11 };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_ROUTE_HDR_BG } };
  cell.alignment = { vertical: "middle", horizontal: "left" };
}

function styleGrandTotal(cell: ExcelJS.Cell, isCurrency = false) {
  cell.font = { bold: true, color: { argb: COLOR_HEADER_FG }, size: 11 };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_GRAND_TOT_BG } };
  cell.alignment = { horizontal: "right" };
  if (isCurrency) cell.numFmt = FMT_COP;
}

export async function GET(req: NextRequest) {
  // Auth
  const role = await getUserRole();
  if (!role || !["cooperativa_admin"].includes(role)) {
    return new Response("No autorizado", { status: 401 });
  }

  // Params
  const { searchParams } = req.nextUrl;
  const parsed = querySchema.safeParse({
    tipo: searchParams.get("tipo"),
    id: searchParams.get("id") ?? undefined,
    mes: searchParams.get("mes"),
    anio: searchParams.get("anio"),
    quincena: searchParams.get("quincena"),
  });

  if (!parsed.success) {
    return new Response("Parámetros inválidos", { status: 400 });
  }

  const { tipo, id, mes, anio, quincena } = parsed.data;

  // Rango de fechas
  const lastDay = new Date(anio, mes, 0).getDate();
  const startDay = quincena === 1 ? 1 : 16;
  const endDay = quincena === 1 ? 15 : lastDay;
  const startDate = `${anio}-${pad(mes)}-${pad(startDay)}`;
  const endDate = `${anio}-${pad(mes)}-${pad(endDay)}`;
  const days = Array.from({ length: endDay - startDay + 1 }, (_, i) => startDay + i);

  const supabase = await createClient();

  // Fincas
  type FincaInfo = { id: number; nombre: string; precio_litro: number };
  let fincas: FincaInfo[] = [];

  if (tipo === "finca") {
    const { data, error } = await supabase
      .from("fincas_cooperativa")
      .select("id, nombre, precio_litro")
      .eq("id", id)
      .single();
    if (error || !data) return new Response("Finca no encontrada", { status: 404 });
    fincas = [{ id: data.id, nombre: data.nombre, precio_litro: Number(data.precio_litro) }];
  } else if (tipo === "ruta") {
    const { data, error } = await supabase
      .from("rutas_cooperativa")
      .select("nombre, rutas_fincas(fincas_cooperativa(id, nombre, precio_litro))")
      .eq("id", id)
      .single();
    if (error || !data) return new Response("Ruta no encontrada", { status: 404 });
    const rfList: any[] = Array.isArray(data.rutas_fincas) ? data.rutas_fincas : [];
    fincas = rfList
      .map((rf: any) => {
        const f = Array.isArray(rf.fincas_cooperativa) ? rf.fincas_cooperativa[0] : rf.fincas_cooperativa;
        if (!f) return null;
        return { id: f.id, nombre: f.nombre, precio_litro: Number(f.precio_litro) };
      })
      .filter(Boolean) as FincaInfo[];
    fincas.sort((a, b) => a.nombre.localeCompare(b.nombre));
  }

  if (tipo !== "general" && fincas.length === 0) {
    return new Response("Sin fincas para generar el informe", { status: 404 });
  }

  // ── INFORME GENERAL ─────────────────────────────────────────────────────────
  if (tipo === "general") {
    const { data: rutasRaw, error: rutasErr } = await supabase
      .from("rutas_cooperativa")
      .select("id, nombre, rutas_fincas(orden, fincas_cooperativa(id, nombre, precio_litro))")
      .order("nombre");

    if (rutasErr) return new Response("Error al obtener rutas", { status: 500 });

    type FincaInfo = { id: number; nombre: string; precio_litro: number };
    type RutaSection = { id: number; nombre: string; fincas: FincaInfo[] };

    const rutas: RutaSection[] = (rutasRaw ?? []).map((r: any) => {
      const rfList: any[] = Array.isArray(r.rutas_fincas) ? r.rutas_fincas : [];
      const fincasOrdenadas: FincaInfo[] = rfList
        .sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))
        .map((rf: any) => {
          const f = Array.isArray(rf.fincas_cooperativa) ? rf.fincas_cooperativa[0] : rf.fincas_cooperativa;
          if (!f) return null;
          return { id: f.id, nombre: f.nombre, precio_litro: Number(f.precio_litro) };
        })
        .filter(Boolean) as FincaInfo[];
      return { id: r.id, nombre: r.nombre, fincas: fincasOrdenadas };
    }).filter((r: RutaSection) => r.fincas.length > 0);

    if (rutas.length === 0) return new Response("Sin rutas con fincas", { status: 404 });

    const allFincaIds = rutas.flatMap((r) => r.fincas.map((f) => f.id));
    const { data: recsGen, error: recErrGen } = await supabase
      .from("recolecciones")
      .select("finca_id, fecha, litros, precio_litro")
      .in("finca_id", allFincaIds)
      .gte("fecha", startDate)
      .lte("fecha", endDate)
      .limit(10000);

    if (recErrGen) return new Response("Error al obtener recolecciones", { status: 500 });

    type DayRec = { litros: number; precio_litro: number };
    const recMapGen = new Map<number, Map<number, DayRec>>();
    for (const rec of recsGen ?? []) {
      const day = parseInt((rec.fecha as string).split("-")[2]);
      if (!recMapGen.has(rec.finca_id)) recMapGen.set(rec.finca_id, new Map());
      recMapGen.get(rec.finca_id)!.set(day, { litros: Number(rec.litros), precio_litro: Number(rec.precio_litro) });
    }

    const mesNombreGen = MESES[mes - 1];
    const wbGen = new ExcelJS.Workbook();
    wbGen.creator = "Toca Lácteos";
    const wsGen = wbGen.addWorksheet(`Q${quincena} ${mesNombreGen} ${anio}`.slice(0, 31));

    const totalColsGen = 1 + days.length + 5;
    const colPrecioBrutoG = totalColsGen - 2;
    const colDesFedeganG  = totalColsGen - 1;
    const colPrecioNetoG  = totalColsGen;
    const colTotalLitrosG = days.length + 3;

    wsGen.getColumn(1).width = 28;
    for (let i = 2; i <= days.length + 1; i++) wsGen.getColumn(i).width = 8;
    wsGen.getColumn(days.length + 2).width = 12;
    wsGen.getColumn(days.length + 3).width = 14;
    wsGen.getColumn(colPrecioBrutoG).width = 16;
    wsGen.getColumn(colDesFedeganG).width = 15;
    wsGen.getColumn(colPrecioNetoG).width = 14;

    // Cabecera de columnas
    const headerGen = ["Finca", ...days.map((d) => d), "Precio/L", "Total Litros", "Precio Bruto", "Des. Fedegan", "Precio Neto"];
    const headerRowGen = wsGen.addRow(headerGen);
    headerRowGen.height = 20;
    headerRowGen.eachCell((cell) => styleHeader(cell));

    let grandLitros = 0, grandBruto = 0, grandFedegan = 0, grandNeto = 0;

    for (const ruta of rutas) {
      // Fila cabecera de ruta (fusionada)
      const rutaHeaderRow = wsGen.addRow([`RUTA: ${ruta.nombre}`, ...Array(totalColsGen - 1).fill("")]);
      rutaHeaderRow.height = 22;
      wsGen.mergeCells(rutaHeaderRow.number, 1, rutaHeaderRow.number, totalColsGen);
      rutaHeaderRow.eachCell((cell) => styleRouteHeader(cell));

      let rutaLitros = 0, rutaBruto = 0, rutaFedegan = 0, rutaNeto = 0;

      for (const finca of ruta.fincas) {
        const dayMap = recMapGen.get(finca.id) ?? new Map<number, DayRec>();
        const dayValues = days.map((d) => dayMap.get(d)?.litros ?? 0);
        const totalLitros = dayValues.reduce((s, v) => s + v, 0);
        const precioBruto = days.reduce((s, d) => {
          const rec = dayMap.get(d);
          return s + (rec ? rec.litros * rec.precio_litro : 0);
        }, 0);
        const desFedegan = Math.round(precioBruto * FEDEGAN_PCT);
        const precioNeto = Math.round(precioBruto) - desFedegan;

        rutaLitros  += totalLitros;
        rutaBruto   += Math.round(precioBruto);
        rutaFedegan += desFedegan;
        rutaNeto    += precioNeto;

        const row = wsGen.addRow([finca.nombre, ...dayValues, finca.precio_litro, totalLitros, Math.round(precioBruto), desFedegan, precioNeto]);
        row.getCell(1).font = { bold: true };
        row.getCell(1).alignment = { vertical: "middle" };
        row.getCell(days.length + 2).numFmt = FMT_COP;
        styleSummary(row.getCell(colPrecioBrutoG));
        styleSummary(row.getCell(colDesFedeganG));
        styleSummary(row.getCell(colPrecioNetoG));
      }

      // Subtotal de ruta
      const subtotalRow = wsGen.addRow(["Subtotal " + ruta.nombre, ...Array(days.length + 1).fill(""), rutaLitros, rutaBruto, rutaFedegan, rutaNeto]);
      subtotalRow.height = 18;
      subtotalRow.getCell(1).font = { bold: true };
      subtotalRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_SUMMARY_BG } };
      subtotalRow.getCell(1).alignment = { horizontal: "left" };
      styleTotal(subtotalRow.getCell(colTotalLitrosG));
      styleTotal(subtotalRow.getCell(colPrecioBrutoG), true);
      styleTotal(subtotalRow.getCell(colDesFedeganG), true);
      styleTotal(subtotalRow.getCell(colPrecioNetoG), true);

      // Fila vacía entre rutas
      wsGen.addRow([]);

      grandLitros  += rutaLitros;
      grandBruto   += rutaBruto;
      grandFedegan += rutaFedegan;
      grandNeto    += rutaNeto;
    }

    // Total general
    const grandRow = wsGen.addRow(["TOTAL GENERAL", ...Array(days.length + 1).fill(""), grandLitros, grandBruto, grandFedegan, grandNeto]);
    grandRow.height = 22;
    grandRow.getCell(1).font = { bold: true, color: { argb: COLOR_HEADER_FG }, size: 11 };
    grandRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_GRAND_TOT_BG } };
    grandRow.getCell(1).alignment = { horizontal: "left" };
    styleGrandTotal(grandRow.getCell(colTotalLitrosG));
    styleGrandTotal(grandRow.getCell(colPrecioBrutoG), true);
    styleGrandTotal(grandRow.getCell(colDesFedeganG), true);
    styleGrandTotal(grandRow.getCell(colPrecioNetoG), true);

    const bufferGen = await wbGen.xlsx.writeBuffer();
    const filenameGen = `informe_general_Q${quincena}_${mesNombreGen}_${anio}.xlsx`;
    return new Response(bufferGen as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filenameGen}"`,
      },
    });
  }
  // ── FIN INFORME GENERAL ──────────────────────────────────────────────────────

  // Recolecciones
  const fincaIds = fincas.map((f) => f.id);
  const { data: recolecciones, error: recError } = await supabase
    .from("recolecciones")
    .select("finca_id, fecha, litros, precio_litro")
    .in("finca_id", fincaIds)
    .gte("fecha", startDate)
    .lte("fecha", endDate)
    .limit(10000);

  if (recError) return new Response("Error al obtener recolecciones", { status: 500 });

  type DayRec = { litros: number; precio_litro: number };
  const recMap = new Map<number, Map<number, DayRec>>();
  for (const rec of recolecciones ?? []) {
    const day = parseInt((rec.fecha as string).split("-")[2]);
    if (!recMap.has(rec.finca_id)) recMap.set(rec.finca_id, new Map());
    recMap.get(rec.finca_id)!.set(day, {
      litros: Number(rec.litros),
      precio_litro: Number(rec.precio_litro),
    });
  }

  // Workbook
  const mesNombre = MESES[mes - 1];
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Toca Lácteos";
  const sheetName = `Q${quincena} ${mesNombre} ${anio}`.slice(0, 31);
  const ws = workbook.addWorksheet(sheetName);

  // Índices de columnas de resumen (1-based)
  // 1: Finca | 2...(days.length+1): días | +2: Precio/L | +3: Total L | +4: Precio Bruto | +5: Des. Fedegan | +6: Precio Neto
  const totalCols = 1 + days.length + 5;
  const colPrecioBruto = totalCols - 2;
  const colDesFedegan = totalCols - 1;
  const colPrecioNeto = totalCols;

  // Anchos de columna
  ws.getColumn(1).width = 26;
  for (let i = 2; i <= days.length + 1; i++) ws.getColumn(i).width = 8;
  ws.getColumn(days.length + 2).width = 12; // Precio/L
  ws.getColumn(days.length + 3).width = 14; // Total Litros
  ws.getColumn(colPrecioBruto).width = 16;
  ws.getColumn(colDesFedegan).width = 15;
  ws.getColumn(colPrecioNeto).width = 14;

  // Cabecera
  const header = [
    "Finca",
    ...days.map((d) => d),
    "Precio/L",
    "Total Litros",
    "Precio Bruto",
    "Des. Fedegan",
    "Precio Neto",
  ];
  const headerRow = ws.addRow(header);
  headerRow.height = 20;
  headerRow.eachCell((cell) => styleHeader(cell));

  // Filas de datos
  let sumLitros = 0;
  let sumBruto = 0;
  let sumFedegan = 0;
  let sumNeto = 0;

  for (const finca of fincas) {
    const dayMap = recMap.get(finca.id) ?? new Map<number, DayRec>();
    const dayValues = days.map((d) => dayMap.get(d)?.litros ?? 0);
    const totalLitros = dayValues.reduce((s, v) => s + v, 0);
    const precioBruto = days.reduce((s, d) => {
      const rec = dayMap.get(d);
      return s + (rec ? rec.litros * rec.precio_litro : 0);
    }, 0);
    const desFedegan = Math.round(precioBruto * FEDEGAN_PCT);
    const precioNeto = Math.round(precioBruto) - desFedegan;

    sumLitros  += totalLitros;
    sumBruto   += Math.round(precioBruto);
    sumFedegan += desFedegan;
    sumNeto    += precioNeto;

    const row = ws.addRow([
      finca.nombre,
      ...dayValues,
      finca.precio_litro,
      totalLitros,
      Math.round(precioBruto),
      desFedegan,
      precioNeto,
    ]);

    row.getCell(1).font = { bold: true };
    row.getCell(1).alignment = { vertical: "middle" };

    // Precio/L con formato COP
    row.getCell(days.length + 2).numFmt = FMT_COP;

    styleSummary(row.getCell(colPrecioBruto));
    styleSummary(row.getCell(colDesFedegan));
    styleSummary(row.getCell(colPrecioNeto));
  }

  // Fila de totales (solo para rutas con varias fincas)
  if (tipo === "ruta") {
  const colTotalLitros = days.length + 3;
  const totalsRow = ws.addRow([
    "TOTAL",
    ...Array(days.length + 1).fill(""),
    sumLitros,
    sumBruto,
    sumFedegan,
    sumNeto,
  ]);
  totalsRow.height = 20;

  totalsRow.getCell(1).font = { bold: true, color: { argb: COLOR_HEADER_FG } };
  totalsRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_TOTALS_BG } };
  totalsRow.getCell(1).alignment = { horizontal: "left" };

  styleTotal(totalsRow.getCell(colTotalLitros));
  styleTotal(totalsRow.getCell(colPrecioBruto), true);
  styleTotal(totalsRow.getCell(colDesFedegan), true);
  styleTotal(totalsRow.getCell(colPrecioNeto), true);
  } // fin if tipo === "ruta"

  // Generar buffer
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `informe_Q${quincena}_${mesNombre}_${anio}.xlsx`;

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
