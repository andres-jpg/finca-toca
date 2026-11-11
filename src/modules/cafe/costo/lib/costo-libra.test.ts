import { describe, expect, it } from "vitest";
import {
  calcularCostoLibra,
  costoBolsaYEtiqueta,
  estadoCosto,
  leerCostoLibra,
  leerCostoLibraPanel,
  mensajeSinCosto,
  promedioPonderadoPorCalidad,
  type CostoLibraLotePanel,
} from "./costo-libra";

// Ejemplo de la issue: Excelso a $30.000/kg, merma de tostión 18,3 %, bolsa + etiqueta $900 → $19.260; venta $29.000.
const COMPLETO = {
  lote_id: "l1",
  gramos: 500,
  aplica: true,
  precio_compra_kg: 30000,
  tostion: { procesos: 1, kg_entrada: 10, kg_salida: 8.17 },
  molienda: { procesos: 0, kg_entrada: 0, kg_salida: 0 },
  merma_tostion: 0.183,
  merma_molienda: null,
  costo_cafe: 18359.6,
  costo_empaque: 900,
  costo_bolsa: 700,
  costo_etiqueta: 200,
  costo_libra: 19260,
  precio_venta: 29000,
  margen: 9740,
  margen_pct: 33.6,
};

describe("leerCostoLibra", () => {
  it("lee el ejemplo completo", () => {
    const c = leerCostoLibra(COMPLETO);
    expect(c).toMatchObject({ aplica: true, tostiones: 1, mermaTostion: 0.183, costoLibra: 19260, precioVenta: 29000, margen: 9740, margenPct: 33.6 });
    expect(estadoCosto(c)).toBe("completo");
    expect(costoBolsaYEtiqueta(c)).toBe(900);
  });

  it("lee numéricos que llegan como texto y deja null lo ausente", () => {
    const c = leerCostoLibra({ ...COMPLETO, costo_libra: "19260", precio_venta: null, margen: undefined });
    expect(c.costoLibra).toBe(19260);
    expect(c.precioVenta).toBeNull();
    expect(c.margen).toBeNull();
  });

  it("basura → no aplica, sin lanzar", () => {
    expect(estadoCosto(leerCostoLibra(null))).toBe("no_aplica");
    expect(estadoCosto(leerCostoLibra({ aplica: false }))).toBe("no_aplica");
  });
});

describe("estadoCosto", () => {
  const base = leerCostoLibra(COMPLETO);
  it("sin tostión", () => {
    const c = { ...base, costoCafe: null, costoLibra: null, tostiones: 0 };
    expect(estadoCosto(c)).toBe("sin_tostion");
    expect(mensajeSinCosto("sin_tostion")).toBe("Se calcula al registrar la primera tostión.");
  });
  it("sin costo de bolsa o etiqueta no hay costo (ni se suma a medias)", () => {
    const c = { ...base, costoEtiqueta: null, costoLibra: null };
    expect(estadoCosto(c)).toBe("sin_insumos");
    expect(costoBolsaYEtiqueta(c)).toBeNull();
  });
  it("sin precio de venta hay costo pero no margen", () => {
    expect(estadoCosto({ ...base, precioVenta: null, margen: null, margenPct: null })).toBe("sin_precio_venta");
  });
  it("completo no tiene mensaje", () => {
    expect(mensajeSinCosto("completo")).toBeNull();
  });
});

function fila(parcial: Partial<CostoLibraLotePanel> & { codigo: string }): CostoLibraLotePanel {
  return { ...leerCostoLibra(COMPLETO), tipoCafeId: "x", tipoCafe: "Excelso", kgEmpacados: 10, ...parcial };
}

describe("promedioPonderadoPorCalidad", () => {
  it("pondera el costo por kg empacado: (19.000×30 + 20.000×10) / 40 = 19.250", () => {
    const [x] = promedioPonderadoPorCalidad([
      fila({ codigo: "MP-1", costoLibra: 19000, kgEmpacados: 30 }),
      fila({ codigo: "MP-2", costoLibra: 20000, kgEmpacados: 10 }),
    ]);
    expect(x).toMatchObject({ tipoCafe: "Excelso", lotes: 2, kg: 40, costoLibra: 19250, precioVenta: 29000, margen: 9750, margenPct: 33.6, lotesSinCosto: 0 });
  });

  it("separa por calidad y mantiene el orden de llegada", () => {
    const r = promedioPonderadoPorCalidad([
      fila({ codigo: "MP-1", costoLibra: 19000 }),
      fila({ codigo: "MP-2", tipoCafeId: "c", tipoCafe: "Consumo", costoLibra: 15000, precioVenta: 20000 }),
      fila({ codigo: "MP-3", costoLibra: 21000 }),
    ]);
    expect(r.map((c) => [c.tipoCafe, c.costoLibra])).toEqual([["Excelso", 20000], ["Consumo", 15000]]);
    expect(r[1]).toMatchObject({ margen: 5000, margenPct: 25 });
  });

  it("los lotes sin costo no entran al promedio y se cuentan aparte", () => {
    const [x] = promedioPonderadoPorCalidad([
      fila({ codigo: "MP-1", costoLibra: 19000, kgEmpacados: 10 }),
      fila({ codigo: "MP-2", costoLibra: null, costoCafe: null, kgEmpacados: 500 }),
    ]);
    expect(x).toMatchObject({ lotes: 2, kg: 10, costoLibra: 19000, lotesSinCosto: 1 });
  });

  it("una calidad sin ningún costo da null, no cero; sin precio no hay margen", () => {
    const [sin] = promedioPonderadoPorCalidad([fila({ codigo: "MP-1", costoLibra: null })]);
    expect(sin).toMatchObject({ costoLibra: null, margen: null, margenPct: null, lotesSinCosto: 1 });
    const [sinPrecio] = promedioPonderadoPorCalidad([fila({ codigo: "MP-1", costoLibra: 19000, precioVenta: null })]);
    expect(sinPrecio).toMatchObject({ costoLibra: 19000, precioVenta: null, margen: null });
  });

  it("ignora lotes que no aplican y lista vacía → []", () => {
    expect(promedioPonderadoPorCalidad([fila({ codigo: "S-1", aplica: false })])).toEqual([]);
    expect(promedioPonderadoPorCalidad([])).toEqual([]);
  });
});

describe("leerCostoLibraPanel", () => {
  it("lee las filas del panel con su calidad y kg", () => {
    const [f] = leerCostoLibraPanel([{ ...COMPLETO, codigo: "MP-2026-0001", tipo_cafe_id: "x", tipo_cafe: "Excelso", kg_empacados: "8.000" }]);
    expect(f).toMatchObject({ codigo: "MP-2026-0001", tipoCafe: "Excelso", kgEmpacados: 8, costoLibra: 19260 });
  });
  it("lo que no es lista → []", () => {
    expect(leerCostoLibraPanel(null)).toEqual([]);
  });
});

describe("calcularCostoLibra · B-13 (ejemplo MP-2026-0007)", () => {
  // Excelso a $28.500/kg, merma acumulada 18,1 % (118,0 → 96,7 kg), precio $29.000 por libra.
  // El ticket usa la merma ya redondeada a 18,1 % (la exacta, 21,3 / 118,0 = 18,05 %, daría café $17.389).
  const merma = 0.181;
  const base = { precioCompraKg: 28500, mermaTostion: merma, bolsa: 1200, etiqueta: 370 };

  it("500 g: café 17.399 · costo 18.969 · margen 34,6 %", () => {
    const r = calcularCostoLibra({ ...base, gramos: 500, precioUnidad: 29000 });
    expect(Math.round(r.cafe)).toBe(17399);
    expect(r.empaque).toBe(1570);
    expect(r.costo).toBe(18969);
    expect(r.margenPct).toBe(34.6);
  });

  it("2.500 g: empaque (3.700 + 370) ÷ 5 = 814 · costo 18.213 · margen 37,2 %", () => {
    const r = calcularCostoLibra({ ...base, bolsa: 3700, gramos: 2500, precioUnidad: 145000 });
    expect(r.empaque).toBe(814);
    expect(r.costo).toBe(18213);
    expect(r.precioLibra).toBe(29000);
    expect(r.margenPct).toBe(37.2);
  });

  it("sin precio no hay margen", () => {
    expect(calcularCostoLibra({ ...base, gramos: 500 }).margen).toBeNull();
  });

  it("el costo de insumos del empaque de la tanda 2 son $123.040", () => {
    expect(68 * (1200 + 370) + 4 * (3700 + 370)).toBe(123040);
  });
});
