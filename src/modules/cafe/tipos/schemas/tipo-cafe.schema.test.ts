import { describe, expect, it } from "vitest";
import { tipoCafeSchema } from "./tipo-cafe.schema";

describe("tipoCafeSchema", () => {
  it("acepta un nombre y lo normaliza", () => {
    expect(tipoCafeSchema.parse({ nombre: "  Excelso   Premium " })).toEqual({ nombre: "Excelso Premium" });
  });

  it("es idempotente", () => {
    const una = tipoCafeSchema.parse({ nombre: "Consumo" });
    expect(tipoCafeSchema.parse(una)).toEqual(una);
  });

  it("rechaza un nombre vacío o de una letra", () => {
    expect(tipoCafeSchema.safeParse({ nombre: "   " }).success).toBe(false);
    expect(tipoCafeSchema.safeParse({ nombre: "a" }).success).toBe(false);
    expect(tipoCafeSchema.safeParse({}).success).toBe(false);
  });

  it("rechaza un nombre demasiado largo", () => {
    expect(tipoCafeSchema.safeParse({ nombre: "x".repeat(61) }).success).toBe(false);
    expect(tipoCafeSchema.safeParse({ nombre: "x".repeat(60) }).success).toBe(true);
  });
});
