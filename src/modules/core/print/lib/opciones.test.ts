import { describe, expect, it } from "vitest";
import { formatearFechaHoraImpresion, MAX_COPIAS, parsearCopias } from "./opciones";

describe("parsearCopias", () => {
  it("lee un entero positivo", () => {
    expect(parsearCopias("2")).toBe(2);
    expect(parsearCopias(" 3 ")).toBe(3);
    expect(parsearCopias(["4", "1"])).toBe(4);
  });

  it("acota a MAX_COPIAS", () => {
    expect(parsearCopias("99")).toBe(MAX_COPIAS);
  });

  it("devuelve el defecto si falta o no es válido", () => {
    for (const v of [undefined, null, "", "0", "-1", "1.5", "dos", "2x"]) expect(parsearCopias(v)).toBe(1);
    expect(parsearCopias(undefined, 2)).toBe(2);
    expect(parsearCopias("0", 2)).toBe(2);
  });
});

describe("formatearFechaHoraImpresion", () => {
  it("usa la zona del cliente y 24 horas", () => {
    expect(formatearFechaHoraImpresion(new Date("2026-03-01T02:05:00Z"), "America/Bogota")).toBe("28/02/2026 21:05");
    expect(formatearFechaHoraImpresion(new Date("2026-10-28T19:00:00Z"), "America/Bogota")).toBe("28/10/2026 14:00");
  });

  it("medianoche sale como 00, no 24", () => {
    expect(formatearFechaHoraImpresion(new Date("2026-03-01T05:00:00Z"), "America/Bogota")).toBe("01/03/2026 00:00");
  });
});
