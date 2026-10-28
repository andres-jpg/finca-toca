import { describe, expect, it } from "vitest";
import { calcularAvance, textoAvance, textoBultos, type EtapaAvance, type LoteAvance } from "./avance";

const etapa = (tipo: EtapaAvance["tipo"], procesados: number, total: number): EtapaAvance => ({
  tipo,
  bultosProcesados: procesados,
  bultosTotal: total,
  completo: procesados === total,
  parcial: procesados > 0 && procesados < total,
});

const maquila = (completados: number, estado = "en_proceso"): LoteAvance => ({
  linea: "servicio",
  estado,
  avanceTexto: `${completados} de 4`,
  serviciosCompletados: completados,
  serviciosRequeridos: ["trilla", "tostion", "molienda", "empaque"],
});

const marcaPropia: LoteAvance = {
  linea: "marca_propia",
  estado: "parcial",
  avanceTexto: "0 de 2",
  serviciosCompletados: 0,
  serviciosRequeridos: ["tostion", "empaque"],
};

describe("textoBultos", () => {
  it("singular y plural", () => {
    expect(textoBultos(4, 6)).toBe("4/6 bultos");
    expect(textoBultos(1, 1)).toBe("1/1 bulto");
  });
});

describe("calcularAvance · servicio", () => {
  it("maquila con trilla+tostión+molienda+empaque: 0 de 4, 1 de 4… y cambia al completarse cada paso", () => {
    expect(textoAvance(maquila(0, "recibido"), [])).toBe("0 de 4");
    expect(textoAvance(maquila(1), [etapa("trilla", 8, 8)])).toBe("1 de 4");
    expect(textoAvance(maquila(2), [etapa("trilla", 8, 8), etapa("tostion", 8, 8)])).toBe("2 de 4");
  });
  it("la barra es completados / requeridos", () => {
    expect(calcularAvance(maquila(1), [etapa("trilla", 8, 8)]).fraccion).toBe(0.25);
    expect(calcularAvance(maquila(4, "listo"), []).fraccion).toBe(1);
  });
  it("un paso a medias no sube el «n de m» pero se dice aparte", () => {
    const a = calcularAvance(maquila(1), [etapa("trilla", 8, 8), etapa("tostion", 2, 8)]);
    expect(a.texto).toBe("1 de 4");
    expect(a.detalle).toBe("Tostión 2/8 bultos");
  });
  it("sin texto de la vista, lo arma", () => {
    expect(textoAvance({ ...maquila(2), avanceTexto: null }, [])).toBe("2 de 4");
  });
});

describe("calcularAvance · marca propia", () => {
  it("sin procesos: sin procesar", () => {
    expect(calcularAvance(marcaPropia, [])).toEqual({ texto: "Sin procesar", fraccion: 0, detalle: null });
  });
  it("«Tostado 4/6 bultos» con la barra al 4/6", () => {
    const a = calcularAvance(marcaPropia, [etapa("tostion", 4, 6)]);
    expect(a.texto).toBe("Tostado 4/6 bultos");
    expect(a.fraccion).toBeCloseTo(4 / 6);
  });
  it("cuenta el paso más avanzado", () => {
    expect(textoAvance(marcaPropia, [etapa("tostion", 6, 6), etapa("molienda", 3, 6)])).toBe("Molido 3/6 bultos");
    expect(textoAvance(marcaPropia, [etapa("tostion", 6, 6), etapa("empaque", 6, 6)])).toBe("Empacado 6/6 bultos");
  });
});

describe("calcularAvance · anulado", () => {
  it("no tiene avance", () => {
    expect(calcularAvance({ ...maquila(0), estado: "anulado" }, [])).toEqual({ texto: "Anulado", fraccion: 0, detalle: null });
  });
});
