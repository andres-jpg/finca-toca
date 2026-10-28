import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));
const cliente = vi.hoisted(() => {
  const rpc = vi.fn();
  return { rpc, schema: vi.fn(() => ({ rpc })) };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ schema: cliente.schema })),
}));

import { MENSAJES_RPC } from "../../rpc/mensajes";
import { getTarifaVigente } from "./tarifas.queries";

describe("getTarifaVigente", () => {
  beforeEach(() => {
    cliente.rpc.mockReset();
  });

  it("devuelve el valor de la tarifa vigente", async () => {
    cliente.rpc.mockResolvedValue({ data: 1400, error: null });
    const r = await getTarifaVigente("cafe.trilla", new Date("2026-11-01T00:00:00Z"));
    expect(r).toEqual({ ok: true, data: 1400 });
    expect(cliente.rpc).toHaveBeenCalledWith("tarifa_vigente", { p_concepto: "cafe.trilla", p_at: "2026-11-01T00:00:00.000Z" });
  });

  it("sin fecha no manda p_at (la función usa now())", async () => {
    cliente.rpc.mockResolvedValue({ data: 1400, error: null });
    await getTarifaVigente("cafe.trilla");
    expect(cliente.rpc).toHaveBeenCalledWith("tarifa_vigente", { p_concepto: "cafe.trilla" });
  });

  it("un concepto sin tarifa → tarifa_no_definida con el detalle de la función", async () => {
    cliente.rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", message: "tarifa_no_definida", details: "No hay una tarifa definida para cafe.molienda en esa fecha." },
    });
    const r = await getTarifaVigente("cafe.molienda");
    expect(r).toEqual({ ok: false, code: "tarifa_no_definida", message: "No hay una tarifa definida para cafe.molienda en esa fecha." });
  });

  it("tarifa_no_definida tiene mensaje legible en el diccionario", () => {
    expect(MENSAJES_RPC.tarifa_no_definida).toMatch(/tarifa/i);
  });
});
