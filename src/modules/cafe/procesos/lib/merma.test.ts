import { describe, expect, it } from "vitest";
import { calcularMerma, esDesvio } from "./merma";

// Los casos del ejemplo del informe son los mismos de `94_cafe_procesos.test.sql`.
describe("calcularMerma", () => {
  it("trilla del ejemplo: 500 → 405 kg = 95 kg (19 %)", () => {
    expect(calcularMerma(500, 405)).toEqual({ mermaKg: 95, mermaPct: 19 });
  });

  it("tostión del ejemplo: 405 → 332 kg = 73 kg (18,025 %)", () => {
    expect(calcularMerma(405, 332)).toEqual({ mermaKg: 73, mermaPct: 18.025 });
  });

  it("molienda: 332 → 330 kg = 0,602 %", () => {
    expect(calcularMerma(332, 330)).toEqual({ mermaKg: 2, mermaPct: 0.602 });
  });

  it("un bache: 13,5 → 11 kg = 18,519 %", () => {
    expect(calcularMerma(13.5, 11)).toEqual({ mermaKg: 2.5, mermaPct: 18.519 });
  });

  it("salida de 0 kg: se pierde todo (100 %)", () => {
    expect(calcularMerma(81, 0)).toEqual({ mermaKg: 81, mermaPct: 100 });
  });

  it("sin pérdida: salida igual a la entrada (0 %)", () => {
    expect(calcularMerma(62.5, 62.5)).toEqual({ mermaKg: 0, mermaPct: 0 });
  });

  it("un solo bulto de 62,5 kg", () => {
    expect(calcularMerma(62.5, 50)).toEqual({ mermaKg: 12.5, mermaPct: 20 });
  });

  it("sin ruido de coma flotante con decimales", () => {
    expect(calcularMerma(0.3, 0.1)).toEqual({ mermaKg: 0.2, mermaPct: 66.667 });
    expect(calcularMerma(1.005, 1)).toEqual({ mermaKg: 0.005, mermaPct: 0.498 });
  });

  it("redondea los medios hacia arriba, como round() de Postgres (0,0005 → 0,001)", () => {
    // 1 g de 2.000 kg = 0,00005 %: no llega a la milésima; 1 g de 200 kg = 0,0005 % → 0,001
    expect(calcularMerma(200, 199.999)).toEqual({ mermaKg: 0.001, mermaPct: 0.001 });
    expect(calcularMerma(2000, 1999.999)).toEqual({ mermaKg: 0.001, mermaPct: 0 });
  });

  it("devuelve null cuando no se puede calcular", () => {
    expect(calcularMerma(0, 0)).toBeNull();
    expect(calcularMerma(-5, 0)).toBeNull();
    expect(calcularMerma(10, -1)).toBeNull();
    expect(calcularMerma(10, 10.001)).toBeNull();
    expect(calcularMerma(Number.NaN, 5)).toBeNull();
    expect(calcularMerma(10, Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe("esDesvio", () => {
  it("merma de 25 % con referencia 19 y tolerancia 3: desvío", () => {
    expect(esDesvio(25, 19, 3)).toBe(true);
  });

  it("justo en el límite (22 % con 19 ± 3) NO es desvío", () => {
    expect(esDesvio(22, 19, 3)).toBe(false);
    expect(esDesvio(16, 19, 3)).toBe(false);
  });

  it("un poco más allá del límite sí lo es, por arriba y por abajo", () => {
    expect(esDesvio(22.001, 19, 3)).toBe(true);
    expect(esDesvio(15.999, 19, 3)).toBe(true);
  });

  it("la tostión del ejemplo (18,025 % con 18 ± 3) no es desvío", () => {
    expect(esDesvio(18.025, 18, 3)).toBe(false);
  });

  it("sin referencia (molienda, empaque) o sin tolerancia nunca hay desvío", () => {
    expect(esDesvio(60, null, 3)).toBe(false);
    expect(esDesvio(60, undefined, 3)).toBe(false);
    expect(esDesvio(60, 19, null)).toBe(false);
  });

  it("tolerancia 0: cualquier diferencia es desvío, la igualdad no", () => {
    expect(esDesvio(19, 19, 0)).toBe(false);
    expect(esDesvio(19.001, 19, 0)).toBe(true);
  });

  it("ignora el ruido de coma flotante (19,1 − 16,1 = 3 exacto)", () => {
    expect(esDesvio(19.1, 16.1, 3)).toBe(false);
    expect(esDesvio(Number.NaN, 19, 3)).toBe(false);
  });
});
