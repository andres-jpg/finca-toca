# core — núcleo de plataforma

Lo que comparten **todos** los verticales (café, ganadería, cooperativa) y que no sabe nada de ninguno de ellos: nada que conozca vacas, litros de leche ni café.

Aquí van las piezas transversales que irán llegando en CO-08 … CO-18 (multi-tenancy, autorización, registro de módulos, etc.).

## Reglas

- `core` puede importar de `@/components` (ui) y `@/lib`.
- `core` **no** puede importar de ningún vertical (`cafe`, `ganaderia`, `cooperativa`) ni de `@/features`. ESLint lo comprueba (ver `eslint.config.mjs`).
- Todo lo que cambia entre clientes es configuración que `core` recibe, nunca un `if (tenant === ...)`.

Cada submódulo sigue el patrón de `src/features`: `<modulo>/{actions,components,schemas,lib}`.
