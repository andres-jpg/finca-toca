import { describe, expect, it } from "vitest";
import type { FilaProduccion, VentaDiaria } from "../types";
import { serieIngresoPorDia } from "./series";

const fila = (fecha: string, linea: FilaProduccion["linea"], valor: number): FilaProduccion => ({ fecha, linea, tipo: "trilla", kgEntrada: 0, kgSalida: 0, mermaPct: null, valor });
const venta = (fecha: string, total: number): VentaDiaria => ({ fecha, total, nVentas: 1, unidadesCortesia: 0 });

describe("serieIngresoPorDia", () => {
  const dias = ["2026-03-09", "2026-03-10", "2026-03-11"];
  it("apila marca propia y servicios y trae el total de cada día", () => {
    const s = serieIngresoPorDia([fila("2026-03-10", "maquila", 700000), fila("2026-03-10", "trilla", 100000)], [venta("2026-03-10", 98000), venta("2026-03-11", 50000)], dias);
    expect(s).toEqual([
      { fecha: "2026-03-09", marcaPropia: 0, servicios: 0, total: 0 },
      { fecha: "2026-03-10", marcaPropia: 98000, servicios: 800000, total: 898000 },
      { fecha: "2026-03-11", marcaPropia: 50000, servicios: 0, total: 50000 },
    ]);
  });
  it("el valor de los procesos de marca propia no es ingreso", () => {
    expect(serieIngresoPorDia([fila("2026-03-09", "marca_propia", 123)], [], dias)[0].total).toBe(0);
  });
  it("días fuera de la lista no aparecen", () => {
    expect(serieIngresoPorDia([fila("2026-02-01", "maquila", 5)], [], dias).every((p) => p.total === 0)).toBe(true);
  });
});
