# cafe — vertical de café

Código del vertical de café. Nace aislado de ganadería y cooperativa: no importa de `@/modules/ganaderia`, `@/modules/cooperativa` ni de `@/features`.

- Puede importar de `@/modules/core`, `@/components` (ui) y `@/lib`.
- Sus tablas viven en el schema `cafe` de Postgres (ver `supabase/migrations/*_schema_cafe.sql`) y se consultan con `supabase.schema("cafe").from(...)`.
- `manifest.ts` declara la navegación del vertical a la plataforma. Hoy `nav: []`; cada pantalla de la Fase 1 añade aquí su entrada (rutas previstas en el propio fichero) con `roles` (membresía, no `rolesLegacy`), más `requireModuloPagina()` en la página y `requireModulo()` en sus actions.

Estructura de cada feature: `<feature>/{actions,components,schemas,lib}`.
