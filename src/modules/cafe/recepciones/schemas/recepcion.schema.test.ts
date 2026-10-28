import { describe, expect, it } from "vitest";
import { payloadRecepcion, recepcionSchema } from "./recepcion.schema";

const TERCERO = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";

const base = {
  terceroId: TERCERO,
  fecha: "2026-11-05",
  numBultos: 8,
  pesoKg: 500,
  humedadPct: 11.5,
  densidad: 680,
  servicios: ["trilla"],
};

function error(input: unknown): string | undefined {
  const r = recepcionSchema.safeParse(input);
  return r.success ? undefined : r.error.issues[0]?.message;
}

describe("recepcionSchema", () => {
  it("acepta una recepción de solo trilla y normaliza lo opcional a null", () => {
    const r = recepcionSchema.parse(base);
    expect(r).toMatchObject({ pesoKg: 500, numBultos: 8, servicios: ["trilla"], nivelTueste: null, pesosBultos: null, observaciones: null });
  });

  it("humedad y densidad son opcionales (vacío = no se midió)", () => {
    const r = recepcionSchema.parse({ ...base, humedadPct: null, densidad: undefined });
    expect(r.humedadPct).toBeNull();
    expect(r.densidad).toBeNull();
  });

  it("exige el cliente", () => {
    expect(error({ ...base, terceroId: "" })).toBe("Elige el cliente");
    expect(error({ ...base, terceroId: undefined })).toBe("Elige el cliente");
  });

  it("exige al menos un servicio", () => {
    expect(error({ ...base, servicios: [] })).toBe("Elige al menos un servicio");
  });

  it("con tostión exige el nivel de tueste", () => {
    expect(error({ ...base, servicios: ["trilla", "tostion", "molienda"] })).toBe("Elige el nivel de tueste");
    expect(error({ ...base, servicios: ["tostion"], nivelTueste: null })).toBe("Elige el nivel de tueste");
    expect(recepcionSchema.parse({ ...base, servicios: ["trilla", "tostion", "molienda"], nivelTueste: "medio" }).nivelTueste).toBe("medio");
  });

  it("sin tostión el nivel de tueste se descarta", () => {
    expect(recepcionSchema.parse({ ...base, nivelTueste: "alto" }).nivelTueste).toBeNull();
  });

  it("la molienda requiere tostión", () => {
    expect(error({ ...base, servicios: ["molienda"] })).toBe("La molienda requiere tostión");
  });

  it("rechaza servicios desconocidos (el empaque no se elige: va con la tostión)", () => {
    expect(error({ ...base, servicios: ["empaque"] })).toBe("Servicio no válido");
    expect(error({ ...base, servicios: ["secado"] })).toBe("Servicio no válido");
  });

  it("peso y bultos", () => {
    expect(error({ ...base, pesoKg: 0 })).toBe("El peso debe ser mayor que cero");
    expect(error({ ...base, pesoKg: Number.NaN })).toBe("Indica el peso total");
    expect(error({ ...base, numBultos: 0 })).toBe("Mínimo 1 bulto");
    expect(error({ ...base, numBultos: 201 })).toBe("Máximo 200 bultos");
    expect(error({ ...base, numBultos: 2.5 })).toBe("El número de bultos debe ser entero");
    expect(error({ ...base, numBultos: Number.NaN })).toBe("Indica el número de bultos");
  });

  it("humedad 0–100 y densidad > 0", () => {
    expect(error({ ...base, humedadPct: 101 })).toBe("La humedad debe estar entre 0 y 100 %");
    expect(error({ ...base, humedadPct: -1 })).toBe("La humedad debe estar entre 0 y 100 %");
    expect(error({ ...base, densidad: 0 })).toBe("La densidad debe ser mayor que cero");
    expect(error({ ...base, densidad: Number.NaN })).toBe("La densidad debe ser mayor que cero");
  });

  it("los pesos por bulto deben ser tantos como bultos y sumar el total", () => {
    const ok = recepcionSchema.parse({ ...base, numBultos: 3, pesoKg: 200, pesosBultos: [70.5, 60, 69.5] });
    expect(ok.pesosBultos).toEqual([70.5, 60, 69.5]);
    expect(error({ ...base, numBultos: 3, pesoKg: 200, pesosBultos: [100, 100] })).toBe("Debe haber 3 pesos de bulto");
    expect(error({ ...base, numBultos: 3, pesoKg: 200, pesosBultos: [70, 60, 69] })).toBe("Los pesos de los bultos deben sumar el peso total");
    expect(error({ ...base, numBultos: 2, pesoKg: 100, pesosBultos: [100, 0] })).toBe("El peso de cada bulto debe ser mayor que cero");
  });

  it("observaciones: recorta espacios y vacío = null", () => {
    expect(recepcionSchema.parse({ ...base, observaciones: "  Trae bolsa  " }).observaciones).toBe("Trae bolsa");
    expect(recepcionSchema.parse({ ...base, observaciones: "   " }).observaciones).toBeNull();
    expect(error({ ...base, observaciones: "x".repeat(501) })).toBe("Máximo 500 caracteres");
  });

  it("la fecha tiene formato YYYY-MM-DD", () => {
    expect(error({ ...base, fecha: "05/11/2026" })).toBe("La fecha no es válida");
  });
});

describe("payloadRecepcion", () => {
  it("monta la carga de la RPC en snake_case (el ejemplo de la tarea)", () => {
    const v = recepcionSchema.parse({ ...base, servicios: ["trilla", "tostion", "molienda"], nivelTueste: "medio" });
    expect(payloadRecepcion(v)).toEqual({
      tercero_id: TERCERO,
      fecha: "2026-11-05",
      peso_kg: 500,
      num_bultos: 8,
      pesos_bultos: null,
      humedad_pct: 11.5,
      densidad: 680,
      servicios: ["trilla", "tostion", "molienda"],
      nivel_tueste: "medio",
      observaciones: null,
    });
  });
});
