import { describe, expect, it } from "vitest";
import { PAGINA_INICIAL_GERENCIA_CAFE, PAGINA_INICIAL_POR_VERTICAL, paginaInicial } from "./pagina-inicial";

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
  });

  it("el café entra por los lotes, sea cual sea su rol", () => {
    expect(paginaInicial({ rolLegacy: null, tenant: { vertical: "cafe" } })).toBe("/dashboard/cafe/lotes");
    expect(PAGINA_INICIAL_POR_VERTICAL.cafe).toBe("/dashboard/cafe/lotes");
  });

  it("Gerencia de café (viewer) abre el panel si el cliente tiene cafe.dashboard (FIN-115)", () => {
    const cafe = (rolTenant: "owner" | "admin" | "operativo" | "viewer", modulos: string[]) =>
      paginaInicial({ rolLegacy: null, rolTenant, tenant: { vertical: "cafe", modulos } });
    expect(cafe("viewer", ["cafe.recepcion", "cafe.dashboard"])).toBe("/dashboard/cafe");
    expect(PAGINA_INICIAL_GERENCIA_CAFE).toBe("/dashboard/cafe");
  });

  it("sin cafe.dashboard Gerencia vuelve a los lotes (el panel redirigiría a /dashboard y entraría en bucle)", () => {
    expect(paginaInicial({ rolLegacy: null, rolTenant: "viewer", tenant: { vertical: "cafe", modulos: ["cafe.recepcion"] } })).toBe("/dashboard/cafe/lotes");
    expect(paginaInicial({ rolLegacy: null, rolTenant: "viewer", tenant: { vertical: "cafe" } })).toBe("/dashboard/cafe/lotes");
  });

  it("el resto de roles de café sigue entrando por los lotes aunque tengan el panel", () => {
    for (const rol of ["owner", "admin", "operativo"] as const) {
      expect(paginaInicial({ rolLegacy: null, rolTenant: rol, tenant: { vertical: "cafe", modulos: ["cafe.dashboard"] } })).toBe("/dashboard/cafe/lotes");
    }
  });

  it("un viewer de otro vertical no cambia", () => {
    expect(paginaInicial({ rolLegacy: null, rolTenant: "viewer", tenant: { vertical: "ganaderia", modulos: ["cafe.dashboard"] } })).toBe("/dashboard/extracciones");
  });

  it("sin cliente ni rol, al dashboard", () => {
    expect(paginaInicial({ rolLegacy: null, tenant: null })).toBe("/dashboard");
  });
});
