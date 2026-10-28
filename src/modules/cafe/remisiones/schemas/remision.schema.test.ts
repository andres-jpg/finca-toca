import { describe, expect, it } from "vitest";
import { anularRemisionSchema, generarRemisionSchema, payloadRemision } from "./remision.schema";

const LOTE = "0a502dc0-dec7-49e0-9d47-d7f77670a9d0";

describe("generarRemisionSchema", () => {
  it("lo mínimo: lote y fecha; forzar queda en false y los textos opcionales sin definir", () => {
    const r = generarRemisionSchema.parse({ loteId: LOTE, fecha: "2026-11-12" });
    expect(r).toEqual({ loteId: LOTE, fecha: "2026-11-12", recibidoPor: undefined, observaciones: undefined, forzar: false });
  });

  it("recorta los textos y un texto en blanco es como no ponerlo", () => {
    const r = generarRemisionSchema.parse({ loteId: LOTE, fecha: "2026-11-12", recibidoPor: "  Pedro  ", observaciones: "   " });
    expect(r.recibidoPor).toBe("Pedro");
    expect(r.observaciones).toBeUndefined();
  });

  it("rechaza lote, fecha o textos inválidos", () => {
    expect(generarRemisionSchema.safeParse({ loteId: "x", fecha: "2026-11-12" }).success).toBe(false);
    expect(generarRemisionSchema.safeParse({ loteId: LOTE, fecha: "2026-02-31" }).success).toBe(false);
    expect(generarRemisionSchema.safeParse({ loteId: LOTE, fecha: "12/11/2026" }).success).toBe(false);
    expect(generarRemisionSchema.safeParse({ loteId: LOTE, fecha: "2026-11-12", recibidoPor: "x".repeat(121) }).success).toBe(false);
    expect(generarRemisionSchema.safeParse({ loteId: LOTE, fecha: "2026-11-12", observaciones: "x".repeat(501) }).success).toBe(false);
  });

  it("forzar exige la observación, con el mensaje en español", () => {
    const sin = generarRemisionSchema.safeParse({ loteId: LOTE, fecha: "2026-11-12", forzar: true });
    expect(sin.success).toBe(false);
    expect(sin.success ? "" : sin.error.issues[0]?.message).toMatch(/escribe la observación/);
    expect(generarRemisionSchema.safeParse({ loteId: LOTE, fecha: "2026-11-12", forzar: true, observaciones: "  " }).success).toBe(false);
    expect(generarRemisionSchema.safeParse({ loteId: LOTE, fecha: "2026-11-12", forzar: true, observaciones: "El cliente recoge hoy" }).success).toBe(true);
  });
});

describe("payloadRemision", () => {
  it("traduce a los nombres de la RPC, con null en lo que falta", () => {
    expect(payloadRemision(generarRemisionSchema.parse({ loteId: LOTE, fecha: "2026-11-12" }))).toEqual({
      lote_id: LOTE,
      fecha: "2026-11-12",
      recibido_por: null,
      observaciones: null,
      forzar: false,
    });
    expect(
      payloadRemision(generarRemisionSchema.parse({ loteId: LOTE, fecha: "2026-11-12", recibidoPor: "Ana", observaciones: "Pendiente la molienda", forzar: true })),
    ).toEqual({ lote_id: LOTE, fecha: "2026-11-12", recibido_por: "Ana", observaciones: "Pendiente la molienda", forzar: true });
  });
});

describe("anularRemisionSchema", () => {
  it("exige un motivo de al menos 3 caracteres", () => {
    expect(anularRemisionSchema.safeParse({ remisionId: LOTE, motivo: "ok" }).success).toBe(false);
    expect(anularRemisionSchema.safeParse({ remisionId: LOTE, motivo: "   " }).success).toBe(false);
    expect(anularRemisionSchema.parse({ remisionId: LOTE, motivo: "  Error de digitación " }).motivo).toBe("Error de digitación");
  });

  it("rechaza una remisión que no es uuid y un motivo demasiado largo", () => {
    expect(anularRemisionSchema.safeParse({ remisionId: "x", motivo: "Error" }).success).toBe(false);
    expect(anularRemisionSchema.safeParse({ remisionId: LOTE, motivo: "x".repeat(501) }).success).toBe(false);
  });
});
