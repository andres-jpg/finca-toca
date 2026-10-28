import { describe, expect, it } from "vitest";
import type { DetalleServicio, Remision } from "../types";
import { filaServicio, filasServicios, lineaApilada, lineaCliente, lineaRecibido, resumenEntrega, valorReferencia } from "./tiquete";

// El ejemplo del informe y de la tarea FIN-113: 500 kg, 8 bultos, trilla + tostión + molienda (+ empaque incluido).
const base = { tarifaKg: null, nivelTueste: null, incluido: false, pendiente: false } as const;
const trilla: DetalleServicio = { ...base, servicio: "trilla", kgEntrada: 500, kgSalida: 405, mermaKg: 95, tarifaKg: 1400, valor: 700000 };
const tostion: DetalleServicio = { ...base, servicio: "tostion", kgEntrada: 405, kgSalida: 332, mermaKg: 73, tarifaKg: 2200, valor: 891000, nivelTueste: "medio" };
const molienda: DetalleServicio = { ...base, servicio: "molienda", kgEntrada: 332, kgSalida: 330, mermaKg: 2, tarifaKg: 1000, valor: 332000 };
const empaque: DetalleServicio = { ...base, servicio: "empaque", kgEntrada: 330, kgSalida: 330, mermaKg: 0, tarifaKg: 0, valor: 0, incluido: true };

describe("filaServicio", () => {
  it("trilla: kilos con tres decimales y merma desde los kilos", () => {
    expect(filaServicio(trilla)).toEqual({ servicio: "Trilla", entra: "500,000", sale: "405,000", merma: "19 %" });
  });

  it("tostión: lleva el nivel de tueste y su merma a dos decimales (73 de 405 kg = 18,02 %, no 18,03)", () => {
    expect(filaServicio(tostion)).toEqual({ servicio: "Tostión · tueste medio", entra: "405,000", sale: "332,000", merma: "18,02 %" });
  });

  it("molienda: 2 de 332 kg = 0,6 %", () => {
    expect(filaServicio(molienda)).toEqual({ servicio: "Molienda", entra: "332,000", sale: "330,000", merma: "0,6 %" });
  });

  it("empaque de maquila: solo «incluido», sin cifras", () => {
    expect(filaServicio(empaque)).toEqual({ servicio: "Empaque", entra: "incluido", sale: "", merma: "" });
  });

  it("un servicio pendiente (entrega forzada) sale sin cifras, nunca con ceros", () => {
    const pendiente: DetalleServicio = { ...base, servicio: "molienda", kgEntrada: null, kgSalida: null, mermaKg: null, valor: null, pendiente: true };
    expect(filaServicio(pendiente)).toEqual({ servicio: "Molienda", entra: "—", sale: "—", merma: "Pendiente" });
  });

  it("el empaque pendiente también sale «Pendiente», no «incluido»", () => {
    const pendiente: DetalleServicio = { ...empaque, kgEntrada: null, kgSalida: null, mermaKg: null, pendiente: true };
    expect(filaServicio(pendiente).merma).toBe("Pendiente");
  });

  it("un servicio parcial (algunos bultos) conserva sus cifras", () => {
    expect(filaServicio({ ...tostion, pendiente: true }).entra).toBe("405,000");
  });

  it("miles con punto: 1.234,500", () => {
    expect(filaServicio({ ...trilla, kgEntrada: 1234.5, kgSalida: 1000, mermaKg: 234.5 }).entra).toBe("1.234,500");
  });
});

describe("filasServicios", () => {
  it("conserva el orden recibido", () => {
    expect(filasServicios([trilla, tostion, molienda, empaque]).map((f) => f.servicio)).toEqual([
      "Trilla",
      "Tostión · tueste medio",
      "Molienda",
      "Empaque",
    ]);
  });
});

describe("lineaApilada (rollo de 58 mm)", () => {
  it("servicio con kilos: título, «entra → sale» y la merma a la derecha", () => {
    expect(lineaApilada(tostion)).toEqual({ titulo: "Tostión · tueste medio", cuerpo: "405,000 → 332,000", derecha: "18,02 %" });
  });

  it("cuerpo y merma caben juntos en una línea del rollo de 58 mm (~26 caracteres)", () => {
    const l = lineaApilada({ ...trilla, kgEntrada: 405, kgSalida: 332, mermaKg: 73 });
    expect(`${l.cuerpo} ${l.derecha}`.length).toBeLessThanOrEqual(26);
  });

  it("empaque incluido y servicio pendiente: una sola línea", () => {
    expect(lineaApilada(empaque)).toEqual({ titulo: "Empaque", cuerpo: null, derecha: "incluido" });
    expect(lineaApilada({ ...base, servicio: "molienda", kgEntrada: null, kgSalida: null, mermaKg: null, valor: null, pendiente: true })).toEqual({
      titulo: "Molienda",
      cuerpo: null,
      derecha: "Pendiente",
    });
  });
});

describe("resumenEntrega", () => {
  it("ejemplo: recibido 500, entregado 330, merma 170 kg (34 %)", () => {
    expect(resumenEntrega({ pesoRecibidoKg: 500, pesoEntregadoKg: 330, mermaTotalKg: 170 })).toEqual({
      recibido: "500,000 kg",
      entregado: "330,000 kg",
      mermaKg: "170,000 kg",
      mermaPct: "34 %",
    });
  });

  it("merma con decimales: 172 de 500 kg = 34,4 %", () => {
    expect(resumenEntrega({ pesoRecibidoKg: 500, pesoEntregadoKg: 328, mermaTotalKg: 172 }).mermaPct).toBe("34,4 %");
  });

  it("sin merma: 0 %", () => {
    expect(resumenEntrega({ pesoRecibidoKg: 100, pesoEntregadoKg: 100, mermaTotalKg: 0 }).mermaPct).toBe("0 %");
  });
});

describe("textos sueltos", () => {
  it("valor de referencia en pesos, sin Intl", () => {
    expect(valorReferencia(1923000)).toBe("$1.923.000");
    expect(valorReferencia(0)).toBe("$0");
  });

  it("cliente con y sin identificación", () => {
    const r: Pick<Remision, "clienteNombre" | "clienteIdentificacion"> = { clienteNombre: "Juan Pérez", clienteIdentificacion: "1234567" };
    expect(lineaCliente(r)).toBe("Juan Pérez · 1234567");
    expect(lineaCliente({ ...r, clienteIdentificacion: null })).toBe("Juan Pérez");
  });

  it("línea de recibido: fecha, kilos y bultos (singular y plural)", () => {
    expect(lineaRecibido("2026-11-12", 500, 8)).toBe("12/11/2026 · 500,000 kg · 8 bultos");
    expect(lineaRecibido("2026-11-12", 62.5, 1)).toBe("12/11/2026 · 62,500 kg · 1 bulto");
  });
});
