import { describe, expect, it } from "vitest";
import { hayFiltrosVentas, parsearFiltrosVentas, serializarFiltrosVentas } from "./filtros";

const UUID = "3f2a1b4c-0d5e-4f60-8a71-92b3c4d5e6f7";

describe("parsearFiltrosVentas", () => {
  it("sin parámetros: página 1 y nada más", () => {
    expect(parsearFiltrosVentas({})).toEqual({ pagina: 1 });
  });

  it("lee todos los filtros válidos", () => {
    const f = parsearFiltrosVentas({ desde: "2026-11-01", hasta: "2026-11-30", tipo: "cortesia", tercero: UUID, estado: "anulada", factura: "pendiente", q: "VT-2026", pagina: "3" });
    expect(f).toEqual({ desde: "2026-11-01", hasta: "2026-11-30", tipo: "cortesia", tercero: UUID, estado: "anulada", facturaPendiente: true, q: "VT-2026", pagina: 3 });
  });

  it("descarta en silencio lo inválido", () => {
    const f = parsearFiltrosVentas({ desde: "ayer", tipo: "regalo", tercero: "x", estado: "borrada", factura: "todas", pagina: "-2" });
    expect(f).toEqual({ pagina: 1 });
  });

  it("si las fechas vienen al revés las ordena", () => {
    expect(parsearFiltrosVentas({ desde: "2026-12-01", hasta: "2026-11-01" })).toMatchObject({ desde: "2026-11-01", hasta: "2026-12-01" });
  });

  it("acepta URLSearchParams", () => {
    expect(parsearFiltrosVentas(new URLSearchParams("tipo=venta&factura=pendiente"))).toEqual({ tipo: "venta", facturaPendiente: true, pagina: 1 });
  });

  it("recorta la búsqueda", () => {
    expect(parsearFiltrosVentas({ q: "x".repeat(100) }).q).toHaveLength(40);
  });
});

describe("serializarFiltrosVentas", () => {
  it("orden fijo y página solo si se pide y es > 1", () => {
    const f = { desde: "2026-11-01", tipo: "venta" as const, facturaPendiente: true, pagina: 2 };
    expect(serializarFiltrosVentas(f)).toBe("desde=2026-11-01&tipo=venta&factura=pendiente");
    expect(serializarFiltrosVentas(f, { conPagina: true })).toBe("desde=2026-11-01&tipo=venta&factura=pendiente&pagina=2");
  });

  it("es el inverso de parsear", () => {
    const f = parsearFiltrosVentas({ desde: "2026-11-01", estado: "vigente", factura: "pendiente", pagina: "4" });
    expect(parsearFiltrosVentas(new URLSearchParams(serializarFiltrosVentas(f, { conPagina: true })))).toEqual(f);
  });
});

describe("hayFiltrosVentas", () => {
  it("la página sola no es un filtro", () => {
    expect(hayFiltrosVentas({ pagina: 5 })).toBe(false);
    expect(hayFiltrosVentas({ pagina: 1, facturaPendiente: true })).toBe(true);
  });
});
