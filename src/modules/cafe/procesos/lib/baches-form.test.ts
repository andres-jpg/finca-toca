import { describe, expect, it } from "vitest";
import { estadoBaches, filaVacia, filasSugeridas, type BacheFila } from "./baches-form";

const fila = (e: string, s: string): BacheFila => ({ ...filaVacia(), pesoEntradaKg: e, pesoSalidaKg: s });

describe("filasSugeridas: «Sugerir baches» llena la entrada y deja la salida para el operario", () => {
  it("405 kg en una tostadora de 13,5 → 30 baches de 13,5 (con coma)", () => {
    const filas = filasSugeridas(405, 13.5);
    expect(filas).toHaveLength(30);
    expect(filas.every((f) => f.pesoEntradaKg === "13,5" && f.pesoSalidaKg === "" && f.temperaturaC === "")).toBe(true);
  });

  it("100 kg → 8 baches de 12,5; el último absorbe el resto", () => {
    expect(filasSugeridas(100, 13.5).map((f) => f.pesoEntradaKg)).toEqual(Array(8).fill("12,5"));
    const filas = filasSugeridas(100.001, 13.5);
    expect(filas.at(-1)?.pesoEntradaKg).toBe("12,501");
  });

  it("sin peso o con capacidad inválida no sugiere nada", () => {
    expect(filasSugeridas(null, 13.5)).toEqual([]);
    expect(filasSugeridas(0, 13.5)).toEqual([]);
    expect(filasSugeridas(10, 0)).toEqual([]);
  });
});

describe("estadoBaches: el indicador verde/rojo", () => {
  it("cuadra cuando la suma de entradas es el peso de entrada", () => {
    const e = estadoBaches([fila("13,5", "11"), fila("13,5", "11,1")], 27);
    expect(e).toMatchObject({ sumaEntradaKg: 27, sumaSalidaKg: 22.1, diferenciaKg: 0, filasValidas: true, cuadra: true });
  });

  it("tolera 1 g, pero no 2", () => {
    expect(estadoBaches([fila("13,5", "11"), fila("13,5", "11")], 27.001).cuadra).toBe(true);
    expect(estadoBaches([fila("13,5", "11"), fila("13,5", "11")], 27.002).cuadra).toBe(false);
  });

  it("diferencia positiva = faltan kg por repartir; negativa = sobran", () => {
    expect(estadoBaches([fila("13,5", "11")], 27).diferenciaKg).toBe(13.5);
    expect(estadoBaches([fila("13,5", "11"), fila("13,5", "11")], 20).diferenciaKg).toBe(-7);
  });

  it("una fila incompleta o con salida mayor que la entrada no es válida", () => {
    expect(estadoBaches([fila("13,5", "")], 13.5)).toMatchObject({ filasValidas: false, cuadra: false });
    expect(estadoBaches([fila("13,5", "14")], 13.5).filasValidas).toBe(false);
    expect(estadoBaches([fila("0", "0")], 0).filasValidas).toBe(false);
  });

  it("sin baches o sin entrada no cuadra", () => {
    expect(estadoBaches([], 27)).toMatchObject({ filasValidas: false, cuadra: false });
    expect(estadoBaches([fila("13,5", "11")], null)).toMatchObject({ diferenciaKg: null, cuadra: false });
  });

  it("una salida de 0 es válida (café perdido por completo en el bache)", () => {
    expect(estadoBaches([fila("13,5", "0")], 13.5).cuadra).toBe(true);
  });
});
