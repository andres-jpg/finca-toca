import { describe, expect, it } from "vitest";
import { bultosPorEstado, empacadoPorPresentacion, sinTostar } from "./donde-esta-hoy";
import type { EtapaLote } from "./etapas";
import { construirRecorrido } from "./recorrido";

const etapa = (tipo: EtapaLote["tipo"], extra: Partial<EtapaLote> = {}): EtapaLote => ({
  tipo, bultosProcesados: 3, bultosTotal: 3, completo: true, parcial: false,
  pesoEntradaKg: 0, pesoSalidaKg: 0, mermaKg: 0, valor: 0, desvios: 0, numProcesos: 1, ...extra,
});

describe("construirRecorrido", () => {
  it("lote parcial de marca propia", () => {
    const pasos = construirRecorrido({
      linea: "marca_propia", estado: "en_proceso", requeridos: ["tostion", "empaque"],
      etapas: [etapa("tostion", { completo: false, parcial: true, bultosProcesados: 2 }), etapa("empaque", { completo: false, parcial: true })],
      agotado: false,
    });
    expect(pasos.map((p) => `${p.etiqueta}:${p.estado}:${p.detalle}`)).toEqual([
      "Compra:completo:null", "Tostión:en_curso:2 de 3 bultos", "Empaque:en_curso:parcial", "Agotado:pendiente:null",
    ]);
  });
  it("servicio entregado", () => {
    const pasos = construirRecorrido({ linea: "servicio", estado: "entregado", requeridos: ["trilla"], etapas: [etapa("trilla")], agotado: false });
    expect(pasos.map((p) => p.estado)).toEqual(["completo", "completo", "completo"]);
    expect(pasos[0].etiqueta).toBe("Recepción");
  });
});

describe("dónde está hoy", () => {
  const bultos = [
    { ultimoTipo: null, pesoActualKg: 60 },
    { ultimoTipo: "trilla" as const, pesoActualKg: 50 },
    { ultimoTipo: "tostion" as const, pesoActualKg: 40 },
    { ultimoTipo: "empaque" as const, pesoActualKg: 0 },
  ];
  it("agrupa por estado sin mezclar", () => {
    const g = bultosPorEstado(bultos);
    expect(g.map((x) => [x.texto, x.bultos, x.pesoKg])).toEqual([["sin procesar", 1, 60], ["trillado", 1, 50], ["tostado", 1, 40]]);
    expect(sinTostar(g)).toEqual({ bultos: 2, pesoKg: 110 });
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
