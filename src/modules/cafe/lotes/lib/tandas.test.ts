import { describe, expect, it } from "vitest";
import type { BacheLinea } from "./linea-tiempo";
import { bachesModificados, calcularTandas, resumenTostion } from "./tandas";
import { mermaTostionAcumulada, notaComprado, textoTandas } from "./cifras";

const p = (id: string, tipo: "tostion" | "empaque", creadoEn: string, extra = {}) => ({
  id, tipo, fecha: "2026-11-03", creadoEn, pesoEntradaKg: 0, pesoSalidaKg: null, mermaKg: null, anulacion: null, reaperturaId: null, origenProcesoId: null, ...extra,
});

describe("calcularTandas", () => {
  const procesos = [
    p("t1", "tostion", "2026-11-03T10:00:00Z", { pesoEntradaKg: 64, pesoSalidaKg: 52.4, mermaKg: 11.6 }),
    p("e1", "empaque", "2026-11-03T11:00:00Z", { origenProcesoId: "t1" }),
    p("t2", "tostion", "2026-11-04T10:00:00Z", { pesoEntradaKg: 54, pesoSalidaKg: 44.3, mermaKg: 9.7 }),
    p("e2", "empaque", "2026-11-04T12:00:00Z", { origenProcesoId: "t2" }),
  ];
  it("numera por tostión y acumula la merma al cerrar cada tanda", () => {
    const r = calcularTandas(procesos);
    expect(r.get("t2")?.numero).toBe(2);
    expect(r.get("e1")).toEqual({ numero: 1, mermaTandaPct: 18.13, acumuladaPct: 18.13 });
    expect(r.get("e2")).toEqual({ numero: 2, mermaTandaPct: 17.96, acumuladaPct: 18.05 });
  });
  it("una tostión sin salida no tiene merma y un anulado no cuenta", () => {
    const r = calcularTandas([p("t1", "tostion", "a", { pesoEntradaKg: 64 }), p("t0", "tostion", "0", { anulacion: { en: "x", por: null, motivo: "m" } })]);
    expect(r.get("t1")).toEqual({ numero: 1, mermaTandaPct: null, acumuladaPct: null });
    expect(r.has("t0")).toBe(false);
  });
});

describe("resumen de la tostión", () => {
  const perfil = { nivel: "medio" as const, tempC: 216, tiempoMin: 17 };
  const bache = (numero: number, temperaturaC: number, nivelTueste: BacheLinea["nivelTueste"] = "medio"): BacheLinea => ({
    numero, pesoEntradaKg: 13, temperaturaC, tiempoMin: 17, nivelTueste, observaciones: null,
  });
  it("en perfil: baches · nivel · temperatura · tiempo", () => {
    const b = [1, 2, 3, 4, 5].map((n) => bache(n, 216));
    expect(resumenTostion(b, perfil, null)).toBe("5 baches · Medio · 216 °C · 17 min");
  });
  it("baches modificados con sus valores", () => {
    const b = [bache(1, 216), bache(2, 216), bache(3, 220, "alto"), bache(4, 220, "alto")];
    expect(bachesModificados(b, perfil).map((x) => x.numero)).toEqual([3, 4]);
    expect(resumenTostion(b, perfil, null)).toBe("4 baches · baches 3 y 4 a 220 °C, alto");
  });
  it("sin perfil no marca nada", () => {
    expect(bachesModificados([bache(1, 300)], null)).toEqual([]);
  });
});

describe("cifras", () => {
  it("merma de tostión acumulada y notas", () => {
    expect(mermaTostionAcumulada([{ tipo: "tostion", pesoEntradaKg: 118, mermaKg: 21.3 }])?.pct).toBe(18.05);
    expect(mermaTostionAcumulada([{ tipo: "trilla", pesoEntradaKg: 118, mermaKg: 21.3 }])).toBeNull();
    expect(notaComprado(28500, 9120000)).toBe("$28.500/kg · $9.120.000");
    expect(notaComprado(null, null)).toBeNull();
    expect(textoTandas(2)).toBe("2 tandas de tostión");
    expect(textoTandas(1)).toBe("1 tanda de tostión");
  });
});
