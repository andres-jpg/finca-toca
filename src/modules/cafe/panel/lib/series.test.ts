import { describe, expect, it } from "vitest";
import type { FilaProduccion } from "../types";
import { resumenPorLinea, resumenPorTipo, serieIngresoPorDia, serieKgPorDia, serieMermaPorDia } from "./series";

// El mismo dataset que supabase/tests/87_cafe_kpis.test.sql (cliente A), tal como lo devuelve cafe.produccion_diaria.
const f = (fecha: string, linea: FilaProduccion["linea"], tipo: FilaProduccion["tipo"], kgEntrada: number, kgSalida: number, valor: number): FilaProduccion => ({
  fecha,
  linea,
  tipo,
  kgEntrada,
  kgSalida,
  mermaPct: null,
  valor,
});
const FILAS: FilaProduccion[] = [
  f("2026-03-09", "maquila", "trilla", 500, 405, 700000),
  f("2026-03-10", "maquila", "tostion", 405, 332, 891000),
  f("2026-03-10", "maquila", "molienda", 332, 330, 332000),
  f("2026-03-10", "maquila", "empaque", 330, 330, 0),
  f("2026-03-10", "marca_propia", "tostion", 120, 98.4, 0),
  f("2026-03-10", "marca_propia", "empaque", 16.4, 16, 0),
  f("2026-03-10", "trilla", "trilla", 300, 230, 420000),
];
const DIAS = ["2026-03-09", "2026-03-10", "2026-03-11"];

describe("serieKgPorDia", () => {
  it("kg de entrada por día y tipo; los días sin procesos salen en 0", () => {
    expect(serieKgPorDia(FILAS, DIAS)).toEqual([
      { fecha: "2026-03-09", trilla: 500, tostion: 0, molienda: 0, empaque: 0 },
      { fecha: "2026-03-10", trilla: 300, tostion: 525, molienda: 332, empaque: 346.4 },
      { fecha: "2026-03-11", trilla: 0, tostion: 0, molienda: 0, empaque: 0 },
    ]);
  });
  it("ignora filas fuera de los días pedidos", () => {
    expect(serieKgPorDia(FILAS, ["2026-03-09"])).toHaveLength(1);
  });
});

describe("serieMermaPorDia", () => {
  it("merma ponderada del día calculada con los kilos (2 decimales); null si no hubo procesos de ese tipo", () => {
    const s = serieMermaPorDia(FILAS, DIAS);
    expect(s[0]).toEqual({ fecha: "2026-03-09", trilla: 19, tostion: null });
    // 10/03: trilla 70 de 300 kg = 23,33 %; tostión 94,6 de 525 kg = 18,02 %
    expect(s[1]).toEqual({ fecha: "2026-03-10", trilla: 23.33, tostion: 18.02 });
    expect(s[2]).toEqual({ fecha: "2026-03-11", trilla: null, tostion: null });
  });
});

describe("serieIngresoPorDia", () => {
  it("marca propia sale de las ventas; servicios, del valor de los procesos de las líneas de servicio", () => {
    const s = serieIngresoPorDia(FILAS, [{ fecha: "2026-03-10", total: 98000, nVentas: 1, unidadesCortesia: 2 }], DIAS);
    expect(s).toEqual([
      { fecha: "2026-03-09", marcaPropia: 0, servicios: 700000 },
      { fecha: "2026-03-10", marcaPropia: 98000, servicios: 1643000 },
      { fecha: "2026-03-11", marcaPropia: 0, servicios: 0 },
    ]);
  });
});

describe("resumenPorTipo", () => {
  it("suma kg, merma ponderada y valor por tipo de proceso, en orden de proceso", () => {
    const r = resumenPorTipo(FILAS);
    expect(r.map((x) => x.tipo)).toEqual(["trilla", "tostion", "molienda", "empaque"]);
    expect(r[0]).toMatchObject({ kgEntrada: 800, kgSalida: 635, mermaKg: 165, mermaPct: 20.63, valor: 1120000 });
    expect(r[1]).toMatchObject({ kgEntrada: 525, mermaPct: 18.02, valor: 891000 });
    expect(r[3]).toMatchObject({ kgEntrada: 346.4, mermaPct: 0.12, valor: 0 });
  });
  it("sin filas, nada", () => {
    expect(resumenPorTipo([])).toEqual([]);
  });
});

describe("resumenPorLinea", () => {
  it("cada línea con sus propios tipos; nunca se suman kilos de líneas distintas", () => {
    const r = resumenPorLinea(FILAS);
    expect(r.map((l) => l.linea)).toEqual(["marca_propia", "trilla", "maquila"]);
    expect(r[0].procesos.map((p) => p.tipo)).toEqual(["tostion", "empaque"]);
    expect(r[1].procesos).toHaveLength(1);
    expect(r[1].procesos[0]).toMatchObject({ kgEntrada: 300, mermaPct: 23.33, valor: 420000 });
    expect(r[2].procesos[0]).toMatchObject({ tipo: "trilla", kgEntrada: 500, mermaPct: 19 });
  });
  it("una línea sin procesos no aparece", () => {
    expect(resumenPorLinea(FILAS.filter((x) => x.linea === "trilla")).map((l) => l.linea)).toEqual(["trilla"]);
  });
});
