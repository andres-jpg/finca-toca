import { describe, expect, it } from "vitest";
import { diasEnPlanta, estadoPresentacion, hrefPestana, parsearPestana, resaltarSinRecoger, saldosPorLote } from "./inventario";

describe("pestañas del inventario", () => {
  it("lee la pestaña de la URL con marca propia por defecto", () => {
    expect(parsearPestana(undefined)).toBe("marca-propia");
    expect(parsearPestana("insumos")).toBe("insumos");
    expect(parsearPestana(["servicios", "x"])).toBe("servicios");
    expect(parsearPestana("otra")).toBe("marca-propia");
  });
  it("href de cada pestaña", () => {
    expect(hrefPestana("marca-propia")).toBe("/dashboard/cafe/inventario");
    expect(hrefPestana("insumos")).toBe("/dashboard/cafe/inventario?tab=insumos");
  });
});

describe("servicios a terceros", () => {
  it("cuenta días en planta con fechas fijas", () => {
    expect(diasEnPlanta("2026-11-01", "2026-11-09")).toBe(8);
    expect(diasEnPlanta("2026-11-09", "2026-11-01")).toBe(0);
  });
  it("resalta solo los listos que pasan el umbral", () => {
    expect(resaltarSinRecoger("listo", 8, 7)).toBe(true);
    expect(resaltarSinRecoger("listo", 7, 7)).toBe(false);
    expect(resaltarSinRecoger("en_proceso", 30, 7)).toBe(false);
  });
});

describe("estado de una presentación", () => {
  it("agotado, bajo y ok", () => {
    expect(estadoPresentacion(0, null)).toBe("agotado");
    expect(estadoPresentacion(-2, 5)).toBe("agotado");
    expect(estadoPresentacion(3, 5)).toBe("bajo");
    expect(estadoPresentacion(3, null)).toBe("ok");
  });
});

describe("saldos por lote", () => {
  it("empacado − reabierto − convertido + convertido hacia él", () => {
    const s = saldosPorLote(
      [{ loteId: "L1", articuloId: "A25", unidades: 4 }],
      [{ loteId: "L1", articuloId: "A25", unidades: 1 }],
      [{ loteId: "L1", origenId: "A25", destinoId: "A5", unidadesOrigen: 2, unidadesDestino: 10 }],
    );
    expect(s).toEqual([
      { loteId: "L1", articuloId: "A25", unidades: 1 },
      { loteId: "L1", articuloId: "A5", unidades: 10 },
    ]);
  });
  it("descarta los saldos agotados", () => {
    expect(saldosPorLote([{ loteId: "L", articuloId: "A", unidades: 2 }], [], [{ loteId: "L", origenId: "A", destinoId: "B", unidadesOrigen: 2, unidadesDestino: 5 }])).toEqual([
      { loteId: "L", articuloId: "B", unidades: 5 },
    ]);
  });
});
