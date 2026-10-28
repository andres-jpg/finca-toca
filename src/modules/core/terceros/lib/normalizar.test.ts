import { describe, expect, it } from "vitest";
import { normalizarIdentificacion, normalizarNombre } from "./normalizar";

// Mismos casos que la sección «Normalización» de supabase/tests/80_terceros.test.sql.
describe("normalizarIdentificacion", () => {
  it("quita puntos, guiones y espacios", () => {
    expect(normalizarIdentificacion(" 900.123.456-7 ")).toBe("9001234567");
    expect(normalizarIdentificacion("900 123 456 7")).toBe("9001234567");
  });

  it("trata el formato con puntos y guion igual que el número pelado", () => {
    expect(normalizarIdentificacion("900.123.456-7")).toBe(normalizarIdentificacion("9001234567"));
  });

  it("pasa a mayúsculas (pasaportes, cédulas de extranjería)", () => {
    expect(normalizarIdentificacion("ab-12.3")).toBe("AB123");
  });

  it("devuelve cadena vacía para null, undefined o solo separadores", () => {
    expect(normalizarIdentificacion(null)).toBe("");
    expect(normalizarIdentificacion(undefined)).toBe("");
    expect(normalizarIdentificacion(" . - ")).toBe("");
  });

  it("es idempotente", () => {
    const una = normalizarIdentificacion("900.123.456-7");
    expect(normalizarIdentificacion(una)).toBe(una);
  });
});

describe("normalizarNombre", () => {
  it("hace trim y colapsa los espacios internos", () => {
    expect(normalizarNombre("  Café    Pepe   S.A.S.  ")).toBe("Café Pepe S.A.S.");
  });

  it("colapsa tabuladores y saltos de línea", () => {
    expect(normalizarNombre("a\t b\n c")).toBe("a b c");
  });

  it("no cambia mayúsculas ni tildes", () => {
    expect(normalizarNombre("CAFÉ del Valle")).toBe("CAFÉ del Valle");
  });

  it("devuelve cadena vacía para null y undefined", () => {
    expect(normalizarNombre(null)).toBe("");
    expect(normalizarNombre(undefined)).toBe("");
  });
});
