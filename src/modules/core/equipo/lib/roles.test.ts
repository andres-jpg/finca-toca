import { describe, expect, it } from "vitest";
import {
  ETIQUETA_ROL_EQUIPO,
  ROLES_EQUIPO,
  etiquetaRolEquipo,
  puedeModificarMiembro,
  rolesAsignables,
} from "./roles";

describe("etiquetas de rol del equipo", () => {
  it("usa los nombres de Cofradía: Propietario, Administrador, Operativo y Gerencia", () => {
    expect(ETIQUETA_ROL_EQUIPO).toEqual({
      owner: "Propietario",
      admin: "Administrador",
      operativo: "Operativo",
      viewer: "Gerencia",
    });
  });

  it("hay una etiqueta por cada rol de la enum", () => {
    expect(Object.keys(ETIQUETA_ROL_EQUIPO).sort()).toEqual([...ROLES_EQUIPO].sort());
  });

  it("etiquetaRolEquipo traduce y deja pasar un rol desconocido tal cual", () => {
    expect(etiquetaRolEquipo("viewer")).toBe("Gerencia");
    expect(etiquetaRolEquipo("auditor")).toBe("auditor");
  });
});

describe("rolesAsignables", () => {
  it("un propietario ofrece los cuatro roles", () => {
    expect(rolesAsignables("owner")).toEqual(["owner", "admin", "operativo", "viewer"]);
  });

  it("un administrador no ofrece Propietario", () => {
    expect(rolesAsignables("admin")).toEqual(["admin", "operativo", "viewer"]);
  });
});

describe("puedeModificarMiembro", () => {
  const yo = "u-yo";

  it("nadie se modifica a sí mismo, ni siendo propietario", () => {
    expect(puedeModificarMiembro("owner", { userId: yo, rol: "owner" }, yo)).toBe(false);
    expect(puedeModificarMiembro("admin", { userId: yo, rol: "admin" }, yo)).toBe(false);
  });

  it("un administrador no toca a un propietario", () => {
    expect(puedeModificarMiembro("admin", { userId: "u-2", rol: "owner" }, yo)).toBe(false);
  });

  it("un administrador sí gestiona a administradores, operativos y gerencia", () => {
    for (const rol of ["admin", "operativo", "viewer"] as const) {
      expect(puedeModificarMiembro("admin", { userId: "u-2", rol }, yo)).toBe(true);
    }
  });

  it("un propietario gestiona a cualquiera menos a sí mismo", () => {
    for (const rol of ROLES_EQUIPO) {
      expect(puedeModificarMiembro("owner", { userId: "u-2", rol }, yo)).toBe(true);
    }
  });
});
