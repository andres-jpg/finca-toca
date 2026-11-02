import { describe, expect, it } from "vitest";
import { fechaCorta, fechaHoraZona, formatearKg3, formatearMermaPct, formatearPct, horaLlegada, pctDeMerma } from "./formato";

describe("fechaCorta", () => {
  it("da día/mes/año sin desplazar el día", () => {
    expect(fechaCorta("2026-11-05")).toBe("05/11/2026");
    expect(fechaCorta("2026-01-01")).toBe("01/01/2026");
  });
});

describe("fechaHoraZona", () => {
  it("lleva el instante a la hora de pared de la zona del cliente", () => {
    // 01:30 UTC del 6 de noviembre es el 5 de noviembre a las 20:30 en Bogotá (UTC-5)
    expect(fechaHoraZona("2026-11-06T01:30:00Z", "America/Bogota")).toBe("05/11/2026 20:30");
    expect(fechaHoraZona("2026-11-06T01:30:00Z", "UTC")).toBe("06/11/2026 01:30");
  });
  it("no revienta con una fecha inválida", () => {
    expect(fechaHoraZona("nada", "America/Bogota")).toBe("—");
  });
});

describe("formatearKg3", () => {
  it("siempre un decimal y miles con punto", () => {
    expect(formatearKg3(332)).toBe("332,0");
    expect(formatearKg3(405)).toBe("405,0");
    expect(formatearKg3(62.5)).toBe("62,5");
    expect(formatearKg3(1234.5)).toBe("1.234,5");
    expect(formatearKg3(0)).toBe("0,0");
    expect(formatearKg3(50.625)).toBe("50,6");
  });
  it("no deja ruido de coma flotante", () => {
    expect(formatearKg3(0.1 + 0.2)).toBe("0,3");
  });
});

describe("pctDeMerma", () => {
  it("el ejemplo del informe: 19 % y 18,02 %", () => {
    expect(pctDeMerma(95, 500)).toBe(19);
    // la base guarda 18,025; con los kilos el cociente es 18,0247 → 18,02 (no 18,03)
    expect(pctDeMerma(73, 405)).toBe(18.02);
    expect(pctDeMerma(2, 332)).toBe(0.6);
    expect(pctDeMerma(168, 500)).toBe(33.6);
  });
  it("redondea medios hacia arriba", () => {
    expect(pctDeMerma(1, 8)).toBe(12.5);
    expect(pctDeMerma(0.005, 100)).toBe(0.01);
  });
  it("0 % sin merma y 100 % si todo se pierde", () => {
    expect(pctDeMerma(0, 500)).toBe(0);
    expect(pctDeMerma(81, 81)).toBe(100);
  });
  it("null cuando no se puede calcular", () => {
    expect(pctDeMerma(1, 0)).toBeNull();
    expect(pctDeMerma(null, 10)).toBeNull();
    expect(pctDeMerma(1, undefined)).toBeNull();
    expect(pctDeMerma(Number.NaN, 10)).toBeNull();
  });
});

describe("formatearPct", () => {
  it("hasta dos decimales, sin ceros sobrantes y con coma", () => {
    expect(formatearPct(19)).toBe("19,0 %");
    expect(formatearPct(18.02)).toBe("18,0 %");
    expect(formatearPct(0.6)).toBe("0,6 %");
    expect(formatearPct(33.6)).toBe("33,6 %");
    expect(formatearPct(0)).toBe("0,0 %");
    expect(formatearPct(100)).toBe("100,0 %");
  });
  it("«—» sin dato", () => {
    expect(formatearPct(null)).toBe("—");
    expect(formatearPct(undefined)).toBe("—");
  });
});

describe("formatearMermaPct", () => {
  it("compone el cálculo y el formato", () => {
    expect(formatearMermaPct(73, 405)).toBe("18,0 %");
    expect(formatearMermaPct(95, 500)).toBe("19,0 %");
    expect(formatearMermaPct(0, 0)).toBe("—");
  });
});

describe("horaLlegada (FIN-129 · A-11)", () => {
  it("12 h con a. m./p. m. en la zona del cliente", () => {
    expect(horaLlegada("2026-11-05T12:15:00Z", "America/Bogota")).toBe("7:15 a. m.");
    expect(horaLlegada("2026-11-05T17:05:00Z", "America/Bogota")).toBe("12:05 p. m.");
    expect(horaLlegada("2026-11-05T05:30:00Z", "America/Bogota")).toBe("12:30 a. m.");
    expect(horaLlegada("2026-11-06T02:59:00Z", "America/Bogota")).toBe("9:59 p. m.");
  });
  it("sin dato o inválido, «—»", () => {
    expect(horaLlegada(null, "America/Bogota")).toBe("—");
    expect(horaLlegada("nada", "America/Bogota")).toBe("—");
  });
});
