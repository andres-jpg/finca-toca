import { describe, expect, it } from "vitest";
import { hayFiltrosRemisiones, parsearFiltrosRemisiones, serializarFiltrosRemisiones } from "./filtros";

const T = "0a502dc0-dec7-49e0-9d47-d7f77670a9d0";

describe("parsearFiltrosRemisiones", () => {
  it("sin parámetros: solo la página 1", () => {
    expect(parsearFiltrosRemisiones({})).toEqual({ pagina: 1 });
  });

  it("lee fechas, cliente, estado, texto y página", () => {
    expect(
      parsearFiltrosRemisiones({ desde: "2026-11-01", hasta: "2026-11-30", tercero: T.toUpperCase(), estado: "anulada", q: " REM-2026 ", pagina: "3" }),
    ).toEqual({ desde: "2026-11-01", hasta: "2026-11-30", tercero: T, estado: "anulada", q: "REM-2026", pagina: 3 });
  });

  it("descarta lo inválido en silencio", () => {
    expect(parsearFiltrosRemisiones({ desde: "2026-02-31", hasta: "ayer", tercero: "no-uuid", estado: "otra", pagina: "-2" })).toEqual({ pagina: 1 });
  });

  it("intercambia desde y hasta si vienen al revés", () => {
    expect(parsearFiltrosRemisiones({ desde: "2026-11-30", hasta: "2026-11-01" })).toMatchObject({ desde: "2026-11-01", hasta: "2026-11-30" });
  });

  it("acepta un URLSearchParams y toma el primer valor de un arreglo", () => {
    expect(parsearFiltrosRemisiones(new URLSearchParams("estado=entregada&q=MQ"))).toEqual({ estado: "entregada", q: "MQ", pagina: 1 });
    expect(parsearFiltrosRemisiones({ estado: ["vigente", "anulada"] })).toEqual({ estado: "entregada", pagina: 1 });
  });

  it("limita la búsqueda a 40 caracteres", () => {
    expect(parsearFiltrosRemisiones({ q: "x".repeat(100) }).q).toHaveLength(40);
  });
});

describe("estado «vigente» heredado", () => {
  it("un enlace antiguo con estado=vigente se lee como entregada", () => {
    expect(parsearFiltrosRemisiones({ estado: "vigente" }).estado).toBe("entregada");
  });
});

describe("serializarFiltrosRemisiones / hayFiltrosRemisiones", () => {
  it("orden fijo y sin la página por defecto", () => {
    expect(serializarFiltrosRemisiones({ q: "MQ", estado: "entregada", desde: "2026-11-01", pagina: 4 })).toBe("desde=2026-11-01&estado=entregada&q=MQ");
    expect(serializarFiltrosRemisiones({ pagina: 4 }, { conPagina: true })).toBe("pagina=4");
    expect(serializarFiltrosRemisiones({ pagina: 1 }, { conPagina: true })).toBe("");
  });

  it("ida y vuelta", () => {
    const filtros = { desde: "2026-11-01", hasta: "2026-11-30", tercero: T, estado: "entregada" as const, q: "REM", pagina: 2 };
    expect(parsearFiltrosRemisiones(new URLSearchParams(serializarFiltrosRemisiones(filtros, { conPagina: true })))).toEqual(filtros);
  });

  it("hay filtros si hay alguno (la página no cuenta)", () => {
    expect(hayFiltrosRemisiones({ pagina: 3 })).toBe(false);
    expect(hayFiltrosRemisiones({ pagina: 1, estado: "anulada" })).toBe(true);
  });
});

