import { describe, expect, it } from "vitest";
import {
  costoInsumosEmpaque,
  enteroConMiles,
  faltantesDeInsumo,
  kgPorUnidades,
  parsearUnidades,
  textoEmpacadas,
  textoFaltante,
  textoKgLinea,
  totalKgEmpacados,
  destinosDeLinea,
  DESTINOS_DIFERENCIA,
  ETIQUETA_DESTINO,
  avisoMolido,
  cierreEmpaque,
  kgDeForma,
} from "./empaque";

// Los casos numéricos son los de `92_cafe_empaque*.test.sql` (81 kg → 120 × 500 g + 8 × 2.500 g) y los de FIN-119.

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

describe("cierreEmpaque (B-08)", () => {
  // MP-2026-0007 tanda 2: entran 54,0 kg; 500 g: 48 grano + 20 molido; 2.500 g: 4 grano + 0 molido = 44,0 kg; báscula 44,3.
  const tanda2 = [
    { presentacionG: 500, unidades: 48, forma: "grano" as const },
    { presentacionG: 500, unidades: 20, forma: "molido" as const },
    { presentacionG: 2500, unidades: 4, forma: "grano" as const },
  ];

  it("tanda 2: en bolsas 44,0 kg, sobrante 0,3 y merma de tostión 18,0 % (54,0 → 44,3)", () => {
    const c = cierreEmpaque({ entradaKg: 54, lineas: tanda2, basculaKg: 44.3 });
    expect(c).toMatchObject({ enBolsasKg: 44, sobranteKg: 0.3, supera: false, mermaKg: 9.7, mermaPct: 17.963 });
    expect(Math.round((c.mermaPct ?? 0) * 10) / 10).toBe(18);
  });

  it("acumulado con la tanda 1 (64,0 → 52,4): 118,0 → 96,7 kg · 18,1 %", () => {
    const c = cierreEmpaque({ entradaKg: 54, lineas: tanda2, basculaKg: 44.3, acumuladoPrevio: { entradaKg: 64, basculaKg: 52.4 } });
    expect(c.acumulado).toMatchObject({ entradaKg: 118, basculaKg: 96.7 });
    expect(Math.round((c.acumulado?.mermaPct ?? 0) * 10) / 10).toBe(18.1);
  });

  it("bolsas > báscula: no se puede guardar", () => {
    const c = cierreEmpaque({ entradaKg: 54, lineas: tanda2, basculaKg: 43 });
    expect(c.supera).toBe(true);
    expect(c.sobranteKg).toBe(-1);
  });

  it("lo incluido de tandas anteriores va a las bolsas pero no altera la merma de la tanda", () => {
    const c = cierreEmpaque({ entradaKg: 54, lineas: tanda2, basculaKg: 44.3, incluidoKg: 0.4 });
    expect(c).toMatchObject({ enBolsasKg: 44, sobranteKg: 0.7, supera: false, mermaPct: 17.963 });
    // incluir lo necesario para empacar de más no es «supera»
    expect(cierreEmpaque({ entradaKg: 54, lineas: tanda2, basculaKg: 43.6, incluidoKg: 0.4 }).supera).toBe(false);
  });

  it("sin báscula válida no hay cierre", () => {
    expect(cierreEmpaque({ entradaKg: 54, lineas: tanda2, basculaKg: null })).toMatchObject({ mermaPct: null, supera: false, acumulado: null });
    expect(cierreEmpaque({ entradaKg: 0, lineas: tanda2, basculaKg: 10 }).mermaPct).toBeNull();
  });

  it("el caso de terceros: 145,6 kg con 12 × 10 kg + 5 × 5 kg → en bolsas 145,0 y sobrante 0,6", () => {
    const c = cierreEmpaque({ entradaKg: 145.6, lineas: [{ presentacionG: 10_000, unidades: 12 }, { presentacionG: 5000, unidades: 5 }], basculaKg: 145.6 });
    expect(c).toMatchObject({ enBolsasKg: 145, sobranteKg: 0.6 });
  });
});

describe("avisoMolido", () => {
  it("«Molido empacado: 10,0 kg · solicitado 10,0 kg»; sin molienda no hay aviso", () => {
    expect(avisoMolido(10, 10)).toBe("Molido empacado: 10,0 kg · solicitado 10,0 kg");
    expect(avisoMolido(9.5, 10)).toBe("Molido empacado: 9,5 kg · solicitado 10,0 kg");
    expect(avisoMolido(10, null)).toBeNull();
  });
});

describe("destinosDeLinea", () => {
  it("reapertura (marca propia): granel, muestra y pérdida; terceros: suelto, muestra y pérdida", () => {
    expect(destinosDeLinea("marca_propia")).toEqual(["granel", "muestra", "perdida"]);
    expect(destinosDeLinea("servicio")).toEqual(["suelto", "muestra", "perdida"]);
  });

  it("todos los destinos tienen etiqueta", () => {
    for (const d of DESTINOS_DIFERENCIA) expect(ETIQUETA_DESTINO[d]).toBeTruthy();
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
    expect(textoKgLinea(500, 120)).toBe("60,0");
    expect(textoKgLinea(2500, 8)).toBe("20,0");
  });

  it("enteroConMiles", () => {
    expect(enteroConMiles(999)).toBe("999");
    expect(enteroConMiles(1000)).toBe("1.000");
    expect(enteroConMiles(1234567)).toBe("1.234.567");
  });
});

describe("kilos por forma", () => {
  const lineas = [
    { presentacionG: 500, unidades: 40, forma: "grano" as const },
    { presentacionG: 2500, unidades: 8, forma: "molido" as const },
  ];

  it("kilos por forma; sin forma es grano", () => {
    expect(kgDeForma(lineas, "grano")).toBe(20);
    expect(kgDeForma(lineas, "molido")).toBe(20);
    expect(kgDeForma([{ presentacionG: 500, unidades: 2 }], "grano")).toBe(1);
  });
});

describe("costoInsumosEmpaque · B-13", () => {
  it("tanda 2 de MP-2026-0007: $123.040", () => {
    const r = costoInsumosEmpaque([
      { unidades: 68, bolsaPrecio: 1200, etiquetaPrecio: 370 },
      { unidades: 4, bolsaPrecio: 3700, etiquetaPrecio: 370 },
    ]);
    expect(r).toEqual({ total: 123040, completo: true });
  });
  it("una presentación sin precio no se inventa: total parcial y completo=false", () => {
    expect(costoInsumosEmpaque([{ unidades: 10, bolsaPrecio: 1200, etiquetaPrecio: null }, { unidades: 2, bolsaPrecio: 100, etiquetaPrecio: 50 }])).toEqual({ total: 300, completo: false });
  });
  it("sin unidades no cuenta", () => {
    expect(costoInsumosEmpaque([{ unidades: 0, bolsaPrecio: null, etiquetaPrecio: null }])).toEqual({ total: 0, completo: true });
  });
});
