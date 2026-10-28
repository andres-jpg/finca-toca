import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  defineParametros,
  definicionesParametrosDeModulos,
  getDefinicionParametro,
  limpiarDefinicionesParametros,
  type ParametroDef,
} from "./registry";

const def = (over: Partial<ParametroDef<number>> = {}): ParametroDef<number> => ({
  clave: "cafe.capacidad_tostadora_kg",
  modulo: "cafe.procesos",
  etiqueta: "Capacidad",
  schema: z.number().gt(0),
  defecto: 13.5,
  grupo: "Producción",
  tipo: "numero",
  ...over,
});

describe("registro de parámetros", () => {
  afterEach(() => limpiarDefinicionesParametros());

  it("registra y recupera una definición por clave", () => {
    defineParametros([def()]);
    expect(getDefinicionParametro("cafe.capacidad_tostadora_kg")?.etiqueta).toBe("Capacidad");
    expect(getDefinicionParametro("cafe.no_existe")).toBeUndefined();
  });

  it("volver a registrar una clave la reemplaza (recarga en caliente)", () => {
    defineParametros([def({ etiqueta: "Antes" })]);
    defineParametros([def({ etiqueta: "Después" })]);
    expect(getDefinicionParametro("cafe.capacidad_tostadora_kg")?.etiqueta).toBe("Después");
  });

  it("rechaza una clave con formato inválido", () => {
    expect(() => defineParametros([def({ clave: "Capacidad Tostadora" })])).toThrow(/clave inválida/);
  });

  it("rechaza un defecto que su propio schema no acepta", () => {
    expect(() => defineParametros([def({ defecto: -5 })])).toThrow(/no cumple su propio schema/);
  });

  it("solo ofrece las definiciones de los módulos activos del cliente", () => {
    defineParametros([def(), def({ clave: "cafe.peso_bulto_kg", modulo: "cafe.recepcion" })]);
    expect(definicionesParametrosDeModulos(["cafe.procesos"]).map((d) => d.clave)).toEqual(["cafe.capacidad_tostadora_kg"]);
    expect(definicionesParametrosDeModulos(["ganaderia.animales"])).toEqual([]);
    expect(definicionesParametrosDeModulos(["cafe.procesos", "cafe.recepcion"])).toHaveLength(2);
  });
});
