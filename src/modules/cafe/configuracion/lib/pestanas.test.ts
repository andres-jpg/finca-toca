import { describe, expect, it } from "vitest";
import { pestanasConfiguracion } from "./pestanas";

const TODOS = ["cafe.recepcion", "cafe.inventario", "core.terceros", "core.equipo"];

describe("pestanasConfiguracion", () => {
  it("propietario y administrador ven todas las pestañas con módulos completos", () => {
    for (const rol of ["owner", "admin"] as const) {
      expect(pestanasConfiguracion(TODOS, rol).map((p) => p.label)).toEqual([
        "Tipos de café",
        "Perfiles de tueste",
        "Terceros",
        "Tarifas y parámetros",
        "Carga inicial",
        "Equipo",
      ]);
    }
  });

  it("operativo y gerencia no acceden a Configuración", () => {
    expect(pestanasConfiguracion(TODOS, "operativo")).toEqual([]);
    expect(pestanasConfiguracion(TODOS, "viewer")).toEqual([]);
    expect(pestanasConfiguracion(TODOS, null)).toEqual([]);
  });

  it("sin un módulo no se ofrece su pestaña", () => {
    expect(pestanasConfiguracion(["cafe.recepcion"], "admin").map((p) => p.label)).toEqual(["Tipos de café", "Perfiles de tueste"]);
  });
});
