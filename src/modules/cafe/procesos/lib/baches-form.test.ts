import { describe, expect, it } from "vitest";
import {
  agrupar,
  aplicarPedidoATodos,
  bachesSinTocar,
  desagrupar,
  difiereDelPedido,
  estadoBaches,
  filaVacia,
  filasSugeridas,
  gruposDe,
  normalizarGrupos,
  repartirProporcional,
  type BacheFila,
} from "./baches-form";

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

describe("pesaje agrupado (A-12)", () => {
  const tres = () => [fila("13,5", ""), fila("13,5", ""), fila("13,5", "10,6")];

  it("reparte el peso del grupo en proporción a la entrada, a gramos, y el último absorbe el resto", () => {
    expect(repartirProporcional(22.1, [13.5, 13.5])).toEqual([11.05, 11.05]);
    expect(repartirProporcional(10, [1, 1, 1])).toEqual([3.333, 3.333, 3.334]);
    expect(repartirProporcional(9, [3, 6])).toEqual([3, 6]);
  });

  it("agrupa 1+2 con 22,1 kg y deja el 3 individual: salida 32,7 y merma del lote 19,3 %", () => {
    const g = agrupar(tres(), [0, 1]);
    const conPeso = normalizarGrupos(g.map((f) => (f.grupo === 1 ? { ...f, pesoGrupoKg: "22,1" } : f)));
    expect(conPeso.map((f) => f.pesoSalidaKg)).toEqual(["11,05", "11,05", "10,6"]);
    expect(conPeso.map((f) => f.grupo)).toEqual([1, 1, null]);
    const e = estadoBaches(conPeso, 40.5);
    expect(e).toMatchObject({ sumaEntradaKg: 40.5, sumaSalidaKg: 32.7, cuadra: true });
    expect(Math.round(((40.5 - e.sumaSalidaKg) / 40.5) * 1000) / 10).toBe(19.3);
  });

  it("un grupo sin peso conjunto deja a sus baches sin salida", () => {
    expect(agrupar(tres(), [0, 1]).map((f) => f.pesoSalidaKg)).toEqual(["", "", "10,6"]);
  });

  it("un grupo de un solo bache se disuelve y los grupos se renumeran", () => {
    const filas = tres().map((f, i) => ({ ...f, grupo: i === 2 ? 5 : 3, pesoGrupoKg: "" }));
    const n = normalizarGrupos([filas[0], filas[1], filas[2]]);
    expect(n.map((f) => f.grupo)).toEqual([1, 1, null]);
  });

  it("desagrupar devuelve el pesaje individual conservando la salida repartida", () => {
    const g = normalizarGrupos(agrupar(tres(), [0, 1]).map((f) => (f.grupo === 1 ? { ...f, pesoGrupoKg: "22,1" } : f)));
    const d = desagrupar(g, 1);
    expect(d.map((f) => f.grupo)).toEqual([null, null, null]);
    expect(d.map((f) => f.pesoSalidaKg)).toEqual(["11,05", "11,05", "10,6"]);
  });

  it("gruposDe resume cada grupo", () => {
    expect(gruposDe(agrupar(tres(), [0, 2]))).toEqual([{ grupo: 1, indices: [0, 2], entradaKg: 27, pesoGrupoKg: "" }]);
  });
});

describe("temperatura y tiempo del pedido (A-12)", () => {
  it("«Aplicar a todos» copia lo que tenga el pedido y respeta lo demás", () => {
    const r = aplicarPedidoATodos([fila("13,5", ""), { ...fila("13,5", ""), tiempoMin: "9" }], { tempC: 205, tiempoMin: null });
    expect(r.map((f) => [f.temperaturaC, f.tiempoMin])).toEqual([["205", ""], ["205", "9"]]);
    expect(aplicarPedidoATodos([fila("1", "")], { tempC: 205, tiempoMin: 12 })[0]).toMatchObject({ temperaturaC: "205", tiempoMin: "12" });
  });

  it("resalta solo cuando lo escrito difiere del pedido", () => {
    expect(difiereDelPedido("212", 205)).toBe(true);
    expect(difiereDelPedido("205", 205)).toBe(false);
    expect(difiereDelPedido("205,0", 205)).toBe(false);
    expect(difiereDelPedido("", 205)).toBe(false);
    expect(difiereDelPedido("212", null)).toBe(false);
  });

  it("bachesSinTocar distingue la sugerencia intacta de un trabajo ya empezado", () => {
    expect(bachesSinTocar(filasSugeridas(40.5, 13.5))).toBe(true);
    expect(bachesSinTocar([{ ...filaVacia(), pesoEntradaKg: "13,5", temperaturaC: "205" }])).toBe(false);
  });
});
