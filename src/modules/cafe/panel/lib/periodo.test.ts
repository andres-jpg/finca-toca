import { describe, expect, it } from "vitest";
import {
  describirPeriodo,
  diasInclusivos,
  etiquetaLinea,
  listarDias,
  lunesDe,
  MAX_DIAS_RANGO,
  parsearParamsPanel,
  resolverPeriodo,
  serializarParamsPanel,
  sumarDias,
} from "./periodo";

// Fechas siempre fijas: nunca se mira el reloj. 2026-03-11 es miércoles.
const HOY = "2026-03-11";

describe("fechas", () => {
  it("sumarDias cruza meses y años sin zona horaria", () => {
    expect(sumarDias("2026-03-01", -1)).toBe("2026-02-28");
    expect(sumarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(sumarDias("2024-02-28", 1)).toBe("2024-02-29");
  });
  it("diasInclusivos cuenta ambos extremos", () => {
    expect(diasInclusivos("2026-03-09", "2026-03-09")).toBe(1);
    expect(diasInclusivos("2026-03-09", "2026-03-10")).toBe(2);
    expect(diasInclusivos("2026-02-27", "2026-03-02")).toBe(4);
  });
  it("lunesDe: la semana empieza el lunes (domingo cuenta con la anterior)", () => {
    expect(lunesDe("2026-03-11")).toBe("2026-03-09"); // miércoles
    expect(lunesDe("2026-03-09")).toBe("2026-03-09"); // lunes
    expect(lunesDe("2026-03-15")).toBe("2026-03-09"); // domingo
    expect(lunesDe("2026-03-16")).toBe("2026-03-16");
  });
  it("listarDias", () => {
    expect(listarDias("2026-02-27", "2026-03-02")).toEqual(["2026-02-27", "2026-02-28", "2026-03-01", "2026-03-02"]);
    expect(listarDias("2026-03-02", "2026-03-01")).toEqual([]);
  });
});

describe("resolverPeriodo", () => {
  it("hoy", () => {
    expect(resolverPeriodo({ periodo: "hoy" }, HOY)).toEqual({ periodo: "hoy", desde: HOY, hasta: HOY, aviso: null });
  });
  it("esta semana: del lunes a hoy", () => {
    expect(resolverPeriodo({ periodo: "semana" }, HOY)).toEqual({ periodo: "semana", desde: "2026-03-09", hasta: HOY, aviso: null });
    expect(resolverPeriodo({ periodo: "semana" }, "2026-03-09")).toMatchObject({ desde: "2026-03-09", hasta: "2026-03-09" });
  });
  it("este mes: del día 1 a hoy", () => {
    expect(resolverPeriodo({ periodo: "mes" }, HOY)).toEqual({ periodo: "mes", desde: "2026-03-01", hasta: HOY, aviso: null });
  });
  it("rango: lo que escribió el usuario", () => {
    expect(resolverPeriodo({ periodo: "rango", desde: "2026-03-01", hasta: "2026-03-05" }, HOY)).toEqual({
      periodo: "rango",
      desde: "2026-03-01",
      hasta: "2026-03-05",
      aviso: null,
    });
  });
  it("rango con una sola fecha: hasta hoy; solo «hasta»: ese día", () => {
    expect(resolverPeriodo({ periodo: "rango", desde: "2026-03-05" }, HOY)).toMatchObject({ desde: "2026-03-05", hasta: HOY });
    expect(resolverPeriodo({ periodo: "rango", hasta: "2026-03-05" }, HOY)).toMatchObject({ desde: "2026-03-05", hasta: "2026-03-05" });
    expect(resolverPeriodo({ periodo: "rango" }, HOY)).toMatchObject({ desde: HOY, hasta: HOY });
  });
  it("rango invertido: se intercambian", () => {
    expect(resolverPeriodo({ periodo: "rango", desde: "2026-03-10", hasta: "2026-03-01" }, HOY)).toMatchObject({
      desde: "2026-03-01",
      hasta: "2026-03-10",
    });
  });
  it("rango de más de un año: se recorta por el principio y se avisa", () => {
    const r = resolverPeriodo({ periodo: "rango", desde: "2024-01-01", hasta: "2026-03-10" }, HOY);
    expect(r.hasta).toBe("2026-03-10");
    expect(diasInclusivos(r.desde, r.hasta)).toBe(MAX_DIAS_RANGO);
    expect(r.aviso).toMatch(/^El rango máximo es de un año: se muestra desde el \d{2}\/\d{2}\/\d{4}\.$/);
  });
});

describe("parsearParamsPanel", () => {
  it("sin parámetros: hoy y todas las líneas", () => {
    expect(parsearParamsPanel({})).toEqual({ periodo: "hoy", linea: null });
  });
  it("periodo y línea válidos", () => {
    expect(parsearParamsPanel({ periodo: "semana", linea: "maquila" })).toEqual({ periodo: "semana", linea: "maquila" });
  });
  it("lo inválido se descarta en silencio", () => {
    expect(parsearParamsPanel({ periodo: "ayer", linea: "cafe", desde: "2026-02-30", hasta: "no" })).toEqual({ periodo: "hoy", linea: null });
  });
  it("fechas sin periodo explícito implican rango", () => {
    expect(parsearParamsPanel({ desde: "2026-03-01", hasta: "2026-03-05" })).toEqual({
      periodo: "rango",
      linea: null,
      desde: "2026-03-01",
      hasta: "2026-03-05",
    });
  });
  it("toma el primer valor si el parámetro se repite", () => {
    expect(parsearParamsPanel({ linea: ["trilla", "maquila"] })).toMatchObject({ linea: "trilla" });
  });
});

describe("serializarParamsPanel", () => {
  it("solo lo que se aparta del valor por defecto", () => {
    expect(serializarParamsPanel({ periodo: "hoy", linea: null })).toBe("");
    expect(serializarParamsPanel({ periodo: "mes", linea: "maquila" })).toBe("periodo=mes&linea=maquila");
    expect(serializarParamsPanel({ periodo: "hoy", linea: "trilla" })).toBe("linea=trilla");
  });
  it("las fechas solo viajan con el rango", () => {
    expect(serializarParamsPanel({ periodo: "semana", desde: "2026-03-09", hasta: "2026-03-11" })).toBe("periodo=semana");
    expect(serializarParamsPanel({ periodo: "rango", desde: "2026-03-01", hasta: "2026-03-05", linea: "marca_propia" })).toBe(
      "periodo=rango&linea=marca_propia&desde=2026-03-01&hasta=2026-03-05",
    );
  });
});

describe("textos", () => {
  it("describirPeriodo", () => {
    expect(describirPeriodo("2026-03-11", "2026-03-11")).toBe("11/03/2026");
    expect(describirPeriodo("2026-03-09", "2026-03-11")).toBe("09/03/2026 – 11/03/2026");
  });
  it("etiquetaLinea", () => {
    expect(etiquetaLinea(null)).toBe("Todo");
    expect(etiquetaLinea("marca_propia")).toBe("Marca propia");
  });
});
