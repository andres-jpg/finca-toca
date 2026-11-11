import { describe, expect, it } from "vitest";
import { enteroSigno, estaAgotado, etiquetaEstadoVenta, etiquetaTipoVenta, subtotalLinea, limitarCantidadTexto, maximoVendible, textoFactura, textoMaximoDisponible, textoVentaGuardada, totalUnidades, totalVenta } from "./venta";

describe("subtotalLinea", () => {
  it("cantidad × precio, en pesos", () => {
    expect(subtotalLinea(3, 23000)).toBe(69000);
    expect(subtotalLinea(1, 29000)).toBe(29000);
  });

  it("no arrastra error de coma flotante con decimales", () => {
    expect(subtotalLinea(3, 0.1)).toBe(0.3);
    expect(subtotalLinea(7, 1234.57)).toBe(8641.99);
  });

  it("sin cantidad o sin precio válidos vale 0", () => {
    expect(subtotalLinea(0, 23000)).toBe(0);
    expect(subtotalLinea(3, -1)).toBe(0);
    expect(subtotalLinea(Number.NaN, 100)).toBe(0);
  });
});

describe("totalVenta", () => {
  it("el ejemplo de la tarea: 3 × Consumo 500 g + 1 × Excelso 500 g = $98.000", () => {
    expect(
      totalVenta([
        { cantidad: 3, precio: 23000 },
        { cantidad: 1, precio: 29000 },
      ]),
    ).toBe(98000);
  });

  it("una cortesía siempre vale 0, aunque las líneas lleven precio", () => {
    expect(totalVenta([{ cantidad: 2, precio: 29000 }], "cortesia")).toBe(0);
  });

  it("sin líneas es 0", () => {
    expect(totalVenta([])).toBe(0);
  });
});

describe("totalUnidades", () => {
  it("suma las unidades de las líneas con cantidad válida", () => {
    expect(totalUnidades([{ cantidad: 3 }, { cantidad: 1 }, { cantidad: 0 }, { cantidad: Number.NaN }])).toBe(4);
  });
});

describe("maximoVendible y estaAgotado (B-11)", () => {
  it("el máximo es el stock entero; el stock heredado negativo cuenta como 0", () => {
    expect(maximoVendible(14)).toBe(14);
    expect(maximoVendible(0)).toBe(0);
    expect(maximoVendible(-3)).toBe(0);
    expect(maximoVendible(Number.NaN)).toBe(0);
  });

  it("agotado con stock 0 o negativo", () => {
    expect(estaAgotado(0)).toBe(true);
    expect(estaAgotado(-3)).toBe(true);
    expect(estaAgotado(1)).toBe(false);
  });

  it("textoMaximoDisponible dice el máximo con punto de miles", () => {
    expect(textoMaximoDisponible(14)).toBe("Máximo disponible: 14");
    expect(textoMaximoDisponible(1200)).toBe("Máximo disponible: 1.200");
  });
});

describe("limitarCantidadTexto (B-11)", () => {
  it("recorta al stock lo que lo supera", () => {
    expect(limitarCantidadTexto("20", 14)).toBe("14");
    expect(limitarCantidadTexto("15", 14)).toBe("14");
  });

  it("deja igual lo que cabe", () => {
    expect(limitarCantidadTexto("14", 14)).toBe("14");
    expect(limitarCantidadTexto("3", 14)).toBe("3");
  });

  it("deja el texto que aún no es un número para que el formulario lo señale", () => {
    expect(limitarCantidadTexto("", 14)).toBe("");
    expect(limitarCantidadTexto("abc", 14)).toBe("abc");
  });

  it("sin stock recorta a 0", () => {
    expect(limitarCantidadTexto("2", 0)).toBe("0");
  });
});

describe("enteroSigno", () => {
  it("usa el signo menos tipográfico para los negativos", () => {
    expect(enteroSigno(-3)).toBe("−3");
    expect(enteroSigno(0)).toBe("0");
    expect(enteroSigno(1200)).toBe("1.200");
  });
});

describe("etiquetas", () => {
  it("tipo y estado", () => {
    expect(etiquetaTipoVenta("venta")).toBe("Venta");
    expect(etiquetaTipoVenta("cortesia")).toBe("Cortesía");
    expect(etiquetaEstadoVenta("vigente")).toBeNull();
    expect(etiquetaEstadoVenta("anulada")).toBe("Anulada");
  });

  it("textoFactura: pendiente, número o guion", () => {
    expect(textoFactura("pendiente", null)).toBe("Pendiente");
    expect(textoFactura("emitida", "FE-1001")).toBe("FE-1001");
    expect(textoFactura("no_requerida", null)).toBe("—");
  });

  it("textoVentaGuardada", () => {
    expect(textoVentaGuardada("venta", "VT-2026-0001", 98000)).toBe("Venta VT-2026-0001 guardada · $98.000");
    expect(textoVentaGuardada("cortesia", "VT-2026-0005", 0)).toBe("Cortesía VT-2026-0005 registrada");
  });
});
