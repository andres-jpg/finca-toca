import { describe, expect, it } from "vitest";
import { colorTipoLote, etiquetaTipoLote, tipoVisibleLote } from "./tipo-lote";

describe("tipoVisibleLote", () => {
  it("marca propia es marca propia, tenga lo que tenga", () => {
    expect(tipoVisibleLote("marca_propia", [])).toBe("marca_propia");
  });
  it("solo trilla → Trilla", () => {
    expect(tipoVisibleLote("servicio", ["trilla"])).toBe("trilla");
  });
  it("sin trilla → Maquila", () => {
    expect(tipoVisibleLote("servicio", ["tostion", "empaque"])).toBe("maquila");
    expect(tipoVisibleLote("servicio", ["tostion", "molienda", "empaque"])).toBe("maquila");
  });
  it("trilla y maquila en el mismo lote", () => {
    expect(tipoVisibleLote("servicio", ["trilla", "tostion", "empaque"])).toBe("trilla_maquila");
  });
  it("sin servicios (no ocurre) se muestra como maquila", () => {
    expect(tipoVisibleLote("servicio", [])).toBe("maquila");
  });
});

describe("etiquetas y colores", () => {
  it("etiquetas en español", () => {
    expect(etiquetaTipoLote("marca_propia")).toBe("Marca propia");
    expect(etiquetaTipoLote("trilla_maquila")).toBe("Trilla + maquila");
  });
  it("cada tipo tiene su color y no se repiten", () => {
    const colores = (["marca_propia", "trilla", "maquila", "trilla_maquila"] as const).map(colorTipoLote);
    expect(new Set(colores).size).toBe(4);
  });
});
