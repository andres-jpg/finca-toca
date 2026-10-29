import { describe, expect, it } from "vitest";
import {
  construirLineaDeTiempo,
  etiquetaMotivoMovimiento,
  listaBultos,
  mermaPctBache,
  type ProcesoLinea,
  type ReaperturaLinea,
  type RecepcionLinea,
  type RemisionLinea,
} from "./linea-tiempo";

const recepcion: RecepcionLinea = {
  fecha: "2026-11-05",
  creadoEn: "2026-11-05T15:00:00Z",
  creadoPor: "operativo@cofradia.test",
  linea: "servicio",
  tercero: "Juan Pérez",
  tipoCafe: null,
  pesoRecibidoKg: 500,
  numBultos: 8,
};

const proceso = (id: string, tipo: ProcesoLinea["tipo"], fecha: string, creadoEn: string, extra: Partial<ProcesoLinea> = {}): ProcesoLinea => ({
  id,
  tipo,
  fecha,
  creadoEn,
  creadoPor: null,
  bultos: [1, 2, 3, 4, 5, 6, 7, 8],
  pesoEntradaKg: 500,
  pesoSalidaKg: 405,
  mermaKg: 95,
  tarifaKg: 1400,
  valor: 700000,
  mermaReferenciaPct: 19,
  toleranciaPts: 3,
  desvio: false,
  nivelTueste: null,
  observaciones: null,
  baches: [],
  anulacion: null,
  ...extra,
});

const entrada = (procesos: ProcesoLinea[]) => ({ recepcion, numBultosLote: 8, procesos, movimientos: [], anulacionLote: null });

describe("construirLineaDeTiempo", () => {
  it("recepción primero y los procesos por fecha", () => {
    const e = construirLineaDeTiempo(
      entrada([proceso("b", "tostion", "2026-11-07", "2026-11-07T14:00:00Z"), proceso("a", "trilla", "2026-11-06", "2026-11-06T14:00:00Z")]),
    );
    expect(e.map((x) => x.clave)).toEqual(["recepcion", "proceso-a", "proceso-b"]);
  });
  it("el mismo día: recepción, luego procesos, luego movimientos; a igual tipo, por creación", () => {
    const e = construirLineaDeTiempo({
      ...entrada([
        proceso("segundo", "tostion", "2026-11-05", "2026-11-05T17:00:00Z"),
        proceso("primero", "trilla", "2026-11-05", "2026-11-05T16:00:00Z"),
      ]),
      movimientos: [
        { id: "m1", fecha: "2026-11-05", creadoEn: "2026-11-05T12:00:00Z", creadoPor: null, articulo: "Bolsa 500 g", cantidad: -10, motivo: "consumo", observaciones: null },
      ],
    });
    expect(e.map((x) => x.clave)).toEqual(["recepcion", "proceso-primero", "proceso-segundo", "movimiento-m1"]);
  });
  it("la anulación del lote cierra la historia aunque su fecha sea la de la recepción", () => {
    const e = construirLineaDeTiempo({
      ...entrada([]),
      anulacionLote: { en: "2026-11-05T20:00:00Z", por: "admin@cofradia.test", motivo: "Duplicado" },
    });
    expect(e.map((x) => x.clase)).toEqual(["recepcion", "anulacion_lote"]);
  });
  it("conserva los procesos anulados", () => {
    const e = construirLineaDeTiempo(
      entrada([proceso("x", "trilla", "2026-11-06", "2026-11-06T14:00:00Z", { anulacion: { en: "2026-11-06T18:00:00Z", por: null, motivo: "Pesaje errado" } })]),
    );
    expect(e).toHaveLength(2);
  });
  it("no muta lo que recibe", () => {
    const procesos = [proceso("b", "tostion", "2026-11-07", "2026-11-07T14:00:00Z"), proceso("a", "trilla", "2026-11-06", "2026-11-06T14:00:00Z")];
    construirLineaDeTiempo(entrada(procesos));
    expect(procesos.map((p) => p.id)).toEqual(["b", "a"]);
  });
});

describe("listaBultos", () => {
  it("lista, o «todos» cuando fueron todos los del lote", () => {
    expect(listaBultos([3, 1, 2], 6)).toBe("1, 2, 3");
    expect(listaBultos([1, 2, 3, 4, 5, 6], 6)).toBe("todos (6)");
    expect(listaBultos([1], 1)).toBe("1");
    expect(listaBultos([], 6)).toBe("—");
  });
});

describe("mermaPctBache / etiquetaMotivoMovimiento", () => {
  it("la merma de un bache sale de sus kilos", () => {
    expect(mermaPctBache({ mermaKg: 2.43, pesoEntradaKg: 13.5 })).toBe(18);
  });
  it("etiqueta el motivo o lo deja como viene", () => {
    expect(etiquetaMotivoMovimiento("consumo")).toBe("Consumo");
    expect(etiquetaMotivoMovimiento("otro")).toBe("otro");
  });
});

describe("construirLineaDeTiempo: remisión de entrega (CO-32)", () => {
  const remision = (id: string, fecha: string, extra: Partial<RemisionLinea> = {}): RemisionLinea => ({
    id,
    numero: `REM-2026-000${id}`,
    fecha,
    creadoEn: `${fecha}T20:00:00Z`,
    creadoPor: null,
    pesoRecibidoKg: 500,
    pesoEntregadoKg: 330,
    mermaTotalKg: 170,
    valorServicios: 1923000,
    forzada: false,
    anulacion: null,
    ...extra,
  });

  it("va después de los procesos del mismo día y antes de la anulación del lote", () => {
    const eventos = construirLineaDeTiempo({
      recepcion,
      numBultosLote: 8,
      procesos: [proceso("p1", "trilla", "2026-11-12", "2026-11-12T14:00:00Z")],
      movimientos: [],
      remisiones: [remision("1", "2026-11-12")],
      anulacionLote: { en: "2026-11-12T23:00:00Z", por: null, motivo: "x" },
    });
    expect(eventos.map((e) => e.clase)).toEqual(["recepcion", "proceso", "remision", "anulacion_lote"]);
  });

  it("conserva las anuladas y ordena las remisiones por fecha de entrega", () => {
    const eventos = construirLineaDeTiempo({
      recepcion,
      numBultosLote: 8,
      procesos: [],
      movimientos: [],
      remisiones: [
        remision("2", "2026-11-14"),
        remision("1", "2026-11-12", { anulacion: { en: "2026-11-13T10:00:00Z", por: null, motivo: "Error" } }),
      ],
      anulacionLote: null,
    });
    expect(eventos.filter((e) => e.clase === "remision").map((e) => e.clave)).toEqual(["remision-1", "remision-2"]);
  });

  it("sin remisiones (o sin el parámetro) la línea de tiempo no cambia", () => {
    const sin = construirLineaDeTiempo({ recepcion, numBultosLote: 8, procesos: [], movimientos: [], anulacionLote: null });
    const vacio = construirLineaDeTiempo({ recepcion, numBultosLote: 8, procesos: [], movimientos: [], remisiones: [], anulacionLote: null });
    expect(sin).toEqual(vacio);
    expect(sin.map((e) => e.clase)).toEqual(["recepcion"]);
  });
});

describe("construirLineaDeTiempo: reapertura de producto empacado (CO-33)", () => {
  const reapertura = (id: string, fecha: string, creadoEn: string, extra: Partial<ReaperturaLinea> = {}): ReaperturaLinea => ({
    id,
    fecha,
    creadoEn,
    creadoPor: "ana@cofradia.test",
    presentacionG: 500,
    unidades: 40,
    producto: "Excelso 500 g",
    pesoKg: 20,
    motivo: "Pedido de 2.500 g molido",
    texto: "40 × Excelso 500 g (20 kg)",
    ...extra,
  });
  const base = { recepcion, numBultosLote: 8, movimientos: [], anulacionLote: null };

  it("es un evento propio y queda antes de la molienda que se hace sobre ella el mismo día", () => {
    const eventos = construirLineaDeTiempo({
      ...base,
      procesos: [proceso("m", "molienda", "2026-11-15", "2026-11-15T16:00:00Z", { bultos: [], reaperturaId: "r1" })],
      reaperturas: [reapertura("r1", "2026-11-15", "2026-11-15T15:00:00Z")],
    });
    expect(eventos.map((e) => e.clave)).toEqual(["recepcion", "reapertura-r1", "proceso-m"]);
  });

  it("los procesos de la reapertura llevan su reapertura; los del lote no", () => {
    const eventos = construirLineaDeTiempo({
      ...base,
      procesos: [
        proceso("t", "tostion", "2026-11-06", "2026-11-06T14:00:00Z"),
        proceso("m", "molienda", "2026-11-15", "2026-11-15T16:00:00Z", { bultos: [], reaperturaId: "r1" }),
      ],
      reaperturas: [reapertura("r1", "2026-11-15", "2026-11-15T15:00:00Z")],
    });
    const procesos = eventos.filter((e) => e.clase === "proceso");
    expect(procesos.map((e) => (e.clase === "proceso" ? e.reapertura?.id ?? null : "x"))).toEqual([null, "r1"]);
  });

  it("una reapertura de otro día va por fecha, antes de la remisión y de la anulación del lote", () => {
    const eventos = construirLineaDeTiempo({
      ...base,
      procesos: [proceso("p", "tostion", "2026-11-06", "2026-11-06T14:00:00Z")],
      reaperturas: [reapertura("r2", "2026-11-20", "2026-11-20T15:00:00Z"), reapertura("r1", "2026-11-10", "2026-11-10T15:00:00Z")],
      anulacionLote: { en: "2026-11-21T10:00:00Z", por: null, motivo: "x" },
    });
    expect(eventos.map((e) => e.clave)).toEqual(["recepcion", "proceso-p", "reapertura-r1", "reapertura-r2", "anulacion-lote"]);
  });

  it("sin reaperturas no cambia nada", () => {
    const eventos = construirLineaDeTiempo({ ...base, procesos: [] });
    expect(eventos.map((e) => e.clase)).toEqual(["recepcion"]);
  });
});
