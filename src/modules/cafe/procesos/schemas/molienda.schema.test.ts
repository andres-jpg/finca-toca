import { describe, expect, it } from "vitest";
import { confirmarMoliendaSchema, payloadConfirmarMolienda } from "./molienda.schema";

const LOTE = "11111111-1111-4111-8111-111111111111";
const TANDA = "22222222-2222-4222-8222-222222222222";
const base = { loteId: LOTE, tostionProcesoId: TANDA, fecha: "2026-11-11" };

describe("confirmarMoliendaSchema", () => {
  it("confirmar sin modificar no manda cantidad ni pesos", () => {
    expect(payloadConfirmarMolienda(confirmarMoliendaSchema.parse(base))).toEqual({
      lote_id: LOTE,
      tostion_proceso_id: TANDA,
      fecha: "2026-11-11",
      modo: null,
      kg: null,
      observaciones: null,
    });
  });
  it("«Otra cantidad» acepta coma decimal y exige kilos", () => {
    expect(confirmarMoliendaSchema.parse({ ...base, modo: "kg", kg: "10,0" })).toMatchObject({ modo: "kg", kg: 10 });
    expect(confirmarMoliendaSchema.safeParse({ ...base, modo: "kg", kg: "" }).success).toBe(false);
  });
  it("«Mitad» y «Todo» descartan los kilos digitados", () => {
    expect(confirmarMoliendaSchema.parse({ ...base, modo: "mitad", kg: "7" })).toMatchObject({ modo: "mitad", kg: null });
  });
  it("no admite «ninguna»: sin molienda se decide en la tostión", () => {
    expect(confirmarMoliendaSchema.safeParse({ ...base, modo: "ninguna" }).success).toBe(false);
  });
});
