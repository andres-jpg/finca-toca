import { describe, expect, it } from "vitest";
import type { TarjetaLotePlanta } from "../types-planta";
import { bultosPorEtapa, calcularAvisos, chipsServicios, construirTablero, diasEntre, filtrarCola, textoListoHace } from "./cola";

function tarjeta(p: Partial<TarjetaLotePlanta> & Pick<TarjetaLotePlanta, "codigo">): TarjetaLotePlanta {
  return {
    id: p.codigo,
    linea: "servicio",
    tercero: "Café del Sur",
    tipoCafe: null,
    fechaRecepcion: "2026-11-05",
    llegadaEn: "2026-11-05T12:15:00.000Z",
    pesoRecibidoKg: 500,
    pesoActualKg: 500,
    numBultos: 8,
    nivelTueste: null,
    alertasCalidad: [],
    tieneDesvio: false,
    estado: "recibido",
    avanceTexto: "0 de 3",
    siguiente: { tipo: "trilla", pendientes: 8, total: 8 },
    serviciosRequeridos: ["trilla", "tostion", "empaque"],
    procesados: {},
    bultosPorEtapa: { trilla: 8 },
    listoDesde: null,
    ...p,
  };
}

const PARCIAL = tarjeta({
  codigo: "MP-2026-0003",
  linea: "marca_propia",
  tercero: "Proveedor Uno",
  numBultos: 6,
  estado: "parcial",
  serviciosRequeridos: ["tostion", "empaque"],
  procesados: { tostion: 2 },
  bultosPorEtapa: { tostion: 4, empaque: 2 },
});
const LISTO = tarjeta({ codigo: "MQ-2026-0009", estado: "listo", procesados: { trilla: 8, tostion: 8, empaque: 8 }, bultosPorEtapa: {}, listoDesde: "2026-10-20" });
const LISTO_MP = tarjeta({ codigo: "MP-2026-0010", linea: "marca_propia", estado: "listo", serviciosRequeridos: ["tostion", "empaque"], bultosPorEtapa: {} });
const NUEVO = tarjeta({ codigo: "MQ-2026-0007" });
const COLA = [NUEVO, PARCIAL, LISTO, LISTO_MP];

describe("bultosPorEtapa", () => {
  it("reparte los bultos según el primer paso requerido que les falta", () => {
    expect(bultosPorEtapa(["tostion", "empaque"], [{ pasos: ["tostion"] }, { pasos: ["tostion"] }, { pasos: [] }, { pasos: [] }])).toEqual({ tostion: 2, empaque: 2 });
  });
  it("un bulto con todo hecho no cuenta", () => {
    expect(bultosPorEtapa(["trilla"], [{ pasos: ["trilla"] }])).toEqual({});
  });
});

describe("construirTablero", () => {
  const t = construirTablero(COLA);
  it("un lote nuevo va a su primera etapa", () => {
    expect(t.trilla.map((e) => e.tarjeta.codigo)).toEqual(["MQ-2026-0007"]);
  });
  it("un lote parcial aparece en dos columnas con sus bultos", () => {
    expect(t.tostion.map((e) => [e.tarjeta.codigo, e.pendientes, e.total])).toEqual([["MP-2026-0003", 4, 6]]);
    expect(t.empaque.map((e) => [e.tarjeta.codigo, e.pendientes])).toEqual([["MP-2026-0003", 2]]);
  });
  it("un lote de servicio listo va a «Por entregar» y no desaparece", () => {
    expect(t.entrega.map((e) => e.tarjeta.codigo)).toEqual(["MQ-2026-0009"]);
  });
  it("marca propia lista no entra a ninguna columna", () => {
    expect(Object.values(t).flat().some((e) => e.tarjeta.codigo === "MP-2026-0010")).toBe(false);
  });
});

describe("filtrarCola", () => {
  it("sin texto devuelve todo", () => {
    expect(filtrarCola(COLA, " ")).toHaveLength(4);
  });
  it("por código o cliente, sin tildes ni mayúsculas", () => {
    expect(filtrarCola(COLA, " mq-2026-0007 ").map((x) => x.codigo)).toEqual(["MQ-2026-0007"]);
    expect(filtrarCola([tarjeta({ codigo: "A", tercero: "Finca Ñandú" })], "nandu")).toHaveLength(1);
  });
});

describe("chipsServicios", () => {
  it("hecho, actual y futuro", () => {
    const t = tarjeta({ codigo: "X", procesados: { trilla: 8 }, bultosPorEtapa: { tostion: 8 } });
    expect(chipsServicios(t, "tostion")).toEqual([
      { tipo: "trilla", estado: "hecho" },
      { tipo: "tostion", estado: "actual" },
      { tipo: "empaque", estado: "futuro" },
    ]);
  });
});

describe("diasEntre y textoListoHace", () => {
  it("cuenta días naturales", () => {
    expect(diasEntre("2026-10-30", "2026-11-02")).toBe(3);
    expect(diasEntre("2026-12-31", "2027-01-01")).toBe(1);
  });
  it("redacta", () => {
    expect(textoListoHace(0)).toBe("listo hoy");
    expect(textoListoHace(1)).toBe("listo desde ayer");
    expect(textoListoHace(5)).toBe("listo hace 5 días");
  });
});

describe("calcularAvisos", () => {
  it("rojo por desvío, ámbar por insumos y gris por lotes sin recoger más de N días", () => {
    const avisos = calcularAvisos({
      tarjetas: [...COLA, tarjeta({ codigo: "MQ-2026-0011", tieneDesvio: true })],
      insumosBajoMinimo: ["Bolsa 500 g"],
      diasSinRecoger: 7,
      hoy: "2026-11-02",
    });
    expect(avisos.map((a) => [a.id, a.tono, a.cantidad])).toEqual([["desvio", "rojo", 1], ["insumo", "ambar", 1], ["sin_recoger", "gris", 1]]);
  });
  it("en orden: cantidades en cero", () => {
    const avisos = calcularAvisos({ tarjetas: [NUEVO, { ...LISTO, listoDesde: "2026-11-01" }], insumosBajoMinimo: [], diasSinRecoger: 7, hoy: "2026-11-02" });
    expect(avisos.every((a) => a.cantidad === 0)).toBe(true);
  });
});
