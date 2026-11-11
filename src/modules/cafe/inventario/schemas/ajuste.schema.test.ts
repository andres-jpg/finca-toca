import { describe, expect, it } from "vitest";
import { ajusteInventarioSchema, cargaInicialSchema, payloadAjusteInventario, payloadCargaInicial } from "./ajuste.schema";

const ID = "6af166d0-e47a-40b4-89c4-605a0a409e7c";
const ID2 = "35d32545-e6ec-4cc2-990f-97266ba397f8";

describe("ajusteInventarioSchema", () => {
  const base = { articuloId: ID, modo: "nueva", cantidad: "12", motivo: "conteo_fisico", observacion: "" } as const;

  it("cantidad nueva: acepta 0 y normaliza el texto", () => {
    const r = ajusteInventarioSchema.safeParse({ ...base, cantidad: "0" });
    expect(r.success && r.data.cantidad).toBe(0);
    const k = ajusteInventarioSchema.safeParse({ ...base, cantidad: "1.200" });
    expect(k.success && k.data.cantidad).toBe(1200);
  });

  it("el motivo es obligatorio y solo admite los cuatro", () => {
    expect(ajusteInventarioSchema.safeParse({ ...base, motivo: undefined }).success).toBe(false);
    expect(ajusteInventarioSchema.safeParse({ ...base, motivo: "otro" }).success).toBe(false);
    for (const m of ["conteo_fisico", "dano", "muestra", "correccion"]) {
      expect(ajusteInventarioSchema.safeParse({ ...base, motivo: m }).success).toBe(true);
    }
  });

  it("la diferencia exige cantidad mayor que cero y dirección", () => {
    expect(ajusteInventarioSchema.safeParse({ ...base, modo: "diferencia", cantidad: "0", direccion: "suma" }).success).toBe(false);
    expect(ajusteInventarioSchema.safeParse({ ...base, modo: "diferencia", cantidad: "3" }).success).toBe(false);
    expect(ajusteInventarioSchema.safeParse({ ...base, modo: "diferencia", cantidad: "3", direccion: "resta" }).success).toBe(true);
  });

  it("rechaza decimales, negativos y texto", () => {
    for (const c of ["1,5", "-2", "abc", ""]) expect(ajusteInventarioSchema.safeParse({ ...base, cantidad: c }).success).toBe(false);
  });

  it("el payload lleva la resta con signo y la observación vacía como null", () => {
    const r = ajusteInventarioSchema.parse({ ...base, modo: "diferencia", cantidad: "3", direccion: "resta" });
    expect(payloadAjusteInventario(r)).toEqual({ articulo_id: ID, modo: "diferencia", cantidad: -3, motivo: "conteo_fisico", observacion: null });
    const n = ajusteInventarioSchema.parse(base);
    expect(payloadAjusteInventario(n)).toMatchObject({ modo: "nueva", cantidad: 12 });
  });
});

describe("cargaInicialSchema", () => {
  it("producto terminado: unidades enteras y costo con formato colombiano", () => {
    const r = cargaInicialSchema.parse({ clase: "producto", articuloId: ID, cantidad: "48", costoUnitario: "18.969" });
    expect(payloadCargaInicial(r)).toEqual({ clase: "producto", articulo_id: ID, tipo_cafe_id: null, cantidad: 48, costo_unitario: 18969, observacion: null });
  });

  it("tostado y verde: kilos con coma y tipo de café", () => {
    const r = cargaInicialSchema.parse({ clase: "verde", tipoCafeId: ID2, cantidad: "202,5", costoUnitario: "28500" });
    expect(payloadCargaInicial(r)).toMatchObject({ clase: "verde", articulo_id: null, tipo_cafe_id: ID2, cantidad: 202.5, costo_unitario: 28500 });
  });

  it("exige el producto o el tipo de café según la clase", () => {
    expect(cargaInicialSchema.safeParse({ clase: "producto", cantidad: "1", costoUnitario: "1" }).success).toBe(false);
    expect(cargaInicialSchema.safeParse({ clase: "tostado", cantidad: "1", costoUnitario: "1" }).success).toBe(false);
  });

  it("rechaza cantidad cero, decimales en unidades y costos ilegibles", () => {
    expect(cargaInicialSchema.safeParse({ clase: "producto", articuloId: ID, cantidad: "0", costoUnitario: "1" }).success).toBe(false);
    expect(cargaInicialSchema.safeParse({ clase: "producto", articuloId: ID, cantidad: "2,5", costoUnitario: "1" }).success).toBe(false);
    expect(cargaInicialSchema.safeParse({ clase: "producto", articuloId: ID, cantidad: "2", costoUnitario: "" }).success).toBe(false);
    expect(cargaInicialSchema.safeParse({ clase: "verde", tipoCafeId: ID2, cantidad: "1,2345", costoUnitario: "1" }).success).toBe(false);
  });

  it("el costo cero es válido (estimado aún sin definir)", () => {
    expect(cargaInicialSchema.safeParse({ clase: "producto", articuloId: ID, cantidad: "2", costoUnitario: "0" }).success).toBe(true);
  });
});
