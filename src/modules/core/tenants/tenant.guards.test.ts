import { beforeEach, describe, expect, it, vi } from "vitest";

const tenant = vi.hoisted(() => ({ getTenantActual: vi.fn() }));
vi.mock("./tenant.queries", () => tenant);

import { AuthorizationError } from "@/lib/auth/errors";
import { requireModulo, tenantTieneModulo } from "./tenant.guards";

describe("guards de módulo", () => {
  beforeEach(() => tenant.getTenantActual.mockReset());

  it("requireModulo no lanza si el cliente tiene el módulo activo", async () => {
    tenant.getTenantActual.mockResolvedValue({ modulos: ["ganaderia.arriendos"] });
    await expect(requireModulo("ganaderia.arriendos")).resolves.toBeUndefined();
  });

  it("requireModulo lanza AuthorizationError si el cliente no lo tiene", async () => {
    tenant.getTenantActual.mockResolvedValue({ modulos: ["ganaderia.animales"] });
    await expect(requireModulo("ganaderia.arriendos")).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("sin cliente (sin sesión o rol de cooperativa) tampoco hay módulo", async () => {
    tenant.getTenantActual.mockResolvedValue(null);
    await expect(requireModulo("ganaderia.arriendos")).rejects.toBeInstanceOf(AuthorizationError);
    await expect(tenantTieneModulo("ganaderia.arriendos")).resolves.toBe(false);
  });
});
