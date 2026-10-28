import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { construirLineaDeTiempo, type ProcesoLinea } from "../lib/linea-tiempo";
import { LoteTimeline } from "./lote-timeline";

// Render básico de la línea de tiempo con el ejemplo del informe: 500 kg → trilla 405 → tostión 332 en 30 baches.

const proceso = (extra: Partial<ProcesoLinea> & Pick<ProcesoLinea, "id" | "tipo" | "fecha" | "creadoEn">): ProcesoLinea => ({
  creadoPor: "operativo@cofradia.test",
  bultos: [1, 2, 3, 4, 5, 6, 7, 8],
  pesoEntradaKg: 0,
  pesoSalidaKg: 0,
  mermaKg: 0,
  tarifaKg: 0,
  valor: 0,
  mermaReferenciaPct: null,
  toleranciaPts: null,
  desvio: false,
  nivelTueste: null,
  observaciones: null,
  baches: [],
  anulacion: null,
  ...extra,
});

const trilla = proceso({
  id: "t",
  tipo: "trilla",
  fecha: "2026-11-06",
  creadoEn: "2026-11-06T14:00:00Z",
  pesoEntradaKg: 500,
  pesoSalidaKg: 405,
  mermaKg: 95,
  tarifaKg: 1400,
  valor: 700000,
  mermaReferenciaPct: 19,
  toleranciaPts: 3,
});

const tostion = proceso({
  id: "o",
  tipo: "tostion",
  fecha: "2026-11-07",
  creadoEn: "2026-11-07T14:00:00Z",
  pesoEntradaKg: 405,
  pesoSalidaKg: 332,
  mermaKg: 73,
  tarifaKg: 2200,
  valor: 891000,
  nivelTueste: "medio",
  mermaReferenciaPct: 18,
  toleranciaPts: 3,
  baches: Array.from({ length: 30 }, (_, i) => ({
    numero: i + 1,
    pesoEntradaKg: 13.5,
    pesoSalidaKg: 11.07,
    mermaKg: 2.43,
    temperaturaC: i === 0 ? 205 : null,
    observaciones: null,
  })),
});

function html(procesos: ProcesoLinea[], extra: Partial<Parameters<typeof construirLineaDeTiempo>[0]> = {}): string {
  const eventos = construirLineaDeTiempo({
    recepcion: {
      fecha: "2026-11-05",
      creadoEn: "2026-11-05T15:00:00Z",
      creadoPor: "recepcion@cofradia.test",
      linea: "servicio",
      tercero: "Juan Pérez",
      tipoCafe: null,
      pesoRecibidoKg: 500,
      numBultos: 8,
    },
    numBultosLote: 8,
    procesos,
    movimientos: [],
    anulacionLote: null,
    ...extra,
  });
  return renderToStaticMarkup(createElement(LoteTimeline, { eventos, zonaHoraria: "America/Bogota" }));
}

describe("LoteTimeline", () => {
  it("muestra la recepción, los procesos en orden y sus kilos, mermas y valor", () => {
    const salida = html([tostion, trilla]);
    expect(salida).toContain("Recepción");
    expect(salida).toContain("500,000 kg</span> en 8 bultos");
    expect(salida).toContain("cliente: Juan Pérez");
    // en orden cronológico: recepción, trilla, tostión
    expect(salida.indexOf("Recepción")).toBeLessThan(salida.indexOf("Trilla"));
    expect(salida.indexOf("Trilla")).toBeLessThan(salida.indexOf("Tostión"));
    // 500 → 405 kg con 19 % y 405 → 332 kg con 18,02 %
    expect(salida).toContain("500,000 → 405,000 kg");
    expect(salida).toContain("merma 95,000 kg (19 %)");
    expect(salida).toContain("405,000 → 332,000 kg");
    expect(salida).toContain("merma 73,000 kg (18,02 %)");
    expect(salida).toContain("$891.000");
    expect(salida).toContain("Tueste medio");
    expect(salida).toContain("todos (8)");
    expect(salida).toContain("operativo@cofradia.test");
  });

  it("la tostión despliega sus baches", () => {
    const salida = html([trilla, tostion]);
    expect(salida).toContain("<details");
    expect(salida).toContain("30 baches");
    expect(salida).toContain("205");
  });

  it("avisa de una merma desviada con su referencia", () => {
    const salida = html([{ ...trilla, desvio: true, pesoSalidaKg: 375, mermaKg: 125 }]);
    expect(salida).toContain("Merma desviada (referencia 19 % ± 3 pts)");
  });

  it("un proceso anulado se conserva, con su motivo", () => {
    const salida = html([{ ...trilla, anulacion: { en: "2026-11-06T20:00:00Z", por: "admin@cofradia.test", motivo: "Pesaje equivocado" } }]);
    expect(salida).toContain("Anulado");
    expect(salida).toContain("Pesaje equivocado");
    expect(salida).toContain("admin@cofradia.test");
  });

  it("el lote anulado cierra la línea de tiempo", () => {
    const salida = html([], { anulacionLote: { en: "2026-11-06T01:30:00Z", por: "admin@cofradia.test", motivo: "Registrado dos veces" } });
    expect(salida).toContain("Lote anulado");
    expect(salida).toContain("Registrado dos veces");
    // 01:30 UTC del 6 es el 5 de noviembre a las 20:30 en Bogotá
    expect(salida).toContain("05/11/2026 20:30");
  });

  it("muestra los movimientos de inventario del lote", () => {
    const salida = html([], {
      movimientos: [
        { id: "m", fecha: "2026-11-08", creadoEn: "2026-11-08T10:00:00Z", creadoPor: null, articulo: "Bolsa 500 g", cantidad: -24, motivo: "consumo", observaciones: null },
      ],
    });
    expect(salida).toContain("Bolsa 500 g");
    expect(salida).toContain("−24");
    expect(salida).toContain("Consumo");
  });

  it("un lote de marca propia se titula Compra y habla de proveedor", () => {
    const salida = renderToStaticMarkup(
      createElement(LoteTimeline, {
        eventos: construirLineaDeTiempo({
          recepcion: { fecha: "2026-11-05", creadoEn: "2026-11-05T15:00:00Z", creadoPor: null, linea: "marca_propia", tercero: "Finca La Esperanza", tipoCafe: "Excelso", pesoRecibidoKg: 375, numBultos: 6 },
          numBultosLote: 6,
          procesos: [],
          movimientos: [],
          anulacionLote: null,
        }),
        zonaHoraria: "America/Bogota",
      }),
    );
    expect(salida).toContain("Compra");
    expect(salida).toContain("proveedor: Finca La Esperanza");
    expect(salida).toContain("Excelso");
  });
});
