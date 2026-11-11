import { describe, expect, it } from "vitest";
import { CODIGO_CARGA_INICIAL, deltaAjuste, enteroConSigno, stockTrasAjuste, sumarCargaTostado, sumarCargaVerde, textoAntesDespues, textoCantidadCarga, unidadCostoCarga } from "./ajuste";

describe("sumarCargaVerde", () => {
  it("suma la carga al tipo que ya tiene lotes y agrega los tipos que solo tienen carga", () => {
    const r = sumarCargaVerde([{ tipoCafe: "Excelso", kg: 100 }], new Map([["Excelso", 50], ["Consumo", 20]]));
    expect(r).toEqual([
      { tipoCafe: "Consumo", kg: 20 },
      { tipoCafe: "Excelso", kg: 150 },
    ]);
  });

  it("sin carga deja lo de los lotes", () => {
    expect(sumarCargaVerde([{ tipoCafe: "Excelso", kg: 10 }], new Map())).toEqual([{ tipoCafe: "Excelso", kg: 10 }]);
  });
});

describe("sumarCargaTostado", () => {
  it("agrega una fila de carga inicial por tipo, sin lote", () => {
    const r = sumarCargaTostado([{ loteId: "l1", codigo: "MP-2026-0001", tipoCafe: "Excelso", forma: "grano", kg: 3 }], new Map([["Excelso", 12], ["Consumo", 0]]));
    expect(r).toEqual([
      { loteId: "l1", codigo: "MP-2026-0001", tipoCafe: "Excelso", forma: "grano", kg: 3 },
      { loteId: "", codigo: CODIGO_CARGA_INICIAL, tipoCafe: "Excelso", forma: null, kg: 12 },
    ]);
  });
});

describe("stockTrasAjuste", () => {
  it("cantidad nueva: es el stock que debe quedar", () => {
    expect(stockTrasAjuste(-3, "nueva", 0, null)).toBe(0);
    expect(stockTrasAjuste(14, "nueva", 12, null)).toBe(12);
  });

  it("diferencia: suma o resta al actual", () => {
    expect(stockTrasAjuste(-3, "diferencia", 3, "suma")).toBe(0);
    expect(stockTrasAjuste(14, "diferencia", 2, "resta")).toBe(12);
  });

  it("una resta mayor al stock da negativo (la RPC lo rechaza)", () => {
    expect(stockTrasAjuste(2, "diferencia", 5, "resta")).toBe(-3);
  });
});

describe("textos", () => {
  it("enteroConSigno usa el menos tipográfico y el punto de miles", () => {
    expect(enteroConSigno(-3)).toBe("−3");
    expect(enteroConSigno(1200)).toBe("1.200");
  });

  it("deltaAjuste y textoAntesDespues", () => {
    expect(deltaAjuste(14, 12)).toBe(-2);
    expect(textoAntesDespues(14, 12)).toBe("14 → 12 u (−2)");
    expect(textoAntesDespues(-3, 0)).toBe("−3 → 0 u (+3)");
    expect(textoAntesDespues(1200, 1200)).toBe("1.200 → 1.200 u (0)");
  });

  it("cantidad y unidad de costo de la carga inicial por clase", () => {
    expect(textoCantidadCarga("producto", 1200)).toBe("1.200 u");
    expect(textoCantidadCarga("verde", 202)).toBe("202,0 kg");
    expect(unidadCostoCarga("producto")).toBe("unidad");
    expect(unidadCostoCarga("tostado")).toBe("kg");
  });
});
