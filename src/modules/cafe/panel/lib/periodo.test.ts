import { describe, expect, it } from "vitest";
import { deLaPeriodo, describirPeriodo, diasDelMes, diasInclusivos, etiquetaAnterior, listarDias, lunesDe, nombreMes, parsearParamsPanel, periodoAnterior, resolverPeriodo, serializarParamsPanel, sumarDias, desdeHistorico } from "./periodo";

// Fechas siempre fijas: nunca se mira el reloj. 2026-03-11 es miércoles.
const HOY = "2026-03-11";

describe("fechas", () => {
  it("sumarDias cruza meses y años sin zona horaria", () => {
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("diasInclusivos cuenta ambos extremos", () => {
    expect(diasInclusivos("2026-03-09", "2026-03-09")).toBe(1);
    expect(diasInclusivos("2026-02-27", "2026-03-02")).toBe(4);
  });
  it("lunesDe: la semana empieza el lunes", () => {
    expect(lunesDe("2026-03-11")).toBe("2026-03-09");
    expect(lunesDe("2026-03-15")).toBe("2026-03-09");
  });
  it("listarDias", () => {
    expect(listarDias("2026-02-27", "2026-03-02")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
    expect(listarDias("2026-03-02", "2026-03-01")).toEqual([]);
  });
  it("diasDelMes y nombreMes", () => {
    expect(diasDelMes("2026-02-10")).toBe(28);
    expect(diasDelMes("2024-02-10")).toBe(29);
    expect(diasDelMes("2026-10-31")).toBe(31);
    expect(nombreMes("2026-09-05")).toBe("septiembre");
  });
});

describe("resolverPeriodo", () => {
  it("hoy, semana (del lunes a hoy) y mes (del día 1 a hoy)", () => {
    expect(resolverPeriodo("hoy", HOY)).toEqual({ desde: HOY, hasta: HOY });
    expect(resolverPeriodo("semana", HOY)).toEqual({ desde: "2026-03-09", hasta: HOY });
    expect(resolverPeriodo("mes", HOY)).toEqual({ desde: "2026-03-01", hasta: HOY });
  });
});

describe("periodoAnterior", () => {
  it("hoy → ayer", () => expect(periodoAnterior("hoy", HOY)).toEqual({ desde: "2026-03-10", hasta: "2026-03-10" }));
  it("semana → la semana pasada hasta el mismo día", () => expect(periodoAnterior("semana", HOY)).toEqual({ desde: "2026-03-02", hasta: "2026-03-04" }));
  it("mes → el mes pasado hasta el mismo día del mes", () => expect(periodoAnterior("mes", "2026-10-11")).toEqual({ desde: "2026-09-01", hasta: "2026-09-11" }));
  it("mes: si el mes pasado es más corto se recorta a su último día", () => {
    expect(periodoAnterior("mes", "2026-03-31")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
  });
  it("etiquetas", () => {
    expect(etiquetaAnterior("mes", "2026-10-11")).toBe("septiembre");
    expect(etiquetaAnterior("semana", HOY)).toBe("la semana pasada");
    expect(etiquetaAnterior("hoy", HOY)).toBe("ayer");
    expect(deLaPeriodo("mes")).toBe("del mes");
  });
});

describe("parsearParamsPanel y serializarParamsPanel", () => {
  it("por defecto, el mes", () => expect(parsearParamsPanel({})).toEqual({ periodo: "mes" }));
  it("periodo válido", () => expect(parsearParamsPanel({ periodo: "semana" })).toEqual({ periodo: "semana" }));
  it("lo inválido o viejo (rango, línea) se descarta en silencio", () => {
    expect(parsearParamsPanel({ periodo: "rango", linea: "maquila", desde: "2026-03-01" })).toEqual({ periodo: "mes" });
  });
  it("toma el primer valor si se repite", () => expect(parsearParamsPanel({ periodo: ["hoy", "mes"] })).toEqual({ periodo: "hoy" }));
  it("serializa solo lo que se aparta del valor por defecto", () => {
    expect(serializarParamsPanel({ periodo: "mes" })).toBe("");
    expect(serializarParamsPanel({ periodo: "hoy" })).toBe("periodo=hoy");
  });
});

describe("textos", () => {
  it("describirPeriodo", () => {
    expect(describirPeriodo("2026-03-11", "2026-03-11")).toBe("11/03/2026");
    expect(describirPeriodo("2026-03-09", "2026-03-11")).toBe("09/03/2026 – 11/03/2026");
  });
});

describe("desdeHistorico", () => {
  it("cabe en el rango máximo de la base (731 días) y no usa una fecha fija", () => {
    expect(desdeHistorico("2026-11-11")).toBe("2024-11-11");
    expect(diasInclusivos(desdeHistorico("2026-11-11"), "2026-11-11") - 1).toBeLessThanOrEqual(731);
    expect(diasInclusivos(desdeHistorico("2028-03-01"), "2028-03-01") - 1).toBeLessThanOrEqual(731);
  });
});
