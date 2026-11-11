import { describe, expect, it } from "vitest";
import { empacadoPorPresentacion, saldoPorEstado, sinTostar } from "./donde-esta-hoy";
import type { EtapaLote } from "./etapas";
import { construirRecorrido } from "./recorrido";

const etapa = (tipo: EtapaLote["tipo"], extra: Partial<EtapaLote> = {}): EtapaLote => ({
  tipo, kgBase: 320, kgProcesados: 320, kgPendientes: 0, completo: true, parcial: false,
  pesoEntradaKg: 0, pesoSalidaKg: 0, mermaKg: 0, valor: 0, desvios: 0, numProcesos: 1, ...extra,
});

const BASE = { loteId: "L1", pesoRecibidoKg: 320, tostadoPorEmpacarKg: 0, puedeOperar: true } as const;

describe("construirRecorrido", () => {
  it("MP-2026-0007: compra y molienda completas, tostión y empaque enlazados, agotado futuro", () => {
    const pasos = construirRecorrido({
      ...BASE, linea: "marca_propia", estado: "en_proceso", requeridos: ["tostion", "empaque"], tostadoPorEmpacarKg: 0.7,
      etapas: [
        etapa("tostion", { completo: false, parcial: true, kgBase: 320, kgProcesados: 118, kgPendientes: 202 }),
        etapa("molienda", { pesoEntradaKg: 10, pesoSalidaKg: null }),
        etapa("empaque", { completo: false, parcial: true, kgPendientes: 0.7 }),
      ],
      agotado: false,
    });
    expect(pasos.map((p) => `${p.etiqueta}|${p.estado}|${p.detalle}`)).toEqual([
      "Compra|completo|320,0 kg · completo",
      "Tostión|parcial|118,0 de 320,0 kg · continuar",
      "Molienda|completo|10,0 kg · realizada",
      "Empaque|parcial|0,7 kg tostado por empacar",
      "Agotado|futuro|pendiente",
    ]);
    expect(pasos.map((p) => p.href)).toEqual([null, "/dashboard/cafe/planta/L1?paso=tostion", null, "/dashboard/cafe/planta/L1?paso=empaque", null]);
  });
  it("un paso sin empezar es enlace solo si lo anterior ya está en marcha; si no, es futuro", () => {
    const pasos = construirRecorrido({
      ...BASE, linea: "servicio", estado: "recibido", requeridos: ["trilla", "tostion"], etapas: [], agotado: false,
    });
    expect(pasos.map((p) => p.estado)).toEqual(["completo", "pendiente", "futuro", "futuro"]);
    expect(pasos[1].href).toBe("/dashboard/cafe/planta/L1?paso=trilla");
    expect(pasos[2].href).toBeNull();
  });
  it("sin permiso para operar no hay enlaces", () => {
    const pasos = construirRecorrido({ ...BASE, puedeOperar: false, linea: "marca_propia", estado: "recibido", requeridos: ["tostion"], etapas: [], agotado: false });
    expect(pasos.every((p) => p.href === null)).toBe(true);
  });
  it("servicio entregado", () => {
    const pasos = construirRecorrido({ ...BASE, linea: "servicio", estado: "entregado", requeridos: ["trilla"], etapas: [etapa("trilla")], agotado: false });
    expect(pasos.map((p) => p.estado)).toEqual(["completo", "completo", "completo"]);
    expect(pasos[0].etiqueta).toBe("Recepción");
  });
});

describe("dónde está hoy", () => {
  const origenes = [
    { tipo: null, saldoKg: 60 },
    { tipo: "trilla" as const, saldoKg: 50 },
    { tipo: "tostion" as const, saldoKg: 40, estimado: true },
    { tipo: "empaque" as const, saldoKg: 30 },
  ];
  it("agrupa por estado sin mezclar; lo empacado no cuenta", () => {
    const g = saldoPorEstado(origenes);
    expect(g.map((x) => [x.texto, x.pesoKg, x.estimado])).toEqual([["sin procesar", 60, false], ["trillado", 50, false], ["tostado por empacar", 40, true]]);
    expect(sinTostar(g)).toEqual({ pesoKg: 110 });
  });
  it("empacado por presentación y forma, sin anulados y menos reabiertas", () => {
    const r = empacadoPorPresentacion(
      [
        { tipo: "empaque", anulacion: null, lineasEmpaque: [{ presentacionG: 500, unidades: 40, producto: "Excelso 500 g", forma: "grano" }, { presentacionG: 500, unidades: 10, producto: "Excelso 500 g molido", forma: "molido" }] },
        { tipo: "empaque", anulacion: { motivo: "x" }, lineasEmpaque: [{ presentacionG: 500, unidades: 99, producto: "x" }] },
      ],
      new Map([[500, 5]]),
    );
    expect(r.map((x) => [x.presentacionG, x.forma, x.unidades])).toEqual([[500, "grano", 35], [500, "molido", 10]]);
  });
});
