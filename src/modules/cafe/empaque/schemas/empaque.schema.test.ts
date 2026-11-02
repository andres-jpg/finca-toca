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
      diferencia_destino: null,
      observaciones: null,
    });
  });

  it("el destino de la diferencia y la bolsa del cliente viajan al payload", () => {
    const r = empaqueSchema.parse({
      ...base,
      diferenciaDestino: "suelto",
      lineas: [{ presentacionG: 5000, unidades: 10, bolsaCliente: true }, { presentacionG: 2500, unidades: 5 }],
    });
    expect(payloadEmpaque(r)).toMatchObject({
      diferencia_destino: "suelto",
      lineas: [{ presentacion_g: 5000, unidades: 10, bolsa_cliente: true }, { presentacion_g: 2500, unidades: 5 }],
    });
  });

  it("un destino desconocido es un error", () => {
    expect(empaqueSchema.safeParse({ ...base, diferenciaDestino: "regalo" }).success).toBe(false);
    expect(empaqueSchema.safeParse({ ...base, diferenciaDestino: "granel" }).success).toBe(true);
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

describe("forma y molienda (A-02)", () => {
  const baseMolido = {
    loteId: "11111111-1111-4111-8111-111111111111",
    fecha: "2026-11-10",
    bultoIds: [],
    lineas: [
      { presentacionG: 500, unidades: 40 },
      { presentacionG: 2500, unidades: 8, forma: "molido" },
    ],
  };

  it("la forma por defecto es grano y el molido viaja al payload junto con la molienda (coma decimal)", () => {
    const r = empaqueSchema.parse({ ...baseMolido, molienda: { entradaKg: "22", salidaKg: "20,4" } });
    expect(r.lineas.map((l) => l.forma)).toEqual(["grano", "molido"]);
    const p = payloadEmpaque(r) as Record<string, unknown>;
    expect(p.lineas).toEqual([
      { presentacion_g: 500, unidades: 40 },
      { presentacion_g: 2500, unidades: 8, forma: "molido" },
    ]);
    expect(p.molienda).toEqual({ peso_entrada_kg: 22, peso_salida_kg: 20.4 });
  });

  it("la misma presentación puede ir en grano y en molido; repetir la misma forma no", () => {
    const dos = [
      { presentacionG: 500, unidades: 4, forma: "grano" },
      { presentacionG: 500, unidades: 6, forma: "molido" },
    ];
    expect(empaqueSchema.safeParse({ ...baseMolido, lineas: dos }).success).toBe(true);
    expect(empaqueSchema.safeParse({ ...baseMolido, lineas: [...dos, { presentacionG: 500, unidades: 1, forma: "molido" }] }).success).toBe(false);
  });

  it("la molienda no puede sacar más de lo que entra y la forma desconocida se rechaza", () => {
    expect(empaqueSchema.safeParse({ ...baseMolido, molienda: { entradaKg: 10, salidaKg: 11 } }).success).toBe(false);
    expect(empaqueSchema.safeParse({ ...baseMolido, molienda: { entradaKg: 0, salidaKg: 0 } }).success).toBe(false);
    expect(empaqueSchema.safeParse({ ...baseMolido, lineas: [{ presentacionG: 500, unidades: 1, forma: "tostado" }] }).success).toBe(false);
  });

  it("sin molienda no se manda el bloque", () => {
    expect(payloadEmpaque(empaqueSchema.parse(baseMolido))).not.toHaveProperty("molienda");
  });
});

