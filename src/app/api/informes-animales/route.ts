import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getUserRole } from "@/lib/auth/get-user-role";
import { getAnimales } from "@/features/animales/actions/animales.actions";
import { RAZA_LABELS } from "@/lib/animales/razas";
import { ESTADO_PRODUCTIVO_LABELS, ESTADO_REPRODUCTIVO_LABELS, formatEdad } from "@/lib/animales/estados";
import type { Animal, AnimalSexo, EstadoProductivo, EstadoReproductivo } from "@/types";

const COLOR_HEADER_BG = "FF0D9488"; // teal-600, mismo tono que informes-cooperativa
const COLOR_HEADER_FG = "FFFFFFFF";

const TODOS = "todos";

const COLUMNS: { header: string; width: number }[] = [
  { header: "Raza", width: 14 },
  { header: "Sexo", width: 10 },
  { header: "ID", width: 12 },
  { header: "Número de registro", width: 18 },
  { header: "Nombre", width: 22 },
  { header: "Edad", width: 14 },
  { header: "Estado productivo", width: 16 },
  { header: "Estado reproductivo", width: 18 },
  { header: "Cantidad de crías", width: 16 },
  { header: "Sangre", width: 24 },
  { header: "Nombre de la madre", width: 20 },
  { header: "Nombre del padre", width: 20 },
];

/**
 * Cuenta las crías de cada animal sobre el universo completo de animales (no el filtrado
 * por la petición), igual que `getAnimalById()`: una cría cuenta para su madre y su padre
 * de forma independiente si ambos están registrados.
 */
function contarCrias(animales: Animal[]): Map<string, number> {
  const conteo = new Map<string, number>();
  for (const a of animales) {
    if (a.madre_id) conteo.set(a.madre_id, (conteo.get(a.madre_id) ?? 0) + 1);
    if (a.padre_id) conteo.set(a.padre_id, (conteo.get(a.padre_id) ?? 0) + 1);
  }
  return conteo;
}

function nombrePadre(a: Animal): string {
  return a.padre_nombre ?? a.padre_pajilla_nombre ?? a.padre_alquiler_nombre ?? "";
}

function nombreMadre(a: Animal): string {
  return a.madre_nombre ?? a.madre_externa_nombre ?? "";
}

export async function GET(req: NextRequest) {
  const role = await getUserRole();
  if (!role || !["admin", "viewer"].includes(role)) {
    return new Response("No autorizado", { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const sexoFiltro = searchParams.get("sexo") ?? TODOS;
  const productivoFiltro = searchParams.get("productivo") ?? TODOS;
  const reproductivoFiltro = searchParams.get("reproductivo") ?? TODOS;
  const alta = (searchParams.get("alta") ?? "true") === "true";

  const todos = await getAnimales();
  const crias = contarCrias(todos);

  const filas = todos.filter(
    (a) =>
      a.alta === alta &&
      (sexoFiltro === TODOS || a.sexo === (sexoFiltro as AnimalSexo)) &&
      (productivoFiltro === TODOS || a.estado_productivo === (productivoFiltro as EstadoProductivo)) &&
      (reproductivoFiltro === TODOS || a.estado_reproductivo === (reproductivoFiltro as EstadoReproductivo))
  );

  const wb = new ExcelJS.Workbook();
  wb.creator = "Toca Lácteos";
  const ws = wb.addWorksheet("Animales");
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];

  COLUMNS.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width;
  });

  const headerRow = ws.getRow(1);
  headerRow.height = 20;
  COLUMNS.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: COLOR_HEADER_FG } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLOR_HEADER_BG } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  filas.forEach((a, idx) => {
    const row = ws.getRow(idx + 2);
    row.values = [
      a.raza ? (RAZA_LABELS[a.raza] ?? a.raza) : "",
      a.sexo === "hembra" ? "Hembra" : "Macho",
      a.identificador,
      a.numero_registro ?? "",
      a.nombre,
      formatEdad(a.fecha_nacimiento) ?? "",
      a.estado_productivo ? ESTADO_PRODUCTIVO_LABELS[a.estado_productivo] : "",
      a.estado_reproductivo ? ESTADO_REPRODUCTIVO_LABELS[a.estado_reproductivo] : "",
      crias.get(a.id) ?? 0,
      a.sangre ?? "",
      nombreMadre(a),
      nombrePadre(a),
    ];
  });

  const buffer = await wb.xlsx.writeBuffer();
  const fecha = new Date().toISOString().slice(0, 10);

  return new Response(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="animales_${fecha}.xlsx"`,
    },
  });
}
