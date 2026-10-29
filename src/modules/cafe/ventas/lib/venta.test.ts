import { describe, expect, it } from "vitest";
import { avisoStock, enteroSigno, etiquetaEstadoVenta, etiquetaTipoVenta, subtotalLinea, textoFactura, textoVentaGuardada, totalUnidades, totalVenta } from "./venta";

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

describe("avisoStock", () => {
  it("avisa cuando la cantidad supera el inventario, con lo que quedaría", () => {
    const a = avisoStock(5, 8);
    expect(a?.resto).toBe(-3);
    expect(a?.texto).toBe("Hay 5 en inventario; quedarán −3. Puedes guardar igualmente.");
  });

  it("no avisa si alcanza (aunque quede en cero) ni si aún no hay cantidad", () => {
    expect(avisoStock(5, 5)).toBeNull();
    expect(avisoStock(5, 1)).toBeNull();
    expect(avisoStock(5, 0)).toBeNull();
    expect(avisoStock(5, Number.NaN)).toBeNull();
  });

  it("con el inventario ya negativo lo dice con signo", () => {
    expect(avisoStock(-2, 1)?.texto).toBe("Hay −2 en inventario; quedarán −3. Puedes guardar igualmente.");
  });

  it("agrupa miles", () => {
    expect(avisoStock(1200, 1500)?.texto).toBe("Hay 1.200 en inventario; quedarán −300. Puedes guardar igualmente.");
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
    expect(etiquetaEstadoVenta("vigente")).toBe("Vigente");
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
