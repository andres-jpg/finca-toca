import { describe, expect, it } from "vitest";
import { aFechaExcel, aNumeroExcel, nombreHojaValido, valorCelda } from "./celdas";

const BOGOTA = "America/Bogota";

describe("aFechaExcel", () => {
  it("respeta un día de calendario sin zona", () => {
    expect(aFechaExcel("2026-03-01", BOGOTA, true)?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(aFechaExcel("2026-03-01", "Pacific/Auckland", false)?.toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });

  it("lleva un instante a la hora de pared de la zona", () => {
    expect(aFechaExcel("2026-03-01T02:00:00Z", BOGOTA, false)?.toISOString()).toBe("2026-02-28T21:00:00.000Z");
    expect(aFechaExcel(new Date("2026-03-01T17:45:30Z"), BOGOTA, false)?.toISOString()).toBe("2026-03-01T12:45:30.000Z");
  });

  it("con soloFecha descarta la hora, ya en la zona del cliente", () => {
    expect(aFechaExcel("2026-03-01T02:00:00Z", BOGOTA, true)?.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("devuelve null para vacíos y valores que no son fecha", () => {
    for (const v of [null, undefined, "", "no-es-fecha", {}]) expect(aFechaExcel(v, BOGOTA, true)).toBeNull();
  });
});

describe("aNumeroExcel", () => {
  it("acepta números y numeric de Postgres como texto", () => {
    expect(aNumeroExcel(12.5)).toBe(12.5);
    expect(aNumeroExcel("1400.50")).toBe(1400.5);
    expect(aNumeroExcel("1400,50")).toBe(1400.5);
  });

  it("devuelve null para vacíos y no finitos", () => {
    for (const v of [null, undefined, "", "abc", Number.NaN, Infinity, {}]) expect(aNumeroExcel(v)).toBeNull();
  });
});

describe("valorCelda", () => {
  it("texto: convierte a cadena y deja null en los vacíos", () => {
    expect(valorCelda(42, "texto", BOGOTA)).toBe("42");
    expect(valorCelda(true, "texto", BOGOTA)).toBe("Sí");
    expect(valorCelda(false, "texto", BOGOTA)).toBe("No");
    expect(valorCelda(null, "texto", BOGOTA)).toBeNull();
  });

  it("numéricos: número o null", () => {
    expect(valorCelda("3.5", "peso", BOGOTA)).toBe(3.5);
    expect(valorCelda("x", "moneda", BOGOTA)).toBeNull();
  });
});

describe("nombreHojaValido", () => {
  it("quita caracteres prohibidos, recorta a 31 y no deja vacío", () => {
    expect(nombreHojaValido("Lotes/Procesos: [2026]?", new Set())).toBe("Lotes Procesos 2026");
    expect(nombreHojaValido("x".repeat(40), new Set())).toHaveLength(31);
    expect(nombreHojaValido("  ", new Set())).toBe("Hoja");
    expect(nombreHojaValido("'Lotes'", new Set())).toBe("Lotes");
  });

  it("desambigua sin distinguir mayúsculas y sin pasar de 31", () => {
    expect(nombreHojaValido("Lotes", new Set(["LOTES"]))).toBe("Lotes (2)");
    expect(nombreHojaValido("Lotes", new Set(["Lotes", "Lotes (2)"]))).toBe("Lotes (3)");
    const largo = "y".repeat(31);
    expect(nombreHojaValido(largo, new Set([largo]))).toHaveLength(31);
  });
});
