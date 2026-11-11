import { describe, expect, it } from "vitest";
import { anularProcesoSchema, payloadProceso, procesoSchema, type ProcesoFormInput } from "./proceso.schema";

const LOTE = "11111111-1111-4111-8111-111111111111";
const ORIGEN = "22222222-2222-4222-8222-222222222222";

function base(p: Partial<ProcesoFormInput> = {}): ProcesoFormInput {
  return { loteId: LOTE, tipo: "trilla", fecha: "2026-11-06", origenProcesoId: null, pesoEntradaKg: "500", pesoSalidaKg: "405", ...p };
}

function tostion(p: Partial<ProcesoFormInput> = {}): ProcesoFormInput {
  return base({
    tipo: "tostion",
    nivelTueste: "medio",
    pesoEntradaKg: "54",
    pesoSalidaKg: null,
    baches: Array.from({ length: 4 }, () => ({ pesoEntradaKg: "13,5", temperaturaC: "216", tiempoMin: "17" })),
    ...p,
  });
}

function mensajes(input: ProcesoFormInput): string[] {
  const r = procesoSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

describe("procesoSchema: la coma decimal se normaliza en los pesos", () => {
  it("«13,5» y «13.5» y 13.5 dan el mismo número", () => {
    for (const entrada of ["13,5", "13.5", 13.5]) {
      const r = procesoSchema.parse(base({ pesoEntradaKg: entrada, pesoSalidaKg: "10,25" }));
      expect(r.pesoEntradaKg).toBe(13.5);
      expect(r.pesoSalidaKg).toBe(10.25);
    }
  });

  it("acepta miles con punto y decimales con coma", () => {
    const r = procesoSchema.parse(base({ pesoEntradaKg: "1.234,5", pesoSalidaKg: "1.000" }));
    expect(r.pesoEntradaKg).toBe(1234.5);
    expect(r.pesoSalidaKg).toBe(1);
  });

  it("rechaza texto que no es un número, con un mensaje claro", () => {
    expect(mensajes(base({ pesoEntradaKg: "abc" }))).toContain("pesoEntradaKg: Indica los kilos del proceso");
    expect(mensajes(base({ pesoEntradaKg: "0" }))).toContain("pesoEntradaKg: Los kilos deben ser mayores que cero");
    expect(mensajes(base({ pesoEntradaKg: "1,2345" }))).toContain("pesoEntradaKg: Usa como máximo 3 decimales (gramos)");
  });
});

describe("procesoSchema: tostión por tandas, sin peso de salida (B-05)", () => {
  it("54,0 kg en 4 baches de 13,5 kg con 216 °C · 17 min: válido y sin salida", () => {
    const r = procesoSchema.parse(tostion());
    expect(r.pesoSalidaKg).toBeNull();
    expect(r.baches).toHaveLength(4);
    expect(r.baches.map((b) => [b.pesoEntradaKg, b.temperaturaC, b.tiempoMin])).toEqual(Array(4).fill([13.5, 216, 17]));
  });

  it("aunque llegue una salida de una pestaña vieja, la tostión no la lleva", () => {
    expect(procesoSchema.parse(tostion({ pesoSalidaKg: "40" })).pesoSalidaKg).toBeNull();
  });

  it("los baches deben sumar los kilos a tostar", () => {
    expect(mensajes(tostion({ pesoEntradaKg: "60" }))).toContain("baches: Los baches suman 54,0 kg y los kilos a tostar son 60,0 kg");
  });

  it("exige baches y nivel de tueste", () => {
    expect(mensajes(tostion({ baches: [] }))).toContain("baches: La tostión se registra por baches: añade al menos uno");
    expect(mensajes(tostion({ nivelTueste: null }))).toContain("nivelTueste: Elige el nivel de tueste");
  });

  it("el nivel de un bache es opcional y por defecto el de la tostión", () => {
    const r = procesoSchema.parse(tostion({ baches: [{ pesoEntradaKg: "54", nivel: "alto" }] }));
    expect(r.baches[0].nivel).toBe("alto");
    expect(procesoSchema.parse(tostion({ baches: [{ pesoEntradaKg: "54" }] })).baches[0].nivel).toBeNull();
  });

  it("solo la tostión lleva baches", () => {
    expect(mensajes(base({ baches: [{ pesoEntradaKg: "13,5" }] }))).toContain("baches: Solo la tostión se registra por baches");
  });
});

describe("procesoSchema: trilla y molienda", () => {
  it("la trilla pide el peso final y no puede superar la entrada", () => {
    expect(mensajes(base({ pesoSalidaKg: "" }))).toContain("pesoSalidaKg: Indica el peso final");
    expect(mensajes(base({ pesoSalidaKg: "600" }))).toContain("pesoSalidaKg: El peso final supera la entrada. Revisar el peso.");
  });

  it("humedad y densidad son opcionales, de la trilla, y van al payload", () => {
    const r = procesoSchema.parse(base({ pesoEntradaKg: "250", pesoSalidaKg: "202,5", humedadPct: "11,2", densidadGl: "720" }));
    expect(r.humedadPct).toBe(11.2);
    expect(r.densidadGl).toBe(720);
    expect(payloadProceso(r)).toMatchObject({ humedad_pct: 11.2, densidad_gl: 720, peso_salida_kg: 202.5 });
    expect(procesoSchema.parse(base()).humedadPct).toBeNull();
    expect(mensajes(base({ humedadPct: "101" }))).toContain("humedadPct: La humedad va entre 0 y 100 %");
    expect(mensajes(base({ densidadGl: "0" }))).toContain("densidadGl: La densidad debe ser mayor que cero");
  });

  it("solo la trilla registra humedad y densidad", () => {
    expect(mensajes(base({ tipo: "molienda", pesoEntradaKg: "20", pesoSalidaKg: "", humedadPct: "11" }))).toContain("humedadPct: Solo la trilla registra humedad y densidad");
  });

  it("la molienda no lleva peso de salida", () => {
    const r = procesoSchema.parse(base({ tipo: "molienda", pesoEntradaKg: "20", pesoSalidaKg: "" }));
    expect(r.pesoSalidaKg).toBeNull();
    expect(r.nivelTueste).toBeNull();
  });
});

describe("payloadProceso", () => {
  it("manda el origen y los baches sin salida ni grupo de pesaje", () => {
    const p = payloadProceso(procesoSchema.parse(tostion({ origenProcesoId: ORIGEN })));
    expect(p).toMatchObject({ lote_id: LOTE, tipo: "tostion", origen_proceso_id: ORIGEN, peso_entrada_kg: 54, peso_salida_kg: null, nivel_tueste: "medio" });
    expect(p).not.toHaveProperty("bultos");
    const baches = p.baches as Record<string, unknown>[];
    expect(baches[0]).toEqual({ peso_entrada_kg: 13.5, nivel_tueste: null, temperatura_c: 216, tiempo_min: 17, observaciones: null });
  });
});

describe("anularProcesoSchema", () => {
  it("exige el motivo", () => {
    expect(anularProcesoSchema.safeParse({ procesoId: LOTE, motivo: "  " }).success).toBe(false);
    expect(anularProcesoSchema.safeParse({ procesoId: LOTE, motivo: "Error de pesaje" }).success).toBe(true);
  });
});

describe("molienda de la tanda (B-06)", () => {
  it("sin decisión no manda molienda (marca propia sin tarjeta)", () => {
    expect(payloadProceso(procesoSchema.parse(tostion()))).toMatchObject({ molienda: null });
  });
  it("«Otra cantidad» manda los kilos; «Mitad» no", () => {
    expect(payloadProceso(procesoSchema.parse(tostion({ molienda: { modo: "kg", kg: "10,0" } })))).toMatchObject({ molienda: { modo: "kg", kg: 10 } });
    expect(payloadProceso(procesoSchema.parse(tostion({ molienda: { modo: "mitad", kg: "10" } })))).toMatchObject({ molienda: { modo: "mitad", kg: null } });
  });
  it("«Otra cantidad» exige kilos", () => {
    expect(mensajes(tostion({ molienda: { modo: "kg", kg: "" } }))).toContain("molienda: Indica los kilos a moler");
  });
  it("«Sin molienda» no lleva kilos", () => {
    expect(payloadProceso(procesoSchema.parse(tostion({ molienda: { modo: "ninguna", kg: "5" } })))).toMatchObject({ molienda: { modo: "ninguna", kg: null } });
  });
  it("fuera de la tostión no se manda", () => {
    expect(payloadProceso(procesoSchema.parse(base({ molienda: { modo: "todo", kg: null } })))).toMatchObject({ molienda: null });
  });
});
