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
  destinosDeLinea,
  DESTINOS_DIFERENCIA,
  ETIQUETA_DESTINO,
  resumenEmpaque,
  cuadreMolienda,
  kgDeForma,
  llegaConMolienda,
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

describe("resumenEmpaque", () => {
  const lineas = [{ presentacionG: 500, unidades: 120 }, { presentacionG: 2500, unidades: 8 }];

  it("81 kg llegan y 80 kg van en bolsas: sobra 1 kg y hay que decir adónde fue", () => {
    expect(resumenEmpaque(81, lineas)).toEqual({ llegaKg: 81, usadoKg: 80, diferenciaKg: 1, haySobrante: true, supera: false, excesoKg: 0 });
  });

  it("el caso del ticket: 145,6 kg con 12 × 10 kg + 5 × 5 kg → usado 145,0 y diferencia 0,6", () => {
    const r = resumenEmpaque(145.6, [{ presentacionG: 10_000, unidades: 12 }, { presentacionG: 5000, unidades: 5 }]);
    expect(r).toMatchObject({ usadoKg: 145, diferenciaKg: 0.6, haySobrante: true, supera: false });
  });

  it("empacar todo lo que llega: diferencia cero y nada que clasificar", () => {
    expect(resumenEmpaque(80, lineas)).toMatchObject({ diferenciaKg: 0, haySobrante: false, supera: false });
  });

  it("170 × 500 g (85 kg) con 81 kg: las bolsas superan por 4 kg", () => {
    expect(resumenEmpaque(81, [{ presentacionG: 500, unidades: 170 }])).toEqual({
      llegaKg: 81,
      usadoKg: 85,
      diferenciaKg: -4,
      haySobrante: false,
      supera: true,
      excesoKg: 4,
    });
  });

  it("sin café que llegue o con un peso inválido no hay resumen", () => {
    expect(resumenEmpaque(null, lineas)).toBeNull();
    expect(resumenEmpaque(0, lineas)).toBeNull();
    expect(resumenEmpaque(Number.NaN, lineas)).toBeNull();
  });

  it("sin líneas todo el café es diferencia", () => {
    expect(resumenEmpaque(81, [])).toMatchObject({ usadoKg: 0, diferenciaKg: 81, haySobrante: true });
  });
});

describe("destinosDeLinea", () => {
  it("marca propia: granel, muestra y pérdida; terceros: suelto, muestra y pérdida", () => {
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

describe("molienda junto con el empaque (A-02)", () => {
  const lineas = [
    { presentacionG: 500, unidades: 40, forma: "grano" as const },
    { presentacionG: 2500, unidades: 8, forma: "molido" as const },
  ];

  it("kilos por forma; sin forma es grano", () => {
    expect(kgDeForma(lineas, "grano")).toBe(20);
    expect(kgDeForma(lineas, "molido")).toBe(20);
    expect(kgDeForma([{ presentacionG: 500, unidades: 2 }], "grano")).toBe(1);
  });

  it("a empaque llega lo que no se molió más lo que salió de la molienda (igual que la base)", () => {
    expect(llegaConMolienda(81, { entradaKg: 22, salidaKg: 20.4 })).toBe(79.4);
    const r = resumenEmpaque(llegaConMolienda(81, { entradaKg: 22, salidaKg: 20.4 }), lineas);
    expect(r).toMatchObject({ llegaKg: 79.4, usadoKg: 40, diferenciaKg: 39.4, haySobrante: true, supera: false });
  });

  it("lo molido en bolsas no puede pasar de lo que salió de la molienda, ni el grano de lo no molido", () => {
    expect(cuadreMolienda(81, { entradaKg: 22, salidaKg: 20.4 }, lineas)).toMatchObject({ molidoSupera: false, granoSupera: false, sinMolerKg: 59 });
    expect(cuadreMolienda(81, { entradaKg: 22, salidaKg: 10 }, lineas)?.molidoSupera).toBe(true);
    expect(cuadreMolienda(81, { entradaKg: 70, salidaKg: 60 }, lineas)?.granoSupera).toBe(true);
  });

  it("sin molienda válida no hay cuadre", () => {
    expect(cuadreMolienda(81, null, lineas)).toBeNull();
    expect(cuadreMolienda(81, { entradaKg: 22, salidaKg: 30 }, lineas)).toBeNull();
    expect(cuadreMolienda(81, { entradaKg: 0, salidaKg: 0 }, lineas)).toBeNull();
  });
});
