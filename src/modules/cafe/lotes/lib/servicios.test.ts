import { describe, expect, it } from "vitest";
import {
  ORDEN_PROCESO,
  etiquetaLinea,
  etiquetaServicio,
  etiquetaTueste,
  ordenarServicios,
} from "./servicios";

// El mismo orden que `cafe.orden_proceso()` (supabase/tests/98_cafe_lotes.test.sql).
describe("ORDEN_PROCESO", () => {
  it("trilla 1, tostión 2, molienda 3, empaque 4", () => {
    expect(ORDEN_PROCESO).toEqual({ trilla: 1, tostion: 2, molienda: 3, empaque: 4 });
  });
});

describe("etiquetas", () => {
  it("línea", () => {
    expect(etiquetaLinea("marca_propia")).toBe("Marca propia");
    expect(etiquetaLinea("servicio")).toBe("Servicio");
  });

  it("servicio", () => {
    expect(etiquetaServicio("trilla")).toBe("Trilla");
    expect(etiquetaServicio("tostion")).toBe("Tostión");
    expect(etiquetaServicio("molienda")).toBe("Molienda");
    expect(etiquetaServicio("empaque")).toBe("Empaque");
  });

  it("nivel de tueste", () => {
    expect(etiquetaTueste("bajo")).toBe("Bajo");
    expect(etiquetaTueste("medio")).toBe("Medio");
    expect(etiquetaTueste("alto")).toBe("Alto");
  });
});

describe("ordenarServicios", () => {
  it("ordena como el trigger de la base", () => {
    expect(ordenarServicios(["molienda", "tostion", "trilla"])).toEqual(["trilla", "tostion", "molienda"]);
    expect(ordenarServicios(["empaque", "trilla"])).toEqual(["trilla", "empaque"]);
  });

  it("quita los repetidos", () => {
    expect(ordenarServicios(["molienda", "tostion", "trilla", "trilla"])).toEqual(["trilla", "tostion", "molienda"]);
  });

  it("vacío y un solo servicio", () => {
    expect(ordenarServicios([])).toEqual([]);
    expect(ordenarServicios(["trilla"])).toEqual(["trilla"]);
  });

  it("no modifica el arreglo recibido", () => {
    const entrada = Object.freeze(["tostion", "trilla"] as const);
    expect(ordenarServicios(entrada)).toEqual(["trilla", "tostion"]);
    expect(entrada).toEqual(["tostion", "trilla"]);
  });
});
