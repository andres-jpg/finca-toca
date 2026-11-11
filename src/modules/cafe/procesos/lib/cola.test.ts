import { describe, expect, it } from "vitest";
import type { TarjetaLotePlanta } from "../types-planta";
import { chipsServicios, construirTablero, diasEntre, filtrarCola, kgPorEtapa, textoListoHace } from "./cola";

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
    nivelTueste: null,
    alertasCalidad: [],
    tieneDesvio: false,
    estado: "recibido",
    avanceTexto: "0 de 3",
    siguiente: { tipo: "trilla", pendienteKg: 500, baseKg: 500 },
    serviciosRequeridos: ["trilla", "tostion", "empaque"],
    completos: {},
    kgPorEtapa: { trilla: 500 },
    listoDesde: null,
    ...p,
  };
}

const PARCIAL = tarjeta({
  codigo: "MP-2026-0003",
  linea: "marca_propia",
  tercero: "Proveedor Uno",
  pesoRecibidoKg: 320,
  estado: "parcial",
  serviciosRequeridos: ["tostion", "empaque"],
  completos: {},
  kgPorEtapa: { tostion: 202, empaque: 54 },
});
const LISTO = tarjeta({ codigo: "MQ-2026-0009", estado: "listo", completos: { trilla: true, tostion: true, empaque: true }, kgPorEtapa: {}, listoDesde: "2026-10-20" });
const LISTO_MP = tarjeta({ codigo: "MP-2026-0010", linea: "marca_propia", estado: "listo", serviciosRequeridos: ["tostion", "empaque"], kgPorEtapa: {} });
const NUEVO = tarjeta({ codigo: "MQ-2026-0007" });
const COLA = [NUEVO, PARCIAL, LISTO, LISTO_MP];

describe("kgPorEtapa", () => {
  it("cuenta los kilos de los pasos que se pueden registrar ahora", () => {
    expect(
      kgPorEtapa([
        { tipo: "tostion", disponible: true, kgDisponible: 202 },
        { tipo: "empaque", disponible: true, kgDisponible: 54 },
        { tipo: "molienda", disponible: false, kgDisponible: 0 },
      ]),
    ).toEqual({ tostion: 202, empaque: 54 });
  });
  it("sin pasos disponibles no cuenta nada", () => {
    expect(kgPorEtapa([{ tipo: "trilla", disponible: false, kgDisponible: 0 }])).toEqual({});
  });
});

describe("construirTablero", () => {
  const t = construirTablero(COLA);
  it("un lote nuevo va a su primera etapa", () => {
    expect(t.trilla.map((e) => e.tarjeta.codigo)).toEqual(["MQ-2026-0007"]);
  });
  it("un lote parcial aparece en dos columnas con sus kilos", () => {
    expect(t.tostion.map((e) => [e.tarjeta.codigo, e.pendientes, e.total])).toEqual([["MP-2026-0003", 202, 320]]);
    expect(t.empaque.map((e) => [e.tarjeta.codigo, e.pendientes])).toEqual([["MP-2026-0003", 54]]);
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
    const t = tarjeta({ codigo: "X", completos: { trilla: true }, kgPorEtapa: { tostion: 405 } });
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
