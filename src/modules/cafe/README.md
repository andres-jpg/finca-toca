# cafe — vertical de café

Código del vertical de café. Nace aislado de ganadería y cooperativa: no importa de `@/modules/ganaderia`, `@/modules/cooperativa` ni de `@/features`.

- Puede importar de `@/modules/core`, `@/components` (ui) y `@/lib`.
- Sus tablas viven en el schema `cafe` de Postgres (ver `supabase/migrations/*_schema_cafe.sql`) y se consultan con `supabase.schema("cafe").from(...)`.
- `manifest.ts` declara el módulo a la plataforma (placeholder; se completa en CO-12).

Estructura de cada feature: `<feature>/{actions,components,schemas,lib}`.
