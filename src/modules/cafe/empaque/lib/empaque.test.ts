import { describe, expect, it } from "vitest";
import {
  enteroConMiles,
  faltantesDeInsumo,
  kgPorUnidades,
  parsearUnidades,
  textoEmpacadas,
  textoFaltante,
  textoKgLinea,
  totalKgEmpacados,
  vistaPreviaEmpaque,
} from "./empaque";

// Los casos numéricos son los de `92_cafe_empaque.test.sql` (81 kg → 120 × 500 g + 8 × 2.500 g).

describe("kgPorUnidades", () => {
  it("unidades × presentación en kilos", () => {
    expect(kgPorUnidades(500, 120)).toBe(60);
    expect(kgPorUnidades(2500, 8)).toBe(20);
    expect(kgPorUnidades(250, 3)).toBe(0.75);
  });

  it("sin errores de coma flotante", () => {
    expect(kgPorUnidades(125, 3)).toBe(0.375);
    expect(kgPorUnidades(333, 3)).toBe(0.999);
    expect(kgPorUnidades(500, 0)).toBe(0);
  });
});

describe("totalKgEmpacados", () => {
  it("suma las líneas: 120 × 500 g + 8 × 2.500 g = 80 kg", () => {
    expect(totalKgEmpacados([{ presentacionG: 500, unidades: 120 }, { presentacionG: 2500, unidades: 8 }])).toBe(80);
  });

  it("sin líneas, cero", () => {
    expect(totalKgEmpacados([])).toBe(0);
  });
});

describe("vistaPreviaEmpaque", () => {
  const lineas = [{ presentacionG: 500, unidades: 120 }, { presentacionG: 2500, unidades: 8 }];

  it("81 kg → 80 kg: merma 1 kg (1,23 %)", () => {
    expect(vistaPreviaEmpaque(81, lineas)).toEqual({ kgEmpacados: 80, mermaKg: 1, mermaPct: 1.23, supera: false, excesoKg: 0 });
  });

  it("empacar todo lo que hay: merma cero", () => {
    expect(vistaPreviaEmpaque(80, lineas)).toMatchObject({ mermaKg: 0, mermaPct: 0, supera: false });
  });

  it("170 × 500 g (85 kg) con 81 kg disponibles: supera por 4 kg y no hay merma que mostrar", () => {
    expect(vistaPreviaEmpaque(81, [{ presentacionG: 500, unidades: 170 }])).toEqual({
      kgEmpacados: 85,
      mermaKg: -4,
      mermaPct: null,
      supera: true,
      excesoKg: 4,
    });
  });

  it("40,5 kg → 40 kg: merma 0,5 kg (1,23 %)", () => {
    expect(vistaPreviaEmpaque(40.5, [{ presentacionG: 500, unidades: 80 }])).toMatchObject({ mermaKg: 0.5, mermaPct: 1.23 });
  });

  it("sin entrada, sin entrada válida o sin líneas no hay vista previa", () => {
    expect(vistaPreviaEmpaque(null, lineas)).toBeNull();
    expect(vistaPreviaEmpaque(0, lineas)).toBeNull();
    expect(vistaPreviaEmpaque(Number.NaN, lineas)).toBeNull();
    expect(vistaPreviaEmpaque(81, [])).toBeNull();
  });
});

describe("parsearUnidades", () => {
  it("enteros positivos, con o sin punto de miles", () => {
    expect(parsearUnidades("120")).toBe(120);
    expect(parsearUnidades("1.200")).toBe(1200);
    expect(parsearUnidades(" 8 ")).toBe(8);
    expect(parsearUnidades(8)).toBe(8);
  });

  it("vacío, cero, decimales, signo o letras → null", () => {
    for (const malo of ["", "   ", "0", "1,5", "1.5", "-3", "doce", "1.20", null, undefined]) {
      expect(parsearUnidades(malo)).toBeNull();
    }
    expect(parsearUnidades(0)).toBeNull();
    expect(parsearUnidades(2.5)).toBeNull();
    expect(parsearUnidades(-1)).toBeNull();
  });
});

describe("textoEmpacadas", () => {
  it("el toast del ticket: dos presentaciones", () => {
    expect(
      textoEmpacadas([{ unidades: 120, producto: "Excelso 500 g" }, { unidades: 8, producto: "Excelso 2.500 g" }]),
    ).toBe("Empacadas 120 × Excelso 500 g y 8 × Excelso 2.500 g");
  });

  it("una sola presentación y tres o más", () => {
    expect(textoEmpacadas([{ unidades: 1200, producto: "Consumo 500 g" }])).toBe("Empacadas 1.200 × Consumo 500 g");
    expect(
      textoEmpacadas([
        { unidades: 1, producto: "A 250 g" },
        { unidades: 2, producto: "A 500 g" },
        { unidades: 3, producto: "A 1.000 g" },
      ]),
    ).toBe("Empacadas 1 × A 250 g, 2 × A 500 g y 3 × A 1.000 g");
  });
});

describe("faltantesDeInsumo", () => {
  it("avisa de lo que quedaría en negativo y no de lo que alcanza", () => {
    const f = faltantesDeInsumo([
      { presentacionG: 500, unidades: 100, bolsaStock: 80, etiquetaStock: 80 },
      { presentacionG: 2500, unidades: 8, bolsaStock: 10, etiquetaStock: 10 },
    ]);
    expect(f).toEqual([
      { clase: "bolsa", presentacionG: 500, resultante: -20 },
      { clase: "etiqueta", presentacionG: 500, resultante: -20 },
    ]);
  });

  it("quedar justo en cero no es faltante; sin unidades tampoco; un insumo desconocido no avisa", () => {
    expect(faltantesDeInsumo([{ presentacionG: 500, unidades: 80, bolsaStock: 80, etiquetaStock: 80 }])).toEqual([]);
    expect(faltantesDeInsumo([{ presentacionG: 500, unidades: 0, bolsaStock: -5, etiquetaStock: -5 }])).toEqual([]);
    expect(faltantesDeInsumo([{ presentacionG: 500, unidades: 10, bolsaStock: null, etiquetaStock: null }])).toEqual([]);
  });

  it("un stock que ya era negativo sigue avisando con el nuevo resultante", () => {
    expect(faltantesDeInsumo([{ presentacionG: 500, unidades: 10, bolsaStock: -5, etiquetaStock: 50 }])).toEqual([
      { clase: "bolsa", presentacionG: 500, resultante: -15 },
    ]);
  });
});

describe("textoFaltante", () => {
  it("el aviso del ticket", () => {
    expect(textoFaltante({ clase: "bolsa", presentacionG: 500, resultante: -20 })).toBe(
      "Quedarían −20 bolsas de 500 g en el sistema. Puedes guardar igualmente",
    );
  });

  it("singular, etiquetas y miles", () => {
    expect(textoFaltante({ clase: "etiqueta", presentacionG: 2500, resultante: -1 })).toBe(
      "Quedarían −1 etiqueta de 2.500 g en el sistema. Puedes guardar igualmente",
    );
    expect(textoFaltante({ clase: "etiqueta", presentacionG: 500, resultante: -1200 })).toContain("−1.200 etiquetas");
  });
});

describe("formato", () => {
  it("textoKgLinea con tres decimales", () => {
    expect(textoKgLinea(500, 120)).toBe("60,000");
    expect(textoKgLinea(2500, 8)).toBe("20,000");
  });

  it("enteroConMiles", () => {
    expect(enteroConMiles(999)).toBe("999");
    expect(enteroConMiles(1000)).toBe("1.000");
    expect(enteroConMiles(1234567)).toBe("1.234.567");
  });
});
