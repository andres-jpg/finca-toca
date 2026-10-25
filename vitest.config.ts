import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/features/**/lib/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/lib/supabase/database.types.ts"],
    },
  },
});
