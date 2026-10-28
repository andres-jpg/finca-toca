import { describe, expect, it } from "vitest";
import { leerRangoSnapshot, medicionesDeCalidad } from "./calidad-lote";

describe("leerRangoSnapshot", () => {
  const rangos = { humedad: { min: 10, max: 12 }, densidad: { min: "x", max: 700 } };
  it("lee el rango guardado", () => {
    expect(leerRangoSnapshot(rangos, "humedad")).toEqual({ min: 10, max: 12 });
  });
  it("null si falta, está mal formado o no hay snapshot", () => {
    expect(leerRangoSnapshot(rangos, "densidad")).toBeNull();
    expect(leerRangoSnapshot({ humedad: { min: 10, max: 12 } }, "densidad")).toBeNull();
    expect(leerRangoSnapshot(null, "humedad")).toBeNull();
    expect(leerRangoSnapshot([1], "humedad")).toBeNull();
  });
});

describe("medicionesDeCalidad", () => {
  it("junta valor, rango del snapshot y alerta", () => {
    const m = medicionesDeCalidad({
      humedadPct: 13.2,
      densidad: 650,
      rangosCalidad: { humedad: { min: 10, max: 12 } },
      alertasCalidad: ["humedad_alta"],
    });
    expect(m).toEqual([
      { magnitud: "humedad", valor: 13.2, rango: { min: 10, max: 12 }, alerta: "alta" },
      { magnitud: "densidad", valor: 650, rango: null, alerta: null },
    ]);
  });
  it("solo lo medido", () => {
    expect(medicionesDeCalidad({ humedadPct: null, densidad: null, rangosCalidad: null, alertasCalidad: [] })).toEqual([]);
  });
  it("reconoce la alerta de valor bajo", () => {
    const [h] = medicionesDeCalidad({ humedadPct: 8, densidad: null, rangosCalidad: null, alertasCalidad: ["humedad_baja"] });
    expect(h.alerta).toBe("baja");
  });
});
