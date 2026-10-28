import { describe, expect, it } from "vitest";
import { paginaInicial } from "./pagina-inicial";

describe("paginaInicial", () => {
  it("un rol legacy conserva su página de siempre", () => {
    expect(paginaInicial({ rolLegacy: "admin", tenant: { vertical: "ganaderia" } })).toBe("/dashboard");
    expect(paginaInicial({ rolLegacy: "user", tenant: { vertical: "ganaderia" } })).toBe("/dashboard/extracciones");
    expect(paginaInicial({ rolLegacy: "cooperativa_admin", tenant: { vertical: "cooperativa" } })).toBe("/dashboard/cooperativa");
    expect(paginaInicial({ rolLegacy: "cooperativa_user", tenant: { vertical: "cooperativa" } })).toBe("/dashboard/recolecciones");
  });

  it("sin rol legacy manda según el vertical del cliente", () => {
    expect(paginaInicial({ rolLegacy: null, tenant: { vertical: "ganaderia" } })).toBe("/dashboard/extracciones");
    expect(paginaInicial({ rolLegacy: null, tenant: { vertical: "cooperativa" } })).toBe("/dashboard/cooperativa");
    expect(paginaInicial({ rolLegacy: null, tenant: { vertical: "cafe" } })).toBe("/dashboard");
  });

  it("sin cliente ni rol, al dashboard", () => {
    expect(paginaInicial({ rolLegacy: null, tenant: null })).toBe("/dashboard");
  });
});
