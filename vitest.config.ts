import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Solo las dos variables de Supabase de `.env.local`: las usa el test que compara el catálogo de
// módulos con la base local (se salta si no hay base o si apunta a un entorno remoto).
try {
  process.loadEnvFile(".env.local");
} catch {
  // sin .env.local (CI, clon nuevo): el test de catálogo contra la base local se salta
}
const env = process.env;

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    env: {
      NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    },
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/features/**/lib/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/lib/supabase/database.types.ts"],
    },
  },
});
