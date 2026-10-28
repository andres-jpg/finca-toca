import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getCurrentUser: vi.fn() }));
const rpc = vi.hoisted(() => ({ callRpc: vi.fn() }));
vi.mock("@/lib/auth/get-user-role", () => auth);
vi.mock("../rpc/call-rpc", () => rpc);

import { getSesion, getSesionBase } from "./sesion";

const json = {
  tenant: {
    id: "t1",
    nombre: "Villa Blanca",
    slug: "villa-blanca",
    vertical: "ganaderia",
    plan: "pro",
    estado: "activo",
    logo_url: "https://cdn.test/logo.png",
    color_primario: "#112233",
    zona_horaria: "America/Bogota",
    moneda: "COP",
    modulos: ["ganaderia.animales", "ganaderia.arriendos"],
  },
  rol_tenant: "admin",
  rol_legacy: "admin",
  es_platform_admin: false,
  membresias: [{ tenant_id: "t1", nombre: "Villa Blanca", slug: "villa-blanca", vertical: "ganaderia", rol: "admin" }],
};

describe("getSesion / getSesionBase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getCurrentUser.mockResolvedValue({ id: "u1", email: "admin@vb.test" });
    rpc.callRpc.mockResolvedValue({ ok: true, data: json });
  });

  it("arma la sesión con una sola RPC (más la lectura de Auth): 2 round-trips", async () => {
    const s = await getSesion();
    expect(auth.getCurrentUser).toHaveBeenCalledOnce();
    expect(rpc.callRpc).toHaveBeenCalledOnce();
    expect(rpc.callRpc).toHaveBeenCalledWith("public", "mi_sesion", {});
    expect(s).toEqual({
      user: { id: "u1", email: "admin@vb.test" },
      tenant: {
        id: "t1",
        nombre: "Villa Blanca",
        slug: "villa-blanca",
        vertical: "ganaderia",
        plan: "pro",
        estado: "activo",
        logoUrl: "https://cdn.test/logo.png",
        colorPrimario: "#112233",
        zonaHoraria: "America/Bogota",
        moneda: "COP",
        modulos: ["ganaderia.animales", "ganaderia.arriendos"],
      },
      rolTenant: "admin",
      rolLegacy: "admin",
      esPlatformAdmin: false,
      membresias: [{ tenantId: "t1", nombre: "Villa Blanca", slug: "villa-blanca", vertical: "ganaderia", rol: "admin" }],
    });
  });

  it("sin usuario no llama a la RPC", async () => {
    auth.getCurrentUser.mockResolvedValue(null);
    expect(await getSesion()).toBeNull();
    expect(await getSesionBase()).toBeNull();
    expect(rpc.callRpc).not.toHaveBeenCalled();
  });

  it("si la RPC falla no concede nada", async () => {
    rpc.callRpc.mockResolvedValue({ ok: false, code: "error_inesperado", message: "x" });
    expect(await getSesion()).toBeNull();
    expect(await getSesionBase()).toBeNull();
  });

  it("sin cliente activo: getSesion() es null pero getSesionBase() conserva al platform admin", async () => {
    rpc.callRpc.mockResolvedValue({
      ok: true,
      data: { ...json, tenant: null, rol_tenant: "owner", rol_legacy: null, es_platform_admin: true, membresias: [] },
    });
    expect(await getSesion()).toBeNull();
    const base = await getSesionBase();
    expect(base).toMatchObject({ tenant: null, esPlatformAdmin: true, rolLegacy: null, membresias: [] });
  });

  it("un cliente sin rol de membresía ni legacy no genera sesión completa", async () => {
    rpc.callRpc.mockResolvedValue({ ok: true, data: { ...json, rol_tenant: null, rol_legacy: null } });
    expect(await getSesion()).toBeNull();
  });

  it("el email ausente se normaliza a cadena vacía", async () => {
    auth.getCurrentUser.mockResolvedValue({ id: "u2" });
    expect((await getSesion())?.user).toEqual({ id: "u2", email: "" });
  });
});
