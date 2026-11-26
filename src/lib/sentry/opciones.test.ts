import { afterEach, describe, expect, it, vi } from "vitest";
import { esPreviewVercel, opcionesSentry } from "./opciones";

const DSN = "https://clave@o0.ingest.sentry.io/1";

function entorno(vars: Record<string, string>) {
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("NEXT_PUBLIC_VERCEL_ENV", "");
  for (const [k, v] of Object.entries(vars)) vi.stubEnv(k, v);
}

afterEach(() => vi.unstubAllEnvs());

describe("opcionesSentry", () => {
  it("preview en servidor (VERCEL_ENV) → desactivado aunque haya DSN", () => {
    entorno({ VERCEL_ENV: "preview" });
    expect(esPreviewVercel()).toBe(true);
    expect(opcionesSentry(DSN).enabled).toBe(false);
  });

  it("preview en cliente (NEXT_PUBLIC_VERCEL_ENV) → desactivado aunque haya DSN", () => {
    entorno({ NEXT_PUBLIC_VERCEL_ENV: "preview" });
    expect(opcionesSentry(DSN).enabled).toBe(false);
  });

  it("producción con DSN → activado", () => {
    entorno({ VERCEL_ENV: "production", NEXT_PUBLIC_VERCEL_ENV: "production" });
    expect(opcionesSentry(DSN).enabled).toBe(true);
  });

  it("local (sin VERCEL_ENV) con DSN → activado", () => {
    entorno({});
    expect(opcionesSentry(DSN).enabled).toBe(true);
  });

  it("sin DSN → desactivado en cualquier entorno", () => {
    entorno({ VERCEL_ENV: "production" });
    expect(opcionesSentry(undefined).enabled).toBe(false);
  });
});
