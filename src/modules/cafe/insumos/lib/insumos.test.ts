import { describe, expect, it } from "vitest";
import {
  agruparPorClase,
  atributosInsumo,
  fechaHoyEnZona,
  instanteMediodia,
  leerAtributosInsumo,
  nombreSugeridoInsumo,
} from "./insumos";

describe("nombreSugeridoInsumo", () => {
  it("compone clase + presentación con separador de miles", () => {
    expect(nombreSugeridoInsumo("bolsa", 500)).toBe("Bolsa 500 g");
    expect(nombreSugeridoInsumo("bolsa", 1000)).toBe("Bolsa 1.000 g");
    expect(nombreSugeridoInsumo("etiqueta", 2500)).toBe("Etiqueta 2.500 g");
    expect(nombreSugeridoInsumo("etiqueta", 25000)).toBe("Etiqueta 25.000 g");
  });

  it("coincide con los nombres que siembra el alta de clientes", () => {
    expect(nombreSugeridoInsumo("bolsa", 500)).toBe("Bolsa 500 g");
    expect(nombreSugeridoInsumo("etiqueta", 2500)).toBe("Etiqueta 2.500 g");
  });
});

describe("leerAtributosInsumo", () => {
  it("lee clase y presentación de un insumo de empaque", () => {
    expect(leerAtributosInsumo({ clase: "bolsa", presentacion_g: 500 })).toEqual({ clase: "bolsa", presentacionG: 500 });
    expect(leerAtributosInsumo(atributosInsumo("etiqueta", 2500))).toEqual({ clase: "etiqueta", presentacionG: 2500 });
  });

  it("devuelve null si no es una bolsa o etiqueta con peso válido", () => {
    expect(leerAtributosInsumo({ clase: "caja", presentacion_g: 500 })).toBeNull();
    expect(leerAtributosInsumo({ clase: "bolsa" })).toBeNull();
    expect(leerAtributosInsumo({ clase: "bolsa", presentacion_g: "500" })).toBeNull();
    expect(leerAtributosInsumo({ clase: "bolsa", presentacion_g: 0 })).toBeNull();
    expect(leerAtributosInsumo({ tipo_cafe_id: "x", presentacion_g: 500 })).toBeNull();
    expect(leerAtributosInsumo(null)).toBeNull();
    expect(leerAtributosInsumo([])).toBeNull();
  });
});

describe("agruparPorClase", () => {
  const i = (clase: "bolsa" | "etiqueta", presentacionG: number, nombre = `${clase} ${presentacionG}`) => ({ clase, presentacionG, nombre });

  it("pone las bolsas primero y ordena por presentación", () => {
    const grupos = agruparPorClase([i("etiqueta", 2500), i("bolsa", 2500), i("etiqueta", 500), i("bolsa", 500)]);
    expect(grupos.map((g) => g.clase)).toEqual(["bolsa", "etiqueta"]);
    expect(grupos[0].insumos.map((x) => x.presentacionG)).toEqual([500, 2500]);
    expect(grupos[1].insumos.map((x) => x.presentacionG)).toEqual([500, 2500]);
  });

  it("no devuelve grupos vacíos", () => {
    expect(agruparPorClase([i("etiqueta", 500)]).map((g) => g.clase)).toEqual(["etiqueta"]);
    expect(agruparPorClase([])).toEqual([]);
  });

  it("desempata por nombre dos insumos de la misma presentación", () => {
    const g = agruparPorClase([i("bolsa", 500, "Bolsa zipper"), i("bolsa", 500, "Bolsa 500 g")]);
    expect(g[0].insumos.map((x) => x.nombre)).toEqual(["Bolsa 500 g", "Bolsa zipper"]);
  });
});

describe("fechas en la zona del cliente", () => {
  it("fechaHoyEnZona usa la zona, no la del servidor", () => {
    // 2026-11-02 03:00 UTC sigue siendo el 1 de noviembre en Bogotá (UTC-5).
    const ahora = new Date("2026-11-02T03:00:00Z");
    expect(fechaHoyEnZona("America/Bogota", ahora)).toBe("2026-11-01");
    expect(fechaHoyEnZona("UTC", ahora)).toBe("2026-11-02");
  });

  it("instanteMediodia da el mediodía local del día pedido", () => {
    expect(instanteMediodia("2026-11-01", "America/Bogota")).toBe("2026-11-01T17:00:00.000Z");
    expect(instanteMediodia("2026-11-01", "UTC")).toBe("2026-11-01T12:00:00.000Z");
    expect(instanteMediodia("2026-11-01", "Asia/Tokyo")).toBe("2026-11-01T03:00:00.000Z");
  });

  it("instanteMediodia rechaza fechas inexistentes o mal formadas", () => {
    expect(instanteMediodia("2026-02-30", "America/Bogota")).toBeNull();
    expect(instanteMediodia("2026-13-01", "America/Bogota")).toBeNull();
    expect(instanteMediodia("01/11/2026", "America/Bogota")).toBeNull();
    expect(instanteMediodia("", "America/Bogota")).toBeNull();
  });
});
