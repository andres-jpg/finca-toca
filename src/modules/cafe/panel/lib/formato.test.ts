import { describe, expect, it } from "vitest";
import { abreviarCOP, cuentaLotes, cuentaProcesos, diaCorto, enteroTexto, kgTexto, mermaTexto } from "./formato";

describe("kgTexto", () => {
  it("coma decimal, miles con punto y sin ceros sobrantes", () => {
    expect(kgTexto(500)).toBe("500 kg");
    expect(kgTexto(1234.5)).toBe("1.234,5 kg");
    expect(kgTexto(332.1)).toBe("332,1 kg");
    expect(kgTexto(0)).toBe("0 kg");
  });
});

describe("mermaTexto", () => {
  it("la merma sale de los KILOS (no del porcentaje guardado a 3 decimales): 73 de 405 kg → 18,02 %", () => {
    expect(mermaTexto({ mermaKg: 73, kgEntrada: 405, procesos: 1 })).toBe("18,02 %");
    expect(mermaTexto({ mermaKg: 95, kgEntrada: 500, procesos: 1 })).toBe("19 %");
  });
  it("es la ponderada del conjunto, no el promedio de porcentajes: 94,6 de 525 kg → 18,02 %", () => {
    expect(mermaTexto({ mermaKg: 94.6, kgEntrada: 525, procesos: 3 })).toBe("18,02 %");
    // el promedio simple de 18,025 %, 18 % y 18 % sería 18,01 %
  });
  it("sin procesos no hay merma que mostrar", () => {
    expect(mermaTexto({ mermaKg: 0, kgEntrada: 0, procesos: 0 })).toBe("—");
  });
  it("con procesos y merma 0, 0 %", () => {
    expect(mermaTexto({ mermaKg: 0, kgEntrada: 330, procesos: 1 })).toBe("0 %");
  });
});

describe("enteroTexto", () => {
  it("separa los miles con punto", () => {
    expect(enteroTexto(1923000)).toBe("1.923.000");
    expect(enteroTexto(98000)).toBe("98.000");
    expect(enteroTexto(7)).toBe("7");
    expect(enteroTexto(-1500)).toBe("-1.500");
    expect(enteroTexto(Number.NaN)).toBe("0");
  });
});

describe("abreviarCOP", () => {
  it("abrevia los pesos de los ejes", () => {
    expect(abreviarCOP(1923000)).toBe("$1,9 M");
    expect(abreviarCOP(2000000)).toBe("$2 M");
    expect(abreviarCOP(98000)).toBe("$98 mil");
    expect(abreviarCOP(1500)).toBe("$1,5 mil");
    expect(abreviarCOP(450)).toBe("$450");
    expect(abreviarCOP(0)).toBe("$0");
    expect(abreviarCOP(-98000)).toBe("-$98 mil");
  });
});

describe("diaCorto y plurales", () => {
  it("día y mes", () => {
    expect(diaCorto("2026-03-09")).toBe("09/03");
  });
  it("singular y plural", () => {
    expect(cuentaProcesos(1)).toBe("1 proceso");
    expect(cuentaProcesos(1500)).toBe("1.500 procesos");
    expect(cuentaLotes(1)).toBe("1 lote");
    expect(cuentaLotes(0)).toBe("0 lotes");
  });
});
