import { describe, expect, it } from "vitest";
import { construirSangre, parseSangre } from "./razas";

describe("construirSangre", () => {
  it("compone el texto con códigos de raza separados por ' x '", () => {
    expect(
      construirSangre([
        { raza: "ayrshire", pct: 50 },
        { raza: "holstein", pct: 30 },
        { raza: "jersey", pct: 20 },
      ])
    ).toBe("AYR:50% x HOL:30% x JER:20%");
  });

  it("ignora componentes vacíos, nulos o con porcentaje 0", () => {
    expect(
      construirSangre([{ raza: "holstein", pct: 100 }, null, undefined, { raza: "jersey", pct: 0 }])
    ).toBe("HOL:100%");
  });

  it("devuelve null si no queda ningún componente", () => {
    expect(construirSangre([])).toBeNull();
    expect(construirSangre([null, { raza: "jersey", pct: 0 }])).toBeNull();
  });

  it("no valida que sumen 100", () => {
    expect(
      construirSangre([
        { raza: "holstein", pct: 80 },
        { raza: "jersey", pct: 40 },
      ])
    ).toBe("HOL:80% x JER:40%");
  });
});

describe("parseSangre", () => {
  it("ida y vuelta con construirSangre", () => {
    const componentes = [
      { raza: "ayrshire" as const, pct: 50 },
      { raza: "holstein" as const, pct: 30 },
      { raza: "jerhol" as const, pct: 20 },
    ];

    expect(parseSangre(construirSangre(componentes))).toEqual(componentes);
  });

  it("acepta una sola raza, espacios alrededor y códigos en minúscula", () => {
    expect(parseSangre("HOL:100%")).toEqual([{ raza: "holstein", pct: 100 }]);
    expect(parseSangre("  hol:60%  X  jer:40% ")).toEqual([
      { raza: "holstein", pct: 60 },
      { raza: "jersey", pct: 40 },
    ]);
  });

  it("devuelve null para vacío, nulo o indefinido", () => {
    expect(parseSangre("")).toBeNull();
    expect(parseSangre(null)).toBeNull();
    expect(parseSangre(undefined)).toBeNull();
  });

  it("devuelve null para texto que no encaja con el formato", () => {
    expect(parseSangre("mitad holstein")).toBeNull();
    expect(parseSangre("HOL:50")).toBeNull();
    expect(parseSangre("HOL:1000%")).toBeNull();
    expect(parseSangre("HOL:50% x")).toBeNull();
  });

  it("devuelve null si algún código de raza no existe", () => {
    expect(parseSangre("XXX:50% x HOL:50%")).toBeNull();
  });
});
