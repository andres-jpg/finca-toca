import { describe, expect, it } from "vitest";
import {
  calcularValorCompra,
  formatearCOP,
  aTextoDecimal,
  formatearKg,
  parsearDecimal,
  parsearPrecio,
  tieneMaxDecimales,
} from "./compra";

describe("calcularValorCompra", () => {
  it("375 kg × $18.500 = $6.937.500 (caso de aceptación)", () => {
    expect(calcularValorCompra(375, 18500)).toBe(6_937_500);
  });

  it("redondea a pesos enteros como round() de Postgres", () => {
    expect(calcularValorCompra(33.333, 1234.5)).toBe(41_150); // 41.149,5885
    expect(calcularValorCompra(10.5, 1000.1)).toBe(10_501); // 10.501,05
    expect(calcularValorCompra(1, 0.5)).toBe(1); // medio hacia arriba
    expect(calcularValorCompra(1, 0.4)).toBe(0);
  });

  it("es exacto con pesos y precios grandes (sin deriva de coma flotante)", () => {
    expect(calcularValorCompra(99_999.999, 9_999_999.99)).toBe(999_999_989_000);
    expect(calcularValorCompra(0.1, 0.3)).toBe(0);
  });

  it("devuelve 0 sin peso o sin precio, o con valores no válidos", () => {
    expect(calcularValorCompra(0, 18500)).toBe(0);
    expect(calcularValorCompra(375, 0)).toBe(0);
    expect(calcularValorCompra(NaN, 18500)).toBe(0);
    expect(calcularValorCompra(375, Infinity)).toBe(0);
    expect(calcularValorCompra(-5, 100)).toBe(0);
  });
});

describe("formatearCOP", () => {
  it("agrupa miles con punto y no lleva decimales", () => {
    expect(formatearCOP(6_937_500)).toBe("$6.937.500");
    expect(formatearCOP(4000)).toBe("$4.000");
    expect(formatearCOP(999)).toBe("$999");
    expect(formatearCOP(0)).toBe("$0");
    expect(formatearCOP(1_234_567_890)).toBe("$1.234.567.890");
  });

  it("redondea y tolera lo no numérico", () => {
    expect(formatearCOP(1234.6)).toBe("$1.235");
    expect(formatearCOP(NaN)).toBe("$0");
    expect(formatearCOP(-1500)).toBe("-$1.500");
  });
});

describe("formatearKg", () => {
  it("1 decimal con coma y punto de miles (FIN-122)", () => {
    expect(formatearKg(62.5)).toBe("62,5");
    expect(formatearKg(375)).toBe("375,0");
    expect(formatearKg(1234.5)).toBe("1.234,5");
    expect(formatearKg(33.334)).toBe("33,3");
    expect(formatearKg(NaN)).toBe("0,0");
  });
});

describe("parsearDecimal", () => {
  it("acepta coma o punto decimal", () => {
    expect(parsearDecimal("62,5")).toBe(62.5);
    expect(parsearDecimal("62.5")).toBe(62.5);
    expect(parsearDecimal(" 375 ")).toBe(375);
    expect(parsearDecimal(",5")).toBe(0.5);
  });

  it("null si está vacío o no es un número", () => {
    expect(parsearDecimal("")).toBeNull();
    expect(parsearDecimal("abc")).toBeNull();
    expect(parsearDecimal("1,2,3")).toBeNull();
    expect(parsearDecimal("-5")).toBeNull();
  });
});

describe("tieneMaxDecimales", () => {
  it("cuenta decimales con tolerancia", () => {
    expect(tieneMaxDecimales(62.5, 3)).toBe(true);
    expect(tieneMaxDecimales(33.333, 3)).toBe(true);
    expect(tieneMaxDecimales(0.1 + 0.2, 3)).toBe(true);
    expect(tieneMaxDecimales(100.0005, 3)).toBe(false);
    expect(tieneMaxDecimales(1234.5, 2)).toBe(true);
    expect(tieneMaxDecimales(1234.567, 2)).toBe(false);
  });
});

describe("parsearPrecio", () => {
  it("entiende el punto de miles colombiano", () => {
    expect(parsearPrecio("18.500")).toBe(18500);
    expect(parsearPrecio("1.234.500")).toBe(1234500);
    expect(parsearPrecio("1.234.500,50")).toBe(1234500.5);
    expect(parsearPrecio("$ 18.500")).toBe(18500);
  });

  it("un punto con menos de tres cifras es decimal", () => {
    expect(parsearPrecio("18.5")).toBe(18.5);
    expect(parsearPrecio("18500")).toBe(18500);
    expect(parsearPrecio("18500,5")).toBe(18500.5);
    expect(parsearPrecio("18500.50")).toBe(18500.5);
  });

  it("null si está vacío o no es un número", () => {
    expect(parsearPrecio("")).toBeNull();
    expect(parsearPrecio("$")).toBeNull();
    expect(parsearPrecio("abc")).toBeNull();
  });
});

describe("aTextoDecimal", () => {
  it("coma decimal y sin miles", () => {
    expect(aTextoDecimal(62.5)).toBe("62,5");
    expect(aTextoDecimal(18500)).toBe("18500");
    expect(aTextoDecimal(Number.NaN)).toBe("");
  });
});
