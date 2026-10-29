import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium, type FullConfig } from "@playwright/test";
import { PASSWORD, ROLES, USUARIOS, estadoAutenticacion } from "./fixtures/auth";

// Antes de la suite: (1) aplica el seed de los tests a la Supabase local y (2) inicia sesión una vez por rol y guarda
// las cookies (`storageState`), para que ningún test pase por el formulario de login. Va aquí y no en un proyecto
// `setup` de Playwright porque `-g "marca propia"` filtraría también los tests del proyecto de setup y la sesión no
// existiría. Playwright arranca el servidor web antes de ejecutar esto.

const RAIZ = path.resolve(__dirname, "..");
const SEED = path.join(RAIZ, "supabase", "dev", "e2e-seed.sql");

/** El seed crea usuarios con contraseña conocida: solo se aplica a una base local. */
function exigirBaseLocal(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    // vacío o inválido: lo trata el mensaje de abajo
  }
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) {
    throw new Error(
      `Los tests E2E solo corren contra la Supabase local (NEXT_PUBLIC_SUPABASE_URL=${url || "(vacía)"}). ` +
        "Arranca la base con `pnpm db:start`, copia sus claves a .env.local (ver .env.local.example) y repite.",
    );
  }
}

function aplicarSeed(): void {
  // El contenedor de Postgres de la Supabase local se llama `supabase_db_<project_id>` (project_id = finca-toca).
  const contenedor = process.env.E2E_DB_CONTAINER ?? "supabase_db_finca-toca";
  const r = spawnSync("docker", ["exec", "-i", contenedor, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], {
    input: fs.readFileSync(SEED, "utf8"),
    encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(
      `No se pudo aplicar ${path.relative(RAIZ, SEED)} en el contenedor «${contenedor}» (¿Docker y \`pnpm db:start\` en marcha? ` +
        `¿falta \`pnpm db:reset\` tras un cambio de migraciones?):\n${r.stderr || r.error?.message || r.stdout}`,
    );
  }
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  exigirBaseLocal();
  aplicarSeed();

  const baseURL = config.projects[0].use.baseURL;
  if (!baseURL) throw new Error("Falta baseURL en playwright.config.ts");
  fs.mkdirSync(path.join(__dirname, ".auth"), { recursive: true });

  const navegador = await chromium.launch();
  try {
    for (const rol of ROLES) {
      const contexto = await navegador.newContext({ baseURL, locale: "es-CO" });
      const page = await contexto.newPage();
      page.setDefaultTimeout(90_000); // la primera visita a /login y /dashboard compila en `next dev`
      await page.goto("/login");
      await page.getByLabel("Correo electrónico").fill(USUARIOS[rol].email);
      await page.getByLabel("Contraseña").fill(PASSWORD);
      await page.getByRole("button", { name: "Iniciar sesión" }).click();
      await page.waitForURL(/\/dashboard/);
      await contexto.storageState({ path: estadoAutenticacion(rol) });
      await contexto.close();
    }
  } finally {
    await navegador.close();
  }
}
