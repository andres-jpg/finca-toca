import { describe, expect, it } from "vitest";
import { etiquetaPresentacion, nombreProductoTerminado } from "./productos";

// Los mismos casos que `supabase/tests/95_cafe_tipos.test.sql` comprueba con `cafe.etiqueta_presentacion()`.
describe("etiquetaPresentacion", () => {
  it.each([
    [250, "250 g"],
    [500, "500 g"],
    [1000, "1.000 g"],
    [2500, "2.500 g"],
    [12500, "12.500 g"],
    [1000000, "1.000.000 g"],
  ])("%s → %s", (gramos, esperado) => {
    expect(etiquetaPresentacion(gramos)).toBe(esperado);
  });

  it("redondea los gramos a entero", () => {
    expect(etiquetaPresentacion(499.6)).toBe("500 g");
  });
});

describe("nombreProductoTerminado", () => {
  it("une tipo y presentación", () => {
    expect(nombreProductoTerminado("Excelso", 500)).toBe("Excelso 500 g");
    expect(nombreProductoTerminado("Consumo", 2500)).toBe("Consumo 2.500 g");
    expect(nombreProductoTerminado("Consumo", 1000)).toBe("Consumo 1.000 g");
  });

  it("normaliza los espacios del tipo", () => {
    expect(nombreProductoTerminado("  Excelso   Premium ", 500)).toBe("Excelso Premium 500 g");
  });
});
