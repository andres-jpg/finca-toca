import { describe, expect, it } from "vitest";
import { MEDIDAS, parsearAncho } from "./ancho";

describe("parsearAncho", () => {
  it("acepta 58 y 80", () => {
    expect(parsearAncho("58")).toBe(58);
    expect(parsearAncho(" 80 ")).toBe(80);
    expect(parsearAncho(["58", "80"])).toBe(58);
  });

  it("ignora lo demás", () => {
    for (const v of [undefined, null, "", "70", "80mm", "abc"]) expect(parsearAncho(v)).toBeUndefined();
  });
});

describe("MEDIDAS", () => {
  it("el cuerpo más los dos márgenes ocupa el papel", () => {
    for (const m of Object.values(MEDIDAS)) expect(m.cuerpoMm + 2 * m.margenMm).toBe(m.papelMm);
  });
});
