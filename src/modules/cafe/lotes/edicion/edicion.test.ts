import { describe, expect, it } from "vitest";
import { construirPayload, describirImpacto, formularioInicial, instanteDesdeZona, partesEnZona, valorLegible, type DatosEdicion } from "./edicion";

const ZONA = "America/Bogota";
const datos: DatosEdicion = {
  loteId: "l1", codigo: "MP-2026-0001", linea: "marca_propia", fechaRecepcion: "2026-11-05", llegadaEn: "2026-11-05T12:15:00.000Z",
  precioCompraKg: 20000, facturaProveedor: null, observaciones: null,
  procesos: [
    { id: "p1", tipo: "tostion", fecha: "2026-11-05", pesoEntradaKg: 27, pesoSalidaKg: 22, observaciones: null,
      baches: [{ id: "b1", numero: 1, pesoEntradaKg: 13.5, pesoSalidaKg: 11, temperaturaC: 205, tiempoMin: null }, { id: "b2", numero: 2, pesoEntradaKg: 13.5, pesoSalidaKg: 11, temperaturaC: null, tiempoMin: 12 }] },
    { id: "p2", tipo: "molienda", fecha: "2026-11-06", pesoEntradaKg: 22, pesoSalidaKg: 21.5, observaciones: null, baches: [] },
  ],
};

describe("hora de llegada en la zona del cliente", () => {
  it("12:15 UTC es 7:15 a. m. en Bogotá", () => expect(partesEnZona("2026-11-05T12:15:00.000Z", ZONA)).toEqual({ fecha: "2026-11-05", hora: "07:15" }));
  it("ida y vuelta", () => expect(instanteDesdeZona("2026-11-05", "07:15", ZONA)).toBe("2026-11-05T12:15:00.000Z"));
  it("cruza de día", () => expect(instanteDesdeZona("2026-12-31", "20:00", ZONA)).toBe("2027-01-01T01:00:00.000Z"));
  it("entrada inválida", () => expect(instanteDesdeZona("x", "07:15", ZONA)).toBeNull());
});

describe("construirPayload", () => {
  it("sin tocar nada no envía nada", () => expect(construirPayload(datos, formularioInicial(datos, ZONA), ZONA)).toEqual({}));
  it("manda solo el bache cambiado", () => {
    const f = formularioInicial(datos, ZONA);
    f.procesos.p1.baches.b1.pesoSalidaKg = "10,5";
    expect(construirPayload(datos, f, ZONA)).toEqual({ procesos: [{ id: "p1", baches: [{ id: "b1", peso_salida_kg: 10.5 }] }] });
  });
  it("corrige el peso de un proceso sin baches y la llegada", () => {
    const f = formularioInicial(datos, ZONA);
    f.procesos.p2.pesoEntradaKg = "21";
    f.llegadaHora = "06:00";
    expect(construirPayload(datos, f, ZONA)).toEqual({
      lote: { llegada_at: "2026-11-05T11:00:00.000Z" },
      procesos: [{ id: "p2", peso_entrada_kg: 21 }],
    });
  });
  it("vaciar la temperatura la manda como null", () => {
    const f = formularioInicial(datos, ZONA);
    f.procesos.p1.baches.b1.temperaturaC = "";
    expect(construirPayload(datos, f, ZONA).procesos?.[0].baches).toEqual([{ id: "b1", temperatura_c: null }]);
  });
});

describe("describirImpacto", () => {
  it("lista solo lo que cambia", () => {
    expect(describirImpacto(
      { merma_tostion_pct: 19.3, valor_servicios: 89100, costo_libra: null },
      { merma_tostion_pct: 18.1, valor_servicios: 89100, costo_libra: 14000 },
    )).toEqual(["merma de tostión (19,3 % → 18,1 %)", "costo por libra (— → $14.000)"]);
  });
  it("sin cambios, vacío", () => expect(describirImpacto({ merma_tostion_pct: 1 }, { merma_tostion_pct: 1 })).toEqual([]));
});

describe("valorLegible", () => {
  it("formatea por campo", () => {
    expect(valorLegible("fecha", "2026-11-05", ZONA)).toBe("05/11/2026");
    expect(valorLegible("llegada_at", "2026-11-05T12:15:00Z", ZONA)).toBe("05/11/2026 07:15");
    expect(valorLegible("observaciones", null, ZONA)).toBe("—");
  });
});
