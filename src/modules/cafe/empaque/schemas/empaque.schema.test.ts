import { describe, expect, it } from "vitest";
import { empaqueSchema, payloadEmpaque, payloadSalidaPt, salidaPtSchema } from "./empaque.schema";

const LOTE = "11111111-1111-4111-8111-111111111111";
const TANDA = "22222222-2222-4222-8222-222222222222";
const ARTICULO = "33333333-3333-4333-8333-333333333333";

const base = {
  loteId: LOTE,
  fecha: "2026-11-08",
  origenProcesoId: TANDA,
  pesoBasculaKg: "44,3",
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
      origen_proceso_id: TANDA,
      peso_bascula_kg: 44.3,
      sobrante_forma: "grano",
      lineas: [{ presentacion_g: 500, unidades: 120 }, { presentacion_g: 2500, unidades: 8 }],
      observaciones: null,
    });
  });

  it("la bolsa del cliente y el tostado incluido viajan al payload; el destino solo con un café reabierto", () => {
    const r = empaqueSchema.parse({
      ...base,
      incluirTostado: [{ loteOrigenId: LOTE, forma: "grano", kg: "0,4" }],
      lineas: [{ presentacionG: 5000, unidades: 10, bolsaCliente: true }, { presentacionG: 2500, unidades: 5 }],
    });
    expect(payloadEmpaque(r)).toMatchObject({
      incluir_tostado: [{ lote_origen_id: LOTE, forma: "grano", kg: 0.4 }],
      lineas: [{ presentacion_g: 5000, unidades: 10, bolsa_cliente: true }, { presentacion_g: 2500, unidades: 5 }],
    });
    expect(payloadEmpaque(r)).not.toHaveProperty("diferencia_destino");
    const reabierto = empaqueSchema.parse({ ...base, origenProcesoId: null, pesoBasculaKg: null, reaperturaId: ARTICULO, pesoEntradaKg: "20", diferenciaDestino: "granel" });
    expect(payloadEmpaque(reabierto)).toMatchObject({ reapertura_id: ARTICULO, peso_entrada_kg: 20, diferencia_destino: "granel" });
  });

  it("un destino desconocido es un error", () => {
    expect(empaqueSchema.safeParse({ ...base, diferenciaDestino: "regalo" }).success).toBe(false);
    expect(empaqueSchema.safeParse({ ...base, diferenciaDestino: "granel" }).success).toBe(true);
  });

  it("el peso en báscula es opcional en el schema (la base lo exige con tostión) y acepta coma decimal", () => {
    expect(empaqueSchema.parse({ ...base, pesoBasculaKg: "" }).pesoBasculaKg).toBeNull();
    expect(empaqueSchema.parse({ ...base, pesoBasculaKg: null }).pesoBasculaKg).toBeNull();
    expect(empaqueSchema.parse({ ...base, pesoBasculaKg: "40,5" }).pesoBasculaKg).toBe(40.5);
    expect(empaqueSchema.parse({ ...base, pesoBasculaKg: 40.5 }).pesoBasculaKg).toBe(40.5);
  });

  it("rechaza pesos ilegibles, cero, con más de 3 decimales o enormes", () => {
    for (const malo of ["abc", "0", "-3", "1,2345", "10000000"]) {
      expect(empaqueSchema.safeParse({ ...base, pesoBasculaKg: malo }).success, malo).toBe(false);
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

  it("lote, tanda y fecha tienen que ser válidos", () => {
    expect(empaqueSchema.safeParse({ ...base, loteId: "no-es-uuid" }).success).toBe(false);
    expect(empaqueSchema.safeParse({ ...base, origenProcesoId: "x" }).success).toBe(false);
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

describe("forma (A-02)", () => {
  const baseMolido = {
    loteId: LOTE,
    fecha: "2026-11-10",
    pesoBasculaKg: "44,3",
    lineas: [
      { presentacionG: 500, unidades: 40 },
      { presentacionG: 2500, unidades: 8, forma: "molido" },
    ],
  };

  it("la forma por defecto es grano y el molido viaja al payload; la molienda ya no va en el empaque", () => {
    const r = empaqueSchema.parse(baseMolido);
    expect(r.lineas.map((l) => l.forma)).toEqual(["grano", "molido"]);
    const p = payloadEmpaque(r) as Record<string, unknown>;
    expect(p.lineas).toEqual([
      { presentacion_g: 500, unidades: 40 },
      { presentacion_g: 2500, unidades: 8, forma: "molido" },
    ]);
    expect(p).not.toHaveProperty("molienda");
    expect(p).not.toHaveProperty("bultos");
  });

  it("la misma presentación puede ir en grano y en molido; repetir la misma forma no", () => {
    const dos = [
      { presentacionG: 500, unidades: 4, forma: "grano" },
      { presentacionG: 500, unidades: 6, forma: "molido" },
    ];
    expect(empaqueSchema.safeParse({ ...baseMolido, lineas: dos }).success).toBe(true);
    expect(empaqueSchema.safeParse({ ...baseMolido, lineas: [...dos, { presentacionG: 500, unidades: 1, forma: "molido" }] }).success).toBe(false);
  });

  it("la forma desconocida se rechaza", () => {
    expect(empaqueSchema.safeParse({ ...baseMolido, lineas: [{ presentacionG: 500, unidades: 1, forma: "tostado" }] }).success).toBe(false);
  });
});
