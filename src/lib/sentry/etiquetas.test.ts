import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({ setUser: vi.fn(), setTag: vi.fn() }));
vi.mock("@sentry/nextjs", () => sentry);

import { aplicarContextoSentry, limpiarContextoSentry } from "./etiquetas";

describe("aplicarContextoSentry", () => {
  beforeEach(() => {
    sentry.setUser.mockClear();
    sentry.setTag.mockClear();
  });

  it("pone el id del usuario y los tags tenant y rol", () => {
    aplicarContextoSentry({ userId: "u-1", rol: "admin", tenantSlug: "villa-blanca" });

    expect(sentry.setUser).toHaveBeenCalledWith({ id: "u-1" });
    expect(sentry.setTag).toHaveBeenCalledWith("rol", "admin");
    expect(sentry.setTag).toHaveBeenCalledWith("tenant", "villa-blanca");
  });

  it("nunca envía el email: setUser recibe solo el id", () => {
    aplicarContextoSentry({ userId: "u-1", rol: "viewer", tenantSlug: "el-velero" });

    const usuario = sentry.setUser.mock.calls[0][0];
    expect(Object.keys(usuario)).toEqual(["id"]);
  });

  it("no pone nada de lo que no se conoce (cooperativa sin tenant, sin sesión)", () => {
    aplicarContextoSentry({ userId: null, rol: "cooperativa_user", tenantSlug: null });

    expect(sentry.setUser).not.toHaveBeenCalled();
    expect(sentry.setTag).toHaveBeenCalledTimes(1);
    expect(sentry.setTag).toHaveBeenCalledWith("rol", "cooperativa_user");
  });

  it("pone el vertical solo si se informa", () => {
    aplicarContextoSentry({ userId: "u-1", rol: "admin", tenantSlug: "x", vertical: "cafe" });
    expect(sentry.setTag).toHaveBeenCalledWith("vertical", "cafe");
  });
});

describe("limpiarContextoSentry", () => {
  beforeEach(() => {
    sentry.setUser.mockClear();
    sentry.setTag.mockClear();
  });

  it("borra el usuario y los tags para que un error posterior no herede el cliente anterior", () => {
    limpiarContextoSentry();

    expect(sentry.setUser).toHaveBeenCalledWith(null);
    for (const tag of ["rol", "tenant", "vertical"]) {
      expect(sentry.setTag).toHaveBeenCalledWith(tag, undefined);
    }
  });
});
