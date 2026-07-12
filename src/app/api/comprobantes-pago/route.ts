import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getUserRole } from "@/lib/auth/get-user-role";
import {
  fetchAllRecolecciones,
  MESES,
} from "@/lib/cooperativa/recolecciones";
import { ordenarFincasPorItinerario } from "@/lib/cooperativa/orden-rutas";
import { getFedeganPct } from "@/lib/cooperativa/fedegan";

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
      const hasQuincena = d.quincena !== undefined && d.mes !== undefined && d.anio !== undefined;
      const hasCustom = d.fechaDesde !== undefined && d.fechaHasta !== undefined;
      return hasQuincena || hasCustom;
    },
    { message: "Se requiere quincena+mes+anio o fechaDesde+fechaHasta" },
  );

type FincaWithRuta = {
  id: number;
  nombre: string;
  precio_litro: number;
  ruta_nombre: string;
};

type DayRec = { litros: number; precio_litro: number };

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function colLetter(col: number): string {
  let s = "";
  while (col > 0) {
    const rem = (col - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    col = Math.floor((col - 1) / 26);
  }
  return s;
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

function formatPeriodo(start: string, end: string): string {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  if (sm === em && sy === ey) return `${sd}-${ed} ${MESES[sm - 1]} ${sy}`;
  if (sy === ey)
    return `${sd} ${MESES[sm - 1]} - ${ed} ${MESES[em - 1]} ${sy}`;
  return `${sd} ${MESES[sm - 1]} ${sy} - ${ed} ${MESES[em - 1]} ${ey}`;
}

const THIN: ExcelJS.BorderStyle = "thin";
const MEDIUM: ExcelJS.BorderStyle = "medium";

function writeVoucher(
  ws: ExcelJS.Worksheet,
  rowStart: number,
  colStart: number,
  data: {
    finca_nombre: string;
    ruta_nombre: string;
    periodo: string;
    litros: number;
    bruto: number;
    fedegan: number;
  },
) {
  const cDollar = colStart;
  const cVal = colStart + 1;
  const cLabel = colStart + 2;

  const addr = (r: number, c: number) => `${colLetter(c)}${r}`;
  const cell = (r: number, c: number) => ws.getRow(r).getCell(c);

  // Filas de cabecera (merged)
  for (const r of [rowStart, rowStart + 1, rowStart + 2, rowStart + 3]) {
    ws.mergeCells(r, cDollar, r, cLabel);
  }

  const c1 = cell(rowStart, cDollar);
  c1.value = data.finca_nombre.toUpperCase();
  c1.font = { bold: true, size: 10 };
  c1.alignment = { horizontal: "center", vertical: "middle" };

  const c2 = cell(rowStart + 1, cDollar);
  c2.value = data.ruta_nombre;
  c2.font = { size: 8, color: { argb: "FF555555" } };
  c2.alignment = { horizontal: "center", vertical: "middle" };

  const c3 = cell(rowStart + 2, cDollar);
  c3.value = data.periodo;
  c3.font = { size: 9 };
  c3.alignment = { horizontal: "center", vertical: "middle" };

  const c4 = cell(rowStart + 3, cDollar);
  c4.value = `${data.litros.toLocaleString("es-CO")} Ltrs`;
  c4.font = { size: 9 };
  c4.alignment = { horizontal: "right", vertical: "middle" };

  const FMT = "#,##0";

  // F5: Bruto
  const r5 = rowStart + 4;
  cell(r5, cDollar).value = "$";
  const brutoCell = cell(r5, cVal);
  brutoCell.value = data.bruto;
  brutoCell.numFmt = FMT;
  brutoCell.alignment = { horizontal: "right" };
  cell(r5, cLabel).value = "";

  // F6: Descuento (editable)
  const r6 = rowStart + 5;
  cell(r6, cDollar).value = "$";
  const descCell = cell(r6, cVal);
  descCell.value = null;
  descCell.numFmt = FMT;
  descCell.alignment = { horizontal: "right" };
  const descLabel = cell(r6, cLabel);
  descLabel.value = "Descuento";
  descLabel.font = { size: 8, italic: true, color: { argb: "FF666666" } };

  // F7: Subtotal = bruto − descuento (fórmula)
  const r7 = rowStart + 6;
  cell(r7, cDollar).value = "$";
  const subCell = cell(r7, cVal);
  subCell.value = { formula: `=${addr(r5, cVal)}-${addr(r6, cVal)}` };
  subCell.numFmt = FMT;
  subCell.alignment = { horizontal: "right" };
  cell(r7, cLabel).value = "";

  // F8: Fedegan
  const r8 = rowStart + 7;
  cell(r8, cDollar).value = "$";
  const fedCell = cell(r8, cVal);
  fedCell.value = data.fedegan;
  fedCell.numFmt = FMT;
  fedCell.alignment = { horizontal: "right" };
  const fedLabel = cell(r8, cLabel);
  fedLabel.value = "Fedegan";
  fedLabel.font = { size: 8, italic: true, color: { argb: "FF666666" } };

  // F9: Saldo anterior (editable)
  const r9 = rowStart + 8;
  cell(r9, cDollar).value = "$";
  const saldoCell = cell(r9, cVal);
  saldoCell.value = null;
  saldoCell.numFmt = FMT;
  saldoCell.alignment = { horizontal: "right" };
  const saldoLabel = cell(r9, cLabel);
  saldoLabel.value = "Sald. Ant.";
  saldoLabel.font = { size: 8, italic: true, color: { argb: "FF666666" } };

  // F10: Total = subtotal − fedegan − saldo (fórmula)
  const r10 = rowStart + 9;
  cell(r10, cDollar).value = "$";
  cell(r10, cDollar).font = { bold: true };
  const totalCell = cell(r10, cVal);
  totalCell.value = {
    formula: `=${addr(r7, cVal)}-${addr(r8, cVal)}-${addr(r9, cVal)}`,
  };
  totalCell.numFmt = FMT;
  totalCell.alignment = { horizontal: "right" };
  totalCell.font = { bold: true };
  const totalLabel = cell(r10, cLabel);
  totalLabel.value = "Total";
  totalLabel.font = { bold: true };

  // Bordes
  const rowEnd = rowStart + 9;
  for (let r = rowStart; r <= rowEnd; r++) {
    for (let c = cDollar; c <= cLabel; c++) {
      const b: Partial<ExcelJS.Borders> = {};
      if (r === rowStart) b.top = { style: MEDIUM };
      if (r === rowEnd) b.bottom = { style: MEDIUM };
      if (c === cDollar) b.left = { style: MEDIUM };
      if (c === cLabel) b.right = { style: MEDIUM };
      if (r > rowStart && !b.top) b.top = { style: THIN };
      if (r === rowEnd) b.top = { style: MEDIUM };
      const existing = ws.getRow(r).getCell(c).border ?? {};
      ws.getRow(r).getCell(c).border = { ...existing, ...b };
    }
  }
}

export async function GET(req: NextRequest) {
  const role = await getUserRole();
  if (!role || !["cooperativa_admin"].includes(role)) {
    return new Response("No autorizado", { status: 401 });
  }

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

  const { tipo, id, quincena, mes, anio, fechaDesde, fechaHasta } = parsed.data;

  // Calcular rango de fechas y texto de período
  let startDate: string;
  let endDate: string;
  let periodo: string;
  let mesNombre: string;
  let filenameTag: string;

  if (fechaDesde && fechaHasta) {
    startDate = fechaDesde;
    endDate = fechaHasta;
    periodo = formatPeriodo(startDate, endDate);
    mesNombre = MESES[parseInt(startDate.split("-")[1]) - 1];
    filenameTag = `${startDate}_${endDate}`;
  } else {
    const q = quincena === "1" ? 1 : 2;
    const lastDay = new Date(anio!, mes!, 0).getDate();
    const startDay = q === 1 ? 1 : 16;
    const endDay = q === 1 ? 15 : lastDay;
    startDate = `${anio}-${pad(mes!)}-${pad(startDay)}`;
    endDate = `${anio}-${pad(mes!)}-${pad(endDay)}`;
    mesNombre = MESES[mes! - 1];
    periodo = formatPeriodo(startDate, endDate);
    filenameTag = `Q${q}_${mesNombre}_${anio}`;
  }

  const supabase = await createClient();

  // Recolectar fincas con su ruta
  let fincas: FincaWithRuta[] = [];

  if (tipo === "finca") {
    const { data, error } = await supabase
      .from("fincas_cooperativa")
      .select("id, nombre, precio_litro, rutas_fincas(rutas_cooperativa(nombre))")
      .eq("id", id!)
      .single();
    if (error || !data)
      return new Response("Finca no encontrada", { status: 404 });

    const rfRaw = data.rutas_fincas;
    const rfArr: any[] = Array.isArray(rfRaw) ? rfRaw : rfRaw ? [rfRaw] : [];
    const rutaRaw = rfArr[0]?.rutas_cooperativa;
    const rutaNombre = rutaRaw
      ? Array.isArray(rutaRaw)
        ? (rutaRaw[0]?.nombre ?? "—")
        : (rutaRaw.nombre ?? "—")
      : "—";

    fincas = [{ id: data.id, nombre: data.nombre, precio_litro: Number(data.precio_litro), ruta_nombre: rutaNombre }];
  } else if (tipo === "ruta") {
    const { data, error } = await supabase
      .from("rutas_cooperativa")
      .select("nombre, rutas_fincas(orden, fincas_cooperativa(id, nombre, precio_litro, itinerarios_fincas(orden, itinerario_id)))")
      .eq("id", id!)
      .single();
    if (error || !data)
      return new Response("Ruta no encontrada", { status: 404 });

    const rfList: any[] = Array.isArray(data.rutas_fincas) ? data.rutas_fincas : [];
    const fincasConItinerario = rfList
      .map((rf: any) => {
        const f = Array.isArray(rf.fincas_cooperativa) ? rf.fincas_cooperativa[0] : rf.fincas_cooperativa;
        if (!f) return null;
        const itList: any[] = Array.isArray(f.itinerarios_fincas)
          ? f.itinerarios_fincas
          : f.itinerarios_fincas
            ? [f.itinerarios_fincas]
            : [];
        return {
          id: f.id,
          nombre: f.nombre,
          precio_litro: Number(f.precio_litro),
          ruta_nombre: data.nombre,
          rutaOrden: rf.orden ?? 0,
          itinerarioId: itList[0]?.itinerario_id ?? null,
          itinerarioOrden: itList[0]?.orden ?? 0,
        };
      })
      .filter(Boolean) as ((FincaWithRuta & {
        rutaOrden: number;
        itinerarioId: number | null;
        itinerarioOrden: number;
      })[]);
    fincas = ordenarFincasPorItinerario(fincasConItinerario, data.nombre);
  } else if (tipo === "itinerario") {
    const { data, error } = await supabase
      .from("itinerarios")
      .select("nombre, itinerarios_fincas(orden, fincas_cooperativa(id, nombre, precio_litro, rutas_fincas(rutas_cooperativa(nombre))))")
      .eq("id", id!)
      .single();
    if (error || !data)
      return new Response("Itinerario no encontrado", { status: 404 });
    const ifList: any[] = Array.isArray(data.itinerarios_fincas) ? data.itinerarios_fincas : [];
    fincas = ifList
      .sort((a: any, b: any) => (a.orden ?? 0) - (b.orden ?? 0))
      .map((itF: any) => {
        const f = Array.isArray(itF.fincas_cooperativa) ? itF.fincas_cooperativa[0] : itF.fincas_cooperativa;
        if (!f) return null;
        const rutasFincasRaw = f.rutas_fincas;
        const rutasFincas: any[] = Array.isArray(rutasFincasRaw) ? rutasFincasRaw : rutasFincasRaw ? [rutasFincasRaw] : [];
        const rutaRaw = rutasFincas[0]?.rutas_cooperativa;
        const rutaNombre = rutaRaw
          ? Array.isArray(rutaRaw) ? (rutaRaw[0]?.nombre ?? "—") : (rutaRaw.nombre ?? "—")
          : "—";
        return { id: f.id, nombre: f.nombre, precio_litro: Number(f.precio_litro), ruta_nombre: rutaNombre };
      })
      .filter(Boolean) as FincaWithRuta[];
  } else {
    const { data: rutasRaw, error } = await supabase
      .from("rutas_cooperativa")
      .select("nombre, rutas_fincas(orden, fincas_cooperativa(id, nombre, precio_litro, itinerarios_fincas(orden, itinerario_id)))")
      .order("nombre");
    if (error) return new Response("Error al obtener rutas", { status: 500 });

    for (const r of rutasRaw ?? []) {
      const rfList: any[] = Array.isArray(r.rutas_fincas) ? r.rutas_fincas : [];
      const fincasConItinerario = rfList
        .map((rf: any) => {
          const f = Array.isArray(rf.fincas_cooperativa) ? rf.fincas_cooperativa[0] : rf.fincas_cooperativa;
          if (!f) return null;
          const itList: any[] = Array.isArray(f.itinerarios_fincas)
            ? f.itinerarios_fincas
            : f.itinerarios_fincas
              ? [f.itinerarios_fincas]
              : [];
          return {
            id: f.id,
            nombre: f.nombre,
            precio_litro: Number(f.precio_litro),
            ruta_nombre: r.nombre,
            rutaOrden: rf.orden ?? 0,
            itinerarioId: itList[0]?.itinerario_id ?? null,
            itinerarioOrden: itList[0]?.orden ?? 0,
          };
        })
        .filter(Boolean) as ((FincaWithRuta & {
          rutaOrden: number;
          itinerarioId: number | null;
          itinerarioOrden: number;
        })[]);
      fincas.push(...ordenarFincasPorItinerario(fincasConItinerario, r.nombre));
    }
  }

  if (fincas.length === 0)
    return new Response("Sin fincas para generar comprobantes", { status: 404 });

  // Recolecciones
  const fincaIds = fincas.map((f) => f.id);
  const recs = await fetchAllRecolecciones(supabase, fincaIds, startDate, endDate);

  // recMap: finca_id → fecha_iso → DayRec
  const recMap = new Map<number, Map<string, DayRec>>();
  for (const rec of recs) {
    if (!recMap.has(rec.finca_id)) recMap.set(rec.finca_id, new Map());
    recMap.get(rec.finca_id)!.set(rec.fecha, { litros: rec.litros, precio_litro: rec.precio_litro });
  }

  const allDates = generateDates(startDate, endDate);

  type VoucherData = {
    finca_nombre: string;
    ruta_nombre: string;
    periodo: string;
    litros: number;
    bruto: number;
    fedegan: number;
  };

  const vouchers: VoucherData[] = fincas
    .map((finca) => {
      const dayMap = recMap.get(finca.id) ?? new Map<string, DayRec>();
      const totalLitros = allDates.reduce((s, d) => s + (dayMap.get(d)?.litros ?? 0), 0);
      const precioBruto = allDates.reduce((s, d) => {
        const rec = dayMap.get(d);
        return s + (rec ? rec.litros * rec.precio_litro : 0);
      }, 0);
      return {
        finca_nombre: finca.nombre,
        ruta_nombre: finca.ruta_nombre,
        periodo,
        litros: Math.round(totalLitros * 1000) / 1000,
        bruto: Math.round(precioBruto),
        fedegan: Math.round(precioBruto * getFedeganPct(finca.ruta_nombre)),
      };
    })
    .filter((v) => v.litros > 0);

  if (vouchers.length === 0)
    return new Response("Sin recolecciones en el período seleccionado", { status: 404 });

  // Workbook
  const wb = new ExcelJS.Workbook();
  wb.creator = "Toca Lácteos";
  const sheetLabel = `Comp ${mesNombre}`.slice(0, 31);
  const ws = wb.addWorksheet(sheetLabel);

  // Columnas: slot(dollar+val+label) | sep | slot | sep | slot
  const SLOTS = [
    { dollar: 1, val: 2, label: 3 },
    { dollar: 5, val: 6, label: 7 },
    { dollar: 9, val: 10, label: 11 },
  ];
  const SEP_COLS = [4, 8];
  const ROWS_PER_VOUCHER = 10;
  const SEP_ROW_HEIGHT = 6;
  const VOUCHER_ROW_HEIGHT = 25;

  for (const s of SLOTS) {
    ws.getColumn(s.dollar).width = 3;
    ws.getColumn(s.val).width = 14;
    ws.getColumn(s.label).width = 9;
  }
  for (const c of SEP_COLS) ws.getColumn(c).width = 2;

  ws.pageSetup.paperSize = 9;
  ws.pageSetup.orientation = "portrait";
  ws.pageSetup.fitToPage = false;

  const rowBreaks: number[] = [];
  let vi = 0;

  while (vi < vouchers.length) {
    const pageIndex = Math.floor(vi / 9);
    const posInPage = vi % 9;
    const rowInPage = Math.floor(posInPage / 3);
    const colSlot = posInPage % 3;
    const pageStartRow = pageIndex * (ROWS_PER_VOUCHER * 3 + 2) + 1;
    const rowStart = pageStartRow + rowInPage * ROWS_PER_VOUCHER + rowInPage;

    if (colSlot === 0 && rowInPage > 0) {
      ws.getRow(rowStart - 1).height = SEP_ROW_HEIGHT;
    }
    for (let i = 0; i < ROWS_PER_VOUCHER; i++) {
      ws.getRow(rowStart + i).height = VOUCHER_ROW_HEIGHT;
    }
    if (colSlot === 2 && rowInPage === 2 && vi + 1 < vouchers.length) {
      rowBreaks.push(rowStart + ROWS_PER_VOUCHER - 1);
    }

    writeVoucher(ws, rowStart, SLOTS[colSlot].dollar, vouchers[vi]);
    vi++;
  }

  if (rowBreaks.length > 0) {
    (ws as any).pageSetup = { ...(ws as any).pageSetup, rowBreaks };
  }

  const buffer = await wb.xlsx.writeBuffer();
  const filename = `comprobantes_${filenameTag}.xlsx`;

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
