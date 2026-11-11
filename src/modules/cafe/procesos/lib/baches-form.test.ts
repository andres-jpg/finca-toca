import { describe, expect, it } from "vitest";
import {
  alternarSeleccion,
  alternarTodos,
  aplicarASeleccionados,
  bachesSinTocar,
  difiereDelPerfil,
  estadoBaches,
  filaVacia,
  filasPorPerfil,
  filasSugeridas,
  repartirKgPorPerfil,
  type BacheFila,
} from "./baches-form";

const fila = (e: string): BacheFila => ({ ...filaVacia(), pesoEntradaKg: e });

describe("filasSugeridas: los baches nacen con los kilos y el perfil (B-05)", () => {
  it("54,0 kg de Excelso → 4 baches de 13,5 kg con 216 °C · 17 min", () => {
    const filas = filasSugeridas(54, 13.5, { nivel: "medio", tempC: 216, tiempoMin: 17 });
    expect(filas).toHaveLength(4);
    expect(filas.every((f) => f.pesoEntradaKg === "13,5" && f.temperaturaC === "216" && f.tiempoMin === "17" && f.nivel === "medio")).toBe(true);
  });

  it("100 kg → 8 baches de 12,5; el último absorbe el resto", () => {
    expect(filasSugeridas(100, 13.5).map((f) => f.pesoEntradaKg)).toEqual(Array(8).fill("12,5"));
    expect(filasSugeridas(100.001, 13.5).at(-1)?.pesoEntradaKg).toBe("12,501");
  });

  it("sin peso o con capacidad inválida no sugiere nada", () => {
    expect(filasSugeridas(null, 13.5)).toEqual([]);
    expect(filasSugeridas(0, 13.5)).toEqual([]);
    expect(filasSugeridas(10, 0)).toEqual([]);
  });
});

describe("filasPorPerfil: maquila con varios perfiles", () => {
  it("27,0 kg del Perfil 1 + 13,5 kg del Perfil 2 → 2 + 1 baches con la columna Perfil", () => {
    const filas = filasPorPerfil(
      [
        { kg: 27, nivel: "medio", tempC: 210, tiempoMin: 15 },
        { kg: 13.5, nivel: "alto", tempC: 220, tiempoMin: 17 },
      ],
      13.5,
    );
    expect(filas.map((f) => [f.perfil, f.pesoEntradaKg, f.temperaturaC])).toEqual([
      ["Perfil 1", "13,5", "210"],
      ["Perfil 1", "13,5", "210"],
      ["Perfil 2", "13,5", "220"],
    ]);
  });

  it("con un solo perfil no rotula los baches", () => {
    expect(filasPorPerfil([{ kg: 27, nivel: "medio", tempC: 210, tiempoMin: 15 }], 13.5).every((f) => f.perfil === null)).toBe(true);
  });
});

describe("estadoBaches: el indicador verde/rojo", () => {
  it("cuadra cuando la suma de entradas son los kilos a tostar", () => {
    const e = estadoBaches([fila("13,5"), fila("13,5"), fila("13,5"), fila("13,5")], 54);
    expect(e).toMatchObject({ sumaEntradaKg: 54, diferenciaKg: 0, filasValidas: true, cuadra: true });
  });
  it("faltan o sobran kilos", () => {
    expect(estadoBaches([fila("13,5")], 54).diferenciaKg).toBe(40.5);
    expect(estadoBaches([fila("60")], 54).diferenciaKg).toBe(-6);
  });
  it("una fila sin entrada no es válida; sin kilos no cuadra", () => {
    expect(estadoBaches([fila("13,5"), fila("")], 13.5).filasValidas).toBe(false);
    expect(estadoBaches([fila("13,5")], null).cuadra).toBe(false);
  });
});

describe("aplicarASeleccionados: «Aplicar a los seleccionados»", () => {
  const base = filasSugeridas(54, 13.5, { nivel: "medio", tempC: 216, tiempoMin: 17 });

  it("seleccionar los baches 3 y 4 y aplicar Alto · 220 °C cambia solo esos dos; el tiempo queda en 17 min", () => {
    const r = aplicarASeleccionados(base, new Set([2, 3]), { nivel: "alto", tempC: "220" });
    expect(r.map((f) => [f.nivel, f.temperaturaC, f.tiempoMin])).toEqual([
      ["medio", "216", "17"],
      ["medio", "216", "17"],
      ["alto", "220", "17"],
      ["alto", "220", "17"],
    ]);
  });

  it("un campo vacío «—» no se toca", () => {
    const r = aplicarASeleccionados(base, new Set([0]), { nivel: null, tempC: "", tiempoMin: "  " });
    expect(r[0]).toEqual(base[0]);
  });

  it("sin selección no cambia nada", () => {
    expect(aplicarASeleccionados(base, new Set(), { tempC: 230 })).toEqual(base);
  });
});

describe("selección múltiple", () => {
  it("alterna un bache y la casilla general", () => {
    expect([...alternarSeleccion(new Set([1]), 2)]).toEqual([1, 2]);
    expect([...alternarSeleccion(new Set([1, 2]), 1)]).toEqual([2]);
    expect([...alternarTodos(new Set(), 3)]).toEqual([0, 1, 2]);
    expect([...alternarTodos(new Set([0, 1, 2]), 3)]).toEqual([]);
  });
});

describe("resaltado y «sin tocar»", () => {
  it("resalta lo que difiere del perfil", () => {
    expect(difiereDelPerfil("220", 216)).toBe(true);
    expect(difiereDelPerfil("216", 216)).toBe(false);
    expect(difiereDelPerfil("", 216)).toBe(false);
    expect(difiereDelPerfil("220", null)).toBe(false);
  });
  it("sin tocar: solo lo sugerido", () => {
    const perfil = { nivel: "medio" as const, tempC: 216, tiempoMin: 17 };
    const filas = filasSugeridas(27, 13.5, perfil);
    expect(bachesSinTocar(filas, perfil)).toBe(true);
    expect(bachesSinTocar(aplicarASeleccionados(filas, new Set([0]), { tempC: 220 }), perfil)).toBe(false);
  });
});

describe("repartirKgPorPerfil (B-02)", () => {
  const medio = { nivel: "medio" as const, tempC: 222, tiempoMin: 17 };
  const alto = { nivel: "alto" as const, tempC: 230, tiempoMin: 15 };

  it("con los kilos del lote tal cual (27,0 + 13,5) genera 2 + 1 baches rotulados por perfil", () => {
    const kg = repartirKgPorPerfil([{ ...medio, kg: 27 }, { ...alto, kg: 13.5 }], 40.5);
    expect(kg.map((p) => p.kg)).toEqual([27, 13.5]);
    const filas = filasPorPerfil(kg, 13.5);
    expect(filas.map((f) => [f.perfil, f.pesoEntradaKg])).toEqual([
      ["Perfil 1", "13,5"],
      ["Perfil 1", "13,5"],
      ["Perfil 2", "13,5"],
    ]);
  });

  it("una tanda menor escala en proporción y suma exactamente la tanda", () => {
    const kg = repartirKgPorPerfil([{ ...medio, kg: 27 }, { ...alto, kg: 13.5 }], 40);
    expect(kg.map((p) => p.kg)).toEqual([26.667, 13.333]);
    expect(kg.reduce((s, p) => s + p.kg, 0)).toBeCloseTo(40, 6);
  });

  it("un solo perfil se lleva toda la tanda; sin tanda o perfiles, nada", () => {
    expect(repartirKgPorPerfil([{ ...medio, kg: 10 }], 54)[0].kg).toBe(54);
    expect(repartirKgPorPerfil([], 54)).toEqual([]);
    expect(repartirKgPorPerfil([{ ...medio, kg: 10 }], null)).toEqual([]);
  });
});
