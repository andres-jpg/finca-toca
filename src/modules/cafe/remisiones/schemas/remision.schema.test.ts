import { describe, expect, it } from "vitest";
import { anularRemisionSchema, entregarLotesSchema, payloadEntrega } from "./remision.schema";

const L1 = "0a502dc0-dec7-49e0-9d47-d7f77670a9d0";
const L2 = "1b613ed1-efd8-4af8-8e58-e8088781b0e1";
const base = { loteIds: [L1], fecha: "2026-11-12", recibeNombre: "Ana Ruiz", recibeDocumento: "1.020.304.050" };

describe("entregarLotesSchema", () => {
  it("lo mínimo: lotes, fecha y quién recibe; la cédula se guarda solo con dígitos", () => {
    const r = entregarLotesSchema.parse(base);
    expect(r).toEqual({ loteIds: [L1], fecha: "2026-11-12", recibeNombre: "Ana Ruiz", recibeDocumento: "1020304050", observaciones: undefined, forzar: false });
  });

  it("acepta varios lotes en una sola entrega", () => {
    expect(entregarLotesSchema.parse({ ...base, loteIds: [L1, L2] }).loteIds).toEqual([L1, L2]);
  });

  it("quién recibe es obligatorio: nombre y cédula", () => {
    const sinNombre = entregarLotesSchema.safeParse({ ...base, recibeNombre: "   " });
    expect(sinNombre.success).toBe(false);
    expect(sinNombre.success ? "" : sinNombre.error.issues[0]?.message).toMatch(/nombre de quien recibe/);
    expect(entregarLotesSchema.safeParse({ ...base, recibeDocumento: "" }).success).toBe(false);
    expect(entregarLotesSchema.safeParse({ ...base, recibeDocumento: "12-3" }).success).toBe(false);
    expect(entregarLotesSchema.safeParse({ ...base, recibeDocumento: "1".repeat(16) }).success).toBe(false);
    expect(entregarLotesSchema.safeParse({ ...base, recibeNombre: undefined }).success).toBe(false);
  });

  it("rechaza lotes vacíos, repetidos o que no son uuid, y fechas inválidas", () => {
    expect(entregarLotesSchema.safeParse({ ...base, loteIds: [] }).success).toBe(false);
    expect(entregarLotesSchema.safeParse({ ...base, loteIds: [L1, L1] }).success).toBe(false);
    expect(entregarLotesSchema.safeParse({ ...base, loteIds: ["x"] }).success).toBe(false);
    expect(entregarLotesSchema.safeParse({ ...base, fecha: "2026-02-31" }).success).toBe(false);
    expect(entregarLotesSchema.safeParse({ ...base, observaciones: "x".repeat(501) }).success).toBe(false);
  });

  it("forzar exige la observación, con el mensaje en español", () => {
    const sin = entregarLotesSchema.safeParse({ ...base, forzar: true });
    expect(sin.success).toBe(false);
    expect(sin.success ? "" : sin.error.issues[0]?.message).toMatch(/escribe la observación/);
    expect(entregarLotesSchema.safeParse({ ...base, forzar: true, observaciones: "El cliente recoge hoy" }).success).toBe(true);
  });
});

describe("payloadEntrega", () => {
  it("traduce a los nombres de la RPC, con null en lo que falta", () => {
    expect(payloadEntrega(entregarLotesSchema.parse({ ...base, loteIds: [L1, L2] }))).toEqual({
      lote_ids: [L1, L2],
      fecha: "2026-11-12",
      recibe_nombre: "Ana Ruiz",
      recibe_documento: "1020304050",
      observaciones: null,
      forzar: false,
    });
  });
});

describe("anularRemisionSchema", () => {
  it("exige un motivo de al menos 3 caracteres", () => {
    expect(anularRemisionSchema.safeParse({ remisionId: L1, motivo: "ok" }).success).toBe(false);
    expect(anularRemisionSchema.safeParse({ remisionId: L1, motivo: "   " }).success).toBe(false);
    expect(anularRemisionSchema.parse({ remisionId: L1, motivo: "  Error de digitación " }).motivo).toBe("Error de digitación");
  });

  it("rechaza una remisión que no es uuid y un motivo demasiado largo", () => {
    expect(anularRemisionSchema.safeParse({ remisionId: "x", motivo: "Error" }).success).toBe(false);
    expect(anularRemisionSchema.safeParse({ remisionId: L1, motivo: "x".repeat(501) }).success).toBe(false);
  });
});
