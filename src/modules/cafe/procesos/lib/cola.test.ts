import { describe, expect, it } from "vitest";
import type { TarjetaLotePlanta } from "../types-planta";
import { contarPorPaso, filtrarCola, separarPorLinea } from "./cola";

function tarjeta(p: Partial<TarjetaLotePlanta> & Pick<TarjetaLotePlanta, "codigo">): TarjetaLotePlanta {
  return {
    id: p.codigo,
    linea: "servicio",
    tercero: "Café del Sur",
    tipoCafe: null,
    fechaRecepcion: "2026-11-05",
    pesoRecibidoKg: 500,
    pesoActualKg: 500,
    numBultos: 8,
    nivelTueste: null,
    alertasCalidad: [],
    tieneDesvio: false,
    estado: "recibido",
    avanceTexto: "0 de 3",
    siguiente: { tipo: "trilla", pendientes: 8, total: 8 },
    ...p,
  };
}

const COLA = [
  tarjeta({ codigo: "MQ-2026-0007" }),
  tarjeta({ codigo: "MQ-2026-0008", tercero: "Finca Ñandú", siguiente: { tipo: "tostion", pendientes: 4, total: 6 } }),
  tarjeta({ codigo: "MP-2026-0003", linea: "marca_propia", tercero: "Proveedor Uno", siguiente: { tipo: "tostion", pendientes: 6, total: 6 } }),
  tarjeta({ codigo: "MP-2026-0004", linea: "marca_propia", siguiente: null }),
];

describe("filtrarCola", () => {
  it("sin filtros devuelve todo", () => {
    expect(filtrarCola(COLA, { paso: null, q: "" })).toHaveLength(4);
  });

  it("por paso: solo las tarjetas cuyo siguiente paso es ese", () => {
    expect(filtrarCola(COLA, { paso: "tostion", q: "" }).map((t) => t.codigo)).toEqual(["MQ-2026-0008", "MP-2026-0003"]);
    expect(filtrarCola(COLA, { paso: "molienda", q: "" })).toEqual([]);
  });

  it("por código, sin distinguir mayúsculas ni espacios sobrantes", () => {
    expect(filtrarCola(COLA, { paso: null, q: " mq-2026-0007 " }).map((t) => t.codigo)).toEqual(["MQ-2026-0007"]);
    expect(filtrarCola(COLA, { paso: null, q: "0003" }).map((t) => t.codigo)).toEqual(["MP-2026-0003"]);
  });

  it("también por cliente, sin tildes", () => {
    expect(filtrarCola(COLA, { paso: null, q: "nandu" }).map((t) => t.codigo)).toEqual(["MQ-2026-0008"]);
  });

  it("combina paso y texto", () => {
    expect(filtrarCola(COLA, { paso: "tostion", q: "MP" }).map((t) => t.codigo)).toEqual(["MP-2026-0003"]);
  });
});

describe("separarPorLinea: servicios y marca propia nunca se mezclan", () => {
  it("reparte las tarjetas en dos listas disjuntas", () => {
    const { servicios, marcaPropia } = separarPorLinea(COLA);
    expect(servicios.map((t) => t.codigo)).toEqual(["MQ-2026-0007", "MQ-2026-0008"]);
    expect(marcaPropia.map((t) => t.codigo)).toEqual(["MP-2026-0003", "MP-2026-0004"]);
    expect(servicios.length + marcaPropia.length).toBe(COLA.length);
  });
});

describe("contarPorPaso", () => {
  it("cuenta tarjetas por su siguiente paso (las que no tienen, no cuentan)", () => {
    expect(contarPorPaso(COLA)).toEqual({ trilla: 1, tostion: 2, molienda: 0, empaque: 0 });
  });
});
