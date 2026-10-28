import { describe, expect, it } from "vitest";
import { ESTADOS_LOTE, colorEstado, esEstadoLote, etiquetaEstado, lotePendienteDeTrabajo } from "./estado";

describe("etiquetaEstado", () => {
  it("etiqueta los seis estados", () => {
    expect(ESTADOS_LOTE.map(etiquetaEstado)).toEqual(["Recibido", "En proceso", "Parcial", "Listo", "Entregado", "Anulado"]);
  });
  it("un estado desconocido se muestra tal cual y la ausencia como «—»", () => {
    expect(etiquetaEstado("raro")).toBe("raro");
    expect(etiquetaEstado(null)).toBe("—");
  });
});

describe("colorEstado", () => {
  it("un color distinto por estado", () => {
    expect(new Set(ESTADOS_LOTE.map(colorEstado)).size).toBe(ESTADOS_LOTE.length);
  });
  it("el desconocido cae en gris", () => {
    expect(colorEstado("raro")).toContain("gray");
  });
});

describe("esEstadoLote / lotePendienteDeTrabajo", () => {
  it("reconoce los estados válidos", () => {
    expect(esEstadoLote("parcial")).toBe(true);
    expect(esEstadoLote("nada")).toBe(false);
    expect(esEstadoLote(undefined)).toBe(false);
  });
  it("solo recibido, en proceso y parcial tienen trabajo pendiente", () => {
    expect(ESTADOS_LOTE.filter(lotePendienteDeTrabajo)).toEqual(["recibido", "en_proceso", "parcial"]);
  });
});
