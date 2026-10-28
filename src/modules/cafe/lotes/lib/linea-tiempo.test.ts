import { describe, expect, it } from "vitest";
import {
  construirLineaDeTiempo,
  etiquetaMotivoMovimiento,
  listaBultos,
  mermaPctBache,
  type ProcesoLinea,
  type RecepcionLinea,
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
