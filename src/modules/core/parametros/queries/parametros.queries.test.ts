import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const sentry = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nextjs", () => sentry);

// `from("parametros").select(...)` devuelve lo que cada test programe.
const cliente = vi.hoisted(() => ({ select: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from: () => ({ select: cliente.select }) })),
}));

import { defineParametros, limpiarDefinicionesParametros, type ParametroDef } from "../registry";
import { getParametro, getParametrosConValor } from "./parametros.queries";

const capacidad: ParametroDef<number> = {
  clave: "cafe.capacidad_tostadora_kg",
  modulo: "cafe.procesos",
  etiqueta: "Capacidad",
  schema: z.number().gt(0),
  defecto: 13.5,
  grupo: "Producción",
  tipo: "numero",
};

const guardados = (filas: { clave: string; valor: unknown }[]) =>
  cliente.select.mockResolvedValue({ data: filas, error: null });

describe("getParametro", () => {
  beforeEach(() => {
    cliente.select.mockReset();
    sentry.captureException.mockClear();
    limpiarDefinicionesParametros();
    defineParametros([capacidad]);
  });

  it("devuelve el defecto cuando no hay valor guardado", async () => {
    guardados([]);
    expect(await getParametro("cafe.capacidad_tostadora_kg")).toBe(13.5);
    expect(sentry.captureException).not.toHaveBeenCalled();
  });

  it("devuelve el valor guardado cuando cumple el schema", async () => {
    guardados([{ clave: "cafe.capacidad_tostadora_kg", valor: 15 }]);
    expect(await getParametro("cafe.capacidad_tostadora_kg")).toBe(15);
  });

  it("devuelve el defecto y avisa a Sentry cuando lo guardado no cumple el schema", async () => {
    guardados([{ clave: "cafe.capacidad_tostadora_kg", valor: -3 }]);
    expect(await getParametro("cafe.capacidad_tostadora_kg")).toBe(13.5);
    expect(sentry.captureException).toHaveBeenCalledTimes(1);
    const [error, contexto] = sentry.captureException.mock.calls[0];
    expect(String(error)).toContain("cafe.capacidad_tostadora_kg");
    expect(String(error)).not.toContain("-3"); // sin el valor del cliente
    expect(contexto).toEqual({ tags: { parametro: "cafe.capacidad_tostadora_kg" } });
  });

  it("acepta la definición en lugar de la clave (no depende del registro) y tipa el resultado", async () => {
    limpiarDefinicionesParametros();
    guardados([{ clave: "cafe.capacidad_tostadora_kg", valor: 20 }]);
    const kg: number = await getParametro(capacidad);
    expect(kg).toBe(20);
  });

  it("una clave sin definir es un error de programación, no un defecto silencioso", async () => {
    guardados([]);
    await expect(getParametro("cafe.no_existe")).rejects.toThrow(/sin definir/);
  });

  it("un fallo de lectura no se disfraza de defecto", async () => {
    cliente.select.mockResolvedValue({ data: null, error: { code: "PGRST301", message: "x" } });
    await expect(getParametro("cafe.capacidad_tostadora_kg")).rejects.toThrow(/No se pudieron leer los parámetros/);
  });
});

describe("getParametrosConValor", () => {
  beforeEach(() => {
    cliente.select.mockReset();
    sentry.captureException.mockClear();
  });

  it("resuelve varias definiciones con una sola lectura", async () => {
    guardados([{ clave: "cafe.capacidad_tostadora_kg", valor: 15 }]);
    const otra: ParametroDef<number> = { ...capacidad, clave: "cafe.peso_bulto_kg", defecto: 62.5 };
    const r = await getParametrosConValor([capacidad, otra]);
    expect(r).toEqual([
      { clave: "cafe.capacidad_tostadora_kg", valor: 15, origen: "guardado", invalido: false },
      { clave: "cafe.peso_bulto_kg", valor: 62.5, origen: "defecto", invalido: false },
    ]);
    expect(cliente.select).toHaveBeenCalledTimes(1);
  });
});
