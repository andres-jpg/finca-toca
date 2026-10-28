import { describe, expect, it } from "vitest";
import { empaqueSchema, payloadEmpaque, payloadSalidaPt, salidaPtSchema } from "./empaque.schema";

const LOTE = "11111111-1111-4111-8111-111111111111";
const BULTO = "22222222-2222-4222-8222-222222222222";
const ARTICULO = "33333333-3333-4333-8333-333333333333";

const base = {
  loteId: LOTE,
  fecha: "2026-11-08",
  bultoIds: [BULTO],
  pesoEntradaKg: "81",
  lineas: [{ presentacionG: 500, unidades: "120" }, { presentacionG: 2500, unidades: "8" }],
  observaciones: "",
};

describe("empaqueSchema", () => {
  it("el ejemplo del ticket se normaliza y arma el payload de la RPC", () => {
    const r = empaqueSchema.safeParse(base);
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(payloadEmpaque(r.data)).toEqual({
      lote_id: LOTE,
      fecha: "2026-11-08",
      bultos: [BULTO],
      peso_entrada_kg: 81,
      lineas: [{ presentacion_g: 500, unidades: 120 }, { presentacion_g: 2500, unidades: 8 }],
      observaciones: null,
    });
  });

  it("el peso de entrada es opcional (la base toma el disponible) y acepta coma decimal", () => {
    expect(empaqueSchema.parse({ ...base, pesoEntradaKg: "" }).pesoEntradaKg).toBeNull();
    expect(empaqueSchema.parse({ ...base, pesoEntradaKg: null }).pesoEntradaKg).toBeNull();
    expect(empaqueSchema.parse({ ...base, pesoEntradaKg: "40,5" }).pesoEntradaKg).toBe(40.5);
    expect(empaqueSchema.parse({ ...base, pesoEntradaKg: 40.5 }).pesoEntradaKg).toBe(40.5);
  });

  it("rechaza pesos ilegibles, cero, con más de 3 decimales o enormes", () => {
    for (const malo of ["abc", "0", "-3", "1,2345", "10000000"]) {
      expect(empaqueSchema.safeParse({ ...base, pesoEntradaKg: malo }).success, malo).toBe(false);
    }
  });

  it("las unidades son enteros positivos (con punto de miles) y al menos una presentación", () => {
    expect(empaqueSchema.parse({ ...base, lineas: [{ presentacionG: 500, unidades: "1.200" }] }).lineas[0].unidades).toBe(1200);
    for (const malo of ["", "0", "1,5", "doce", "-4", "100000"]) {
      expect(empaqueSchema.safeParse({ ...base, lineas: [{ presentacionG: 500, unidades: malo }] }).success, malo).toBe(false);
    }
    expect(empaqueSchema.safeParse({ ...base, lineas: [] }).success).toBe(false);
  });

  it("una presentación repetida es un error en la fila repetida", () => {
    const r = empaqueSchema.safeParse({ ...base, lineas: [{ presentacionG: 500, unidades: 1 }, { presentacionG: 500, unidades: 2 }] });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path).toEqual(["lineas", 1, "presentacionG"]);
  });

  it("lote, bultos y fecha tienen que ser válidos", () => {
    expect(empaqueSchema.safeParse({ ...base, loteId: "no-es-uuid" }).success).toBe(false);
    expect(empaqueSchema.safeParse({ ...base, bultoIds: ["x"] }).success).toBe(false);
    expect(empaqueSchema.safeParse({ ...base, fecha: "08/11/2026" }).success).toBe(false);
  });

  it("es idempotente: lo ya normalizado se vuelve a validar igual (el Server Action repite la validación)", () => {
    const una = empaqueSchema.parse(base);
    const dos = empaqueSchema.parse({ ...una, observaciones: una.observaciones });
    expect(dos).toEqual(una);
  });
});

describe("salidaPtSchema", () => {
  const salida = { articuloId: ARTICULO, motivo: "muestra", unidades: "5", observaciones: "" };

  it("una muestra va sin observación y en positivo (la base resta)", () => {
    const r = salidaPtSchema.parse(salida);
    expect(payloadSalidaPt(r)).toEqual({ articulo_id: ARTICULO, motivo: "muestra", unidades: 5, observaciones: null });
  });

  it("una pérdida sin observación es un error; con ella se acepta", () => {
    const sin = salidaPtSchema.safeParse({ ...salida, motivo: "perdida" });
    expect(sin.success).toBe(false);
    if (!sin.success) expect(sin.error.issues[0].path).toEqual(["observaciones"]);
    expect(salidaPtSchema.safeParse({ ...salida, motivo: "perdida", observaciones: "Bolsas rotas" }).success).toBe(true);
  });

  it("un ajuste exige dirección y observación, y lleva el signo", () => {
    expect(salidaPtSchema.safeParse({ ...salida, motivo: "ajuste", observaciones: "Conteo físico" }).success).toBe(false);
    expect(salidaPtSchema.safeParse({ ...salida, motivo: "ajuste", direccion: "aumenta" }).success).toBe(false);
    const baja = salidaPtSchema.parse({ ...salida, motivo: "ajuste", direccion: "disminuye", observaciones: "Conteo físico" });
    expect(payloadSalidaPt(baja)).toMatchObject({ motivo: "ajuste", unidades: -5 });
    const sube = salidaPtSchema.parse({ ...salida, motivo: "ajuste", direccion: "aumenta", observaciones: "Conteo físico" });
    expect(payloadSalidaPt(sube)).toMatchObject({ motivo: "ajuste", unidades: 5 });
  });

  it("la dirección solo cuenta en el ajuste", () => {
    const r = salidaPtSchema.parse({ ...salida, direccion: "disminuye" });
    expect(payloadSalidaPt(r)).toMatchObject({ motivo: "muestra", unidades: 5 });
  });

  it("solo muestra, pérdida y ajuste: la venta y la cortesía son de otra pantalla", () => {
    expect(salidaPtSchema.safeParse({ ...salida, motivo: "venta" }).success).toBe(false);
    expect(salidaPtSchema.safeParse({ ...salida, motivo: "cortesia" }).success).toBe(false);
  });

  it("las unidades son enteros mayores que cero", () => {
    for (const malo of ["", "0", "-1", "1,5", "x"]) {
      expect(salidaPtSchema.safeParse({ ...salida, unidades: malo }).success, malo).toBe(false);
    }
  });
});
