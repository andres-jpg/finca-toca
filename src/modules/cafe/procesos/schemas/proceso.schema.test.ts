import { describe, expect, it } from "vitest";
import { anularProcesoSchema, payloadProceso, procesoSchema, type ProcesoFormInput } from "./proceso.schema";

const LOTE = "11111111-1111-4111-8111-111111111111";
const BULTO = "22222222-2222-4222-8222-222222222222";

function base(p: Partial<ProcesoFormInput> = {}): ProcesoFormInput {
  return {
    loteId: LOTE,
    tipo: "trilla",
    fecha: "2026-11-06",
    bultoIds: [BULTO],
    pesoEntradaKg: "500",
    pesoSalidaKg: "405",
    ...p,
  };
}

function mensajes(input: ProcesoFormInput): string[] {
  const r = procesoSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
}

describe("procesoSchema: la coma decimal se normaliza en todos los campos de peso", () => {
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

  it("la coma también vale en los baches y en la temperatura", () => {
    const r = procesoSchema.parse(
      base({
        tipo: "tostion",
        nivelTueste: "medio",
        pesoEntradaKg: "27",
        pesoSalidaKg: null,
        baches: [
          { pesoEntradaKg: "13,5", pesoSalidaKg: "11,1", temperaturaC: "210,5" },
          { pesoEntradaKg: "13,5", pesoSalidaKg: "11,05", temperaturaC: "" },
        ],
      }),
    );
    expect(r.baches.map((b) => [b.pesoEntradaKg, b.pesoSalidaKg, b.temperaturaC])).toEqual([
      [13.5, 11.1, 210.5],
      [13.5, 11.05, null],
    ]);
    expect(r.pesoSalidaKg).toBe(22.15);
  });

  it("rechaza texto que no es un número, con un mensaje claro", () => {
    expect(mensajes(base({ pesoEntradaKg: "abc" }))).toContain("pesoEntradaKg: Indica el peso de entrada");
    expect(mensajes(base({ pesoSalidaKg: "4o5" }))).toContain("pesoSalidaKg: El peso de salida debe ser un número");
  });
});

describe("procesoSchema: trilla, molienda y empaque", () => {
  it("un proceso válido pasa y no lleva baches ni nivel de tueste", () => {
    const r = procesoSchema.parse(base({ nivelTueste: "alto" }));
    expect(r).toMatchObject({ tipo: "trilla", pesoEntradaKg: 500, pesoSalidaKg: 405, baches: [], nivelTueste: null, observaciones: null });
  });

  it("exige el peso de salida", () => {
    expect(mensajes(base({ pesoSalidaKg: "" }))).toContain("pesoSalidaKg: Indica el peso de salida");
    expect(mensajes(base({ pesoSalidaKg: null }))).toContain("pesoSalidaKg: Indica el peso de salida");
  });

  it("la salida no puede superar la entrada (pero puede ser 0)", () => {
    expect(mensajes(base({ pesoSalidaKg: "500,001" }))).toContain("pesoSalidaKg: La salida no puede superar la entrada");
    expect(mensajes(base({ pesoSalidaKg: "0" }))).toEqual([]);
  });

  it("la entrada debe ser mayor que cero y tener como mucho 3 decimales", () => {
    expect(mensajes(base({ pesoEntradaKg: "0" }))).toContain("pesoEntradaKg: El peso de entrada debe ser mayor que cero");
    expect(mensajes(base({ pesoEntradaKg: "10,1234" }))).toContain("pesoEntradaKg: Usa como máximo 3 decimales (gramos)");
  });

  it("no admite baches fuera de la tostión", () => {
    expect(mensajes(base({ baches: [{ pesoEntradaKg: "500", pesoSalidaKg: "405" }] }))).toContain("baches: Solo la tostión se registra por baches");
  });

  it("valida el lote, el paso y la fecha", () => {
    expect(mensajes(base({ loteId: "x" }))).toContain("loteId: El lote no es válido");
    expect(mensajes(base({ fecha: "06/11/2026" }))).toContain("fecha: La fecha no es válida");
    expect(mensajes({ ...base(), tipo: "secado" as never })).toContain("tipo: Elige el paso a registrar");
  });
});

describe("procesoSchema: tostión por baches", () => {
  const tostion = (p: Partial<ProcesoFormInput> = {}) =>
    base({
      tipo: "tostion",
      nivelTueste: "medio",
      pesoEntradaKg: "27",
      pesoSalidaKg: null,
      baches: [
        { pesoEntradaKg: "13,5", pesoSalidaKg: "11" },
        { pesoEntradaKg: "13,5", pesoSalidaKg: "11" },
      ],
      ...p,
    });

  it("baches que suman la entrada: la salida es la suma de sus salidas", () => {
    const r = procesoSchema.parse(tostion());
    expect(r.pesoSalidaKg).toBe(22);
    expect(r.nivelTueste).toBe("medio");
  });

  it("el ejemplo del informe: 405 kg en 30 baches de 13,5 → 332 kg", () => {
    const baches = Array.from({ length: 30 }, (_, i) => ({ pesoEntradaKg: "13,5", pesoSalidaKg: i < 22 ? "11,067" : "11,066" }));
    const salida = 22 * 11.067 + 8 * 11.066;
    const r = procesoSchema.parse(tostion({ pesoEntradaKg: "405", baches }));
    expect(r.baches).toHaveLength(30);
    expect(r.pesoSalidaKg).toBeCloseTo(salida, 3);
  });

  it("los baches deben sumar la entrada (tolerancia de 1 g)", () => {
    expect(mensajes(tostion({ pesoEntradaKg: "30" }))[0]).toMatch(/^baches: Los baches suman 27,000 kg de entrada y el peso de entrada es 30,000 kg/);
    expect(mensajes(tostion({ pesoEntradaKg: "27,001" }))).toEqual([]);
    expect(mensajes(tostion({ pesoEntradaKg: "27,002" }))[0]).toMatch(/^baches:/);
  });

  it("exige al menos un bache y el nivel de tueste", () => {
    expect(mensajes(tostion({ baches: [] }))).toContain("baches: La tostión se registra por baches: añade al menos uno");
    expect(mensajes(tostion({ nivelTueste: null }))).toContain("nivelTueste: Elige el nivel de tueste");
  });

  it("la salida de un bache no puede superar su entrada", () => {
    const m = mensajes(tostion({ baches: [{ pesoEntradaKg: "13,5", pesoSalidaKg: "14" }, { pesoEntradaKg: "13,5", pesoSalidaKg: "11" }] }));
    expect(m).toContain("baches.0.pesoSalidaKg: La salida no puede superar la entrada");
  });

  it("un peso de salida a mano debe coincidir con la suma de los baches", () => {
    expect(mensajes(tostion({ pesoSalidaKg: "20" }))).toContain("pesoSalidaKg: El peso de salida debe ser la suma de los baches");
    expect(mensajes(tostion({ pesoSalidaKg: "22" }))).toEqual([]);
  });
});

describe("payloadProceso: lo que recibe cafe.registrar_proceso", () => {
  it("trilla: sin baches ni nivel", () => {
    expect(payloadProceso(procesoSchema.parse(base({ observaciones: "  buen grano " })))).toEqual({
      lote_id: LOTE,
      tipo: "trilla",
      fecha: "2026-11-06",
      bultos: [BULTO],
      peso_entrada_kg: 500,
      peso_salida_kg: 405,
      nivel_tueste: null,
      baches: null,
      observaciones: "buen grano",
    });
  });

  it("tostión: baches con temperatura y observaciones opcionales", () => {
    const p = payloadProceso(
      procesoSchema.parse(
        base({
          tipo: "tostion",
          nivelTueste: "alto",
          pesoEntradaKg: "13,5",
          pesoSalidaKg: null,
          baches: [{ pesoEntradaKg: "13,5", pesoSalidaKg: "11,1", temperaturaC: "210" }],
        }),
      ),
    );
    expect(p).toMatchObject({
      tipo: "tostion",
      nivel_tueste: "alto",
      peso_salida_kg: 11.1,
      baches: [{ peso_entrada_kg: 13.5, peso_salida_kg: 11.1, temperatura_c: 210, observaciones: null }],
    });
  });
});

describe("anularProcesoSchema", () => {
  it("el motivo es obligatorio", () => {
    expect(anularProcesoSchema.safeParse({ procesoId: LOTE, motivo: "   " }).success).toBe(false);
    expect(anularProcesoSchema.parse({ procesoId: LOTE, motivo: " Error de pesaje " }).motivo).toBe("Error de pesaje");
  });
});
