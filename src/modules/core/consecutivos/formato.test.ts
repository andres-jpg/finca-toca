import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatearConsecutivo } from "./formato";

// Los mismos casos están en supabase/tests/60_consecutivos.test.sql (sección "Formato"). Si cambias uno,
// cambia el otro: el test de abajo comprueba que el SQL de pgTAP los contiene.
const CASOS: { formato: string; serie: string; anio: number; n: number; esperado: string }[] = [
  { formato: "{serie}-{anio}-{n:4}", serie: "MP", anio: 2026, n: 13, esperado: "MP-2026-0013" },
  { formato: "{serie}-{anio}-{n:4}", serie: "MP", anio: 2026, n: 10000, esperado: "MP-2026-10000" },
  { formato: "{serie}-{n}", serie: "REM", anio: 2026, n: 7, esperado: "REM-7" },
  { formato: "{anio}/{n:6}-{serie}", serie: "MQ", anio: 2027, n: 42, esperado: "2027/000042-MQ" },
  { formato: "{n:2}-{n:4}", serie: "X", anio: 2026, n: 5, esperado: "05-0005" },
  { formato: "{serie}-{n:4}", serie: "MP", anio: 2026, n: 123456, esperado: "MP-123456" },
];

describe("formatearConsecutivo", () => {
  it.each(CASOS)("$formato con $serie/$anio/$n → $esperado", ({ formato, serie, anio, n, esperado }) => {
    expect(formatearConsecutivo(formato, serie, anio, n)).toBe(esperado);
  });

  it("el formato por defecto da MP-2026-0013 (el ejemplo de 'Próximo número')", () => {
    expect(formatearConsecutivo("{serie}-{anio}-{n:4}", "MP", 2026, 13)).toBe("MP-2026-0013");
  });

  it("un texto de la serie con aspecto de marcador no se interpreta", () => {
    expect(formatearConsecutivo("{serie}-{n:3}", "{n}", 2026, 1)).toBe("{n}-001");
  });
});

// Coherencia con el SQL, en dos niveles:
//  1. los casos de arriba están en el test pgTAP (no necesita base, corre también en el CI antes de
//     levantar Supabase);
//  2. contra `public.formatear_consecutivo()` de la base LOCAL, si está levantada (`pnpm db:start`).
describe("formatearConsecutivo ↔ formatear_consecutivo() de SQL", () => {
  it("el test pgTAP contiene los mismos casos", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/tests/60_consecutivos.test.sql"), "utf8");
    for (const c of CASOS) {
      const fila = `('${c.formato}'`;
      expect(sql, `falta el caso ${c.esperado} en 60_consecutivos.test.sql`).toContain(fila);
      expect(sql, `falta el esperado ${c.esperado} en 60_consecutivos.test.sql`).toContain(`'${c.esperado}'`);
    }
  });
});

// Solo contra la Supabase local (nunca staging ni producción), aunque .env.local apunte a otra:
// se llama con la clave de servicio, y eso no se hace contra un entorno remoto desde un test.
const URL_LOCAL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const CLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const esLocal = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(`${URL_LOCAL}/`);

async function formatearEnSql(c: (typeof CASOS)[number]): Promise<string | null> {
  if (!esLocal || !CLAVE) return null;
  try {
    const r = await fetch(`${URL_LOCAL}/rest/v1/rpc/formatear_consecutivo`, {
      method: "POST",
      headers: { apikey: CLAVE, Authorization: `Bearer ${CLAVE}`, "Content-Type": "application/json" },
      body: JSON.stringify({ p_formato: c.formato, p_serie: c.serie, p_anio: c.anio, p_n: c.n }),
      signal: AbortSignal.timeout(2000),
    });
    return r.ok ? ((await r.json()) as string) : null;
  } catch {
    return null; // base apagada
  }
}

const primeraRespuesta = await formatearEnSql(CASOS[0]);

describe.skipIf(primeraRespuesta === null)("formatearConsecutivo ↔ SQL (Supabase local)", () => {
  it.each(CASOS)("$esperado sale igual en TS y en Postgres", async (c) => {
    expect(await formatearEnSql(c)).toBe(formatearConsecutivo(c.formato, c.serie, c.anio, c.n));
  });
});
