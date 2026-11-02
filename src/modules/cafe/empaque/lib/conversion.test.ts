import { describe, expect, it } from "vitest";
import { avisoCuadre, cuadreConversion, unidadesQueCuadran } from "./conversion";

describe("convertir presentación", () => {
  it("2 × 2.500 g = 10 × 500 g cuadra", () => {
    const c = cuadreConversion({ presentacionG: 2500, unidades: 2 }, { presentacionG: 500, unidades: 10 });
    expect(c).toEqual({ kgOrigen: 5, kgDestino: 5, diferenciaKg: 0, cuadra: true });
    expect(avisoCuadre(c)).toBeNull();
  });
  it("avisa cuando no cuadra", () => {
    const c = cuadreConversion({ presentacionG: 2500, unidades: 1 }, { presentacionG: 500, unidades: 4 });
    expect(c.cuadra).toBe(false);
    expect(c.diferenciaKg).toBe(-0.5);
    expect(avisoCuadre(c)).toContain("0,5 kg menos");
  });
  it("sugiere las unidades que cuadran", () => {
    expect(unidadesQueCuadran({ presentacionG: 2500, unidades: 2 }, 500)).toBe(10);
    expect(unidadesQueCuadran({ presentacionG: 2500, unidades: 1 }, 1000)).toBeNull();
    expect(unidadesQueCuadran({ presentacionG: 500, unidades: 1 }, 0)).toBeNull();
  });
});
