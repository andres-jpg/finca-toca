import { describe, expect, it } from "vitest";
import {
  evaluarPaso,
  evaluarPasos,
  origenPeso,
  pasoInicial,
  pasoOrigen,
  pasoPrevio,
  pasosDelLote,
  pasosRequeridos,
  siguientePaso,
  textoSiguientePaso,
  type LotePasos,
  type OrigenPlanta,
} from "./pasos";

const COMPLETO: LotePasos = { linea: "servicio", servicios: ["trilla", "tostion", "molienda", "empaque"] };
const SIN_MOLIENDA: LotePasos = { linea: "servicio", servicios: ["trilla", "tostion", "empaque"] };
const MARCA_PROPIA: LotePasos = { linea: "marca_propia", servicios: [] };

const origen = (o: Partial<OrigenPlanta>): OrigenPlanta => ({
  procesoId: null,
  tipo: null,
  fecha: null,
  baseKg: 320,
  consumidoKg: 0,
  saldoKg: 320,
  estimado: false,
  conMolienda: false,
  ...o,
});

describe("pasosDelLote / pasosRequeridos", () => {
  it("servicio: los contratados, en orden", () => {
    expect(pasosDelLote({ linea: "servicio", servicios: ["empaque", "trilla", "tostion"] })).toEqual(["trilla", "tostion", "empaque"]);
  });
  it("marca propia: nunca trilla", () => {
    expect(pasosDelLote(MARCA_PROPIA)).toEqual(["tostion", "molienda", "empaque"]);
  });
  it("requeridos: la molienda de marca propia cuenta solo si ya se hizo", () => {
    expect(pasosRequeridos(MARCA_PROPIA, false)).toEqual(["tostion", "empaque"]);
    expect(pasosRequeridos(MARCA_PROPIA, true)).toEqual(["tostion", "molienda", "empaque"]);
    expect(pasosRequeridos(COMPLETO, false)).toEqual(["trilla", "tostion", "molienda", "empaque"]);
  });
});

// Mismos casos que `cafe.paso_previo` y `cafe.paso_origen` en `86_cafe_saldo_kg.test.sql`.
describe("pasoPrevio y pasoOrigen (espejo de SQL)", () => {
  it("servicio completo: el previo es el contratado anterior; el origen se salta la molienda", () => {
    expect(["trilla", "tostion", "molienda", "empaque"].map((t) => pasoPrevio(COMPLETO, t as never))).toEqual([null, "trilla", "tostion", "molienda"]);
    expect(["trilla", "tostion", "molienda", "empaque"].map((t) => pasoOrigen(COMPLETO, t as never))).toEqual([null, "trilla", "tostion", "tostion"]);
  });
  it("sin molienda contratada, el empaque sigue a la tostión", () => {
    expect(pasoPrevio(SIN_MOLIENDA, "empaque")).toBe("tostion");
    expect(pasoOrigen(SIN_MOLIENDA, "empaque")).toBe("tostion");
  });
  it("marca propia: la tostión sale de la raíz; molienda y empaque cuelgan de la tostión", () => {
    expect(pasoOrigen(MARCA_PROPIA, "tostion")).toBeNull();
    expect(pasoOrigen(MARCA_PROPIA, "molienda")).toBe("tostion");
    expect(pasoOrigen(MARCA_PROPIA, "empaque")).toBe("tostion");
  });
});

describe("evaluarPaso", () => {
  it("la tostión de marca propia parte de la raíz con todo el saldo", () => {
    const e = evaluarPaso(MARCA_PROPIA, "tostion", [origen({})]);
    expect(e).toMatchObject({ disponible: true, motivo: null, kgDisponible: 320 });
  });

  it("320 kg con 118 kg tostados dejan 202 kg por tostar", () => {
    const e = evaluarPaso(MARCA_PROPIA, "tostion", [origen({ consumidoKg: 118, saldoKg: 202 })]);
    expect(e.kgDisponible).toBe(202);
  });

  it("sin tostión no hay empaque: dice qué falta", () => {
    const e = evaluarPaso(MARCA_PROPIA, "empaque", [origen({})]);
    expect(e).toMatchObject({ disponible: false, motivo: "Primero registra la tostión." });
  });

  it("el empaque ofrece las tostiones abiertas (más de una = elegir tanda)", () => {
    const t1 = origen({ procesoId: "t1", tipo: "tostion", baseKg: 64, saldoKg: 64, estimado: true });
    const t2 = origen({ procesoId: "t2", tipo: "tostion", baseKg: 54, saldoKg: 54, estimado: true });
    const cerrada = origen({ procesoId: "t0", tipo: "tostion", baseKg: 52.4, consumidoKg: 52.4, saldoKg: 0 });
    const e = evaluarPaso(MARCA_PROPIA, "empaque", [origen({}), cerrada, t1, t2]);
    expect(e.origenes.map((o) => o.procesoId)).toEqual(["t1", "t2"]);
    expect(e.kgDisponible).toBe(118);
  });

  it("un saldo dentro de la tolerancia ya no ofrece el paso", () => {
    const e = evaluarPaso(MARCA_PROPIA, "tostion", [origen({ consumidoKg: 319.98, saldoKg: 0.02 })]);
    expect(e).toMatchObject({ disponible: false, motivo: "No queda café por procesar en este paso." });
  });

  it("la molienda ofrece las tostiones que aún no se muelen", () => {
    const sin = origen({ procesoId: "t1", tipo: "tostion", baseKg: 54, saldoKg: 54 });
    const con = origen({ procesoId: "t2", tipo: "tostion", baseKg: 54, saldoKg: 54, conMolienda: true });
    expect(evaluarPaso(MARCA_PROPIA, "molienda", [sin, con]).origenes.map((o) => o.procesoId)).toEqual(["t1"]);
  });

  it("la tostión de un servicio con trilla consume de la salida de la trilla", () => {
    const trilla = origen({ procesoId: "tr", tipo: "trilla", baseKg: 405, saldoKg: 405 });
    const e = evaluarPaso(COMPLETO, "tostion", [origen({ saldoKg: 0, consumidoKg: 500 }), trilla]);
    expect(e).toMatchObject({ disponible: true, kgDisponible: 405 });
  });

  it("evaluarPasos recorre los pasos del lote", () => {
    expect(evaluarPasos(MARCA_PROPIA, [origen({})]).map((e) => [e.tipo, e.disponible])).toEqual([
      ["tostion", true],
      ["molienda", false],
      ["empaque", false],
    ]);
  });
});

describe("siguientePaso", () => {
  it("el primero de los requeridos con kilos pendientes (202,0 kg por tostar · de 320,0 kg)", () => {
    const s = siguientePaso(["tostion", "empaque"], [{ tipo: "tostion", kgBase: 320, kgPendientes: 202 }], 320);
    expect(s).toEqual({ tipo: "tostion", pendienteKg: 202, baseKg: 320 });
    expect(textoSiguientePaso(s!)).toBe("Tostión · 202,0 kg por tostar · de 320,0 kg");
  });
  it("un paso sin procesos cuenta con lo recibido; completos → null", () => {
    expect(siguientePaso(["trilla"], [], 500)).toEqual({ tipo: "trilla", pendienteKg: 500, baseKg: 500 });
    expect(siguientePaso(["trilla"], [{ tipo: "trilla", kgBase: 500, kgPendientes: 0 }], 500)).toBeNull();
  });
});

describe("pasoInicial y origenPeso", () => {
  it("preselecciona el siguiente paso si se puede registrar", () => {
    expect(pasoInicial(MARCA_PROPIA, [origen({})], ["tostion", "empaque"], [], 320)).toBe("tostion");
  });
  it("sin nada disponible, null", () => {
    expect(pasoInicial(MARCA_PROPIA, [origen({ consumidoKg: 320, saldoKg: 0 })], ["tostion", "empaque"], [{ tipo: "tostion", kgBase: 320, kgPendientes: 0 }], 320)).toBeNull();
  });
  it("origenPeso: el paso previo y su fecha", () => {
    expect(origenPeso(origen({ procesoId: "tr", tipo: "trilla", fecha: "2026-11-06" }))).toEqual({ previo: "trilla", fecha: "2026-11-06" });
    expect(origenPeso(origen({}))).toEqual({ previo: null, fecha: null });
  });
});
