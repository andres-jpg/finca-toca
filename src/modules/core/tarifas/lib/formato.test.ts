import { describe, expect, it } from "vitest";
import { formatearPesos, formatearVigencia } from "./formato";

describe("formatearPesos", () => {
  it("da pesos colombianos sin decimales cuando no los hay", () => {
    expect(formatearPesos(1400).replace(/\s/g, " ")).toBe("$ 1.400");
  });
  it("conserva los centavos si la tarifa los tiene", () => {
    expect(formatearPesos(1250.5).replace(/\s/g, " ")).toBe("$ 1.250,5");
  });
});

describe("formatearVigencia", () => {
  it("formatea en la zona horaria del cliente, no en la del servidor", () => {
    // 2026-11-01 03:00 UTC = 2026-10-31 22:00 en Bogotá (UTC-5): el día cambia.
    const bogota = formatearVigencia("2026-11-01T03:00:00Z", "America/Bogota");
    const utc = formatearVigencia("2026-11-01T03:00:00Z", "UTC");
    expect(bogota).toContain("31");
    expect(bogota).toMatch(/oct/i);
    expect(utc).toMatch(/nov/i);
  });
});
