import { describe, expect, it } from "vitest";
import { resumirCambioMiembro } from "./historial";

describe("resumirCambioMiembro", () => {
  it("un cambio de rol se dice con la etiqueta del equipo", () => {
    expect(resumirCambioMiembro("UPDATE", { rol: "viewer" })).toEqual(["Rol → Gerencia"]);
    expect(resumirCambioMiembro("UPDATE", { rol: "admin" })).toEqual(["Rol → Administrador"]);
  });

  it("desactivar y reactivar", () => {
    expect(resumirCambioMiembro("UPDATE", { activo: false })).toEqual(["Estado → Desactivado"]);
    expect(resumirCambioMiembro("UPDATE", { activo: true })).toEqual(["Estado → Activo"]);
  });

  it("un UPDATE con varios campos los lista todos y se salta los técnicos", () => {
    expect(
      resumirCambioMiembro("UPDATE", { rol: "operativo", activo: true, updated_by: "x", updated_at: "2026-10-28" }),
    ).toEqual(["Rol → Operativo", "Estado → Activo"]);
  });

  it("un alta muestra el rol inicial, sin estado", () => {
    expect(resumirCambioMiembro("INSERT", { rol: "operativo", activo: true, user_id: "u" })).toEqual(["Rol → Operativo"]);
  });

  it("sin cambios relevantes, sin líneas", () => {
    expect(resumirCambioMiembro("UPDATE", null)).toEqual([]);
    expect(resumirCambioMiembro("DELETE", { rol: "admin" })).toEqual([]);
    expect(resumirCambioMiembro("UPDATE", ["no", "objeto"])).toEqual([]);
  });
});
