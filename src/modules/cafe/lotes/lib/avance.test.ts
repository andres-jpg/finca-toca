import { describe, expect, it } from "vitest";
import { calcularAvance, textoAvance, textoKg, type EtapaAvance, type LoteAvance } from "./avance";

// kg procesados / kg base (p. ej. 118 de 320 kg tostados).
const etapa = (tipo: EtapaAvance["tipo"], procesados: number, total: number): EtapaAvance => ({
  tipo,
  kgBase: total,
  kgProcesados: procesados,
  kgPendientes: total - procesados,
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

describe("textoKg", () => {
  it("«202,0 kg por tostar · de 320,0 kg»", () => {
    expect(textoKg("tostion", 202, 320)).toBe("202,0 kg por tostar · de 320,0 kg");
    expect(textoKg("empaque", 54, 118)).toBe("54,0 kg por empacar · de 118,0 kg");
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
    expect(a.detalle).toBe("Tostión · 6,0 kg por tostar · de 8,0 kg");
  });
  it("sin texto de la vista, lo arma", () => {
    expect(textoAvance({ ...maquila(2), avanceTexto: null }, [])).toBe("2 de 4");
  });
});

describe("calcularAvance · marca propia", () => {
  it("sin procesos: sin procesar", () => {
    expect(calcularAvance(marcaPropia, [])).toEqual({ texto: "Sin procesar", fraccion: 0, detalle: null });
  });
  it("un lote de 320,0 kg con 118,0 kg tostados muestra «202,0 kg por tostar»", () => {
    const a = calcularAvance(marcaPropia, [etapa("tostion", 118, 320)]);
    expect(a.texto).toBe("202,0 kg por tostar · de 320,0 kg");
    expect(a.fraccion).toBeCloseTo(118 / 320);
  });
  it("cuenta el paso más avanzado", () => {
    expect(textoAvance(marcaPropia, [etapa("tostion", 320, 320), etapa("molienda", 100, 320)])).toBe("220,0 kg por moler · de 320,0 kg");
    expect(textoAvance(marcaPropia, [etapa("tostion", 320, 320), etapa("empaque", 320, 320)])).toBe("Empacado · 320,0 kg");
  });
});

describe("calcularAvance · anulado", () => {
  it("no tiene avance", () => {
    expect(calcularAvance({ ...maquila(0), estado: "anulado" }, [])).toEqual({ texto: "Anulado", fraccion: 0, detalle: null });
  });
});
