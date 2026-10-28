import { describe, expect, it } from "vitest";
import {
  MOTIVOS,
  MOTIVOS_ENTRADA,
  MOTIVOS_SALIDA,
  cantidadConSigno,
  estadoStock,
  etiquetaArticulo,
  formatearCantidad,
  signoMotivo,
  signoValido,
} from "./inventario";

describe("etiquetaArticulo", () => {
  it("texto primero, medida después: Excelso · 500 g", () => {
    expect(etiquetaArticulo({ tipo_cafe: "excelso", presentacion_g: 500 })).toBe("Excelso · 500 g");
  });

  it("no depende del orden de las claves", () => {
    expect(etiquetaArticulo({ presentacion_g: 500, tipo_cafe: "excelso" })).toBe("Excelso · 500 g");
  });

  it("insumo: Bolsa · 500 g", () => {
    expect(etiquetaArticulo({ clase: "bolsa", presentacion_g: 500 })).toBe("Bolsa · 500 g");
  });

  it("entiende varias unidades por el sufijo de la clave", () => {
    expect(etiquetaArticulo({ peso_kg: 2.5 })).toBe("2.5 kg");
    expect(etiquetaArticulo({ volumen_ml: 250 })).toBe("250 ml");
    expect(etiquetaArticulo({ volumen_l: 1 })).toBe("1 L");
  });

  it("un número sin sufijo de unidad se muestra tal cual", () => {
    expect(etiquetaArticulo({ talla: 42 })).toBe("42");
    expect(etiquetaArticulo({ talla_m: 42 })).toBe("42");
    expect(etiquetaArticulo({ g: 5 })).toBe("5");
  });

  it("cambia guiones bajos por espacios y capitaliza", () => {
    expect(etiquetaArticulo({ variedad: "caturra_amarillo" })).toBe("Caturra amarillo");
  });

  it("ignora vacíos, booleanos, nulos, objetos y listas", () => {
    expect(etiquetaArticulo({ a: "", b: "  ", c: true, d: null, e: { x: 1 }, f: [1], g_g: Infinity })).toBe("");
  });

  it("sin atributos válidos devuelve cadena vacía", () => {
    expect(etiquetaArticulo({})).toBe("");
    expect(etiquetaArticulo(null)).toBe("");
    expect(etiquetaArticulo(undefined)).toBe("");
    expect(etiquetaArticulo([1, 2])).toBe("");
    expect(etiquetaArticulo("texto")).toBe("");
  });
});

describe("signoMotivo / signoValido", () => {
  it("clasifica cada motivo y ninguno queda fuera", () => {
    expect(MOTIVOS).toHaveLength(MOTIVOS_ENTRADA.length + MOTIVOS_SALIDA.length + 1);
    for (const m of MOTIVOS_ENTRADA) expect(signoMotivo(m)).toBe(1);
    for (const m of MOTIVOS_SALIDA) expect(signoMotivo(m)).toBe(-1);
    expect(signoMotivo("ajuste")).toBe(0);
  });

  it("las entradas exigen cantidad positiva y las salidas negativa", () => {
    expect(signoValido("compra", 5)).toBe(true);
    expect(signoValido("compra", -5)).toBe(false);
    expect(signoValido("venta", -5)).toBe(true);
    expect(signoValido("venta", 5)).toBe(false);
  });

  it("el ajuste admite cualquier signo, pero nunca cero", () => {
    expect(signoValido("ajuste", 5)).toBe(true);
    expect(signoValido("ajuste", -5)).toBe(true);
    expect(signoValido("ajuste", 0)).toBe(false);
    expect(signoValido("compra", 0)).toBe(false);
  });
});

describe("cantidadConSigno", () => {
  it("el motivo decide el signo", () => {
    expect(cantidadConSigno("compra", 5)).toBe(5);
    expect(cantidadConSigno("venta", 5)).toBe(-5);
    expect(cantidadConSigno("perdida", 2.5)).toBe(-2.5);
  });

  it("ignora el signo que traiga la magnitud", () => {
    expect(cantidadConSigno("venta", -5)).toBe(-5);
    expect(cantidadConSigno("compra", -5)).toBe(5);
  });

  it("en un ajuste manda la dirección (por defecto aumenta)", () => {
    expect(cantidadConSigno("ajuste", 3, "salida")).toBe(-3);
    expect(cantidadConSigno("ajuste", 3, "entrada")).toBe(3);
    expect(cantidadConSigno("ajuste", 3)).toBe(3);
  });
});

describe("estadoStock", () => {
  it("negativo, bajo mínimo u ok", () => {
    expect(estadoStock(-1, 10)).toBe("negativo");
    expect(estadoStock(5, 10)).toBe("bajo");
    expect(estadoStock(10, 10)).toBe("ok"); // estricto: igual al mínimo no alerta
    expect(estadoStock(11, 10)).toBe("ok");
  });

  it("sin mínimo nunca está bajo", () => {
    expect(estadoStock(0, null)).toBe("ok");
    expect(estadoStock(-3, null)).toBe("negativo");
  });

  it("mínimo 0: solo alerta si queda negativo", () => {
    expect(estadoStock(0, 0)).toBe("ok");
  });
});

describe("formatearCantidad", () => {
  it("añade la abreviatura de la unidad", () => {
    expect(formatearCantidad(200)).toBe("200 u");
    expect(formatearCantidad(2.5, "kg")).toBe("2,5 kg");
    expect(formatearCantidad(1, "litro")).toBe("1 L");
    expect(formatearCantidad(500, "g")).toBe("500 g");
  });

  it("conserva el signo y recorta a 3 decimales", () => {
    expect(formatearCantidad(-3)).toBe("-3 u");
    expect(formatearCantidad(1.23456, "kg")).toBe("1,235 kg");
  });
});
