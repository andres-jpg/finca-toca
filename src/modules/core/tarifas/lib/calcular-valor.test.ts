import { describe, expect, it } from "vitest";
import { calcularValor } from "./calcular-valor";

describe("calcularValor", () => {
  it("multiplica peso por tarifa", () => {
    expect(calcularValor(10, 1400)).toBe(14000);
    expect(calcularValor(13.5, 1400)).toBe(18900);
    expect(calcularValor(62.5, 2200)).toBe(137500);
  });

  it("redondea a pesos enteros (Math.round)", () => {
    expect(calcularValor(1.2345, 1000)).toBe(1235); // 1234,5 → 1235
    expect(calcularValor(2.3333, 1000)).toBe(2333); // 2333,3 → 2333
    expect(calcularValor(0.5, 1)).toBe(1); // medio exacto: hacia arriba
  });

  it("el ruido de coma flotante no decide el redondeo de un medio exacto", () => {
    // 1.005 * 1000 = 1004.9999999999999 en coma flotante; el valor "real" es 1005 y no hay nada que redondear.
    expect(calcularValor(1.005, 1000)).toBe(1005);
    // 4.35 * 100 = 434.99999999999994 → 435
    expect(calcularValor(4.35, 100)).toBe(435);
  });

  it("peso cero o tarifa cero dan cero", () => {
    expect(calcularValor(0, 1400)).toBe(0);
    expect(calcularValor(10, 0)).toBe(0);
  });

  it("admite tarifas con centavos", () => {
    expect(calcularValor(10, 1250.55)).toBe(12506); // 12505,5 → 12506
  });

  it("rechaza pesos y tarifas negativos o no finitos", () => {
    expect(() => calcularValor(-1, 1400)).toThrow(RangeError);
    expect(() => calcularValor(10, -1)).toThrow(RangeError);
    expect(() => calcularValor(Number.NaN, 1400)).toThrow(RangeError);
    expect(() => calcularValor(10, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});
