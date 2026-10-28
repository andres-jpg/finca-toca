import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ParametroDef } from "../registry";
import { resolverParametro } from "./valor";

const capacidad: ParametroDef<number> = {
  clave: "cafe.capacidad_tostadora_kg",
  modulo: "cafe.procesos",
  etiqueta: "Capacidad",
  schema: z.number().gt(0),
  defecto: 13.5,
  grupo: "Producción",
  tipo: "numero",
};

const rango: ParametroDef<{ min: number; max: number } | null> = {
  clave: "cafe.humedad_rango_pct",
  modulo: "cafe.recepcion",
  etiqueta: "Humedad",
  schema: z.object({ min: z.number(), max: z.number() }).nullable(),
  defecto: null,
  grupo: "Calidad",
  tipo: "rango",
};

describe("resolverParametro", () => {
  it("sin valor guardado devuelve el defecto", () => {
    expect(resolverParametro(capacidad, undefined)).toEqual({ valor: 13.5, origen: "defecto", invalido: false });
  });

  it("un valor guardado válido manda sobre el defecto", () => {
    expect(resolverParametro(capacidad, 15)).toEqual({ valor: 15, origen: "guardado", invalido: false });
  });

  it("un valor guardado que no cumple el schema cae en el defecto y se marca inválido", () => {
    expect(resolverParametro(capacidad, 0)).toEqual({ valor: 13.5, origen: "defecto", invalido: true });
    expect(resolverParametro(capacidad, "quince")).toEqual({ valor: 13.5, origen: "defecto", invalido: true });
    expect(resolverParametro(capacidad, { x: 1 })).toEqual({ valor: 13.5, origen: "defecto", invalido: true });
  });

  it("un JSON null guardado es un valor (\"sin configurar\") si el schema lo admite", () => {
    expect(resolverParametro(rango, null)).toEqual({ valor: null, origen: "guardado", invalido: false });
  });

  it("un JSON null guardado en un parámetro que no lo admite es inválido", () => {
    expect(resolverParametro(capacidad, null)).toEqual({ valor: 13.5, origen: "defecto", invalido: true });
  });

  it("un rango válido se devuelve tal cual", () => {
    expect(resolverParametro(rango, { min: 10, max: 12 }).valor).toEqual({ min: 10, max: 12 });
  });
});
