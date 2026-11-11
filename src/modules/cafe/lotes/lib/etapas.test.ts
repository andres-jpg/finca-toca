import { describe, expect, it } from "vitest";
import { filasEtapas, mermaProcesada, type EtapaLote } from "./etapas";

const etapa = (tipo: EtapaLote["tipo"], entrada: number, salida: number, extra: Partial<EtapaLote> = {}): EtapaLote => ({
  tipo,
  kgBase: 500,
  kgProcesados: 500,
  kgPendientes: 0,
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

describe("mermaProcesada (A-03)", () => {
  const etapa = (tipo: EtapaLote["tipo"], entrada: number, salida: number): EtapaLote => ({
    tipo,
    kgBase: 375,
    kgProcesados: 125,
    kgPendientes: 250,
    completo: false,
    parcial: true,
    pesoEntradaKg: entrada,
    pesoSalidaKg: salida,
    mermaKg: tipo === "trilla" || tipo === "tostion" ? entrada - salida : null,
    valor: 0,
    desvios: 0,
    numProcesos: 1,
  });

  it("125 kg de 375 procesados: mide esos kilos, 20 %, no 6,7 % sobre lo recibido", () => {
    const r = mermaProcesada([etapa("trilla", 125, 100)]);
    expect(r).toEqual({ entradaKg: 125, mermaKg: 25, pct: 20 });
  });

  it("suma trilla y tostión (Σ merma / Σ entrada); molienda y empaque no tienen merma", () => {
    const r = mermaProcesada([etapa("trilla", 500, 405), etapa("tostion", 405, 332), etapa("empaque", 332, 332), etapa("molienda", 332, 330)]);
    expect(r?.mermaKg).toBe(168);
    expect(r?.entradaKg).toBe(905);
    expect(r?.pct).toBe(18.56);
  });

  it("sin procesos con merma no hay merma", () => {
    expect(mermaProcesada([])).toBeNull();
    expect(mermaProcesada([etapa("empaque", 10, 10)])).toBeNull();
    // una tostión sin empacar (sin salida) todavía no tiene merma
    expect(mermaProcesada([{ tipo: "tostion", pesoEntradaKg: 54, mermaKg: null }])).toBeNull();
  });
});
