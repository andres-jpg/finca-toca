import { describe, expect, it } from "vitest";
import { repartirPeso } from "./repartir-peso";

const suma = (partes: number[]) => Math.round(partes.reduce((a, b) => a + b * 1000, 0)) / 1000;

describe("repartirPeso", () => {
  it("375 kg en 6 bultos: 62,500 ×6", () => {
    expect(repartirPeso(375, 6)).toEqual([62.5, 62.5, 62.5, 62.5, 62.5, 62.5]);
  });

  it("100 kg en 3 bultos: el último absorbe el resto", () => {
    expect(repartirPeso(100, 3)).toEqual([33.333, 33.333, 33.334]);
  });

  it("un solo bulto lleva todo el peso", () => {
    expect(repartirPeso(62.5, 1)).toEqual([62.5]);
    expect(repartirPeso(0.001, 1)).toEqual([0.001]);
  });

  it("totales con decimales", () => {
    expect(repartirPeso(125.5, 2)).toEqual([62.75, 62.75]);
    expect(repartirPeso(10.001, 3)).toEqual([3.333, 3.333, 3.335]);
    expect(repartirPeso(500, 8)).toEqual([62.5, 62.5, 62.5, 62.5, 62.5, 62.5, 62.5, 62.5]);
  });

  it("siempre suma el total exacto, sin ruido de coma flotante", () => {
    for (const [total, n] of [
      [100, 3],
      [10, 6],
      [0.1 + 0.2, 7],
      [1234.567, 11],
      [999.999, 200],
    ] as const) {
      const partes = repartirPeso(total, n);
      expect(partes).toHaveLength(n);
      expect(suma(partes)).toBe(Math.round(total * 1000) / 1000);
      for (const p of partes) {
        expect(p).toBeGreaterThan(0);
        expect(Math.round(p * 1000)).toBeCloseTo(p * 1000, 6);
      }
    }
  });

  it("las partes salvo la última son iguales y la última no es menor", () => {
    const partes = repartirPeso(10, 6);
    expect(partes.slice(0, 5).every((p) => p === partes[0])).toBe(true);
    expect(partes[5]).toBeGreaterThanOrEqual(partes[0]);
  });

  it("rechaza entradas inválidas", () => {
    expect(() => repartirPeso(100, 0)).toThrow(RangeError);
    expect(() => repartirPeso(100, 2.5)).toThrow(RangeError);
    expect(() => repartirPeso(0, 3)).toThrow(RangeError);
    expect(() => repartirPeso(-5, 3)).toThrow(RangeError);
    expect(() => repartirPeso(Number.NaN, 3)).toThrow(RangeError);
    expect(() => repartirPeso(0.1, 200)).toThrow(RangeError);
  });
});
