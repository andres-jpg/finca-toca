import { describe, expect, it } from "vitest";
import { calcularFechaRevacunacion, DIAS_AVISO_REVACUNACION } from "./revacunacion";

const VACUNACION = new Date(2026, 0, 10);

describe("calcularFechaRevacunacion", () => {
  it("1_mes suma un mes", () => {
    expect(calcularFechaRevacunacion(VACUNACION, "1_mes")).toEqual(new Date(2026, 1, 10));
  });

  it("6_meses suma seis meses", () => {
    expect(calcularFechaRevacunacion(VACUNACION, "6_meses")).toEqual(new Date(2026, 6, 10));
  });

  it("1_anio suma doce meses", () => {
    expect(calcularFechaRevacunacion(VACUNACION, "1_anio")).toEqual(new Date(2027, 0, 10));
  });

  it("recorta al último día del mes destino (31 ene + 1 mes = 28 feb)", () => {
    expect(calcularFechaRevacunacion(new Date(2026, 0, 31), "1_mes")).toEqual(new Date(2026, 1, 28));
  });

  it("personalizada devuelve la fecha manual tal cual, ignorando la de vacunación", () => {
    const manual = new Date(2026, 8, 1);

    expect(calcularFechaRevacunacion(VACUNACION, "personalizada", manual)).toBe(manual);
    expect(calcularFechaRevacunacion(undefined, "personalizada", manual)).toBe(manual);
  });

  it("personalizada sin fecha manual (o inválida) devuelve null", () => {
    expect(calcularFechaRevacunacion(VACUNACION, "personalizada")).toBeNull();
    expect(calcularFechaRevacunacion(VACUNACION, "personalizada", null)).toBeNull();
    expect(calcularFechaRevacunacion(VACUNACION, "personalizada", new Date("x"))).toBeNull();
  });

  it("sin periodo devuelve null", () => {
    expect(calcularFechaRevacunacion(VACUNACION, null)).toBeNull();
    expect(calcularFechaRevacunacion(VACUNACION, undefined)).toBeNull();
  });

  it("con plazo predefinido pero sin fecha de vacunación válida devuelve null", () => {
    expect(calcularFechaRevacunacion(undefined, "6_meses")).toBeNull();
    expect(calcularFechaRevacunacion(new Date("x"), "6_meses")).toBeNull();
  });

  it("un plazo predefinido ignora la fecha manual", () => {
    expect(calcularFechaRevacunacion(VACUNACION, "1_mes", new Date(2030, 0, 1))).toEqual(
      new Date(2026, 1, 10)
    );
  });

  it("la ventana de aviso es de 8 días", () => {
    expect(DIAS_AVISO_REVACUNACION).toBe(8);
  });
});
