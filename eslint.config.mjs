import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import boundaries from "eslint-plugin-boundaries";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Fronteras de import de la arquitectura modular (ver CLAUDE.md → "Arquitectura modular").
  // Solo se aplican a src/modules: el resto del código (features, app…) queda como estaba.
  {
    files: ["src/modules/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "core", pattern: "src/modules/core/**", partialMatch: false },
        {
          type: "vertical",
          pattern: "src/modules/(cafe|ganaderia|cooperativa)/**",
          partialMatch: false,
          capture: ["vertical"],
        },
        { type: "legacy-feature", pattern: "src/features/**", partialMatch: false },
        { type: "ui", pattern: "src/components/**", partialMatch: false },
        { type: "lib", pattern: "src/lib/**", partialMatch: false },
        { type: "app", pattern: "src/app/**", partialMatch: false },
      ],
    },
    rules: {
      "boundaries/dependencies": [
        2,
        {
          default: "disallow",
          policies: [
            {
              from: { element: { type: "vertical" } },
              allow: {
                to: [
                  { element: { type: "core" } },
                  { element: { type: "ui" } },
                  { element: { type: "lib" } },
                  {
                    element: {
                      type: "vertical",
                      captured: { vertical: "{{from.element.captured.vertical}}" },
                    },
                  },
                ],
              },
            },
            {
              from: { element: { type: "core" } },
              allow: {
                to: [
                  { element: { type: "core" } },
                  { element: { type: "ui" } },
                  { element: { type: "lib" } },
                ],
              },
            },
            // Prohibiciones explícitas: ganan sobre las permisiones y dan un mensaje claro.
            {
              from: { element: { type: "vertical" } },
              disallow: {
                to: {
                  element: {
                    type: "vertical",
                    captured: { vertical: "!{{from.element.captured.vertical}}" },
                  },
                },
              },
              message:
                "Un vertical no puede importar de otro vertical ({{from.element.captured.vertical}} → {{to.element.captured.vertical}}). Lo compartido va a core.",
            },
            {
              from: { element: { type: "core" } },
              disallow: { to: { element: { type: "vertical" } } },
              message: "core no puede conocer a ningún vertical ({{to.element.captured.vertical}}).",
            },
            {
              from: { element: { type: ["core", "vertical"] } },
              disallow: { to: { element: { type: "legacy-feature" } } },
              message: "src/modules no puede importar de src/features (código legacy, se migra en la Fase 2).",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
