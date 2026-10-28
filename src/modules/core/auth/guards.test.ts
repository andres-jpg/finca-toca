import { beforeEach, describe, expect, it, vi } from "vitest";

const sesion = vi.hoisted(() => ({ getSesion: vi.fn(), getSesionBase: vi.fn() }));
const nav = vi.hoisted(() => ({
  redirect: vi.fn((ruta: string) => {
    throw new Error(`NEXT_REDIRECT:${ruta}`);
  }),
}));
const sentry = vi.hoisted(() => ({ registrarContextoSentry: vi.fn() }));
vi.mock("./sesion", () => sesion);
vi.mock("next/navigation", () => nav);
vi.mock("@/lib/sentry/contexto", () => sentry);

import { AuthorizationError } from "@/lib/auth/errors";
import { requirePlatformAdmin, requireRolTenant, requireSesion } from "./guards";

const base = {
  user: { id: "u1", email: "a@b.test" },
  tenant: { id: "t1", slug: "villa-blanca" },
  rolLegacy: null,
  esPlatformAdmin: false,
  membresias: [],
};

describe("requireSesion", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devuelve la sesión si existe", async () => {
    const s = { ...base, rolTenant: "admin" };
    sesion.getSesion.mockResolvedValue(s);
    await expect(requireSesion()).resolves.toBe(s);
    expect(sentry.registrarContextoSentry).toHaveBeenCalledOnce();
  });

  it("sin sesión redirige a /login", async () => {
    sesion.getSesion.mockResolvedValue(null);
    await expect(requireSesion()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(nav.redirect).toHaveBeenCalledWith("/login");
  });
});

describe("requireRolTenant", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deja pasar a un rol de la lista y devuelve la sesión", async () => {
    const s = { ...base, rolTenant: "admin" };
    sesion.getSesion.mockResolvedValue(s);
    await expect(requireRolTenant(["owner", "admin"])).resolves.toBe(s);
  });

  it("lanza AuthorizationError si el rol no está en la lista", async () => {
    sesion.getSesion.mockResolvedValue({ ...base, rolTenant: "viewer" });
    await expect(requireRolTenant(["owner", "admin"])).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("lanza AuthorizationError sin sesión (no redirige: es para Server Actions)", async () => {
    sesion.getSesion.mockResolvedValue(null);
    await expect(requireRolTenant(["admin"])).rejects.toBeInstanceOf(AuthorizationError);
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  it("una lista vacía no deja pasar a nadie", async () => {
    sesion.getSesion.mockResolvedValue({ ...base, rolTenant: "owner" });
    await expect(requireRolTenant([])).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("el platform admin no se salta la lista de roles (actúa como owner solo si el rol lo permite)", async () => {
    sesion.getSesion.mockResolvedValue({ ...base, esPlatformAdmin: true, rolTenant: "owner" });
    await expect(requireRolTenant(["admin"])).rejects.toBeInstanceOf(AuthorizationError);
    await expect(requireRolTenant(["owner"])).resolves.toBeDefined();
  });
});

describe("requirePlatformAdmin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pasa si es platform admin, aunque aún no tenga cliente activo", async () => {
    sesion.getSesionBase.mockResolvedValue({ ...base, tenant: null, rolTenant: null, esPlatformAdmin: true });
    await expect(requirePlatformAdmin()).resolves.toBeUndefined();
  });

  it("lanza AuthorizationError a un usuario normal", async () => {
    sesion.getSesionBase.mockResolvedValue({ ...base, rolTenant: "owner", esPlatformAdmin: false });
    await expect(requirePlatformAdmin()).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("lanza AuthorizationError sin sesión", async () => {
    sesion.getSesionBase.mockResolvedValue(null);
    await expect(requirePlatformAdmin()).rejects.toBeInstanceOf(AuthorizationError);
  });
});
