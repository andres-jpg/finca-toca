import { describe, expect, it } from "vitest";
import { diaCorto, enteroTexto, kgTexto, librasTexto, millonesTexto, variacionTexto } from "./formato";

describe("kgTexto", () => {
  it("1 decimal, coma decimal y miles con punto", () => {
    expect(kgTexto(500)).toBe("500,0 kg");
    expect(kgTexto(1234.5)).toBe("1.234,5 kg");
    expect(kgTexto(332.1)).toBe("332,1 kg");
    expect(kgTexto(0)).toBe("0,0 kg");
  });
});

describe("enteroTexto y librasTexto", () => {
  it("puntos de miles", () => {
    expect(enteroTexto(1923000)).toBe("1.923.000");
    expect(enteroTexto(999)).toBe("999");
    expect(enteroTexto(-1500.4)).toBe("-1.500");
    expect(enteroTexto(Number.NaN)).toBe("0");
    expect(librasTexto(2907)).toBe("2.907 lb");
  });
});

describe("millonesTexto", () => {
  it("millones con 1 decimal y coma", () => {
    expect(millonesTexto(1234000)).toBe("1,2");
    expect(millonesTexto(98000)).toBe("0,1");
    expect(millonesTexto(0)).toBe("0,0");
    expect(millonesTexto(12_950_000)).toBe("13,0");
  });
});

describe("diaCorto", () => {
  it("dd/mm", () => {
    expect(diaCorto("2026-03-09")).toBe("09/03");
    expect(diaCorto("raro")).toBe("raro");
  });
});

describe("variacionTexto", () => {
  it("lleva el signo y 1 decimal", () => {
    expect(variacionTexto(4.2)).toBe("+4,2 %");
    expect(variacionTexto(-1)).toBe("−1,0 %");
    expect(variacionTexto(0)).toBe("0,0 %");
  });
});
