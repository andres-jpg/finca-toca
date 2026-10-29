import { describe, expect, it } from "vitest";
import {
  aplicarFiltrosLotes,
  describirFiltros,
  escaparLike,
  esFechaYmd,
  hayFiltros,
  parsearFiltros,
  serializarFiltros,
  type ConsultaFiltrable,
} from "./filtros";

const TERCERO = "0a502dc0-dec7-49e0-9d47-d7f77670a9d0";

describe("parsearFiltros", () => {
  it("sin parámetros: ningún filtro y la primera página", () => {
    expect(parsearFiltros({})).toEqual({ pagina: 1 });
    expect(hayFiltros(parsearFiltros({}))).toBe(false);
  });
  it("lee el ejemplo de la tarea: tipo=maquila&estado=parcial", () => {
    expect(parsearFiltros({ tipo: "maquila", estado: "parcial" })).toEqual({ tipo: "maquila", estado: "parcial", pagina: 1 });
  });
  it("acepta un URLSearchParams (la ruta de exportación)", () => {
    const f = parsearFiltros(new URLSearchParams(`tipo=trilla&desde=2026-11-01&hasta=2026-11-30&tercero=${TERCERO}&q=MQ-2026`));
    expect(f).toEqual({ tipo: "trilla", desde: "2026-11-01", hasta: "2026-11-30", tercero: TERCERO, q: "MQ-2026", pagina: 1 });
  });
  it("descarta en silencio lo inválido", () => {
    const f = parsearFiltros({ tipo: "cafe", estado: "raro", desde: "2026-02-30", hasta: "ayer", tercero: "no-es-uuid", pagina: "-3" });
    expect(f).toEqual({ pagina: 1 });
  });
  it("si desde > hasta, los intercambia", () => {
    expect(parsearFiltros({ desde: "2026-12-01", hasta: "2026-11-01" })).toMatchObject({ desde: "2026-11-01", hasta: "2026-12-01" });
  });
  it("recorta la búsqueda y toma el primer valor de un parámetro repetido", () => {
    expect(parsearFiltros({ q: "  MP-2026  " }).q).toBe("MP-2026");
    expect(parsearFiltros({ q: "x".repeat(100) }).q).toHaveLength(40);
    expect(parsearFiltros({ estado: ["listo", "parcial"] }).estado).toBe("listo");
    expect(parsearFiltros({ q: "   " }).q).toBeUndefined();
  });
  it("página entera ≥ 1", () => {
    expect(parsearFiltros({ pagina: "3" }).pagina).toBe(3);
    expect(parsearFiltros({ pagina: "2.5" }).pagina).toBe(1);
    expect(parsearFiltros({ pagina: "0" }).pagina).toBe(1);
  });
});

describe("serializarFiltros", () => {
  it("ida y vuelta con el parseo", () => {
    const f = parsearFiltros({ tipo: "maquila", estado: "parcial", desde: "2026-11-01", hasta: "2026-11-30", q: "MQ" });
    expect(serializarFiltros(f)).toBe("tipo=maquila&estado=parcial&desde=2026-11-01&hasta=2026-11-30&q=MQ");
    expect(parsearFiltros(new URLSearchParams(serializarFiltros(f)))).toEqual(f);
  });
  it("la página solo viaja si se pide y es mayor que 1", () => {
    expect(serializarFiltros({ tipo: "trilla", pagina: 3 })).toBe("tipo=trilla");
    expect(serializarFiltros({ tipo: "trilla", pagina: 3 }, { conPagina: true })).toBe("tipo=trilla&pagina=3");
    expect(serializarFiltros({ tipo: "trilla", pagina: 1 }, { conPagina: true })).toBe("tipo=trilla");
  });
  it("sin filtros, vacío", () => {
    expect(serializarFiltros({ pagina: 1 })).toBe("");
  });
});

describe("describirFiltros", () => {
  it("el formato de la cabecera del Excel", () => {
    const f = parsearFiltros({ tipo: "maquila", estado: "parcial", desde: "2026-11-01", hasta: "2026-11-30" });
    expect(describirFiltros(f)).toBe("Tipo: Maquila · Estado: Parcial · 01/11/2026–30/11/2026");
  });
  it("un solo extremo del rango y el tercero por nombre", () => {
    expect(describirFiltros(parsearFiltros({ desde: "2026-11-01" }))).toBe("Desde 01/11/2026");
    expect(describirFiltros(parsearFiltros({ hasta: "2026-11-30" }))).toBe("Hasta 30/11/2026");
    expect(describirFiltros(parsearFiltros({ tercero: TERCERO }), "Juan Pérez")).toBe("Tercero: Juan Pérez");
  });
  it("sin filtros", () => {
    expect(describirFiltros({ pagina: 1 })).toBe("Sin filtros");
  });
});

describe("esFechaYmd / escaparLike", () => {
  it("valida días reales", () => {
    expect(esFechaYmd("2028-02-29")).toBe(true);
    expect(esFechaYmd("2026-02-29")).toBe(false);
    expect(esFechaYmd("2026-2-1")).toBe(false);
  });
  it("escapa los comodines del patrón", () => {
    expect(escaparLike("MQ_50%")).toBe("MQ\\_50\\%");
  });
});

/** Consulta de mentira que anota cada condición, para comprobar la traducción sin base de datos. */
class Espia implements ConsultaFiltrable<Espia> {
  condiciones: string[] = [];
  private anotar(texto: string): Espia {
    this.condiciones.push(texto);
    return this;
  }
  eq(c: string, v: string) {
    return this.anotar(`${c}=${v}`);
  }
  gte(c: string, v: string) {
    return this.anotar(`${c}>=${v}`);
  }
  lte(c: string, v: string) {
    return this.anotar(`${c}<=${v}`);
  }
  ilike(c: string, v: string) {
    return this.anotar(`${c} ilike ${v}`);
  }
  contains(c: string, v: string[]) {
    return this.anotar(`${c} contiene ${v.join(",")}`);
  }
  overlaps(c: string, v: string[]) {
    return this.anotar(`${c} solapa ${v.join(",")}`);
  }
}

const condiciones = (entrada: Record<string, string>) => aplicarFiltrosLotes(new Espia(), parsearFiltros(entrada)).condiciones;

describe("aplicarFiltrosLotes", () => {
  it("sin filtros no añade nada", () => {
    expect(condiciones({})).toEqual([]);
  });
  it("marca_propia y servicios filtran por línea", () => {
    expect(condiciones({ tipo: "marca_propia" })).toEqual(["linea=marca_propia"]);
    expect(condiciones({ tipo: "servicios" })).toEqual(["linea=servicio"]);
  });
  it("trilla: servicio que incluye trilla; maquila: servicio que incluye tostión, molienda o empaque", () => {
    expect(condiciones({ tipo: "trilla" })).toEqual(["linea=servicio", "servicios contiene trilla"]);
    expect(condiciones({ tipo: "maquila" })).toEqual(["linea=servicio", "servicios solapa tostion,molienda,empaque"]);
  });
  it("solo_trilla (panel de gerencia): servicio cuyo único servicio es la trilla, sin los «Trilla + maquila»", () => {
    expect(condiciones({ tipo: "solo_trilla" })).toEqual(["linea=servicio", "servicios={trilla}"]);
  });
  it("tipo=maquila&estado=parcial&desde&hasta&tercero&q", () => {
    expect(condiciones({ tipo: "maquila", estado: "parcial", desde: "2026-11-01", hasta: "2026-11-30", tercero: TERCERO, q: "MQ_1" })).toEqual([
      "linea=servicio",
      "servicios solapa tostion,molienda,empaque",
      "estado=parcial",
      "fecha_recepcion>=2026-11-01",
      "fecha_recepcion<=2026-11-30",
      `tercero_id=${TERCERO}`,
      "codigo ilike %MQ\\_1%",
    ]);
  });
});
