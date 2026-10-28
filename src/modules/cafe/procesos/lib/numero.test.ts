import { describe, expect, it } from "vitest";
import { aTextoDecimal, fechaCorta, formatearCompacto, formatearPeso, formatearPorcentaje, parsearDecimal } from "./numero";

describe("parsearDecimal: la coma decimal se normaliza", () => {
  it.each([
    ["13,5", 13.5],
    ["405", 405],
    ["405,000", 405],
    ["0,5", 0.5],
    [",5", 0.5],
    ["13.5", 13.5],
    ["1.234,5", 1234.5],
    ["1.234", 1.234], // sin coma, un solo punto es el decimal
    ["405.000", 405],
    ["1.234.567", 1234567],
    ["  332,125 ", 332.125],
    ["12,", 12],
  ])("%j → %j", (texto, esperado) => {
    expect(parsearDecimal(texto)).toBe(esperado);
  });

  it.each([[""], ["   "], ["abc"], ["1,2,3"], ["-5"], ["12kg"], ["1.2.3"], ["1,234.5"], ["1.23,4"]])("%j no es un número", (texto) => {
    expect(parsearDecimal(texto)).toBeNull();
  });

  it("deja pasar un número y rechaza null, undefined, NaN y negativos", () => {
    expect(parsearDecimal(13.5)).toBe(13.5);
    expect(parsearDecimal(0)).toBe(0);
    expect(parsearDecimal(null)).toBeNull();
    expect(parsearDecimal(undefined)).toBeNull();
    expect(parsearDecimal(Number.NaN)).toBeNull();
    expect(parsearDecimal(-1)).toBeNull();
  });
});

describe("aTextoDecimal", () => {
  it("escribe con coma y sin miles ni ceros sobrantes", () => {
    expect(aTextoDecimal(13.5)).toBe("13,5");
    expect(aTextoDecimal(405)).toBe("405");
    expect(aTextoDecimal(1234.5678)).toBe("1234,568");
    expect(aTextoDecimal(null)).toBe("");
  });

  it("es el inverso de parsearDecimal", () => {
    for (const n of [13.5, 405, 0.125, 1234.567]) expect(parsearDecimal(aTextoDecimal(n))).toBe(n);
  });
});

describe("formatos", () => {
  it("formatearPeso: 3 decimales con coma y miles con punto", () => {
    expect(formatearPeso(405)).toBe("405,000");
    expect(formatearPeso(332.125)).toBe("332,125");
    expect(formatearPeso(1234.5)).toBe("1.234,500");
    expect(formatearPeso(0)).toBe("0,000");
  });

  it("formatearPorcentaje: 1 decimal por defecto", () => {
    expect(formatearPorcentaje(25)).toBe("25,0");
    expect(formatearPorcentaje(18.025, 2)).toBe("18,02"); // «18,02», como en el informe
    expect(formatearPorcentaje(100)).toBe("100,0");
  });

  it("formatearCompacto quita ceros sobrantes", () => {
    expect(formatearCompacto(19)).toBe("19");
    expect(formatearCompacto(2.5)).toBe("2,5");
  });

  it("fechaCorta no pasa por Date", () => {
    expect(fechaCorta("2026-11-06")).toBe("06/11");
    expect(fechaCorta("2026-11-06", true)).toBe("06/11/2026");
    expect(fechaCorta("raro")).toBe("raro");
  });
});
