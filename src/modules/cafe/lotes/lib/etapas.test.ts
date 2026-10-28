import { describe, expect, it } from "vitest";
import { filasEtapas, quedaDisponible, type EtapaLote } from "./etapas";

const etapa = (tipo: EtapaLote["tipo"], entrada: number, salida: number, extra: Partial<EtapaLote> = {}): EtapaLote => ({
  tipo,
  bultosProcesados: 8,
  bultosTotal: 8,
  completo: true,
  parcial: false,
  pesoEntradaKg: entrada,
  pesoSalidaKg: salida,
  mermaKg: Math.round((entrada - salida) * 1000) / 1000,
  valor: 0,
  desvios: 0,
  numProcesos: 1,
  ...extra,
});

describe("filasEtapas", () => {
  it("el ejemplo del informe: 500 → 405 → 332 con mermas de 19 % y 18,02 %", () => {
    const filas = filasEtapas(["trilla", "tostion", "molienda", "empaque"], [etapa("trilla", 500, 405), etapa("tostion", 405, 332)]);
    expect(filas.map((f) => (f.pendiente ? `${f.tipo}:pendiente` : `${f.etapa.tipo}:${f.mermaPct}`))).toEqual([
      "trilla:19",
      "tostion:18.02",
      "molienda:pendiente",
      "empaque:pendiente",
    ]);
  });
  it("sigue el orden de la planta aunque lleguen desordenadas", () => {
    const filas = filasEtapas(["trilla", "tostion"], [etapa("tostion", 405, 332), etapa("trilla", 500, 405)]);
    expect(filas.map((f) => (f.pendiente ? f.tipo : f.etapa.tipo))).toEqual(["trilla", "tostion"]);
  });
  it("incluye una etapa hecha que no era requerida (la molienda opcional de marca propia)", () => {
    const filas = filasEtapas(["tostion", "empaque"], [etapa("tostion", 100, 82), etapa("molienda", 82, 81)]);
    expect(filas.map((f) => (f.pendiente ? f.tipo : f.etapa.tipo))).toEqual(["tostion", "molienda", "empaque"]);
  });
  it("sin entrada no hay %", () => {
    const [f] = filasEtapas([], [etapa("trilla", 0, 0)]);
    expect(f.pendiente ? null : f.mermaPct).toBeNull();
  });
});

describe("quedaDisponible", () => {
  it("todo en tostión: un solo grupo con el total", () => {
    const bultos = Array.from({ length: 8 }, () => ({ ultimoTipo: "tostion" as const, pesoActualKg: 41.5 }));
    expect(quedaDisponible(bultos)).toEqual([{ paso: "tostion", texto: "tostado", pesoKg: 332 }]);
  });
  it("a medias: del paso más avanzado al menos, con los sin procesar al final", () => {
    const d = quedaDisponible([
      { ultimoTipo: null, pesoActualKg: 62.5 },
      { ultimoTipo: "tostion", pesoActualKg: 50.625 },
      { ultimoTipo: "tostion", pesoActualKg: 50.625 },
      { ultimoTipo: "trilla", pesoActualKg: 50.625 },
    ]);
    expect(d).toEqual([
      { paso: "tostion", texto: "tostado", pesoKg: 101.25 },
      { paso: "trilla", texto: "trillado", pesoKg: 50.625 },
      { paso: null, texto: "sin procesar", pesoKg: 62.5 },
    ]);
  });
  it("suma en gramos, sin ruido de coma flotante", () => {
    const d = quedaDisponible([
      { ultimoTipo: "molienda", pesoActualKg: 0.1 },
      { ultimoTipo: "molienda", pesoActualKg: 0.2 },
    ]);
    expect(d[0].pesoKg).toBe(0.3);
  });
  it("sin bultos, nada", () => {
    expect(quedaDisponible([])).toEqual([]);
  });
});
