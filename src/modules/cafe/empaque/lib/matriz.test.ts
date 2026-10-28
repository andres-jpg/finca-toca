import { describe, expect, it } from "vitest";
import { construirMatriz, leerAtributosProducto, type ProductoTerminado, type TipoCafeMatriz } from "./matriz";

const tipos: TipoCafeMatriz[] = [
  { id: "t-excelso", nombre: "Excelso", activo: true, orden: 2 },
  { id: "t-consumo", nombre: "Consumo", activo: true, orden: 1 },
  { id: "t-viejo", nombre: "Pergamino viejo", activo: false, orden: 3 },
];

function producto(tipoCafeId: string, presentacionG: number, stock: number, activo = true): ProductoTerminado {
  return { articuloId: `${tipoCafeId}-${presentacionG}`, nombre: `${tipoCafeId} ${presentacionG}`, stock, tipoCafeId, presentacionG, activo };
}

describe("construirMatriz", () => {
  const productos = [
    producto("t-excelso", 500, 120),
    producto("t-excelso", 2500, 8),
    producto("t-consumo", 500, 0),
    producto("t-consumo", 2500, -3),
  ];

  it("filas por tipo (en su orden) y columnas por presentación (de menor a mayor)", () => {
    const m = construirMatriz(productos, tipos);
    expect(m.presentaciones).toEqual([500, 2500]);
    expect(m.filas.map((f) => f.tipoCafe)).toEqual(["Consumo", "Excelso"]);
  });

  it("cada celda lleva sus unidades y su equivalencia en kg, sin totales mezclados", () => {
    const m = construirMatriz(productos, tipos);
    const excelso = m.filas.find((f) => f.tipoCafe === "Excelso")!;
    expect(excelso.celdas[500]?.producto.stock).toBe(120);
    expect(excelso.celdas[500]?.kg).toBe(60);
    expect(excelso.celdas[2500]?.kg).toBe(20);
    expect(Object.keys(m)).toEqual(["presentaciones", "filas"]);
    expect(Object.keys(excelso)).toEqual(["tipoCafeId", "tipoCafe", "celdas"]);
  });

  it("el stock negativo se conserva (la pantalla lo pinta en rojo)", () => {
    const m = construirMatriz(productos, tipos);
    const consumo = m.filas.find((f) => f.tipoCafe === "Consumo")!;
    expect(consumo.celdas[2500]?.producto.stock).toBe(-3);
    expect(consumo.celdas[2500]?.kg).toBe(-7.5);
  });

  it("un tipo desactivado desaparece si no tiene existencias y se queda si todavía le quedan unidades", () => {
    expect(construirMatriz([...productos, producto("t-viejo", 500, 0)], tipos).filas.map((f) => f.tipoCafe)).toEqual(["Consumo", "Excelso"]);
    const conStock = construirMatriz([...productos, producto("t-viejo", 500, 4)], tipos);
    expect(conStock.filas.map((f) => f.tipoCafe)).toEqual(["Consumo", "Excelso", "Pergamino viejo"]);
  });

  it("un producto inactivo sin stock no crea columna; con stock sí", () => {
    expect(construirMatriz([...productos, producto("t-excelso", 250, 0, false)], tipos).presentaciones).toEqual([500, 2500]);
    expect(construirMatriz([...productos, producto("t-excelso", 250, 6, false)], tipos).presentaciones).toEqual([250, 500, 2500]);
  });

  it("un tipo sin ese producto deja la celda vacía", () => {
    const m = construirMatriz([producto("t-excelso", 500, 5), producto("t-consumo", 2500, 7)], tipos);
    expect(m.filas.find((f) => f.tipoCafe === "Excelso")!.celdas[2500]).toBeUndefined();
    expect(m.filas.find((f) => f.tipoCafe === "Consumo")!.celdas[500]).toBeUndefined();
  });

  it("sin productos: ni columnas ni filas de tipos inactivos", () => {
    const m = construirMatriz([], tipos);
    expect(m.presentaciones).toEqual([]);
    expect(m.filas.map((f) => f.tipoCafe)).toEqual(["Consumo", "Excelso"]);
  });
});

describe("leerAtributosProducto", () => {
  it("lee tipo y presentación", () => {
    expect(leerAtributosProducto({ tipo_cafe_id: "abc", presentacion_g: 500 })).toEqual({ tipoCafeId: "abc", presentacionG: 500 });
  });

  it("rechaza lo que no es un producto terminado de café", () => {
    expect(leerAtributosProducto({ tipo_cafe: "excelso", presentacion_g: 500 })).toBeNull();
    expect(leerAtributosProducto({ tipo_cafe_id: "abc", presentacion_g: "500" })).toBeNull();
    expect(leerAtributosProducto({ tipo_cafe_id: "abc", presentacion_g: 0 })).toBeNull();
    expect(leerAtributosProducto(null)).toBeNull();
    expect(leerAtributosProducto([])).toBeNull();
  });
});
