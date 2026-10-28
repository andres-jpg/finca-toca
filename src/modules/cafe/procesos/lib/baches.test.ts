import { describe, expect, it } from "vitest";
import { bachesCuadran, sugerirBaches, totalesBaches } from "./baches";

const suma = (partes: number[]) => Math.round(partes.reduce((a, b) => a + b * 1000, 0)) / 1000;

// Mismos casos que `cafe.sugerir_baches()` en `94_cafe_procesos.test.sql`.
describe("sugerirBaches", () => {
  it("81 kg con capacidad 13,5 → 6 baches de 13,5", () => {
    expect(sugerirBaches(81, 13.5)).toEqual([13.5, 13.5, 13.5, 13.5, 13.5, 13.5]);
  });

  it("100 kg → 8 baches de 12,5", () => {
    expect(sugerirBaches(100, 13.5)).toEqual([12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5]);
  });

  it("405 kg (la salida de la trilla del ejemplo) → 30 baches de 13,5", () => {
    const baches = sugerirBaches(405, 13.5);
    expect(baches).toHaveLength(30);
    expect(baches.every((b) => b === 13.5)).toBe(true);
  });

  it("justo la capacidad: un bache; menos que la capacidad: un bache con todo", () => {
    expect(sugerirBaches(13.5, 13.5)).toEqual([13.5]);
    expect(sugerirBaches(0.5, 13.5)).toEqual([0.5]);
    expect(sugerirBaches(0.001, 13.5)).toEqual([0.001]);
  });

  it("un gramo por encima de la capacidad ya pide otro bache (reparto igual)", () => {
    expect(sugerirBaches(13.501, 13.5)).toEqual([6.75, 6.751]);
    expect(sugerirBaches(14, 13.5)).toEqual([7, 7]);
  });

  it("el último bache absorbe el resto y todo suma el peso", () => {
    expect(sugerirBaches(100.001, 13.5)).toEqual([12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.501]);
    for (const peso of [0.3 + 0.6, 125, 187.5, 250, 333.333, 1000]) {
      const baches = sugerirBaches(peso, 13.5);
      expect(suma(baches)).toBe(Math.round(peso * 1000) / 1000);
      expect(Math.max(...baches)).toBeLessThanOrEqual(13.5);
    }
  });

  it("respeta otra capacidad", () => {
    expect(sugerirBaches(81, 10)).toEqual([9, 9, 9, 9, 9, 9, 9, 9, 9]);
  });

  it("peso o capacidad no válidos lanzan RangeError", () => {
    expect(() => sugerirBaches(0, 13.5)).toThrow(RangeError);
    expect(() => sugerirBaches(-1, 13.5)).toThrow(RangeError);
    expect(() => sugerirBaches(Number.NaN, 13.5)).toThrow(RangeError);
    expect(() => sugerirBaches(81, 0)).toThrow(RangeError);
    expect(() => sugerirBaches(81, Number.NaN)).toThrow(RangeError);
  });
});

describe("totalesBaches y bachesCuadran", () => {
  const baches = [
    { peso_entrada_kg: 13.5, peso_salida_kg: 11.1 },
    { peso_entrada_kg: 13.5, peso_salida_kg: 11.2 },
  ];

  it("suma entradas y salidas sin ruido de coma flotante", () => {
    expect(totalesBaches(baches)).toEqual({ entradaKg: 27, salidaKg: 22.3 });
    expect(totalesBaches([{ peso_entrada_kg: 0.1, peso_salida_kg: 0.2 }, { peso_entrada_kg: 0.2, peso_salida_kg: 0.1 }])).toEqual({
      entradaKg: 0.3,
      salidaKg: 0.3,
    });
    expect(totalesBaches([])).toEqual({ entradaKg: 0, salidaKg: 0 });
  });

  it("cuadran si suman la entrada y la salida del proceso (tolerancia de 1 g)", () => {
    expect(bachesCuadran(baches, 27, 22.3)).toBe(true);
    expect(bachesCuadran(baches, 27.001, 22.299)).toBe(true);
  });

  it("no cuadran si difieren más de 1 g o si no hay baches", () => {
    expect(bachesCuadran(baches, 27.002, 22.3)).toBe(false);
    expect(bachesCuadran(baches, 27, 22.5)).toBe(false);
    expect(bachesCuadran([], 0, 0)).toBe(false);
  });

  it("los 30 baches del ejemplo suman 405 → 332", () => {
    const treinta = Array.from({ length: 30 }, (_, i) => ({ peso_entrada_kg: 13.5, peso_salida_kg: i < 26 ? 11 : 11.5 }));
    expect(totalesBaches(treinta)).toEqual({ entradaKg: 405, salidaKg: 332 });
    expect(bachesCuadran(treinta, 405, 332)).toBe(true);
  });
});
