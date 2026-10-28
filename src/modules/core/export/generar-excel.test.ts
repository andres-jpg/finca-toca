import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { generarExcel, type Hoja } from "./generar-excel";

interface Lote {
  codigo: string;
  kg: number | string;
  valor: number;
  merma: number;
  recibido: string;
  llegada: string;
}

const FILAS: Lote[] = [
  { codigo: "MP-2026-0001", kg: 100.5, valor: 140_700, merma: 0.19, recibido: "2026-01-31", llegada: "2026-02-01T03:30:00Z" },
  { codigo: "MP-2026-0002", kg: "20.25", valor: 28_350, merma: 0.185, recibido: "2026-02-01", llegada: "2026-02-01T15:00:00Z" },
];

const hojaLotes = (extra: Partial<Hoja<Lote>> = {}): Hoja<Lote> => ({
  nombre: "Lotes",
  titulo: "Lotes recibidos",
  filas: FILAS,
  columnas: [
    { header: "Código", key: "codigo" },
    { header: "Peso (kg)", key: "kg", formato: "peso" },
    { header: "Valor", key: "valor", formato: "moneda" },
    { header: "Merma", key: "merma", formato: "porcentaje" },
    { header: "Recibido", key: "recibido", formato: "fecha" },
    { header: "Llegó", key: "llegada", formato: "fechaHora" },
    { header: "Doble", key: (l) => l.valor * 2, formato: "entero" },
  ],
  ...extra,
});

async function leer(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as unknown as ArrayBuffer);
  return libro;
}

const OPCIONES = { tenant: { nombre: "Cofradía", zonaHoraria: "America/Bogota" }, generadoEn: new Date("2026-03-01T12:00:00Z") };

describe("generarExcel", () => {
  it("escribe cliente, título con filtros, cabecera congelada y los datos", async () => {
    const libro = await leer(
      await generarExcel([hojaLotes()], { ...OPCIONES, filtrosAplicados: { Estado: "Activos", Rol: "Proveedor", Vacío: "" } }),
    );
    const ws = libro.getWorksheet("Lotes")!;

    expect(ws.getCell("A1").value).toBe("Cofradía");
    expect(ws.getCell("A2").value).toBe("Lotes recibidos  ·  Filtros: Estado: Activos; Rol: Proveedor");
    expect(ws.getRow(3).values).toEqual([undefined, "Código", "Peso (kg)", "Valor", "Merma", "Recibido", "Llegó", "Doble"]);
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 3 });
    expect(ws.getCell("A4").value).toBe("MP-2026-0001");
    expect(ws.getCell("A5").value).toBe("MP-2026-0002");
    expect(ws.getCell("G4").value).toBe(281_400); // columna con función
  });

  it("aplica los formatos de número: peso, moneda COP y porcentaje; acepta numeric como texto", async () => {
    const ws = (await leer(await generarExcel([hojaLotes()], OPCIONES))).getWorksheet("Lotes")!;

    expect(ws.getCell("B4").numFmt).toBe("#,##0.000");
    expect(ws.getCell("C4").numFmt).toBe('"$"#,##0');
    expect(ws.getCell("D4").numFmt).toBe("0.0%");
    expect(ws.getCell("G4").numFmt).toBe("#,##0");
    expect(ws.getCell("B5").value).toBe(20.25);
  });

  it("escribe las fechas en la zona del cliente, sin correr un día", async () => {
    const ws = (await leer(await generarExcel([hojaLotes()], OPCIONES))).getWorksheet("Lotes")!;

    expect(ws.getCell("E4").numFmt).toBe("dd/mm/yyyy");
    expect((ws.getCell("E4").value as Date).toISOString()).toBe("2026-01-31T00:00:00.000Z");
    expect(ws.getCell("F4").numFmt).toBe("dd/mm/yyyy hh:mm");
    // 03:30 UTC del 1/feb es 22:30 del 31/ene en Bogotá (UTC-5)
    expect((ws.getCell("F4").value as Date).toISOString()).toBe("2026-01-31T22:30:00.000Z");
    expect((ws.getCell("F5").value as Date).toISOString()).toBe("2026-02-01T10:00:00.000Z");
  });

  it("añade la fila de totales con fórmulas SUM, no con valores", async () => {
    const ws = (
      await leer(await generarExcel([hojaLotes({ totales: ["kg", "valor", "merma"] })], OPCIONES))
    ).getWorksheet("Lotes")!;

    expect(ws.getCell("A6").value).toBe("TOTAL");
    expect(ws.getCell("B6").value).toMatchObject({ formula: "SUM(B4:B5)" });
    expect(ws.getCell("C6").value).toMatchObject({ formula: "SUM(C4:C5)", result: 169_050 });
    expect(ws.getCell("D6").value).toMatchObject({ formula: "SUM(D4:D5)" });
    expect(ws.getCell("B6").numFmt).toBe("#,##0.000");
    expect(ws.getCell("C6").numFmt).toBe('"$"#,##0');
    expect(ws.getCell("E6").value).toBeNull(); // las columnas sin total quedan vacías
  });

  it("no pone fila de totales si no hay filas", async () => {
    const ws = (await leer(await generarExcel([hojaLotes({ filas: [], totales: ["valor"] })], OPCIONES))).getWorksheet("Lotes")!;
    expect(ws.actualRowCount).toBe(3); // cliente, título y cabecera: ni datos ni TOTAL
  });

  it("rechaza totales sobre una columna inexistente, no numérica o la primera", async () => {
    await expect(generarExcel([hojaLotes({ totales: ["nada" as keyof Lote] })], OPCIONES)).rejects.toThrow(/no tiene una columna/);
    await expect(generarExcel([hojaLotes({ totales: ["recibido"] })], OPCIONES)).rejects.toThrow(/no se puede sumar/);
    await expect(generarExcel([hojaLotes({ totales: ["codigo"] })], OPCIONES)).rejects.toThrow(/no se puede sumar/);
  });

  it("crea varias hojas con nombres válidos y únicos", async () => {
    const libro = await leer(
      await generarExcel([hojaLotes({ nombre: "Lotes: 2026/Q1?" }), hojaLotes({ nombre: "lotes 2026 q1" }), hojaLotes({ nombre: "Procesos", titulo: undefined })], OPCIONES),
    );
    expect(libro.worksheets.map((w) => w.name)).toEqual(["Lotes 2026 Q1", "lotes 2026 q1 (2)", "Procesos"]);
    expect(libro.getWorksheet("Procesos")!.getCell("A2").value).toBe("Procesos");
  });

  it("guarda el cliente como autor y siempre produce un libro con al menos una hoja", async () => {
    const libro = await leer(await generarExcel([], OPCIONES));
    expect(libro.creator).toBe("Cofradía");
    expect(libro.worksheets).toHaveLength(1);
  });
});
