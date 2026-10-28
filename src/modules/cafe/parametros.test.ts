import { describe, expect, it } from "vitest";
import { MODULOS } from "@/modules/core/tenants/modulos";
import { CONCEPTOS_TARIFA_CAFE, DEFINICIONES_PARAMETROS_CAFE, PARAMETROS_CAFE } from "./parametros";

describe("definiciones de parámetros de café", () => {
  it("cada defecto cumple su propio schema", () => {
    for (const d of DEFINICIONES_PARAMETROS_CAFE) {
      expect(d.schema.safeParse(d.defecto).success, d.clave).toBe(true);
    }
  });

  it("claves únicas, con prefijo cafe. y módulo del catálogo", () => {
    const claves = DEFINICIONES_PARAMETROS_CAFE.map((d) => d.clave);
    expect(new Set(claves).size).toBe(claves.length);
    for (const d of DEFINICIONES_PARAMETROS_CAFE) {
      expect(d.clave).toMatch(/^cafe\.[a-z0-9_]+$/);
      expect(MODULOS).toContain(d.modulo);
    }
  });

  it("los defectos son los de la especificación", () => {
    expect(PARAMETROS_CAFE.capacidadTostadoraKg.defecto).toBe(13.5);
    expect(PARAMETROS_CAFE.mermaReferenciaTrillaPct.defecto).toBe(19);
    expect(PARAMETROS_CAFE.mermaReferenciaTostionPct.defecto).toBe(18);
    expect(PARAMETROS_CAFE.mermaToleranciaPts.defecto).toBe(3);
    expect(PARAMETROS_CAFE.pesoBultoKg.defecto).toBe(62.5);
  });

  it("humedad y densidad quedan sin configurar (null) hasta que Cofradía los confirme", () => {
    expect(PARAMETROS_CAFE.humedadRangoPct.defecto).toBeNull();
    expect(PARAMETROS_CAFE.densidadRango.defecto).toBeNull();
  });

  it("los números rechazan valores fuera de rango", () => {
    expect(PARAMETROS_CAFE.capacidadTostadoraKg.schema.safeParse(0).success).toBe(false);
    expect(PARAMETROS_CAFE.mermaReferenciaTrillaPct.schema.safeParse(101).success).toBe(false);
    expect(PARAMETROS_CAFE.mermaReferenciaTrillaPct.schema.safeParse(-1).success).toBe(false);
    expect(PARAMETROS_CAFE.mermaToleranciaPts.schema.safeParse(-0.5).success).toBe(false);
    expect(PARAMETROS_CAFE.mermaToleranciaPts.schema.safeParse(0).success).toBe(true);
    expect(PARAMETROS_CAFE.capacidadTostadoraKg.schema.safeParse(Number.NaN).success).toBe(false);
  });

  it("los rangos exigen mínimo < máximo y admiten null", () => {
    const { schema } = PARAMETROS_CAFE.humedadRangoPct;
    expect(schema.safeParse({ min: 10, max: 12 }).success).toBe(true);
    expect(schema.safeParse(null).success).toBe(true);
    expect(schema.safeParse({ min: 12, max: 10 }).success).toBe(false);
    expect(schema.safeParse({ min: 10 }).success).toBe(false);
  });
});

describe("conceptos de tarifa de café", () => {
  it("son trilla, tostión y molienda; el empaque nunca tiene tarifa", () => {
    expect(CONCEPTOS_TARIFA_CAFE.map((c) => c.concepto)).toEqual(["cafe.trilla", "cafe.tostion", "cafe.molienda"]);
    expect(CONCEPTOS_TARIFA_CAFE.some((c) => c.concepto.includes("empaque"))).toBe(false);
    for (const c of CONCEPTOS_TARIFA_CAFE) expect(MODULOS).toContain(c.modulo);
  });
});
