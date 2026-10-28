import { beforeEach, describe, expect, it } from "vitest";
import { autorizarExport, defineExportadores, getExportador, limpiarExportadores, parametro, type ExportadorDef } from "./registry";

const def = (extra: Partial<ExportadorDef> = {}): ExportadorDef => ({
  recurso: "terceros",
  etiqueta: "Terceros",
  modulo: "core.terceros",
  roles: ["owner", "admin"],
  generar: async () => ({ hojas: [] }),
  ...extra,
});

const sesion = (rolTenant: "owner" | "admin" | "operativo" | "viewer", modulos: string[], rolLegacy: "admin" | "user" | "viewer" | null = null) => ({
  rolTenant,
  rolLegacy,
  tenant: { modulos },
});

describe("autorizarExport", () => {
  it("sin sesión", () => {
    expect(autorizarExport(null, def())).toBe("sin_sesion");
  });

  it("exige el módulo activo del cliente", () => {
    expect(autorizarExport(sesion("owner", ["ganaderia.animales"]), def())).toBe("sin_modulo");
    expect(autorizarExport(sesion("owner", []), def())).toBe("sin_modulo");
  });

  it("exige un rol de membresía permitido", () => {
    expect(autorizarExport(sesion("viewer", ["core.terceros"]), def())).toBe("sin_rol");
    expect(autorizarExport(sesion("admin", ["core.terceros"]), def())).toBe("ok");
  });

  it("el módulo se comprueba antes que el rol", () => {
    expect(autorizarExport(sesion("viewer", []), def())).toBe("sin_modulo");
  });

  it("con rolesLegacy exige también el rol legacy", () => {
    const d = def({ rolesLegacy: ["admin"] });
    expect(autorizarExport(sesion("admin", ["core.terceros"], "admin"), d)).toBe("ok");
    expect(autorizarExport(sesion("admin", ["core.terceros"], "user"), d)).toBe("sin_rol");
    expect(autorizarExport(sesion("admin", ["core.terceros"], null), d)).toBe("sin_rol");
  });
});

describe("registro de exportadores", () => {
  beforeEach(limpiarExportadores);

  it("registra y busca por recurso; volver a registrar reemplaza", () => {
    expect(getExportador("terceros")).toBeUndefined();
    defineExportadores([def()]);
    expect(getExportador("terceros")?.etiqueta).toBe("Terceros");
    defineExportadores([def({ etiqueta: "Otro" })]);
    expect(getExportador("terceros")?.etiqueta).toBe("Otro");
  });

  it("falla en voz alta con un recurso mal formado o sin roles", () => {
    expect(() => defineExportadores([def({ recurso: "Mis Lotes" })])).toThrow(/recurso inválido/);
    expect(() => defineExportadores([def({ recurso: "../x" })])).toThrow(/recurso inválido/);
    expect(() => defineExportadores([def({ roles: [] })])).toThrow(/ningún rol/);
  });
});

describe("parametro", () => {
  it("devuelve el texto sin espacios o undefined si falta o está vacío", () => {
    const q = new URLSearchParams("q=  hola &vacio=%20&otro=1");
    expect(parametro(q, "q")).toBe("hola");
    expect(parametro(q, "vacio")).toBeUndefined();
    expect(parametro(q, "falta")).toBeUndefined();
  });
});
