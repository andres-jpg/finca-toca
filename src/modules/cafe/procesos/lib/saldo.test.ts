import { describe, expect, it } from "vitest";
import { estadoPaso, mermaTanda, quedaSaldo, saldoDe, toleranciaSaldoKg } from "./saldo";

// Casos compartidos con pgTAP (`86_cafe_saldo_kg.test.sql`): la misma cuenta en SQL y en TS.
describe("tolerancia del saldo", () => {
  it.each([
    [0, 0.05],
    [1, 0.05],
    [10, 0.05],
    [320, 1.6],
    [500, 2.5],
  ])("base %s kg → %s kg", (base, esperada) => {
    expect(toleranciaSaldoKg(base)).toBeCloseTo(esperada, 6);
  });
});

describe("saldo y estado de un paso", () => {
  it("320 kg con 118 kg tostados dejan 202 kg por tostar", () => {
    expect(saldoDe(320, 118)).toBe(202);
    expect(estadoPaso(320, 118)).toEqual({ pendienteKg: 202, completo: false, parcial: true });
  });
  it("completo dentro de la tolerancia (0,5 %)", () => {
    expect(estadoPaso(320, 319).completo).toBe(true);
    expect(estadoPaso(320, 318).completo).toBe(false);
    expect(estadoPaso(320, 320).parcial).toBe(false);
  });
  it("sin procesar no es parcial", () => {
    expect(estadoPaso(320, 0)).toEqual({ pendienteKg: 320, completo: false, parcial: false });
  });
  it("queda saldo solo sobre la tolerancia", () => {
    expect(quedaSaldo(54, 54)).toBe(false);
    expect(quedaSaldo(54, 53.5)).toBe(true);
    expect(quedaSaldo(54, 53.8)).toBe(false);
  });
});

describe("merma de la tanda (B-08)", () => {
  it("MP-2026-0007 tanda 2: 54,0 → báscula 44,3 = 18,0 %", () => {
    expect(mermaTanda(54, 44.3)).toBe(17.963);
  });
  it("acumulado 118,0 → 96,7 = 18,1 %", () => {
    expect(Math.round((mermaTanda(118, 96.7) ?? 0) * 10) / 10).toBe(18.1);
  });
  it("sin entrada no hay merma", () => {
    expect(mermaTanda(0, 0)).toBeNull();
  });
});
