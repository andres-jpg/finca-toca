import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => sentry);

// Cliente Supabase falso: `schema(...).rpc(...)` devuelve lo que cada test programe.
const cliente = vi.hoisted(() => {
  const rpc = vi.fn();
  const schema = vi.fn(() => ({ rpc }));
  return { rpc, schema };
});
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ schema: cliente.schema })),
}));

import { callRpc } from "./call-rpc";
import { MENSAJES_RPC } from "./mensajes";

function respondeConError(error: { code?: string; message?: string; details?: string | null }) {
  cliente.rpc.mockResolvedValue({ data: null, error });
}

describe("callRpc", () => {
  beforeEach(() => {
    cliente.rpc.mockReset();
    cliente.schema.mockClear();
    sentry.captureException.mockClear();
  });

  it("devuelve los datos cuando la función responde bien", async () => {
    cliente.rpc.mockResolvedValue({ data: { id: "abc" }, error: null });

    const r = await callRpc<"cafe", "crear_lote", { id: string }>("cafe", "crear_lote", { p_input: { x: 1 } });

    expect(r).toEqual({ ok: true, data: { id: "abc" } });
    expect(cliente.schema).toHaveBeenCalledWith("cafe");
    expect(cliente.rpc).toHaveBeenCalledWith("crear_lote", { p_input: { x: 1 } });
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("42501 → no_autorizado", async () => {
    respondeConError({ code: "42501", message: "permission denied for function x" });

    const r = await callRpc("public", "alguna_fn", {});

    expect(r).toEqual({ ok: false, code: "no_autorizado", message: MENSAJES_RPC.no_autorizado });
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("23505 → duplicado", async () => {
    respondeConError({ code: "23505", message: 'duplicate key value violates unique constraint "x"' });

    const r = await callRpc("public", "alguna_fn", {});

    expect(r).toEqual({ ok: false, code: "duplicado", message: MENSAJES_RPC.duplicado });
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("23503 → referencia_invalida", async () => {
    respondeConError({ code: "23503", message: "violates foreign key constraint" });

    const r = await callRpc("public", "alguna_fn", {});

    expect(r).toEqual({ ok: false, code: "referencia_invalida", message: MENSAJES_RPC.referencia_invalida });
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("P0001 → message es el código y details el texto para el usuario", async () => {
    respondeConError({ code: "P0001", message: "stock_insuficiente", details: "Quedan 3 bultos y pides 5." });

    const r = await callRpc("cafe", "empacar", {});

    expect(r).toEqual({ ok: false, code: "stock_insuficiente", message: "Quedan 3 bultos y pides 5." });
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("P0001 sin details usa el mensaje del diccionario", async () => {
    respondeConError({ code: "P0001", message: "tarifa_no_definida", details: null });

    const r = await callRpc("cafe", "liquidar", {});

    expect(r).toEqual({ ok: false, code: "tarifa_no_definida", message: MENSAJES_RPC.tarifa_no_definida });
  });

  it("P0001 con texto libre (no snake_case) no se toma por código: error_inesperado", async () => {
    respondeConError({ code: "P0001", message: "Algo salió mal con Juan Pérez" });

    const r = await callRpc("cafe", "empacar", {});

    expect(r).toMatchObject({ ok: false, code: "error_inesperado" });
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
  });

  it("cualquier otro error → error_inesperado y se reporta a Sentry sin argumentos ni PII", async () => {
    respondeConError({ code: "XX000", message: 'falla con valor "juan@correo.com"' });

    const r = await callRpc("public", "alguna_fn", { p_input: { email: "juan@correo.com" } });

    expect(r).toEqual({ ok: false, code: "error_inesperado", message: MENSAJES_RPC.error_inesperado });
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    const [excepcion, contexto] = sentry.captureException.mock.calls[0];
    expect(contexto).toEqual({ tags: { rpc: "public.alguna_fn", pg_code: "XX000" } });
    const enviado = JSON.stringify([String(excepcion), contexto]);
    expect(enviado).not.toContain("juan@correo.com");
  });

  it("si el cliente lanza (red caída), también es error_inesperado", async () => {
    cliente.rpc.mockRejectedValue(new Error("fetch failed"));

    const r = await callRpc("public", "alguna_fn", {});

    expect(r).toMatchObject({ ok: false, code: "error_inesperado" });
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
  });
});

// Comprobación de tipos (la valida `tsc`; en ejecución no hace nada): con una función que
// sí está en los tipos generados, `args` y el retorno se validan.
describe("tipado con los tipos generados", () => {
  it("valida los args de una función conocida", async () => {
    cliente.rpc.mockResolvedValue({ data: "tenant-1", error: null });

    const ok = await callRpc("public", "tenant_actual", {});
    if (ok.ok) {
      const id: string = ok.data;
      expect(id).toBe("tenant-1");
    }

    // @ts-expect-error tenant_actual() no recibe argumentos
    await callRpc("public", "tenant_actual", { x: 1 });
  });
});
