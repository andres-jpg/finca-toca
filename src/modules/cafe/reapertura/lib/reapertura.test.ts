import { describe, expect, it } from "vitest";
import {
  calcularSaldoReabrible,
  kgReabiertos,
  maxReabrible,
  pasosPendientesReapertura,
  textoEquivale,
  textoPasosReapertura,
  textoReapertura,
  tituloTarjetaReapertura,
  validarUnidadesReapertura,
} from "./reapertura";

describe("calcularSaldoReabrible", () => {
  it("empacadas del lote menos reabiertas", () => {
    expect(calcularSaldoReabrible(120, 0)).toBe(120);
    expect(calcularSaldoReabrible(120, 40)).toBe(80);
    expect(calcularSaldoReabrible(120, 120)).toBe(0);
  });
  it("nunca es negativo", () => {
    expect(calcularSaldoReabrible(10, 15)).toBe(0);
    expect(calcularSaldoReabrible(0, 0)).toBe(0);
  });
});

describe("maxReabrible", () => {
  it("es el menor entre el saldo del lote y el stock global", () => {
    expect(maxReabrible(80, 110)).toBe(80);
    expect(maxReabrible(80, 5)).toBe(5);
  });
  it("un stock negativo o sin existencias deja 0", () => {
    expect(maxReabrible(80, 0)).toBe(0);
    expect(maxReabrible(80, -3)).toBe(0);
  });
  it("ignora fracciones del stock", () => {
    expect(maxReabrible(80, 5.9)).toBe(5);
  });
});

describe("kgReabiertos / textoEquivale", () => {
  it("40 × 500 g son 20 kg", () => {
    expect(kgReabiertos(500, 40)).toBe(20);
    expect(textoEquivale(500, 40)).toBe("Equivale a 20,000 kg");
  });
  it("sin deriva de coma flotante", () => {
    expect(kgReabiertos(2500, 7)).toBe(17.5);
    expect(kgReabiertos(250, 3)).toBe(0.75);
    expect(textoEquivale(2500, 1234)).toBe("Equivale a 3.085,000 kg");
  });
});

describe("validarUnidadesReapertura", () => {
  it("válido dentro del saldo y del stock", () => {
    expect(validarUnidadesReapertura(40, 120, 150)).toBeNull();
    expect(validarUnidadesReapertura(120, 120, 120)).toBeNull();
  });
  it("más que el saldo del lote: supera_saldo, aunque haya stock", () => {
    const e = validarUnidadesReapertura(121, 120, 500);
    expect(e?.codigo).toBe("supera_saldo");
    expect(e?.mensaje).toContain("120");
  });
  it("más que el stock global: sin_stock", () => {
    const e = validarUnidadesReapertura(6, 20, 5);
    expect(e?.codigo).toBe("sin_stock");
    expect(e?.mensaje).toContain("5 en el inventario");
  });
  it("el saldo se comprueba primero (el mismo orden que la RPC)", () => {
    expect(validarUnidadesReapertura(50, 20, 5)?.codigo).toBe("supera_saldo");
  });
  it("stock negativo se dice como 0", () => {
    expect(validarUnidadesReapertura(1, 20, -4)?.mensaje).toContain("Solo hay 0 en el inventario");
  });
});

describe("textos", () => {
  it("la reapertura en una línea", () => {
    expect(textoReapertura(40, "Excelso 500 g", 20)).toBe("40 × Excelso 500 g (20 kg)");
    expect(textoReapertura(1200, "Consumo 500 g", 600)).toBe("1.200 × Consumo 500 g (600 kg)");
  });
  it("título de la tarjeta de la cola", () => {
    expect(tituloTarjetaReapertura("MP-2026-0003", 20, "Excelso")).toBe("Reapertura de MP-2026-0003 · 20 kg · Excelso");
    expect(tituloTarjetaReapertura("MP-2026-0003", 2.5, null)).toBe("Reapertura de MP-2026-0003 · 2,5 kg");
  });
  it("pasos pendientes según el estado", () => {
    expect(pasosPendientesReapertura("pendiente")).toEqual(["molienda", "empaque"]);
    expect(pasosPendientesReapertura("en_proceso")).toEqual(["empaque"]);
    expect(pasosPendientesReapertura("completada")).toEqual([]);
    expect(textoPasosReapertura("pendiente")).toBe("Molienda y/o empaque");
    expect(textoPasosReapertura("en_proceso")).toBe("Empaque");
    expect(textoPasosReapertura("completada")).toBe("Sin pasos pendientes");
  });
});
