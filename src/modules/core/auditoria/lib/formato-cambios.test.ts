import { describe, expect, it } from "vitest";
import { formatearFechaHora, formatearValor, resumirCambios } from "./formato-cambios";

describe("resumirCambios", () => {
  it("lista cada campo modificado de un UPDATE", () => {
    expect(resumirCambios("UPDATE", { valor: 3100, numero_factura: "F-1" })).toEqual([
      "valor → 3100",
      "numero factura → F-1",
    ]);
  });

  it("no lista campos en INSERT ni DELETE", () => {
    expect(resumirCambios("INSERT", { valor: 1 })).toEqual([]);
    expect(resumirCambios("DELETE", null)).toEqual([]);
  });

  it("tolera cambios vacíos o con forma inesperada", () => {
    expect(resumirCambios("UPDATE", null)).toEqual([]);
    expect(resumirCambios("UPDATE", [1, 2])).toEqual([]);
  });
});

describe("formatearValor", () => {
  it("muestra null como raya, y trunca lo largo", () => {
    expect(formatearValor(null)).toBe("—");
    expect(formatearValor(false)).toBe("false");
    expect(formatearValor("x".repeat(100))).toHaveLength(60);
  });
});

describe("formatearFechaHora", () => {
  it("usa la hora de Colombia aunque el servidor esté en UTC", () => {
    // 15:30 UTC = 10:30 en Bogotá
    expect(formatearFechaHora("2026-10-26T15:30:00Z")).toContain("10:30");
  });
});
