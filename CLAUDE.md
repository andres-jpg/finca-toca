# CLAUDE.md

Guía para Claude Code en este repositorio. Aquí solo van las reglas que aplican siempre; el detalle de cada área está en `docs/claude/` y se lee **antes de tocar esa área**.

## Proyecto

**Finca Toca**: SaaS multi-tenant y multi-vertical. Verticales: **ganadería** (Villa Blanca, El Velero), **cooperativa** de leche (Toca Lácteos) y **café** (Cofradía). Next.js 16 (App Router), React 19, TypeScript, Supabase (Postgres + Auth), Tailwind v4, shadcn/ui. Gestor de paquetes: **pnpm**. Alias `@/*` → `src/*`.

## Reglas de trabajo

- **NUNCA** hagas commit, push ni PR sin que el usuario lo pida explícitamente.
- No reintroduzcas lógica duplicada: si existe un helper o una fuente única (citada abajo o en `docs/claude/`), úsalo.
- Nada de `if (tenant === …)`: lo que cambia entre clientes es configuración (módulos, parámetros, datos).
- Textos de usuario en español; código y nombres de dominio en español, como el resto del repo.

## Comandos

```bash
pnpm dev | build | lint
pnpm test            # Vitest (src/**/*.test.ts, co-localizados; fechas fijas, nunca new Date() sin argumento)
pnpm test:db         # pgTAP (supabase/tests/), requiere pnpm db:start + pnpm db:reset
pnpm test:e2e        # Playwright (e2e/), requiere db:start + db:reset
pnpm db:start | db:reset | db:stop | db:diff <nombre> | db:types
pnpm tenant:create   # alta de cliente por CLI
```

**Tras cada migración: `pnpm db:types`** y commitea migración + `src/lib/supabase/database.types.ts` juntos (el CI falla por drift). No edites ni formatees ese fichero a mano.

## Dónde está cada cosa

| Vas a tocar… | Lee antes |
| --- | --- |
| Carpetas y módulos | `docs/claude/estructura.md` |
| Roles, multi-tenancy, membresías, `getSesion()`, alta de clientes, equipo, plantilla RLS | `docs/claude/plataforma.md` |
| Server Actions, Supabase tipado, formularios, tablas, paginación | `docs/claude/patrones.md` |
| Animales, eventos, alertas, pajillas, leche, arriendos, dashboard de finca | `docs/claude/ganaderia.md` |
| Cooperativa: rutas, itinerarios, recolecciones, pagos, informe Excel, offline | `docs/claude/cooperativa.md` |
| Esquema `public` (tablas y columnas) | `docs/claude/base-de-datos.md` |
| Auditoría, monolito modular, RPC transaccionales, kardex, consecutivos, terceros, tarifas/parámetros, Excel, impresión | `docs/claude/nucleo.md` |
| Vertical café: lotes, compra, recepción, procesos, planta, empaque, remisiones, ventas, reapertura, panel | `docs/claude/cafe.md` + `src/modules/cafe/README.md` |
| Variables, desarrollo local, E2E, migraciones, CI, despliegue, Sentry | `docs/claude/entorno.md` |
| Decisiones de arquitectura | `docs/adr/` |
| Ajustes de Cofradía en curso | `docs/cofradia-ajustes-fase1/` |

## Arquitectura en una página

- **Código nuevo en `src/modules/`** (`core/` + un directorio por vertical, cada uno con `{actions,components,queries,schemas,lib}`). Lo legacy sigue en `src/features/` hasta la Fase 2.
- **Fronteras (ESLint, error)**: vertical → core/ui/lib/su propio vertical; core nunca importa un vertical; `src/modules` nunca importa `src/features`. Solo `src/modules/registry.ts` ve todos los verticales.
- **Pantalla nueva = 3 piezas**: entrada en el `manifest.ts` del módulo + `requireModuloPagina(modulo)` en la página + `requireModulo(modulo)` y `requireRolTenant([...])` en cada Server Action. Ocultar el menú es cosmético.
- **Sesión**: en código nuevo usa solo `getSesion()` (`core/auth/sesion.ts`) y los guards de `core/auth/guards.ts`. `getUserRole()`/`requireRole()`/`checkRoutePermission()` son legacy.
- **Dos modelos de acceso** hasta la Fase 2: `roles` (legacy: tablas de finca y cooperativa, `rol_actual()`) y `tenant_members` (tablas nuevas: núcleo y café, `rol_en_tenant()` = `owner|admin|operativo|viewer`).
- **RLS es la frontera real.** Toda tabla nueva: `tenant_id not null default public.tenant_actual()`, RLS activa con la plantilla de membresías (+ `tenant_tiene_modulo(...)` si es de un módulo), columnas `created_at/by` y `updated_at/by`, trigger `public.set_updated()`, `select audit.activar('esquema.tabla')` y **test pgTAP de aislamiento por tenant**. No pases `tenant_id` a mano en los inserts.
- **Escrituras de más de una tabla o atómicas = función `plpgsql` por RPC** (`security invoker`, `search_path = ''`, `revoke … from public, anon; grant … to authenticated`). El Server Action solo autoriza, valida con Zod y llama a `callRpc()`. Errores de negocio: `raise exception using errcode = 'P0001', message = 'codigo_snake', detail = 'texto'` y el código en `src/modules/core/rpc/mensajes.ts`. `SECURITY DEFINER` solo en excepciones documentadas.
- **Inventario**: el stock es la suma de movimientos; solo se escribe con `registrar_movimientos()`. Correcciones = movimiento `ajuste` (solo owner/admin).
- **Café: saldo por kilos, sin bultos** (ADR 0002): cada proceso consume de su `origen_proceso_id`; el saldo sale solo de `cafe.v_origenes_disponibles`/`procesos/lib/saldo.ts`. Las secciones de `docs/claude/cafe.md` que hablan de bultos son históricas.
- **Códigos correlativos**: siempre `public.siguiente_consecutivo(serie, fecha)` dentro de la RPC, nunca `max()+1`.
- **Esquema `cafe`**: `supabase.schema("cafe")`. En staging/producción hay que exponerlo a mano en *Settings → API*.

## Convenciones de código

- Server Components cargan datos; lo interactivo es `"use client"`. `next/dynamic` con `ssr: false` solo dentro de un fichero cliente.
- Formularios: React Hook Form + Zod (`zodResolver`). En esta versión de Zod, `z.enum()`/`z.number()` no aceptan `required_error`/`invalid_type_error`: usa `message`.
- Clientes Supabase tipados con `Database`: nada de `any`. Relaciones embebidas con `aUno()`/`aLista()` (`lib/supabase/relaciones.ts`).
- PostgREST corta en 1000 filas: pagina con `.range()` (`fetchAllPaginado` en `core/export`).
- `getCurrentUser()` (con `React.cache()`) en vez de `supabase.auth.getUser()` directo.
- Denegaciones: `throw new AuthorizationError()` (no `new Error("No autorizado")`), para que Sentry no las reporte.
- Lógica pura en `lib/` con su test Vitest; las cuentas que también hace SQL comparten casos de prueba con pgTAP.
- Fechas y formatos que dependen de la zona horaria se calculan en el servidor con la zona del cliente (`tenants.zona_horaria`), nunca en el navegador.
- Flujo de usuario nuevo (formulario, paso de planta, permiso, exportación) = escenario E2E en `e2e/`.

## Migraciones y despliegue

- Fuente de verdad: `supabase/migrations/`. Nunca edites una migración aplicada; crea otra. No metas datos de clientes.
- Flujo: local → `pnpm db:diff` → revisar a mano (`GRANT`/`REVOKE`) → PR → `develop` (staging, automático) → `main` (producción, con aprobación).
- **Compatibles hacia atrás (expand → migrate → contract)**: nunca renombres ni borres columnas en el mismo release que cambia el código que las usa.
- `.env.local` apunta a la Supabase local; nunca a producción. No ejecutes `supabase/seed.sql` fuera de local.
- Usuarios de prueba locales: `admin@vb.test`, `user@vb.test`, `viewer@vb.test`, `admin@velero.test`, `coop.admin@test`, `coop.user@test`; café E2E: `admin@cafe.test`, `operativo@cafe.test`, `gerencia@cafe.test`. Contraseña `password123`.
- Antes de cada release a producción: revisar Supabase → *Advisors* (Security y Performance).

## Mantener este fichero

Si añades una regla que aplica a todo el repo, va aquí en una línea. Si es detalle de un área, va en su fichero de `docs/claude/` (o en el `README.md` del módulo). No dupliques contenido entre ambos.
