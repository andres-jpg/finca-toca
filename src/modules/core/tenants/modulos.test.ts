import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MODULOS, tieneModulo } from "./modulos";

describe("tieneModulo", () => {
  it("true si el módulo está entre los activos del cliente", () => {
    expect(tieneModulo(["ganaderia.animales", "ganaderia.arriendos"], "ganaderia.arriendos")).toBe(true);
  });

  it("false si el cliente no lo tiene", () => {
    expect(tieneModulo(["ganaderia.animales"], "ganaderia.arriendos")).toBe(false);
  });

  it("sin lista (null, undefined o vacía) no hay módulo", () => {
    expect(tieneModulo(null, "ganaderia.arriendos")).toBe(false);
    expect(tieneModulo(undefined, "ganaderia.arriendos")).toBe(false);
    expect(tieneModulo([], "ganaderia.arriendos")).toBe(false);
  });

  it("compara el id exacto: ni mayúsculas ni el nombre sin prefijo de vertical", () => {
    expect(tieneModulo(["Ganaderia.Arriendos"], "ganaderia.arriendos")).toBe(false);
    expect(tieneModulo(["arriendos"], "ganaderia.arriendos")).toBe(false);
  });
});

describe("MODULOS", () => {
  it("no repite ids y todos llevan el formato <vertical|core>.<nombre>", () => {
    expect(new Set(MODULOS).size).toBe(MODULOS.length);
    for (const id of MODULOS) expect(id).toMatch(/^(ganaderia|cooperativa|cafe|core)\.[a-z_]+$/);
  });
});

// Coherencia MODULOS ↔ seed del catálogo (`public.modulos`). Dos comprobaciones:
//  1. contra el SQL de la migración: no necesita base, así que corre también en el CI antes de
//     levantar Supabase;
//  2. contra la base LOCAL, si está levantada (`pnpm db:start`): lo que de verdad hay en la tabla.
const DIR_MIGRACIONES = join(process.cwd(), "supabase/migrations");

// Un módulo nuevo llega en una migración nueva (`insert into public.modulos … on conflict`): se leen todas.
function idsSembradosEnMigraciones(): string[] {
  const ids: string[] = [];
  for (const fichero of readdirSync(DIR_MIGRACIONES).filter((f) => f.endsWith(".sql"))) {
    const sql = readFileSync(join(DIR_MIGRACIONES, fichero), "utf8");
    for (const bloque of sql.matchAll(/insert into public\.modulos[\s\S]*?on conflict/gi)) {
      ids.push(...[...bloque[0].matchAll(/^\s*\('([a-z_.]+)',/gm)].map((m) => m[1]));
    }
  }
  return ids;
}

describe("MODULOS ↔ seed de las migraciones", () => {
  it("las migraciones siembran exactamente los ids de MODULOS", () => {
    expect(idsSembradosEnMigraciones().sort()).toEqual([...MODULOS].sort());
  });
});

// Solo contra la Supabase local (nunca staging ni producción), aunque .env.local apunte a otra:
// se lee con la clave de servicio, y eso no se hace contra un entorno remoto desde un test.
const URL_LOCAL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const CLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const esLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(`${URL_LOCAL}/`);

async function leerCatalogoLocal(): Promise<{ id: string; vertical: string | null }[] | null> {
  if (!esLocal || !CLAVE) return null;
  try {
    const r = await fetch(`${URL_LOCAL}/rest/v1/modulos?select=id,vertical`, {
      headers: { apikey: CLAVE, Authorization: `Bearer ${CLAVE}` },
      signal: AbortSignal.timeout(2000),
    });
    return r.ok ? await r.json() : null;
  } catch {
    return null; // base apagada
  }
}

const catalogoLocal = await leerCatalogoLocal();

describe.skipIf(!catalogoLocal)("MODULOS ↔ public.modulos (Supabase local)", () => {
  it("la tabla tiene exactamente los ids de MODULOS", () => {
    expect((catalogoLocal ?? []).map((m) => m.id).sort()).toEqual([...MODULOS].sort());
  });

  it("el prefijo de cada id es su vertical (o `core` si no tiene)", () => {
    for (const m of catalogoLocal ?? []) {
      expect(m.id.split(".")[0]).toBe(m.vertical ?? "core");
    }
  });
});
