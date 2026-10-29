import { defineConfig, devices } from "@playwright/test";

// Tests E2E (FIN-117 / CO-36). Contra la Supabase LOCAL y `pnpm dev`: antes de la suite, `pnpm db:reset`
// (ver «Tests E2E» en CLAUDE.md). `e2e/global-setup.ts` aplica `supabase/dev/e2e-seed.sql` y guarda la sesión de cada rol.

// Mismo criterio que vitest.config.ts: las claves de la Supabase local salen de `.env.local` (en CI las escribe el
// workflow). Se carga aquí, antes de definir nada, para que el servidor de desarrollo, el globalSetup y los workers
// (todos heredan `process.env`) vean las mismas variables.
try {
  process.loadEnvFile(".env.local");
} catch {
  // sin .env.local: valen las variables ya exportadas en el entorno
}

// 3100 y no 3000: en esta máquina el 3000 suele estar ocupado por el `pnpm dev` de quien desarrolla.
const PUERTO = Number(process.env.E2E_PORT ?? 3100);
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PUERTO}`;
const EN_CI = Boolean(process.env.CI);
// Cómo se levanta la app (`E2E_SERVER`):
//  · sin definir: `pnpm build && pnpm start` — la app compilada. Es el modo por defecto porque `next dev` compila cada ruta la
//    primera vez que se pide y la suite entera pasaba de 14 min (con esperas agotadas en frío); compilada son ~2 min con el build.
//  · `start`: solo `pnpm start`, sobre un `pnpm build` que ya hiciste (lo usa el CI, que construye en su propio paso).
//  · `dev`: `pnpm dev`, para depurar un escenario con `--ui` o `--headed`.
// Las variables NEXT_PUBLIC_* se incrustan en el build desde `.env.local`.
const SERVIDOR = process.env.E2E_SERVER ?? "build";
const COMANDOS: Record<string, string> = {
  build: `pnpm build && pnpm start --port ${PUERTO}`,
  start: `pnpm start --port ${PUERTO}`,
  dev: `pnpm dev --port ${PUERTO}`,
};
if (!(SERVIDOR in COMANDOS)) throw new Error(`E2E_SERVER=${SERVIDOR} no es válido: usa build, start o dev`);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e/global-setup.ts",

  // Una sola ejecución a la vez: todos los tests comparten la misma base (un cliente de café, un inventario) y miden
  // diferencias de stock; en paralelo se pisarían. Cada test sigue siendo independiente (crea sus propios datos).
  fullyParallel: false,
  workers: 1,
  forbidOnly: EN_CI,
  retries: EN_CI ? 1 : 0,

  // `next dev` compila cada ruta la primera vez que se pide, y los formularios de planta son largos: holgura de sobra.
  timeout: 120_000,
  expect: { timeout: 15_000 },

  // El informe HTML (con trazas y capturas de lo que falló) es el artefacto que sube el CI.
  reporter: [["list"], ["html", { open: "never" }]],

  use: {
    baseURL: BASE_URL,
    locale: "es-CO",
    timezoneId: "America/Bogota",
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    // Solo al fallar: es lo que sube el CI como artefacto.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      // Los formularios de planta se piensan para la tablet (campos de 44 px, barra de guardar fija al pie por debajo de
      // 1280 px). El iPad trae WebKit por defecto; aquí se fuerza Chromium para instalar un solo navegador. Solo corren
      // los escenarios marcados con `@tablet` en su título.
      name: "tablet",
      grep: /@tablet/,
      use: { ...devices["iPad (gen 7) landscape"], browserName: "chromium" },
    },
  ],

  webServer: {
    command: COMANDOS[SERVIDOR],
    url: `${BASE_URL}/login`,
    reuseExistingServer: !EN_CI,
    timeout: 400_000, // incluye el `pnpm build` del modo por defecto
    stdout: "ignore",
    stderr: "pipe",
  },
});
