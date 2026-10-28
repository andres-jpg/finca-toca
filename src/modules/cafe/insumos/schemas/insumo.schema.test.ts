import { describe, expect, it } from "vitest";
import {
  ajusteFormSchema,
  ajusteInsumoSchema,
  cantidadAjuste,
  compraInsumoSchema,
  editarInsumoSchema,
  insumoSchema,
} from "./insumo.schema";

const ID = "9f0e6a0e-6a7e-4a1b-9c53-0c5d8a3d2b11";

describe("insumoSchema", () => {
  const base = { nombre: "Bolsa 1.000 g", clase: "bolsa", presentacion_g: 1000, stock_minimo: 200 } as const;

  it("acepta un insumo válido y normaliza el nombre", () => {
    expect(insumoSchema.parse({ ...base, nombre: "  Bolsa   1.000 g " })).toEqual(base);
  });

  it("el mínimo vacío es «sin alerta» (null), no 0", () => {
    expect(insumoSchema.parse({ ...base, stock_minimo: null }).stock_minimo).toBeNull();
    expect(insumoSchema.parse({ ...base, stock_minimo: undefined }).stock_minimo).toBeNull();
    expect(insumoSchema.parse({ ...base, stock_minimo: 0 }).stock_minimo).toBe(0);
  });

  it("rechaza un mínimo negativo o con decimales", () => {
    expect(insumoSchema.safeParse({ ...base, stock_minimo: -1 }).success).toBe(false);
    expect(insumoSchema.safeParse({ ...base, stock_minimo: 1.5 }).success).toBe(false);
  });

  it("la clase es bolsa o etiqueta", () => {
    expect(insumoSchema.safeParse({ ...base, clase: "etiqueta" }).success).toBe(true);
    expect(insumoSchema.safeParse({ ...base, clase: "caja" }).success).toBe(false);
    expect(insumoSchema.safeParse({ ...base, clase: undefined }).success).toBe(false);
  });

  it("la presentación es un entero entre 50 y 50.000 g", () => {
    for (const g of [50, 500, 2500, 50_000]) expect(insumoSchema.safeParse({ ...base, presentacion_g: g }).success).toBe(true);
    for (const g of [49, 0, -500, 50_001, 500.5, Number.NaN]) {
      expect(insumoSchema.safeParse({ ...base, presentacion_g: g }).success).toBe(false);
    }
  });

  it("el nombre tiene al menos 2 caracteres y como máximo 120", () => {
    expect(insumoSchema.safeParse({ ...base, nombre: "a" }).success).toBe(false);
    expect(insumoSchema.safeParse({ ...base, nombre: "   " }).success).toBe(false);
    expect(insumoSchema.safeParse({ ...base, nombre: "x".repeat(121) }).success).toBe(false);
  });
});

describe("editarInsumoSchema", () => {
  it("solo cambia nombre y mínimo", () => {
    expect(editarInsumoSchema.parse({ nombre: " Etiqueta 500 g ", stock_minimo: 200, clase: "bolsa" })).toEqual({
      nombre: "Etiqueta 500 g",
      stock_minimo: 200,
    });
  });
});

describe("compraInsumoSchema", () => {
  const base = { articuloId: ID, cantidad: 500, fecha: "2026-11-02" };

  it("acepta una compra mínima y rellena lo opcional con null", () => {
    expect(compraInsumoSchema.parse(base)).toEqual({ ...base, costoUnitario: null, terceroId: null, observaciones: null });
  });

  it("acepta costo, proveedor y observaciones", () => {
    const r = compraInsumoSchema.parse({ ...base, costoUnitario: 450, terceroId: ID, observaciones: "  Factura 123 " });
    expect(r).toMatchObject({ costoUnitario: 450, terceroId: ID, observaciones: "Factura 123" });
  });

  it("la cantidad es un entero mayor a 0", () => {
    for (const cantidad of [0, -5, 2.5, Number.NaN]) {
      expect(compraInsumoSchema.safeParse({ ...base, cantidad }).success).toBe(false);
    }
  });

  it("el costo no puede ser negativo", () => {
    expect(compraInsumoSchema.safeParse({ ...base, costoUnitario: -1 }).success).toBe(false);
    expect(compraInsumoSchema.safeParse({ ...base, costoUnitario: 0 }).success).toBe(true);
  });

  it("exige un insumo y una fecha con formato AAAA-MM-DD", () => {
    expect(compraInsumoSchema.safeParse({ ...base, articuloId: "x" }).success).toBe(false);
    expect(compraInsumoSchema.safeParse({ ...base, fecha: "02/11/2026" }).success).toBe(false);
    expect(compraInsumoSchema.safeParse({ ...base, fecha: "" }).success).toBe(false);
  });

  it("el proveedor, si viene, es un uuid", () => {
    expect(compraInsumoSchema.safeParse({ ...base, terceroId: "no-uuid" }).success).toBe(false);
  });
});

describe("ajusteInsumoSchema", () => {
  const base = { articuloId: ID, cantidad: -3, observaciones: "Conteo físico" };

  it("acepta ajustes positivos y negativos", () => {
    expect(ajusteInsumoSchema.safeParse(base).success).toBe(true);
    expect(ajusteInsumoSchema.safeParse({ ...base, cantidad: 10 }).success).toBe(true);
  });

  it("rechaza cero y decimales", () => {
    expect(ajusteInsumoSchema.safeParse({ ...base, cantidad: 0 }).success).toBe(false);
    expect(ajusteInsumoSchema.safeParse({ ...base, cantidad: 1.5 }).success).toBe(false);
  });

  it("la observación es obligatoria", () => {
    expect(ajusteInsumoSchema.safeParse({ ...base, observaciones: "" }).success).toBe(false);
    expect(ajusteInsumoSchema.safeParse({ ...base, observaciones: "  " }).success).toBe(false);
    expect(ajusteInsumoSchema.safeParse({ articuloId: ID, cantidad: 1 }).success).toBe(false);
  });
});

describe("ajusteFormSchema", () => {
  it("convierte dirección + cantidad positiva en la cantidad con signo", () => {
    expect(cantidadAjuste(ajusteFormSchema.parse({ direccion: "aumenta", cantidad: 5, observaciones: "Conteo" }))).toBe(5);
    expect(cantidadAjuste(ajusteFormSchema.parse({ direccion: "disminuye", cantidad: 5, observaciones: "Conteo" }))).toBe(-5);
  });

  it("exige dirección, cantidad positiva y observación", () => {
    expect(ajusteFormSchema.safeParse({ cantidad: 5, observaciones: "Conteo" }).success).toBe(false);
    expect(ajusteFormSchema.safeParse({ direccion: "aumenta", cantidad: -5, observaciones: "Conteo" }).success).toBe(false);
    expect(ajusteFormSchema.safeParse({ direccion: "aumenta", cantidad: 5, observaciones: "" }).success).toBe(false);
  });
});
