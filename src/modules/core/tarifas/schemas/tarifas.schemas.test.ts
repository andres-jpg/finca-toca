import { describe, expect, it } from "vitest";
import { crearTarifaSchema } from "./tarifas.schemas";

const base = { concepto: "cafe.trilla", valor: 1400 };

describe("crearTarifaSchema", () => {
  it("acepta una tarifa mínima", () => {
    const r = crearTarifaSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.observaciones).toBeNull();
  });

  it("acepta una vigencia ISO con zona y normaliza la nota en blanco a null", () => {
    const r = crearTarifaSchema.safeParse({ ...base, vigenteDesde: "2026-12-01T05:00:00.000Z", observaciones: "  " });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.observaciones).toBeNull();
  });

  it.each([
    ["valor negativo", { ...base, valor: -1 }],
    ["valor NaN", { ...base, valor: Number.NaN }],
    ["valor no numérico", { ...base, valor: "1400" }],
    ["tres decimales", { ...base, valor: 1400.123 }],
    ["valor desbordado", { ...base, valor: 1e15 }],
    ["sin concepto", { valor: 1400 }],
    ["vigencia sin zona", { ...base, vigenteDesde: "2026-12-01T05:00:00" }],
    ["vigencia basura", { ...base, vigenteDesde: "mañana" }],
  ])("rechaza %s", (_nombre, entrada) => {
    expect(crearTarifaSchema.safeParse(entrada).success).toBe(false);
  });

  it("acepta cero y dos decimales", () => {
    expect(crearTarifaSchema.safeParse({ ...base, valor: 0 }).success).toBe(true);
    expect(crearTarifaSchema.safeParse({ ...base, valor: 1250.55 }).success).toBe(true);
  });
});
