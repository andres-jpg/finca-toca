import { describe, expect, it } from "vitest";
import { moliendaReaperturaSchema, payloadMoliendaReapertura, payloadReabrir, reabrirSchema } from "./reapertura.schema";

const LOTE = "11111111-1111-4111-8111-111111111111";
const REAP = "22222222-2222-4222-8222-222222222222";

describe("reabrirSchema", () => {
  const base = { loteId: LOTE, presentacionG: 500, unidades: "40", fecha: "2026-11-15", motivo: " Pedido de 2.500 g molido " };

  it("normaliza unidades con texto y el motivo recortado", () => {
    const r = reabrirSchema.parse(base);
    expect(r.unidades).toBe(40);
    expect(r.motivo).toBe("Pedido de 2.500 g molido");
    expect(payloadReabrir(r)).toEqual({ lote_id: LOTE, presentacion_g: 500, unidades: 40, fecha: "2026-11-15", motivo: "Pedido de 2.500 g molido" });
  });
  it("acepta punto de miles y rechaza decimales, cero y texto", () => {
    expect(reabrirSchema.parse({ ...base, unidades: "1.200" }).unidades).toBe(1200);
    for (const malo of ["0", "1,5", "abc", "", -3]) {
      expect(reabrirSchema.safeParse({ ...base, unidades: malo }).success).toBe(false);
    }
  });
  it("el motivo es opcional", () => {
    expect(reabrirSchema.parse({ ...base, motivo: "" }).motivo).toBeNull();
    expect(reabrirSchema.parse({ ...base, motivo: undefined }).motivo).toBeNull();
  });
  it("exige lote válido, presentación y fecha", () => {
    expect(reabrirSchema.safeParse({ ...base, loteId: "x" }).success).toBe(false);
    expect(reabrirSchema.safeParse({ ...base, presentacionG: 0 }).success).toBe(false);
    expect(reabrirSchema.safeParse({ ...base, fecha: "15/11/2026" }).success).toBe(false);
  });
});

describe("moliendaReaperturaSchema", () => {
  const base = { loteId: LOTE, reaperturaId: REAP, fecha: "2026-11-15", pesoEntradaKg: "", pesoSalidaKg: "19,8", observaciones: "" };

  it("la entrada vacía es null y la salida acepta coma decimal", () => {
    const r = moliendaReaperturaSchema.parse(base);
    expect(r.pesoEntradaKg).toBeNull();
    expect(r.pesoSalidaKg).toBe(19.8);
    expect(payloadMoliendaReapertura(r)).toEqual({
      lote_id: LOTE,
      tipo: "molienda",
      fecha: "2026-11-15",
      reapertura_id: REAP,
      peso_entrada_kg: null,
      peso_salida_kg: 19.8,
      observaciones: null,
    });
  });
  it("sin bultos, baches ni tueste en la carga", () => {
    const p = payloadMoliendaReapertura(moliendaReaperturaSchema.parse(base));
    expect(p).not.toHaveProperty("bultos");
    expect(p).not.toHaveProperty("baches");
    expect(p).not.toHaveProperty("nivel_tueste");
  });
  it("la salida es obligatoria y no supera la entrada escrita", () => {
    expect(moliendaReaperturaSchema.safeParse({ ...base, pesoSalidaKg: "" }).success).toBe(false);
    expect(moliendaReaperturaSchema.safeParse({ ...base, pesoEntradaKg: "20", pesoSalidaKg: "21" }).success).toBe(false);
    expect(moliendaReaperturaSchema.safeParse({ ...base, pesoEntradaKg: "20", pesoSalidaKg: "20" }).success).toBe(true);
  });
  it("máximo tres decimales", () => {
    expect(moliendaReaperturaSchema.safeParse({ ...base, pesoSalidaKg: "19,8004" }).success).toBe(false);
  });
});
