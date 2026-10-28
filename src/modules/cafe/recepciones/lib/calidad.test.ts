import { describe, expect, it } from "vitest";
import {
  ETIQUETA_ALERTA_CALIDAD,
  evaluarCalidad,
  formatearRango,
  mensajeFueraDeRango,
  mensajeRangoSinConfigurar,
  posicionEnRango,
} from "./calidad";

const humedad = { min: 10, max: 12 };
const densidad = { min: 600, max: 700 };

describe("posicionEnRango", () => {
  it("dentro, por debajo y por encima; los límites no alertan", () => {
    expect(posicionEnRango(11, humedad)).toBeNull();
    expect(posicionEnRango(10, humedad)).toBeNull();
    expect(posicionEnRango(12, humedad)).toBeNull();
    expect(posicionEnRango(9.99, humedad)).toBe("baja");
    expect(posicionEnRango(13.2, humedad)).toBe("alta");
  });

  it("compara con 2 decimales, como la columna: 12,004 se guarda como 12 y no alerta", () => {
    expect(posicionEnRango(12.004, humedad)).toBeNull();
    expect(posicionEnRango(12.006, humedad)).toBe("alta");
  });

  it("sin valor o sin rango no hay alerta", () => {
    expect(posicionEnRango(null, humedad)).toBeNull();
    expect(posicionEnRango(undefined, humedad)).toBeNull();
    expect(posicionEnRango(Number.NaN, humedad)).toBeNull();
    expect(posicionEnRango(50, null)).toBeNull();
    expect(posicionEnRango(50, undefined)).toBeNull();
  });
});

describe("evaluarCalidad", () => {
  it("humedad 13,2 % con rango 10–12 → humedad_alta (y la densidad dentro, nada)", () => {
    expect(evaluarCalidad({ humedadPct: 13.2, densidad: 680 }, { humedad, densidad })).toEqual(["humedad_alta"]);
  });

  it("varias alertas, humedad primero (el orden en que las guarda la base)", () => {
    expect(evaluarCalidad({ humedadPct: 9.5, densidad: 550 }, { humedad, densidad })).toEqual(["humedad_baja", "densidad_baja"]);
    expect(evaluarCalidad({ humedadPct: 12.5, densidad: 701 }, { humedad, densidad })).toEqual(["humedad_alta", "densidad_alta"]);
  });

  it("sin rango configurado no hay alertas, aunque se mida", () => {
    expect(evaluarCalidad({ humedadPct: 99, densidad: 1 }, {})).toEqual([]);
    expect(evaluarCalidad({ humedadPct: 99, densidad: 1 }, { humedad: null, densidad: null })).toEqual([]);
  });

  it("solo se evalúa lo medido", () => {
    expect(evaluarCalidad({ humedadPct: null, densidad: 800 }, { humedad, densidad })).toEqual(["densidad_alta"]);
    expect(evaluarCalidad({}, { humedad, densidad })).toEqual([]);
  });

  it("cada alerta tiene etiqueta", () => {
    expect(ETIQUETA_ALERTA_CALIDAD.humedad_alta).toBe("Humedad alta");
    expect(Object.keys(ETIQUETA_ALERTA_CALIDAD)).toHaveLength(4);
  });
});

describe("textos", () => {
  it("el aviso de humedad fuera de rango", () => {
    expect(mensajeFueraDeRango("humedad", 13.2, humedad)).toBe(
      "Humedad 13,2 % fuera del rango 10–12 %. Puedes guardar igualmente",
    );
  });

  it("el aviso de densidad no lleva unidad", () => {
    expect(mensajeFueraDeRango("densidad", 550, densidad)).toBe("Densidad 550 fuera del rango 600–700. Puedes guardar igualmente");
  });

  it("formatea rangos con coma decimal", () => {
    expect(formatearRango({ min: 10.5, max: 12 }, "humedad")).toBe("10,5–12 %");
    expect(formatearRango(densidad, "densidad")).toBe("600–700");
  });

  it("rango sin configurar", () => {
    expect(mensajeRangoSinConfigurar("humedad")).toBe("Rango de humedad sin configurar");
    expect(mensajeRangoSinConfigurar("densidad")).toBe("Rango de densidad sin configurar");
  });
});
