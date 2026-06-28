import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/get-user-role";
import { fetchAllRecolecciones, MESES } from "@/lib/cooperativa/recolecciones";

const querySchema = z
  .object({
    tipo: z.enum(["finca", "ruta", "itinerario", "general"]),
    id: z.coerce.number().int().positive().optional(),
    // Modo quincena
    quincena: z.enum(["1", "2"]).optional(),
    mes: z.coerce.number().int().min(1).max(12).optional(),
    anio: z.coerce.number().int().min(2000).max(2100).optional(),
    // Modo rango libre
    fechaDesde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    fechaHasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine((d) => d.tipo === "general" || d.id !== undefined, {
    message: "id requerido para tipo finca, ruta o itinerario",
  })
  .refine(
    (d) => {
      const hasQuincena =
        d.quincena !== undefined &&
        d.mes !== undefined &&
        d.anio !== undefined;
      const hasCustom =
        d.fechaDesde !== undefined && d.fechaHasta !== undefined;
      return hasQuincena || hasCustom;
    },
    { message: "Se requiere quincena+mes+anio o fechaDesde+fechaHasta" },
  );

const FEDEGAN_PCT = 0.0075;

// Colors (ARGB)
const COLOR_HEADER_BG = "FF0D9488"; // teal-600
const COLOR_HEADER_FG = "FFFFFFFF"; // white
const COLOR_SUMMARY_BG = "FFCCFBF1"; // teal-100
const COLOR_TOTALS_BG = "FF0F766E"; // teal-800
const COLOR_ROUTE_HDR_BG = "FF1E4E79"; // blue-900
const COLOR_GRAND_TOT_BG = "FF134E4A"; // teal-950
const FMT_COP = '"$"#,##0';

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Genera todas las fechas ISO entre start y end (inclusive)
function generateDates(start: string, end: string): string[] {
  const dates: string[] = [];
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const cur = new Date(sy, sm - 1, sd);
  const endD = new Date(ey, em - 1, ed);
  while (cur <= endD) {
    dates.push(
      `${cur.getFullYear()}-${pad(cur.getMonth() + 1)}-${pad(cur.getDate())}`,
    );
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
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
    quincena: searchParams.get("quincena") ?? undefined,
    mes: searchParams.get("mes") ?? undefined,
    anio: searchParams.get("anio") ?? undefined,
    fechaDesde: searchParams.get("fechaDesde") ?? undefined,
    fechaHasta: searchParams.get("fechaHasta") ?? undefined,
  });

  if (!parsed.success) {
    return new Response("Parámetros inválidos", { status: 400 });
  }

  const { tipo, id, quincena, mes, anio, fechaDesde, fechaHasta } =
    parsed.data;

  // Rango de fechas y etiquetas de columna
  let startDate: string;
  let endDate: string;
  let periodoLabel: string;
  let isSameMonth: boolean;

  if (quincena && mes !== undefined && anio !== undefined) {
    const lastDay = new Date(anio, mes, 0).getDate();
    const startDay = quincena === "1" ? 1 : 16;
    const endDay = quincena === "1" ? 15 : lastDay;
    startDate = `${anio}-${pad(mes)}-${pad(startDay)}`;
    endDate = `${anio}-${pad(mes)}-${pad(endDay)}`;
    periodoLabel = `Q${quincena} ${MESES[mes - 1]} ${anio}`;
    isSameMonth = true;
  } else {
    startDate = fechaDesde!;
    endDate = fechaHasta!;
    const [sy, sm] = startDate.split("-").map(Number);
    const [ey, em] = endDate.split("-").map(Number);
    isSameMonth = sy === ey && sm === em;
    periodoLabel = `${startDate} a ${endDate}`;
  }

  // Array de fechas ISO y etiquetas para cabeceras de columna
  const dates = generateDates(startDate, endDate);
  const dayLabels: (number | string)[] = dates.map((iso) => {
    const parts = iso.split("-");
    const d = parseInt(parts[2]);
    const m = parseInt(parts[1]);
    return isSameMonth ? d : `${pad(d)}/${pad(m)}`;
  });

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
    if (error || !data)
      return new Response("Finca no encontrada", { status: 404 });
    fincas = [
      {
        id: data.id,
        nombre: data.nombre,
        precio_litro: Number(data.precio_litro),
      },
    ];
  } else if (tipo === "ruta") {
    const { data, error } = await supabase
      .from("rutas_cooperativa")
      .select(
        "nombre, rutas_fincas(fincas_cooperativa(id, nombre, precio_litro))",
      )
      .eq("id", id)
      .single();
    if (error || !data)
      return new Response("Ruta no encontrada", { status: 404 });
    const rfList: any[] = Array.isArray(data.rutas_fincas)
      ? data.rutas_fincas
      : [];
    fincas = rfList
      .map((rf: any) => {
        const f = Array.isArray(rf.fincas_cooperativa)
          ? rf.fincas_cooperativa[0]
          : rf.fincas_cooperativa;
        if (!f) return null;
        return {
          id: f.id,
          nombre: f.nombre,
          precio_litro: Number(f.precio_litro),
        };
      })
      .filter(Boolean) as FincaInfo[];
    fincas.sort((a, b) => a.nombre.localeCompare(b.nombre));
  } else if (tipo === "itinerario") {
    const { data, error } = await supabase
      .from("itinerarios")
      .select("nombre, itinerarios_fincas(orden, fincas_cooperativa(id, nombre, precio_litro))")
      .eq("id", id)
      .single();
    if (error || !data)
      return new Response("Itinerario no encontrado", { status: 404 });
    const ifList: any[] = Array.isArray(data.itinerarios_fincas)
      ? data.itinerarios_fincas
      : [];
    fincas = ifList
      .sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))
      .map((itF: any) => {
        const f = Array.isArray(itF.fincas_cooperativa)
          ? itF.fincas_cooperativa[0]
          : itF.fincas_cooperativa;
        if (!f) return null;
        return {
          id: f.id,
          nombre: f.nombre,
          precio_litro: Number(f.precio_litro),
        };
      })
      .filter(Boolean) as FincaInfo[];
  }

  if (tipo !== "general" && fincas.length === 0) {
    return new Response("Sin fincas para generar el informe", { status: 404 });
  }

  // ── INFORME GENERAL ─────────────────────────────────────────────────────────
  if (tipo === "general") {
    const { data: rutasRaw, error: rutasErr } = await supabase
      .from("rutas_cooperativa")
      .select(
        "id, nombre, rutas_fincas(orden, fincas_cooperativa(id, nombre, precio_litro))",
      )
      .order("nombre");

    if (rutasErr)
      return new Response("Error al obtener rutas", { status: 500 });

    type RutaSection = { id: number; nombre: string; fincas: FincaInfo[] };

    const rutas: RutaSection[] = (rutasRaw ?? [])
      .map((r: any) => {
        const rfList: any[] = Array.isArray(r.rutas_fincas)
          ? r.rutas_fincas
          : [];
        const fincasOrdenadas: FincaInfo[] = rfList
          .sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))
          .map((rf: any) => {
            const f = Array.isArray(rf.fincas_cooperativa)
              ? rf.fincas_cooperativa[0]
              : rf.fincas_cooperativa;
            if (!f) return null;
            return {
              id: f.id,
              nombre: f.nombre,
              precio_litro: Number(f.precio_litro),
            };
          })
          .filter(Boolean) as FincaInfo[];
        return { id: r.id, nombre: r.nombre, fincas: fincasOrdenadas };
      })
      .filter((r: RutaSection) => r.fincas.length > 0);

    if (rutas.length === 0)
      return new Response("Sin rutas con fincas", { status: 404 });

    const allFincaIds = rutas.flatMap((r) => r.fincas.map((f) => f.id));
    const recsGen = await fetchAllRecolecciones(
      supabase,
      allFincaIds,
      startDate,
      endDate,
    );

    type DayRec = { litros: number; precio_litro: number };
    const recMapGen = new Map<number, Map<string, DayRec>>();
    for (const rec of recsGen) {
      const fecha = rec.fecha as string;
      if (!recMapGen.has(rec.finca_id))
        recMapGen.set(rec.finca_id, new Map());
      recMapGen.get(rec.finca_id)!.set(fecha, {
        litros: Number(rec.litros),
        precio_litro: Number(rec.precio_litro),
      });
    }

    const wbGen = new ExcelJS.Workbook();
    wbGen.creator = "Toca Lácteos";
    const wsGen = wbGen.addWorksheet(periodoLabel.slice(0, 31));

    // Congelar primera fila (cabecera de días)
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
      ...dayLabels,
      "Precio/L",
      "Total Litros",
      "Precio Bruto",
      "Des. Fedegan",
      "Precio Neto",
    ];
    const headerRowGen = wsGen.addRow(headerGen);
    headerRowGen.height = 20;
    headerRowGen.eachCell((cell) => styleHeader(cell));

    let grandLitros = 0,
      grandBruto = 0,
      grandFedegan = 0,
      grandNeto = 0;
    const grandDayTotals = new Array(dates.length).fill(0);

    for (const ruta of rutas) {
      // Fila cabecera de ruta (fusionada)
      const rutaHeaderRow = wsGen.addRow([
        `RUTA: ${ruta.nombre}`,
        ...Array(totalColsGen - 1).fill(""),
      ]);
      rutaHeaderRow.height = 22;
      wsGen.mergeCells(
        rutaHeaderRow.number,
        1,
        rutaHeaderRow.number,
        totalColsGen,
      );
      rutaHeaderRow.eachCell((cell) => styleRouteHeader(cell));

      let rutaLitros = 0,
        rutaBruto = 0,
        rutaFedegan = 0,
        rutaNeto = 0;
      const rutaDayTotals = new Array(dates.length).fill(0);

      for (const finca of ruta.fincas) {
        const dayMap =
          recMapGen.get(finca.id) ?? new Map<string, DayRec>();
        const dayValues = dates.map((iso) => dayMap.get(iso)?.litros ?? 0);
        dayValues.forEach((v, i) => {
          rutaDayTotals[i] += v;
        });
        const totalLitros = dayValues.reduce((s, v) => s + v, 0);
        const precioBruto = dates.reduce((s, iso) => {
          const rec = dayMap.get(iso);
          return s + (rec ? rec.litros * rec.precio_litro : 0);
        }, 0);
        const desFedegan = Math.round(precioBruto * FEDEGAN_PCT);
        const precioNeto = Math.round(precioBruto) - desFedegan;

        rutaLitros += totalLitros;
        rutaBruto += Math.round(precioBruto);
        rutaFedegan += desFedegan;
        rutaNeto += precioNeto;

        const row = wsGen.addRow([
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
        row.getCell(dates.length + 2).numFmt = FMT_COP;
        styleSummary(row.getCell(colPrecioBrutoG));
        styleSummary(row.getCell(colDesFedeganG));
        styleSummary(row.getCell(colPrecioNetoG));
      }

      // Subtotal de ruta con sumatorio diario
      const subtotalRow = wsGen.addRow([
        "Subtotal " + ruta.nombre,
        ...rutaDayTotals,
        "",
        rutaLitros,
        rutaBruto,
        rutaFedegan,
        rutaNeto,
      ]);
      subtotalRow.height = 18;
      subtotalRow.getCell(1).font = { bold: true };
      subtotalRow.getCell(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLOR_SUMMARY_BG },
      };
      subtotalRow.getCell(1).alignment = { horizontal: "left" };
      for (let i = 2; i <= dates.length + 1; i++) {
        styleTotal(subtotalRow.getCell(i));
      }
      styleTotal(subtotalRow.getCell(colTotalLitrosG));
      styleTotal(subtotalRow.getCell(colPrecioBrutoG), true);
      styleTotal(subtotalRow.getCell(colDesFedeganG), true);
      styleTotal(subtotalRow.getCell(colPrecioNetoG), true);

      // Fila vacía entre rutas
      wsGen.addRow([]);

      rutaDayTotals.forEach((v, i) => {
        grandDayTotals[i] += v;
      });
      grandLitros += rutaLitros;
      grandBruto += rutaBruto;
      grandFedegan += rutaFedegan;
      grandNeto += rutaNeto;
    }

    // Total general con sumatorio diario
    const grandRow = wsGen.addRow([
      "TOTAL GENERAL",
      ...grandDayTotals,
      "",
      grandLitros,
      grandBruto,
      grandFedegan,
      grandNeto,
    ]);
    grandRow.height = 22;
    grandRow.getCell(1).font = {
      bold: true,
      color: { argb: COLOR_HEADER_FG },
      size: 11,
    };
    grandRow.getCell(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLOR_GRAND_TOT_BG },
    };
    grandRow.getCell(1).alignment = { horizontal: "left" };
    for (let i = 2; i <= dates.length + 1; i++) {
      styleGrandTotal(grandRow.getCell(i));
    }
    styleGrandTotal(grandRow.getCell(colTotalLitrosG));
    styleGrandTotal(grandRow.getCell(colPrecioBrutoG), true);
    styleGrandTotal(grandRow.getCell(colDesFedeganG), true);
    styleGrandTotal(grandRow.getCell(colPrecioNetoG), true);

    const bufferGen = await wbGen.xlsx.writeBuffer();
    const filenameGen =
      quincena && mes !== undefined && anio !== undefined
        ? `informe_general_Q${quincena}_${MESES[mes - 1]}_${anio}.xlsx`
        : `informe_general_${startDate}_${endDate}.xlsx`;
    return new Response(bufferGen as ArrayBuffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filenameGen}"`,
      },
    });
  }
  // ── FIN INFORME GENERAL ──────────────────────────────────────────────────────

  // Recolecciones (finca / ruta)
  const fincaIds = fincas.map((f) => f.id);
  const recolecciones = await fetchAllRecolecciones(
    supabase,
    fincaIds,
    startDate,
    endDate,
  );

  type DayRec = { litros: number; precio_litro: number };
  const recMap = new Map<number, Map<string, DayRec>>();
  for (const rec of recolecciones) {
    const fecha = rec.fecha as string;
    if (!recMap.has(rec.finca_id)) recMap.set(rec.finca_id, new Map());
    recMap.get(rec.finca_id)!.set(fecha, {
      litros: Number(rec.litros),
      precio_litro: Number(rec.precio_litro),
    });
  }

  // Workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Toca Lácteos";
  const ws = workbook.addWorksheet(periodoLabel.slice(0, 31));

  // Congelar primera fila (cabecera de días)
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

  // Índices de columnas de resumen (1-based)
  const totalCols = 1 + dates.length + 5;
  const colPrecioBruto = totalCols - 2;
  const colDesFedegan = totalCols - 1;
  const colPrecioNeto = totalCols;
  const colTotalLitros = dates.length + 3;

  // Anchos de columna
  ws.getColumn(1).width = 26;
  for (let i = 2; i <= dates.length + 1; i++) ws.getColumn(i).width = isSameMonth ? 8 : 10;
  ws.getColumn(dates.length + 2).width = 12; // Precio/L
  ws.getColumn(dates.length + 3).width = 14; // Total Litros
  ws.getColumn(colPrecioBruto).width = 16;
  ws.getColumn(colDesFedegan).width = 15;
  ws.getColumn(colPrecioNeto).width = 14;

  // Cabecera
  const header = [
    "Finca",
    ...dayLabels,
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
  const dayTotals = new Array(dates.length).fill(0);

  for (const finca of fincas) {
    const dayMap = recMap.get(finca.id) ?? new Map<string, DayRec>();
    const dayValues = dates.map((iso) => dayMap.get(iso)?.litros ?? 0);
    dayValues.forEach((v, i) => {
      dayTotals[i] += v;
    });
    const totalLitros = dayValues.reduce((s, v) => s + v, 0);
    const precioBruto = dates.reduce((s, iso) => {
      const rec = dayMap.get(iso);
      return s + (rec ? rec.litros * rec.precio_litro : 0);
    }, 0);
    const desFedegan = Math.round(precioBruto * FEDEGAN_PCT);
    const precioNeto = Math.round(precioBruto) - desFedegan;

    sumLitros += totalLitros;
    sumBruto += Math.round(precioBruto);
    sumFedegan += desFedegan;
    sumNeto += precioNeto;

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
    row.getCell(dates.length + 2).numFmt = FMT_COP;
    styleSummary(row.getCell(colPrecioBruto));
    styleSummary(row.getCell(colDesFedegan));
    styleSummary(row.getCell(colPrecioNeto));
  }

  // Fila de totales con sumatorio diario
  const totalsRow = ws.addRow([
    "TOTAL",
    ...dayTotals,
    "",
    sumLitros,
    sumBruto,
    sumFedegan,
    sumNeto,
  ]);
  totalsRow.height = 20;
  totalsRow.getCell(1).font = {
    bold: true,
    color: { argb: COLOR_HEADER_FG },
  };
  totalsRow.getCell(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: COLOR_TOTALS_BG },
  };
  totalsRow.getCell(1).alignment = { horizontal: "left" };
  for (let i = 2; i <= dates.length + 1; i++) {
    styleTotal(totalsRow.getCell(i));
  }
  styleTotal(totalsRow.getCell(colTotalLitros));
  styleTotal(totalsRow.getCell(colPrecioBruto), true);
  styleTotal(totalsRow.getCell(colDesFedegan), true);
  styleTotal(totalsRow.getCell(colPrecioNeto), true);

  // Generar buffer
  const buffer = await workbook.xlsx.writeBuffer();
  const filename =
    quincena && mes !== undefined && anio !== undefined
      ? `informe_Q${quincena}_${MESES[mes - 1]}_${anio}.xlsx`
      : `informe_${startDate}_${endDate}.xlsx`;

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
