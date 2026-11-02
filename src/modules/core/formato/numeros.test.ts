import { describe, expect, it } from "vitest";
import { formatCOP, formatKg, formatKgNum, formatPct, formatPctNum } from "./numeros";

describe("formatKg", () => {
  it.each([
    [156, "156,0 kg"],
    [250, "250,0 kg"],
    [194, "194,0 kg"],
    [0, "0,0 kg"],
    [62.5, "62,5 kg"],
    [1234.56, "1.234,6 kg"],
    [1234.5, "1.234,5 kg"],
    [332.049, "332,0 kg"],
    [332.05, "332,1 kg"],
    [0.04, "0,0 kg"],
    [-73.25, "-73,3 kg"],
    [-0.01, "0,0 kg"],
    [1000000, "1.000.000,0 kg"],
  ])("%s → %s", (n, esperado) => expect(formatKg(n)).toBe(esperado));
  it("no finito → 0,0", () => expect(formatKgNum(Number.NaN)).toBe("0,0"));
});

describe("formatPct", () => {
  it.each([
    [18.3, "18,3 %"],
    [19, "19,0 %"],
    [13.33333, "13,3 %"],
    [18.025, "18,0 %"],
    [0.6, "0,6 %"],
    [33.65, "33,7 %"],
  ])("%s → %s", (n, esperado) => expect(formatPct(n)).toBe(esperado));
  it("null y no finito → —", () => {
    expect(formatPct(null)).toBe("—");
    expect(formatPct(undefined)).toBe("—");
    expect(formatPct(Number.NaN)).toBe("—");
  });
  it("formatPctNum sin signo", () => expect(formatPctNum(25)).toBe("25,0"));
});

describe("formatCOP", () => {
  it.each([
    [19260, "$19.260"],
    [6937500, "$6.937.500"],
    [4000, "$4.000"],
    [0, "$0"],
    [1250.5, "$1.251"],
    [-1500, "-$1.500"],
    [-0.2, "$0"],
  ])("%s → %s", (n, esperado) => expect(formatCOP(n)).toBe(esperado));
  it("no finito → $0", () => expect(formatCOP(Number.NaN)).toBe("$0"));
});
