import { describe, expect, it } from "vitest";
import type { TipoEvento } from "@/types";
import { calcularDiasEnLeche, calcularDiasEnLecheEnFecha } from "./estados";

// Fecha fija (hora local): 15 de junio de 2026.
const HOY = new Date(2026, 5, 15);

const ev = (tipo_evento: TipoEvento, fecha: string) => ({ tipo_evento, fecha });

describe("calcularDiasEnLeche", () => {
  it("cuenta los días desde el último parto", () => {
    expect(calcularDiasEnLeche("produccion", [ev("parto", "2026-05-16")], HOY)).toBe(30);
  });

  it("un aborto arranca la lactancia igual que un parto", () => {
    expect(calcularDiasEnLeche("produccion", [ev("aborto", "2026-06-05")], HOY)).toBe(10);
  });

  it("el día del parto cuenta 0", () => {
    expect(calcularDiasEnLeche("produccion", [ev("parto", "2026-06-15")], HOY)).toBe(0);
  });

  it("gana el parto más reciente", () => {
    const eventos = [ev("parto", "2025-03-01"), ev("parto", "2026-05-26")];

    expect(calcularDiasEnLeche("produccion", eventos, HOY)).toBe(20);
  });

  it("gana el más reciente entre parto y aborto, sin importar el orden del arreglo", () => {
    const eventos = [ev("aborto", "2026-06-01"), ev("parto", "2026-03-01")];

    expect(calcularDiasEnLeche("produccion", eventos, HOY)).toBe(14);
  });

  it("un secado posterior al parto pone el contador a 0", () => {
    const eventos = [ev("parto", "2025-09-01"), ev("secado", "2026-05-01")];

    expect(calcularDiasEnLeche("produccion", eventos, HOY)).toBe(0);
  });

  it("un parto posterior al secado reanuda la cuenta", () => {
    const eventos = [ev("parto", "2025-01-01"), ev("secado", "2025-11-01"), ev("parto", "2026-06-01")];

    expect(calcularDiasEnLeche("produccion", eventos, HOY)).toBe(14);
  });

  it("parto y secado el mismo día: queda seca", () => {
    const eventos = [ev("secado", "2026-06-01"), ev("parto", "2026-06-01")];

    expect(calcularDiasEnLeche("produccion", eventos, HOY)).toBe(0);
  });

  it("estado secado manda sobre el historial, aunque no haya evento de secado", () => {
    expect(calcularDiasEnLeche("secado", [ev("parto", "2026-05-16")], HOY)).toBe(0);
    expect(calcularDiasEnLeche("secado", [], HOY)).toBe(0);
  });

  it("sin parto, aborto ni secado devuelve null", () => {
    expect(calcularDiasEnLeche("produccion", [], HOY)).toBeNull();
    expect(calcularDiasEnLeche(null, [ev("inseminacion", "2026-01-10")], HOY)).toBeNull();
  });

  it("un parto con fecha futura cuenta 0, nunca negativo", () => {
    expect(calcularDiasEnLeche("produccion", [ev("parto", "2026-06-20")], HOY)).toBe(0);
  });

  it("ignora otros tipos de evento", () => {
    const eventos = [ev("parto", "2026-05-16"), ev("vacunacion", "2026-06-10")];

    expect(calcularDiasEnLeche("produccion", eventos, HOY)).toBe(30);
  });
});

describe("calcularDiasEnLecheEnFecha", () => {
  const eventos = [ev("parto", "2026-01-01"), ev("secado", "2026-04-01"), ev("parto", "2026-06-01")];

  it("cuenta desde el parto vigente en esa fecha", () => {
    expect(calcularDiasEnLecheEnFecha(eventos, "2026-02-01")).toBe(31);
  });

  it("ignora eventos posteriores a la fecha consultada", () => {
    expect(calcularDiasEnLecheEnFecha(eventos, "2026-03-01")).toBe(59);
  });

  it("devuelve 0 si en esa fecha ya estaba seca", () => {
    expect(calcularDiasEnLecheEnFecha(eventos, "2026-05-01")).toBe(0);
  });

  it("devuelve null si no hay parto o aborto previo a la fecha", () => {
    expect(calcularDiasEnLecheEnFecha(eventos, "2025-12-31")).toBeNull();
    expect(calcularDiasEnLecheEnFecha([], "2026-02-01")).toBeNull();
  });
});
