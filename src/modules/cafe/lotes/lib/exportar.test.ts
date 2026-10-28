import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { generarExcel } from "@/modules/core/export/generar-excel";
import {
  construirHojasLotes,
  fraccionMerma,
  ordenarProcesos,
  textoAlertasCalidad,
  textoServicios,
  type LoteExport,
  type ProcesoExport,
} from "./exportar";
import { describirFiltros, parsearFiltros } from "./filtros";

const base = (extra: Partial<LoteExport>): LoteExport => ({
  id: "x",
  codigo: "MP-2026-0001",
  linea: "marca_propia",
  servicios: [],
  tercero: "Finca La Esperanza",
  identificacion: "900123456",
  tipoCafe: "Excelso",
  fechaRecepcion: "2026-11-01",
  numBultos: 6,
  pesoRecibidoKg: 375,
  humedadPct: null,
  densidad: null,
  alertasCalidad: [],
  nivelTueste: null,
  precioCompraKg: 18_500,
  valorCompra: 6_937_500,
  pesoActualKg: 375,
  mermaTotalKg: 0,
  valorServicios: 0,
  estado: "recibido",
  avanceTexto: "0 de 3",
  remision: null,
  ...extra,
});

// Dataset fijo: dos lotes de marca propia y uno de maquila (el ejemplo del informe: 500 kg → trilla → tostión).
const LOTES: LoteExport[] = [
  base({ id: "1", codigo: "MP-2026-0002", fechaRecepcion: "2026-11-05", pesoRecibidoKg: 100, numBultos: 2, pesoActualKg: 100, valorCompra: 1_850_000 }),
  base({ id: "2", codigo: "MP-2026-0001" }),
  base({
    id: "3",
    codigo: "MQ-2026-0001",
    linea: "servicio",
    servicios: ["empaque", "tostion", "trilla"],
    tercero: "Cafés del Norte",
    identificacion: "800555111",
    tipoCafe: null,
    fechaRecepcion: "2026-11-02",
    numBultos: 8,
    pesoRecibidoKg: 500,
    humedadPct: 12.5,
    densidad: 0.71,
    alertasCalidad: ["humedad_alta"],
    nivelTueste: "medio",
    precioCompraKg: null,
    valorCompra: null,
    pesoActualKg: 332.1,
    mermaTotalKg: 167.9,
    valorServicios: 1_591_000,
    estado: "parcial",
    avanceTexto: "1 de 3",
  }),
];

const proceso = (extra: Partial<ProcesoExport>): ProcesoExport => ({
  loteCodigo: "MQ-2026-0001",
  linea: "servicio",
  fecha: "2026-11-03",
  tipo: "trilla",
  numBultos: 8,
  pesoEntradaKg: 500,
  pesoSalidaKg: 405,
  mermaKg: 95,
  mermaReferenciaPct: 19,
  desvio: false,
  nivelTueste: null,
  tarifaKg: 1400,
  valor: 700_000,
  registradoPor: "operario@cofradia.test",
  creadoEn: "2026-11-03T15:00:00Z",
  anulado: false,
  motivoAnulacion: null,
  ...extra,
});

const PROCESOS: ProcesoExport[] = [
  proceso({}),
  proceso({ fecha: "2026-11-04", tipo: "tostion", pesoEntradaKg: 405, pesoSalidaKg: 332, mermaKg: 73, mermaReferenciaPct: 18, nivelTueste: "medio", tarifaKg: 2200, valor: 891_000, creadoEn: "2026-11-04T15:00:00Z" }),
  proceso({ fecha: "2026-11-05", tipo: "molienda", numBultos: null, anulado: true, motivoAnulacion: "Pesaje equivocado", mermaReferenciaPct: null, creadoEn: "2026-11-05T15:00:00Z" }),
];

async function leer(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer as unknown as ArrayBuffer);
  return libro;
}

const OPCIONES = { tenant: { nombre: "Cofradía", zonaHoraria: "America/Bogota" }, generadoEn: new Date("2026-11-30T12:00:00Z") };

describe("construirHojasLotes → Excel", () => {
  const filtros = parsearFiltros({ tipo: "maquila", estado: "parcial", desde: "2026-11-01", hasta: "2026-11-30" });
  const descripcion = describirFiltros(filtros);

  it("genera dos hojas, «Lotes» y «Procesos», con las cabeceras de HU-F1-15", async () => {
    const libro = await leer(await generarExcel(construirHojasLotes(LOTES, PROCESOS, descripcion), OPCIONES));
    expect(libro.worksheets.map((w) => w.name)).toEqual(["Lotes", "Procesos"]);

    expect((libro.getWorksheet("Lotes")!.getRow(3).values as unknown[]).slice(1)).toEqual([
      "Código", "Línea", "Tipo", "Cliente / Proveedor", "Identificación", "Tipo de café", "Fecha recepción", "Bultos", "Kg recibidos",
      "Humedad %", "Densidad", "Alertas de calidad", "Servicios contratados", "Nivel de tueste", "Precio compra/kg", "Valor compra",
      "Kg actuales", "Merma total kg", "Merma total %", "Valor servicios", "Estado", "Avance", "Remisión",
    ]);
    expect((libro.getWorksheet("Procesos")!.getRow(3).values as unknown[]).slice(1)).toEqual([
      "Código lote", "Línea", "Fecha", "Proceso", "Bultos", "Kg entrada", "Kg salida", "Merma kg", "Merma %", "Referencia %",
      "Desvío", "Nivel de tueste", "Tarifa/kg", "Valor", "Registrado por", "Anulado", "Motivo de anulación",
    ]);
  });

  it("pone los filtros legibles en la fila 2 de las dos hojas", async () => {
    const libro = await leer(await generarExcel(construirHojasLotes(LOTES, PROCESOS, descripcion), OPCIONES));
    expect(descripcion).toBe("Tipo: Maquila · Estado: Parcial · 01/11/2026–30/11/2026");
    expect(libro.getWorksheet("Lotes")!.getCell("A2").value).toBe(`Lotes  ·  ${descripcion}`);
    expect(libro.getWorksheet("Procesos")!.getCell("A2").value).toBe(`Procesos  ·  ${descripcion}`);
  });

  it("escribe el lote de maquila con tipo, servicios, calidad, formatos y fechas sin correrse un día", async () => {
    const ws = (await leer(await generarExcel(construirHojasLotes(LOTES, PROCESOS, descripcion), OPCIONES))).getWorksheet("Lotes")!;
    // Orden de entrada: MP-0002, MP-0001, subtotal MP, MQ-0001, subtotal servicios.
    expect(ws.getCell("A4").value).toBe("MP-2026-0002");
    expect(ws.getCell("A7").value).toBe("MQ-2026-0001");
    expect(ws.getCell("B7").value).toBe("Servicio");
    expect(ws.getCell("C7").value).toBe("Trilla + maquila");
    expect(ws.getCell("D7").value).toBe("Cafés del Norte");
    expect(ws.getCell("G7").value).toEqual(new Date(Date.UTC(2026, 10, 2))); // 02/11/2026, no 01/11
    expect(ws.getCell("G7").numFmt).toBe("dd/mm/yyyy");
    expect(ws.getCell("I7").value).toBe(500);
    expect(ws.getCell("I7").numFmt).toBe("#,##0.000");
    expect(ws.getCell("J7").value).toBeCloseTo(0.125, 10); // humedad 12,5 % como fracción
    expect(ws.getCell("J7").numFmt).toBe("0.0%");
    expect(ws.getCell("L7").value).toBe("Humedad alta");
    expect(ws.getCell("M7").value).toBe("Trilla, Tostión, Empaque");
    expect(ws.getCell("N7").value).toBe("Medio");
    expect(ws.getCell("Q7").value).toBe(332.1);
    expect(ws.getCell("S7").value).toBeCloseTo(0.3358, 10); // 167,9 / 500 = 33,58 %
    expect(ws.getCell("U7").value).toBe("Parcial");
    expect(ws.getCell("V7").value).toBe("1 de 3");
  });

  it("totales por línea con SUM real, sin un total que mezcle propio y terceros", async () => {
    const ws = (await leer(await generarExcel(construirHojasLotes(LOTES, PROCESOS, descripcion), OPCIONES))).getWorksheet("Lotes")!;
    expect(ws.getCell("A6").value).toBe("Subtotal marca propia");
    expect(ws.getCell("H6").value).toMatchObject({ formula: "SUM(H4:H5)", result: 8 });
    expect(ws.getCell("I6").value).toMatchObject({ formula: "SUM(I4:I5)", result: 475 });
    expect(ws.getCell("P6").value).toMatchObject({ formula: "SUM(P4:P5)", result: 8_787_500 });
    expect(ws.getCell("A8").value).toBe("Subtotal servicios (clientes)");
    expect(ws.getCell("I8").value).toMatchObject({ formula: "SUM(I7:I7)", result: 500 });
    expect(ws.getCell("T8").value).toMatchObject({ formula: "SUM(T7:T7)", result: 1_591_000 });
    expect(ws.getCell("A9").value).toBeNull(); // ningún «TOTAL» general
  });

  it("procesos: merma % calculada desde los kilos (18,02 %), referencia, desvío y anulados", async () => {
    const ws = (await leer(await generarExcel(construirHojasLotes(LOTES, PROCESOS, descripcion), OPCIONES))).getWorksheet("Procesos")!;
    expect(ws.getCell("A4").value).toBe("MQ-2026-0001");
    expect(ws.getCell("D4").value).toBe("Trilla");
    expect(ws.getCell("E4").value).toBe(8);
    expect(ws.getCell("H4").value).toBe(95);
    expect(ws.getCell("I4").value).toBeCloseTo(0.19, 10);
    expect(ws.getCell("I4").numFmt).toBe("0.0%");
    expect(ws.getCell("J4").value).toBeCloseTo(0.19, 10);
    expect(ws.getCell("K4").value).toBe("No");
    // tostión: 73 / 405 = 18,0247 → 18,02 % (no el 18,025 guardado, que redondearía a 18,03)
    expect(ws.getCell("I5").value).toBeCloseTo(0.1802, 10);
    expect(ws.getCell("L5").value).toBe("Medio");
    expect(ws.getCell("M5").value).toBe(2200);
    expect(ws.getCell("N5").value).toBe(891_000);
    expect(ws.getCell("O5").value).toBe("operario@cofradia.test");
    // molienda anulada: sin bultos ni referencia
    expect(ws.getCell("D6").value).toBe("Molienda");
    expect(ws.getCell("E6").value).toBeNull();
    expect(ws.getCell("J6").value).toBeNull();
    expect(ws.getCell("P6").value).toBe("Sí");
    expect(ws.getCell("Q6").value).toBe("Pesaje equivocado");
  });

  it("sin filas, las dos hojas existen igual (solo cabeceras)", async () => {
    const libro = await leer(await generarExcel(construirHojasLotes([], [], "Sin filtros"), OPCIONES));
    expect(libro.worksheets.map((w) => w.name)).toEqual(["Lotes", "Procesos"]);
    expect(libro.getWorksheet("Lotes")!.getCell("A4").value).toBeNull();
  });
});

describe("helpers de la exportación", () => {
  it("fraccionMerma usa los kilos (2 decimales) y devuelve fracción", () => {
    expect(fraccionMerma(95, 500)).toBe(0.19);
    expect(fraccionMerma(73, 405)).toBe(0.1802);
    expect(fraccionMerma(0, 0)).toBeNull();
  });
  it("textoAlertasCalidad traduce los códigos y deja pasar los desconocidos", () => {
    expect(textoAlertasCalidad(["humedad_alta", "densidad_baja"])).toBe("Humedad alta, Densidad baja");
    expect(textoAlertasCalidad(["otra"])).toBe("otra");
    expect(textoAlertasCalidad([])).toBe("");
  });
  it("textoServicios ordena como la planta y no inventa contrato en marca propia", () => {
    expect(textoServicios("servicio", ["molienda", "trilla", "tostion", "empaque"])).toBe("Trilla, Tostión, Molienda, Empaque");
    expect(textoServicios("marca_propia", [])).toBe("");
  });
  it("ordenarProcesos: por lote (orden de la hoja Lotes), fecha, registro y paso", () => {
    const filas = [
      { loteCodigo: "B", fecha: "2026-11-01", creadoEn: "2026-11-01T10:00:00Z", tipo: "tostion" as const },
      { loteCodigo: "A", fecha: "2026-11-09", creadoEn: "2026-11-09T10:00:00Z", tipo: "trilla" as const },
      { loteCodigo: "A", fecha: "2026-11-03", creadoEn: "2026-11-03T12:00:00Z", tipo: "tostion" as const },
      { loteCodigo: "A", fecha: "2026-11-03", creadoEn: "2026-11-03T12:00:00Z", tipo: "trilla" as const },
      { loteCodigo: "Z", fecha: "2026-10-01", creadoEn: "2026-10-01T10:00:00Z", tipo: "trilla" as const },
    ];
    const orden = ordenarProcesos(filas, ["A", "B"]).map((p) => `${p.loteCodigo}${p.fecha.slice(-2)}${p.tipo[0]}`);
    expect(orden).toEqual(["A03t", "A03t", "A09t", "B01t", "Z01t"]);
  });
});
