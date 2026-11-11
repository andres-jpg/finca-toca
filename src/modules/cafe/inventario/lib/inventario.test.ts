import { describe, expect, it } from "vitest";
import { alcanceVerde, coberturaBaja, coberturaDias, diasEnPlanta, etiquetaPestana, leerLibrasVendidas, librasDisponibles, librasPorTipoPresentacion, textoDias, estadoPresentacion, hrefPestana, parsearPestana, resaltarSinRecoger, saldosPorLote } from "./inventario";

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

describe("libras y cobertura (B-10)", () => {
  it("libras = Σ unidades × gramos / 500 (2.500 g = 5 lb)", () => {
    expect(librasDisponibles([{ unidades: 310, gramos: 500 }, { unidades: 180, gramos: 500 }])).toBe(490);
    expect(librasDisponibles([{ unidades: 22, gramos: 2500 }, { unidades: 14, gramos: 2500 }])).toBe(180);
    expect(librasDisponibles([{ unidades: -3, gramos: 2500 }])).toBe(0);
  });
  it("cobertura = libras / promedio diario de 30 días; sin ventas «—»", () => {
    // 450 lb vendidas en 30 días = 15 lb/día; 135 lb alcanzan 9 días.
    expect(coberturaDias(135, 450)).toBe(9);
    expect(textoDias(coberturaDias(135, 450))).toBe("9 días");
    expect(coberturaDias(100, 0)).toBeNull();
    expect(textoDias(null)).toBe("—");
    expect(textoDias(1.4)).toBe("1 día");
  });
  it("menos de 10 días es alerta; 10 no; sin ventas no", () => {
    expect(coberturaBaja(9, 10)).toBe(true);
    expect(coberturaBaja(10, 10)).toBe(false);
    expect(coberturaBaja(null, 10)).toBe(false);
  });
  it("café verde alcanza = kg × (1 − merma) × 2 / lb diarias", () => {
    // 202 kg × 0,82 × 2 = 331,28 lb; con 30 lb/día (900 en 30 días) ≈ 11 días.
    expect(Math.floor(alcanceVerde(202, 18, 900)!)).toBe(11);
    expect(alcanceVerde(202, 18, 0)).toBeNull();
  });
  it("lee y agrupa las libras vendidas por tipo y presentación", () => {
    const v = leerLibrasVendidas([
      { articulo_pt_id: "a", tipo_cafe_id: "x", presentacion_g: 500, libras: "40" },
      { articulo_pt_id: "b", tipo_cafe_id: "x", presentacion_g: 500, libras: 10 },
      { articulo_pt_id: "c", tipo_cafe_id: "x", presentacion_g: 2500, libras: 25 },
      null,
    ]);
    expect(v).toHaveLength(3);
    expect(librasPorTipoPresentacion(v).get("x:500")).toBe(50);
  });
  it("etiquetas de pestaña con contador", () => {
    expect(etiquetaPestana("servicios", { enPlanta: 6 })).toBe("Servicios a terceros · 6 en planta");
    expect(etiquetaPestana("insumos", { bajos: 2 })).toBe("Insumos · 2 bajos");
    expect(etiquetaPestana("insumos", { bajos: 1 })).toBe("Insumos · 1 bajo");
    expect(etiquetaPestana("insumos", { bajos: 0 })).toBe("Insumos");
    expect(etiquetaPestana("marca-propia")).toBe("Marca propia");
  });
});
