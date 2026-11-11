import { describe, expect, it } from "vitest";
import { perfilTuesteSchema } from "./perfil-tueste.schema";

const BASE = {
  tipoCafeId: "6f1d3c52-2b6e-4d7e-9a53-1c5d1f0a9b11",
  nivel: "medio",
  tempC: 216,
  tiempoMin: 17,
  vigenteDesde: "2026-12-01",
};

describe("perfilTuesteSchema", () => {
  it("acepta un perfil válido y el de maquila (tipo null)", () => {
    expect(perfilTuesteSchema.safeParse(BASE).success).toBe(true);
    expect(perfilTuesteSchema.safeParse({ ...BASE, tipoCafeId: null }).success).toBe(true);
  });

  it("rechaza nivel desconocido, temperatura y tiempo fuera de rango", () => {
    expect(perfilTuesteSchema.safeParse({ ...BASE, nivel: "oscuro" }).success).toBe(false);
    expect(perfilTuesteSchema.safeParse({ ...BASE, tempC: 0 }).success).toBe(false);
    expect(perfilTuesteSchema.safeParse({ ...BASE, tempC: 401 }).success).toBe(false);
    expect(perfilTuesteSchema.safeParse({ ...BASE, tiempoMin: 0 }).success).toBe(false);
    expect(perfilTuesteSchema.safeParse({ ...BASE, tiempoMin: 121 }).success).toBe(false);
    expect(perfilTuesteSchema.safeParse({ ...BASE, tempC: 216.25 }).success).toBe(false);
    expect(perfilTuesteSchema.safeParse({ ...BASE, tempC: 216.5 }).success).toBe(true);
  });

  it("rechaza fechas mal formadas o imposibles", () => {
    expect(perfilTuesteSchema.safeParse({ ...BASE, vigenteDesde: "01/12/2026" }).success).toBe(false);
    expect(perfilTuesteSchema.safeParse({ ...BASE, vigenteDesde: "2026-02-30" }).success).toBe(false);
    expect(perfilTuesteSchema.safeParse({ ...BASE, vigenteDesde: "1999-12-31" }).success).toBe(false);
  });

  it("rechaza un tipo que no es uuid", () => {
    expect(perfilTuesteSchema.safeParse({ ...BASE, tipoCafeId: "excelso" }).success).toBe(false);
  });
});
