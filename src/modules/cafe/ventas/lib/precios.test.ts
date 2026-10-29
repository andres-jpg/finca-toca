import { describe, expect, it } from "vitest";
import { conceptoPrecio, esConceptoPrecio, preciosPorArticulo } from "./precios";

const ID_A = "3f2a1b4c-0d5e-4f60-8a71-92b3c4d5e6f7";
const ID_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

describe("conceptoPrecio", () => {
  it("cafe.precio_ + el uuid sin guiones (el mismo caso que el test pgTAP de cafe.concepto_precio)", () => {
    expect(conceptoPrecio(ID_A)).toBe("cafe.precio_3f2a1b4c0d5e4f608a7192b3c4d5e6f7");
  });

  it("cumple el CHECK de public.tarifas.concepto (un solo punto, minúsculas, cifras y _)", () => {
    expect(conceptoPrecio(ID_B)).toMatch(/^[a-z0-9_]+\.[a-z0-9_]+$/);
  });

  it("normaliza mayúsculas", () => {
    expect(conceptoPrecio(ID_A.toUpperCase())).toBe(conceptoPrecio(ID_A));
  });
});

describe("esConceptoPrecio", () => {
  it("reconoce los de precio de venta y no los de proceso", () => {
    expect(esConceptoPrecio(conceptoPrecio(ID_A))).toBe(true);
    expect(esConceptoPrecio("cafe.trilla")).toBe(false);
    expect(esConceptoPrecio("cafe.precio_xyz")).toBe(false);
  });
});

describe("preciosPorArticulo (precio vigente por artículo)", () => {
  const vigentes = new Map([[conceptoPrecio(ID_A), 23000]]);

  it("devuelve el precio de cada producto que tiene tarifa", () => {
    const p = preciosPorArticulo(vigentes, [ID_A, ID_B]);
    expect(p.get(ID_A)).toBe(23000);
  });

  it("un producto sin tarifa no aparece: la línea pide el valor a mano", () => {
    expect(preciosPorArticulo(vigentes, [ID_B]).has(ID_B)).toBe(false);
  });

  it("acepta un objeto además de un Map", () => {
    expect(preciosPorArticulo({ [conceptoPrecio(ID_B)]: 29000 }, [ID_B]).get(ID_B)).toBe(29000);
  });
});
