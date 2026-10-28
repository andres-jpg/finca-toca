# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Finca Toca** is a farm management dashboard for tracking cattle operations, milk extraction, expenses, income, and cooperative milk collection routes. Built with Next.js 16 (App Router), React 19, TypeScript, Supabase (PostgreSQL + Auth), TailwindCSS v4, and shadcn/ui.

## Workflow Rules

**NUNCA hagas commits, subas ramas (push) ni crees pull requests a menos que el usuario lo pida explícitamente.** Esto aplica incluso después de completar una tarea. Espera siempre una instrucción directa como "haz commit", "sube los cambios" o "crea una PR" antes de ejecutar cualquier acción git que afecte el repositorio remoto o el historial local.

## Commands

```bash
pnpm dev      # Start dev server at localhost:3000
pnpm build    # Production build
pnpm lint     # Run ESLint
pnpm test           # Vitest: tests unitarios de funciones puras (src/**/*.test.ts)
pnpm test:watch     # Vitest en modo watch
pnpm test:coverage  # Vitest con cobertura (v8)
pnpm test:db        # pgTAP (supabase/tests/): RLS y funciones SQL; necesita `pnpm db:start` y `pnpm db:reset` previos
pnpm test:concurrencia  # 20 llamadas paralelas a siguiente_consecutivo() contra la Supabase local (FIN-95)
```

Package manager is **pnpm**.

**Tests.** Dos suites: Vitest para funciones puras de TypeScript (co-localizados, `foo.test.ts` junto a `foo.ts`; fechas siempre fijas, nunca `new Date()` sin argumento) y pgTAP para la base. Los tests de pgTAP corren contra la Supabase local con los usuarios del seed: `tests.autenticar_como('admin@vb.test')` (en `supabase/tests/00_helpers.sql`) simula a un usuario y, desde ahí, RLS aplica de verdad; `reset role` vuelve a postgres. Cada fichero va en `begin … rollback`, así que no deja datos. Lánzalos siempre juntos con `pnpm test:db`: `00_helpers.sql` crea el esquema `tests` y `99_limpieza.test.sql` lo retira, para que `pnpm db:diff` no lo recoja. **Toda tabla nueva lleva su test pgTAP de aislamiento por tenant** (un cliente no ve ni escribe filas de otro), junto a la migración que la crea.

## Architecture

### Directory Structure

```
src/
├── app/                              # Next.js App Router pages
│   ├── api/
│   │   ├── cron/animales-estados/    # GET (Bearer CRON_SECRET) → avance diario leche→levante_1→levante_2
│   │   ├── informes-cooperativa/     # GET → 2-sheet Excel report + payment vouchers (ExcelJS), cooperativa_admin only
│   │   ├── itinerario-data/          # GET → conductor's assigned itinerario + today's synced data + pending pagos
│   │   ├── recolecciones-sync/       # POST → offline conductor sync of recolecciones (Dexie → Supabase)
│   │   └── pagos-sync/               # POST → offline conductor sync of pagos_finca estado changes
│   ├── dashboard/
│   │   ├── cooperativa/              # Cooperativa overview (has loading.tsx)
│   │   ├── fincas-cooperativa/       # Finca CRUD
│   │   ├── rutas-cooperativa/        # Route CRUD + drag-and-drop finca ordering
│   │   ├── itinerarios/              # Itinerario CRUD (admin) / assigned-itinerario view (conductor)
│   │   ├── recolecciones/            # Daily milk collections — offline-first conductor PWA view
│   │   ├── pagos-cooperativa/        # Activar pagos por finca/período + historial (cooperativa_admin)
│   │   ├── usuarios-cooperativa/     # User → itinerario assignment (admin only)
│   │   ├── informes-cooperativa/     # Excel report generator
│   │   ├── animales/[id]/            # Animal detail page (vacas/[id] y toros/[id] solo redirigen)
│   │   ├── arriendos/                # Contratos de arriendo + abonos (módulo solo de Villa Blanca)
│   │   └── ...                       # gastos, ingresos, extracciones, inventario, configuracion
│   └── (auth)/                       # login, signup
├── features/                         # Feature modules — one per domain entity
│   ├── animales/
│   ├── eventos-animal/
│   ├── alertas/                      # lib/calcular-alertas.ts (pura) + queries + campana/tarjeta/ficha
│   ├── arriendos/                    # Arriendos + abonos; cada abono genera su gasto espejo
│   ├── fincas-cooperativa/
│   ├── rutas-cooperativa/
│   ├── itinerarios/
│   ├── recolecciones/
│   ├── pagos-cooperativa/
│   ├── usuarios-cooperativa/
│   ├── informes-cooperativa/
│   └── [feature]/
│       ├── actions/                  # Server Actions (data mutations + queries)
│       ├── components/               # Feature-specific UI
│       └── schemas/                  # Zod validation schemas
├── components/
│   ├── layout/                       # Sidebar, header, dashboard shell
│   ├── shared/                       # data-table, entity-modal, date-picker, finca-combobox, etc.
│   ├── dashboard/                    # DashboardFilter
│   └── ui/                           # shadcn/ui primitives
├── lib/
│   ├── supabase/server.ts            # Server-side Supabase client (cookie-based)
│   ├── supabase/client.ts            # Client-side Supabase client
│   ├── supabase/relaciones.ts        # aUno()/aLista()/Rel<T>: relaciones embebidas (objeto o array) con tipos
│   ├── supabase/admin.ts             # Service-role client (server-only), currently unused — no caller does its own authz, so anyone who imports it must add a requireRole()/getUserRole() check themselves
│   ├── auth/                         # LEGACY (roles): getUserRole, getCurrentUser, checkRoutePermission, canWrite, canDelete, requireRole — código nuevo: getSesion() en modules/core/auth
│   ├── offline/                      # db.ts (Dexie/IndexedDB schema), sync.ts (syncQueue, syncPagos) — conductor offline-first flow
│   └── cooperativa/
│       └── recolecciones.ts          # Shared: fetchAllRecolecciones, FEDEGAN_PCT, MESES, RecRow
├── charts/
│   ├── chart-wrappers.tsx            # "use client" — next/dynamic(..., { ssr: false }) for the main dashboard charts
│   ├── cooperativa-chart-wrappers.tsx # Same pattern for the cooperativa dashboard charts
│   ├── gastos-ingresos-line-chart.tsx
│   ├── conceptos-donut-chart.tsx
│   ├── extracciones-line-chart.tsx
│   ├── gastos-cooperativa-chart.tsx
│   ├── litros-por-finca-chart.tsx
│   ├── litros-por-ruta-chart.tsx
│   └── recolecciones-trend-chart.tsx
└── types/index.ts                    # Shared TypeScript interfaces
```

### Key Patterns

**Server Actions** are the mutation layer. Each feature's `actions/` folder contains async server functions that call Supabase and then call `revalidatePath()` to trigger ISR cache invalidation.

**Apuntes automáticos de la leche** (`extracciones.actions.ts`): cada extracción se parte en `litros_cantina` (se vende) y `litros_cria` (se queda para los terneros). `sincronizarApuntesLeche(fecha)` regenera **los dos** apuntes contables de esa fecha con el precio vigente del litro: `upsertIngresoLeche` → `ingresos.source = 'leche_extraccion'`, `upsertGastoLecheCria` → `gastos.source = 'leche_cria'` (subconcepto "Leche para crías", bajo "Alimentación animal", uno por tenant; se inserta con `pagado: true` porque no es una factura pendiente con un tercero). Ambos se recalculan por fecha completa —no por fila— y se **borran** si el día se queda sin litros de ese destino o si no hay precio registrado; al cambiar la fecha de una extracción hay que sincronizar también la fecha vieja. Llama siempre a `sincronizarApuntesLeche()`, no a un upsert suelto, o el otro apunte queda desincronizado.

**Arriendos (módulo `ganaderia.arriendos`, hoy solo de Villa Blanca)** (`features/arriendos`, `/dashboard/arriendos`): contratos (`arrendatario`, `finca_nombre`, período y `canon`) con sus abonos. El **saldo no se guarda**: `getArriendos()` lo deriva en cada lectura como `canon - SUM(abonos.valor)`, igual que las alertas o los días en leche; el panel de abonos además muestra el saldo tras cada abono, recorriéndolos en orden cronológico (`created_at` desempata los del mismo día).
- **Cada abono genera un gasto espejo** con `gastos.source = 'arriendo_abono'`, fechado el día del abono —eso es lo que lo hace contar en el mes en que se paga—, con `pagado: true` (es dinero ya entregado, no una factura pendiente), `proveedor` = arrendatario y el subconcepto "Arriendos" (bajo "Operación y mantenimiento", ya existía en la taxonomía de Villa Blanca). El vínculo es `arriendos_abonos.gasto_id`. Todo pasa por `upsertGastoAbono()`/`borrarGastoAbono()`: no insertes en `gastos` a mano desde este módulo.
- Orden de las escrituras, porque no hay transacción a través de PostgREST: al **crear**, primero el gasto (para tener su id) y se borra si el abono no llega a insertarse —mismo criterio que el reintegro de pajillas—; al **borrar**, primero el gasto y luego el abono, para no dejar un gasto automático sin dueño. Al borrar un arriendo hay que quitar los gastos de sus abonos **a mano**: los abonos se van en cascada, los gastos no. Editar arrendatario o finca resincroniza los gastos de todos sus abonos (`proveedor` y observaciones salen del contrato).
- Si alguien borra el gasto a mano, `gasto_id` queda a NULL (ON DELETE SET NULL), el abono sobrevive —es el registro primario— y la siguiente edición del abono lo regenera. Por eso `gastos-table.tsx` esconde editar/borrar en todo gasto con `source` y muestra la insignia "Auto" (`ORIGEN_AUTO` mapea cada `source` a su módulo): tocarlos ahí los desincronizaría de quien manda.
- **La exclusividad de Villa Blanca no está en RLS** (RLS ya aísla por `tenant_id`; la restricción por módulo se hace en la app). Vive en la base como el módulo `ganaderia.arriendos` en `tenant_modulos` —hoy solo activo para `villa-blanca`—: la barra lateral lo comprueba con `tieneModulo(modulos, 'ganaderia.arriendos')` (`modulos` por props), la página con `requireModuloPagina` (redirect a `/dashboard`) y cada Server Action con `requireModulo('ganaderia.arriendos')` (obligatorio: son endpoints POST públicos). Habilitarlo a otro cliente es un `insert` en `tenant_modulos`, sin deploy (ver *Módulos por cliente* en Multi-tenancy).

**Role-based access control** is enforced at three levels — all three matter, since RLS is the only one a client can't bypass by calling Supabase's REST/RPC API directly with the public anon key:
- Route level: `await checkRoutePermission(["admin", "viewer"])` in page Server Components — redirects to the role's home page (`PAGINA_INICIAL_POR_ROL`) if unauthorized
- Write level: `canWrite(role)` / `canDelete(role)` return `false` for the `"viewer"` role; pass these booleans down to client components to hide mutation UI
- Server Action / API route level: `await requireRole(["cooperativa_admin"])` throws if the caller's role is not in the allowed list (use this in every mutating Server Action — it's a public POST endpoint regardless of which UI calls it)
- **Database level (RLS)**: every `public` table's INSERT/UPDATE/DELETE policy checks `roles.rol` via `EXISTS (SELECT 1 FROM roles WHERE roles.user_id = auth.uid() AND roles.rol = ANY(ARRAY[...]))` — not just `TO authenticated USING (true)`. This is the actual authorization boundary; the three levels above are UX/defense-in-depth on top of it. When adding a new table, write its policies to match the same role matrix as the table's `requireRole(...)` calls — see "RLS policies" under Cooperativa Module. The new core/café tables use membership roles instead (`rol_en_tenant()`): see *Membresías y roles genéricos* and its RLS template under Multi-tenancy.

**Código nuevo → `getSesion()`**: el rol de la membresía (`rolTenant`, `requireRolTenant()`) sustituye a `getUserRole()`/`requireRole()` en los módulos nuevos; los niveles de abajo describen el modelo legacy, que sigue vigente en las pantallas existentes. Ver *Sesión unificada (FIN-91)* en Multi-tenancy.

**Multi-tenancy (lado finca)**: la app sirve a varios clientes — hoy Villa Blanca y El Velero (más la fila de Toca Lácteos). `tenants` es la tabla de clientes y `roles.tenant_id` ata cada usuario al suyo en las tablas legacy (NULL en los roles de cooperativa) y, desde FIN-90, `tenant_members` lo generaliza a membresías N:M (ver *Membresías y roles genéricos* más abajo). Las 14 tablas del lado finca llevan `tenant_id NOT NULL` (las 12 originales más `arriendos` y `arriendos_abonos`). **No se llama `finca_id` porque ese nombre ya significa "finca proveedora de la cooperativa"** en `recolecciones`/`rutas_fincas`/`itinerarios_fincas`/`pagos_finca`.
- El aislamiento no requiere tocar los Server Actions: **RLS filtra las lecturas** (`tenant_id = tenant_actual()`) y **`DEFAULT public.tenant_actual()` estampa las escrituras**, con el `WITH CHECK` impidiendo falsear el cliente. No añadas `tenant_id` a mano en los INSERT.
- `tenant_actual()` y `rol_actual()` son `STABLE SECURITY DEFINER` con `search_path = ''`: un lookup por consulta en vez del `EXISTS` sobre `roles` por fila que había antes. Desde FIN-90 `tenant_actual()` lee de las membresías (con `roles.tenant_id` como respaldo) y `rol_actual()` sigue leyendo solo de `roles`. El linter de Supabase las marca como "SECURITY DEFINER ejecutable por authenticated" — es inevitable, las políticas se evalúan como el usuario, y solo devuelven el rol/cliente del propio llamante.
- El cron (`createAdminClient()`, service role) salta RLS **a propósito**: avanza estados de todos los clientes.
- Dar de alta un cliente nuevo es solo SQL (ver `supabase/legacy/2026-08-05-multitenancy.sql`): fila en `tenants`, usuario en Auth, fila en `roles` con su `tenant_id` (el trigger crea la membresía). Ni código ni políticas nuevas.
- El nombre llega a la barra lateral vía `getTenantActual()` (`src/modules/core/tenants/tenant.queries.ts`, `React.cache()`), no está hardcodeado.
- **Módulos por cliente** (FIN-89): qué tiene cada cliente vive en la base, no en el código. `tenants` lleva `vertical` (`ganaderia|cooperativa|cafe`, sin DEFAULT: un cliente nuevo lo declara), `estado`, `plan`, `nit`, marca (`logo_url`, `color_primario` `#RRGGBB`), `zona_horaria` y `moneda`; `modulos` es el catálogo global (id `<vertical>.<nombre>`, `core.*` sin vertical; `base` = viene con el vertical) y `tenant_modulos (tenant_id, modulo_id, activo, config)` lo que tiene activo cada cliente. `getTenantActual()` (`src/modules/core/tenants/tenant.queries.ts`, `React.cache()`) devuelve el cliente con `modulos: string[]`, que desde FIN-91 salen de la RPC `mi_sesion()` compartida con `getSesion()` (ver *Sesión unificada*); `lib/auth/get-tenant.ts` queda solo como re-export `@deprecated`.
  - **Tres piezas, mismo patrón que los roles**: la barra lateral solo recibe las entradas que `getNavParaSesion()` deja pasar según los módulos activos del cliente (ver *Registro de módulos y barra lateral (FIN-92)*; `tieneModulo()` es la función pura de `core/tenants/modulos.ts`, importable del fichero directo, no del barril `@/modules/core`, que arrastra código de servidor); la página redirige con `requireModuloPagina()` (`core/tenants/tenant.guards.ts`); y **cada Server Action llama `requireModulo('ganaderia.arriendos')`** (`core/tenants/tenant.guards.ts`, lanza `AuthorizationError`; obligatorio: son endpoints POST públicos). Esconder la opción es cosmético.
  - **`MODULOS`** (`as const` en `core/tenants/modulos.ts`) es la lista de ids del código y da el tipo `ModuloId`. Tiene que coincidir con el seed de `public.modulos`: `modulos.test.ts` lo compara contra el SQL de la migración (siempre) y contra la base local (si está levantada). Un módulo nuevo = migración con su fila en `modulos` + su id en `MODULOS`.
  - **Activar un módulo a un cliente es una fila, sin deploy**: `insert into public.tenant_modulos (tenant_id, modulo_id) select id, 'ganaderia.arriendos' from public.tenants where slug = 'el-velero';` (`update … set activo = false` para quitarlo). Lo hace la plataforma (SQL editor o `service_role`): **ningún cliente puede escribir** en `modulos` ni en `tenant_modulos` —solo `SELECT`, y de su propio `tenant_id`—, ni siquiera un admin dándose módulos a sí mismo. Se ve al recargar; `tenant_modulos` está auditada (`audit.log`).
  - `public.tenant_tiene_modulo(p_modulo text)` (`STABLE`, `SECURITY INVOKER`) existe para las políticas RLS de tablas de módulos **opcionales** (`using (public.tenant_tiene_modulo('…'))`); hoy ninguna política la usa, `arriendos` sigue aislándose solo por `tenant_id`.
  - **Marca**: el `admin` del cliente puede `UPDATE` de su propia fila de `tenants`, **solo** `nombre`, `logo_url` y `color_primario` (`GRANT UPDATE (…)` + política `tenants_update_marca`; `plan`, `estado`, `vertical`… dan `42501`). `tenants.updated_at/updated_by` los pone el trigger `set_updated`.
  - La cooperativa existe como cliente `toca-lacteos` (`vertical = 'cooperativa'`, con sus 4 módulos). Sus tablas siguen sin `tenant_id` y sus roles en `roles` con `tenant_id` NULL (Fase 2), pero desde FIN-90 sus usuarios tienen membresía en él y `getTenantActual()` lo devuelve.

**Membresías y roles genéricos (FIN-90)**: conviven dos modelos de acceso hasta la Fase 2 (*expand*).
- **`roles` (legacy) manda en las tablas existentes.** Las 14 tablas de finca, las de cooperativa y sus políticas siguen exigiendo `rol_actual()` (`admin|user|viewer`, `cooperativa_*`); `rol_actual()` **no cambió**. `requireRole()`/`getUserRole()` también leen de `roles`.
- **`tenant_members` (nuevo) manda en las tablas nuevas** (núcleo y café): `(user_id, tenant_id)` N:M con `rol public.rol_tenant` (`owner|admin|operativo|viewer`), `permisos text[]` (finos, p. ej. `cafe.tarifas.editar`) y `activo` (no se borra: se desactiva). `platform_admins` (quien entra a cualquier tenant, para soporte) y `user_tenant_activo` (el tenant que eligió el usuario) no son accesibles desde la API; solo las funciones.
- **`roles` → `tenant_members` es automático**: el backfill de la migración y el trigger `sincronizar_membresia` (insert/update/delete en `roles`) mapean `admin→admin`, `user→operativo`, `viewer→viewer`, y `cooperativa_admin→admin` / `cooperativa_user→operativo` **en `toca-lacteos`**. Las altas manuales de siempre (SQL sobre `roles`) siguen valiendo. Un rol de finca sin `tenant_id` no genera membresía (no aborta). Un `owner`, o un usuario con varias membresías, se crea con `insert` directo en `tenant_members`. En la Fase 2 `roles` desaparece y las políticas legacy pasan a `rol_en_tenant()`.
- **Funciones de sesión** (todas `STABLE SECURITY DEFINER`, `search_path = ''`, sin `anon`): `tenant_actual()` (misma firma que antes; resuelve 1) el tenant elegido en `user_tenant_activo` si sigue siendo suyo o es platform admin, 2) su única membresía activa, 3) `roles.tenant_id`), `rol_en_tenant()` (rol de la membresía en el tenant actual; `owner` para un platform admin sin membresía), `es_platform_admin()`, `tiene_permiso(p)` (`owner`/`admin` o `p = any(permisos)`) y `cambiar_tenant_activo(p_tenant)` (volátil; lanza `tenant_no_permitido` / `tenant_no_encontrado` con `P0001`, ya en `mensajes.ts`).
- **La cooperativa ya tiene tenant** (`tenant_actual()` = `toca-lacteos`, antes `NULL`). **No uses `tenant == null` como señal de "es cooperativa"**: usa el rol (`getUserRole()`) o `tenant.vertical`. Las políticas de finca siguen exigiendo `rol_actual() in ('admin','user','viewer')`, así que un usuario de cooperativa no ve ni escribe animales/gastos aunque comparta la función `tenant_actual()`.
- **Platform admin y tablas legacy**: un platform admin sin fila en `roles` ve todos los `tenants` y entra a cualquier tenant, pero **no lee las tablas legacy** (`rol_actual()` es NULL). Solo lo resolverá la Fase 2; para soporte puntual dale también un rol en `roles`. `mi_sesion()` resuelve el cliente con `tenant_actual()` y filtra por su id, porque `tenants_select` le deja ver todos.
- **RLS de las tablas nuevas**: `tenant_members` (SELECT la propia fila o, siendo `owner`/`admin`, las del tenant actual; INSERT/UPDATE solo `owner`/`admin`, y solo un `owner` asigna o toca `owner`; UPDATE solo de `rol`/`permisos`/`activo`; nadie borra) y `user_tenant_activo` (solo la propia fila, escritura solo vía `cambiar_tenant_activo`). `tenants_select` suma al platform admin; `audit.log` e `historial_cambios()` exigen `rol_en_tenant() in ('owner','admin')` (el email sale de `tenant_members`).
- **Altas manuales**: la gestión de usuarios sigue sin UI (Fase 1); el selector de tenant llegó con FIN-91 (ver *Sesión unificada*). Para dar de alta a un platform admin (manual, por SQL en cada entorno, nunca en una migración): `insert into public.platform_admins (user_id) select id from auth.users where email = '…';`.

**Sesión unificada (FIN-91)**: `getSesion()` (`src/modules/core/auth/sesion.ts`, módulo plano con `React.cache()`, **no** `"use server"`) es **el único punto de entrada a la sesión para código nuevo**: devuelve `{ user, tenant, rolTenant, rolLegacy, esPlatformAdmin, membresias }` (o `null` sin usuario / sin cliente activo con rol). No combines `getCurrentUser()` + `getUserRole()` + `getTenantActual()` en código nuevo.
- **Dos round-trips por request, en total**: `getCurrentUser()` (Auth) + la RPC `public.mi_sesion()` (`STABLE SECURITY DEFINER`, `search_path = ''`, sin `anon`), que devuelve en un solo json el cliente activo con sus módulos, `rol_tenant`, `rol_legacy`, `es_platform_admin` y las membresías activas (nombre/slug/vertical, que `tenants_select` no deja ver por RLS; de ahí el `SECURITY DEFINER`, que solo lee lo del propio `auth.uid()`). Si no hay membresía en el cliente activo, `rol_tenant` cae al equivalente de su rol de `roles` (mismo mapeo del backfill). `getTenantActual()` ya no consulta por su cuenta: sale de `getSesionBase()`.
- **`getSesionBase()`** es la misma lectura sin exigir cliente activo (`tenant`/`rolTenant` pueden ser `null`): la usan el layout —para mostrar el selector a un platform admin que aún no eligió cliente— y `requirePlatformAdmin()`. Fuera de eso, `getSesion()`.
- **Guards** (`core/auth/guards.ts`): `requireSesion()` (redirect a `/login`; páginas/layouts), `requireRolTenant(['owner','admin'])` (lanza `AuthorizationError`; **Server Actions de módulos nuevos**, en lugar de `requireRole()`) y `requirePlatformAdmin()`. `requireRole()` y `checkRoutePermission()` siguen intactos para las pantallas legacy, marcados `@deprecated` para código nuevo. Los guards no sustituyen a RLS, que sigue siendo la frontera real.
- **Selector de cliente**: `TenantSwitcher` (`core/tenants/components/`, `cmdk`) se monta en el header solo si `membresias.length > 1` o `esPlatformAdmin`; el platform admin busca entre todos los clientes con la RPC `platform_listar_tenants()` (`SECURITY DEFINER`, verifica `es_platform_admin()` por dentro y lanza `no_autorizado` a cualquier otro). El Server Action `cambiarTenantActivo(tenantId)` llama a `cambiar_tenant_activo` con `callRpc`, hace `revalidatePath('/', 'layout')` y `redirect('/dashboard')`; **la autorización vive en la RPC** (rechaza un `tenantId` ajeno con `tenant_no_permitido`), no en la UI. Sin cliente activo (platform admin recién creado, o cuenta sin membresía ni rol) el layout muestra `SinClienteActivo` en vez de redirigir a `/login`: el proxy devuelve a `/dashboard` a quien ya tiene sesión y entraría en bucle.
- **Platform admin en un cliente legacy**: sin fila en `roles` entra pero las políticas legacy (`rol_actual()`) no le dejan ver datos; el layout (`soporteLimitado`) muestra el aviso "Vista de soporte limitada en módulos legacy" en vez de pantallas vacías sin explicación. Solo lo resolverá la Fase 2.

**Plantilla RLS para TABLAS NUEVAS** (núcleo y café; usan membresías, no `roles`). `(select …)` hace que Postgres evalúe la función una vez por consulta y no por fila:

```sql
create table <schema>.<tabla> (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.tenant_actual() references public.tenants,
  -- ... columnas de negocio y la convención created_at/created_by/updated_at/updated_by
);
create index on <schema>.<tabla> (tenant_id);
alter table <schema>.<tabla> enable row level security;

-- lectura: cualquier miembro del tenant actual
create policy <tabla>_select on <schema>.<tabla> for select to authenticated
  using (tenant_id = (select public.tenant_actual()));
-- escritura operativa: owner, admin y operativo (no viewer)
create policy <tabla>_insert on <schema>.<tabla> for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'));
create policy <tabla>_update on <schema>.<tabla> for update to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'))
  with check (tenant_id = (select public.tenant_actual())
              and (select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'));
-- configuración (tarifas, maestros): sustituye la lista por ('owner', 'admin'),
-- o usa `(select public.tiene_permiso('cafe.tarifas.editar'))` para un permiso fino.
```

Y su test pgTAP de aislamiento (ver `supabase/tests/50_membresias.test.sql`): crea los usuarios/membresías **dentro** del test, comprueba que otro cliente no ve ni escribe, que un `viewer` no escribe y que un usuario con dos membresías ve lo del tenant que elige con `cambiar_tenant_activo()`.

Roles: `"admin" | "user" | "viewer" | "cooperativa_admin" | "cooperativa_user"` — Postgres enum type `rol`, stored in the `roles` table (`roles.user_id` → `roles.rol`), not in Supabase Auth metadata. There is no UI/Server Action that writes to `roles` — assigning a role to a new user is a manual step (Supabase dashboard/SQL) by the project owner. `getUserRole()` (`lib/auth/get-user-role.ts`) fails **closed**: a user with no row in `roles`, or a transient lookup error, gets `null` (no access), never an implicit role. New self-registered users (`/signup` is open, unauthenticated) therefore have zero dashboard access until an admin manually inserts their `roles` row.

**Server vs. Client Components**: Pages and layout containers are Server Components that fetch data. Interactive UI (forms, modals, state) uses `"use client"`. The `dashboard-layout-client.tsx` is the client boundary for the dashboard shell; it receives `userRole` as a prop from the server layout.

**Forms** use React Hook Form + Zod (via `zodResolver`). Schemas live in `features/[feature]/schemas/`.

**Data tables** use the shared `components/shared/data-table.tsx` wrapper around TanStack React Table v8 with built-in column filtering, sorting, and pagination.

**Read-only detail modals**: Tables that need a view-only mode use an inline detail component (not the form) rendered inside `EntityModal`. The eye icon (`Eye` from lucide-react) triggers it and is visible for all roles including `viewer`.

**Supabase one-to-one joins**: When a table has a `UNIQUE` FK (e.g. `pagos.gasto_id`), PostgREST may return the embedded resource as an object rather than an array. Always handle both cases: `Array.isArray(row.rel) ? row.rel[0] : row.rel ?? null`.

**Clientes Supabase tipados** (`server.ts`, `client.ts`, `admin.ts` llevan `<Database>` de `database.types.ts`): las filas y los `select` con joins salen tipados, así que **no anotes `(row: any)`** en callbacks — se infiere solo, y `@typescript-eslint/no-explicit-any` es un error de lint. Para las relaciones embebidas que pueden venir como objeto o como array usa `aUno()` / `aLista()` de `lib/supabase/relaciones.ts` (y `Rel<T>` para tipar una fila a mano en un mapper), en vez de repetir `Array.isArray(...)`. Los campos que en BD son `text` con un CHECK (`estado`, `metodo_pago`, `responsable`…) llegan como `string`: se estrechan con un cast al tipo de `@/types`, comentando que es el CHECK. Si cambias el esquema, regenera los tipos (`pnpm db:types`) o los `select` dejarán de compilar — es el aviso que se busca.

**PostgREST row cap**: PostgREST has a `max_rows` cap (default 1000). For queries that may exceed this, paginate using `.range(from, from + PAGE - 1)` in a `while` loop until `data.length < PAGE`. The `informes-cooperativa` API route uses this pattern (`fetchAllRecolecciones`). Several dashboard pages do an un-paginated `.select()` over a table's full history (e.g. `dashboard/page.tsx`'s `gastos`/`ingresos`/`extracciones_leche` fetches) — these are subject to the same 1000-row cap and will silently truncate once a table grows past it; only `informes-cooperativa` and its `/preview` JSON counterpart (both go through `buildInformeData`) currently paginate.

**Deduplicate `supabase.auth.getUser()` per request**: it always does a real round-trip to Supabase Auth (unlike `getSession()`, which just decodes the cookie locally). `getCurrentUser()` (`lib/auth/get-user-role.ts`) wraps it in `React.cache()`; `getUserRole()` calls `getCurrentUser()` internally. Always import `getCurrentUser` instead of calling `supabase.auth.getUser()` directly in a Server Action/Route Handler/Server Component that might run after `getUserRole()`/`requireRole()` already resolved the session — calling the raw method again is a second network round-trip that `cache()` would have deduplicated for free.

**`next/dynamic` with `{ ssr: false }`**: only allowed inside a `"use client"` module — calling it directly in a Server Component (e.g. a `page.tsx`) fails the build with "`ssr: false` is not allowed with `next/dynamic` in Server Components." Put the `dynamic()` calls in a small client wrapper file (see `chart-wrappers.tsx` / `cooperativa-chart-wrappers.tsx`) and import the already-wrapped component into the page.

**Offline sync mutex** (`hooks/useSyncQueue.ts`): the "is a sync already running" lock is a `useRef`, not a `useState` — a ref is read/written synchronously, so two near-simultaneous `syncNow()` calls (e.g. the mount effect and the reconnect-timer effect both firing) can't both pass the check before either sets the lock. A `useState`-based lock would race here because `setState` is batched/deferred. `isSyncing` (the `useState`) only drives the UI ("Sincronizando…" badge); never use it as the actual guard.

**Offline sync lost-update guard** (`lib/offline/sync.ts`): `syncQueue()`/`syncPagos()` snapshot the `pending` Dexie records, await the network round-trip, then must re-check the record in IndexedDB still matches the snapshot before marking it `synced` — if the conductor edited it again while the request was in flight, blindly overwriting `syncStatus` would silently drop that newer edit (it would never be retried, since it's no longer `pending`). Any new offline-sync write path must follow this same "compare-before-commit" pattern, not just flip the status on a successful response. All sync triggers should go through `useSyncQueue()`'s `syncNow()` (the guarded entry point) rather than calling `syncQueue()`/`syncPagos()` directly, to avoid two syncs running concurrently.

**Fichas de animales**: `vacas` y `toros` se unificaron en la tabla `animales`; la ficha vive en `/dashboard/animales/[id]` (las rutas `vacas/[id]` y `toros/[id]` solo redirigen) y contiene:
- información básica (incluye **días en leche** y **concentrado por ordeño**, ambos solo en hembras)
- genealogía (madre/padre con enlaces cruzados)
- crías (incluyendo estados y alta/baja)
- alertas pendientes de ese animal
- historial de eventos

**Doble estado del animal** (`estado_productivo` + `estado_reproductivo`, enums de Postgres): sustituyen al antiguo campo único `estado`, **eliminado de `animales` el 2026-08-04** — `supabase/legacy/2026-08-04-drop-animales-estado.sql` documenta el DROP y guarda el rollback, y los valores originales siguen en `vacas_legacy.estado`/`toros_legacy.estado`. Productivo `leche → levante_1 → levante_2 → produccion ⇄ secado` (machos: `… → reproductor`); reproductivo, solo hembras, con dos entradas: la novilla sube `pre_puber → puber → servicio` (derivado del tramo productivo, no de eventos) y la vaca parida `pre_servicio → servicio`; desde `servicio` el flujo es `→ por_confirmar → cargada | rechequeo`; **`vacia` se eliminó de `estado_reproductivo` el 2026-08-07**, y del `resultado` de la palpación el 2026-09-07 (`supabase/legacy/2026-09-07-resultado-palpacion-quitar-vacia.sql`): una palpación sin preñez se registra directamente con `resultado = "servicio"`, que coincide 1:1 con el estado al que mueve la vaca — `estadoDesdeEvento()` ya no traduce nada, solo copia `resultado` al eje reproductivo (ver `ResultadoPalpacion` en `types/index.ts`). **`src/lib/animales/estados.ts` es la única fuente de verdad**: etiquetas, colores, hex, estados válidos por sexo, constantes de plazos (`MESES_SECADO`, `MESES_PARTO`, `DIAS_TOPIZADO`, `DIAS_CELO_POST_PARTO`, `DIAS_CICLO_CELO`), `estadoProductivoPorEdad()`, `estadoDesdeEvento()` y `formatEdad()` (edad en texto para la ficha — se calcula en el servidor y se pasa ya formateada, porque `parseFechaDB` resuelve en la zona local y en Vercel es UTC frente al UTC-5 del navegador). Antes estos mapas estaban duplicados en cuatro componentes — no los reintroduzcas localmente.

**Días en leche (DEL)**: **no se guarda en la tabla** — `calcularDiasEnLeche()` (`lib/animales/estados.ts`, función pura) lo deriva en cada lectura, igual que las alertas. La lactancia **arranca** con un `parto` o `aborto` y **se cierra** con un `secado` (contador a 0); gana el evento más reciente de esos tres. Se cuenta desde `eventos_animal.fecha`, nunca desde `created_at` ni desde la fecha del cambio de estado. Además devuelve 0 si `estado_productivo === "secado"` aunque no haya evento de secado, porque el estado se puede poner a mano. Sin parto/aborto registrado devuelve `null` y la ficha muestra "Sin parto registrado" en vez de inventar un número. Se calcula **en el servidor** y se pasa ya resuelto a la ficha, por la misma razón que `formatEdad()` (zona horaria de Vercel vs. navegador).

**Concentrado por ordeño** (`animales.concentrado_por_ordeno`, `real` nullable): cantidad de pienso por **cada** ordeño del día, no el total diario. Es manual y puramente informativo — ningún evento ni el cron lo tocan. Solo aplica a hembras: el formulario lo oculta para machos y tanto `createAnimal` como `updateAnimal` lo fuerzan a `null` si `sexo === "macho"`. `null` = sin definir, distinto de 0.

**Sangre (% de pureza, solo El Velero)**: `animales.sangre` es **texto compuesto**, no columnas: `"AYR:50% x HOL:30% x JER:20%"`. `construirSangre()`/`parseSangre()` (`lib/animales/razas.ts`) lo montan y lo deshacen a partir de una lista de `{raza, pct}` — hasta `MAX_COMPONENTES_SANGRE` (3) razas —, y `parseSangre()` devuelve `null` si el texto no encaja, con lo que el formulario lo trata como "sin definir" en vez de romperse.
- Las reglas del selector viven en `lib/animales/sangre.ts` (puro, sin React) y `SangreSelector` solo las pinta: `normalizarSangre()` es el único camino por el que pasan los cambios, así que lo que se ve y el texto que se guarda no se pueden separar. Autocompleta cada fila hasta el 100% mientras el usuario no la escriba a mano (`manual`), **permite pasarse del 100%** (la finca a veces lo necesita: se avisa en ámbar, no se bloquea) y muestra la **tercera raza solo si las dos primeras suman menos de 100**, limpiándola si dejan de hacerlo para que no quede un porcentaje oculto contando en el valor.
- `SangreSelector` (`features/animales/components/`) lo comparten el alta/edición de animal y el subformulario de cría del evento de parto. Antes el bloque estaba duplicado en los dos — no lo reintroduzcas en local.

**Eventos por animal**: El módulo `features/eventos-animal` centraliza `getEventosAnimal()`, `createEventoAnimal()`, `updateEventoAnimal()`, `deleteEventoAnimal()`, la validación Zod, el formulario (`EventForm`, con campos condicionales por tipo) y el timeline (`EventsTimeline`). Añadir un `tipo_evento` obliga a tocar 5 sitios: el CHECK de Postgres, `TipoEvento` en `types/index.ts`, `eventoSchema`, `TIPO_LABELS` en `event-form.tsx` y `TIPO_CONFIG` en `events-timeline.tsx`. Si además mueve el estado del animal, súmale `estadoDesdeEvento()` y `TIPOS_EVENTO_CON_TRANSICION` en `lib/animales/estados.ts` (y `TIPOS_EVENTO_PARA_ALERTAS` si lo necesita `calcularAlertas()`).

**Revacunación** (`lib/animales/revacunacion.ts`, fuente única): el evento `vacunacion` lleva `requiere_revacunacion` (Sí/No), `periodo_revacunacion` (`1_mes` | `6_meses` | `1_anio` | `personalizada`) y `fecha_revacunacion`.
- La fecha la **calcula el Server Action**, no el cliente: `filasRevacunacion()` en `eventos.actions.ts` la deriva con `calcularFechaRevacunacion()` desde la fecha del evento y el plazo, así que corregir la fecha de la vacunación arrastra la de revacunación. El formulario llama a la misma función pura solo para previsualizarla, y únicamente envía `fecha_revacunacion` cuando el plazo es `personalizada`. `filasEvento()` se arma **antes** de tocar el inventario de pajillas porque puede lanzar.
- Se guarda el plazo además de la fecha precisamente para poder recalcularla, y el "No" explícito se persiste: `false` es "no hace falta", `NULL` son las vacunaciones anteriores a este control.
- Cambiar el tipo de evento al editar pone los tres campos a NULL, para no dejar viva la alerta de una vacunación que ya no existe. Los CHECK de la tabla (`eventos_animal_revacunacion_check`) repiten la regla en la base.

Al crear/editar un evento, `aplicarTransicionEstado()` mueve el estado del animal según `estadoDesdeEvento()`. Es un modelo **delta hacia adelante**: solo escribe un eje si no existe ya un evento *posterior* que lo gobierne, de modo que registrar con retraso una inseminación antigua no revierte una vaca que ya parió, y un estado puesto a mano solo lo pisa un evento más nuevo.

Al borrarlo, `recalcularEstadoTrasBorrado()` hace lo inverso: si el evento borrado era el que gobernaba un eje (nada posterior lo pisa), ese eje vuelve al efecto del evento anterior que lo gobierne; si no queda ninguno, el estado se deja intacto en vez de inventar un valor. `eventos_animal` tiene política RLS de DELETE desde el 2026-08-05 (`admin`/`user`) — antes el borrado era un no-op silencioso, por lo que `deleteEventoAnimal()` comprueba `count === 0` para no dar por buena una fila no borrada.

**Inventario de pajillas** (`features/inventario/pajillas`): el consumo de stock ocurre **al registrar la inseminación**, no al dar de alta la cría. `createEventoAnimal` descuenta 1 del lote antes de insertar (y lo devuelve si el insert falla), `updateEventoAnimal` compensa al cambiar de lote y `deleteEventoAnimal` reintegra la pajilla; todo pasa por `ajustarStockPajilla()`, que acota el resultado a `[0, cantidad]`. `nombreToroDeLote()` en el alta de la cría ya **no** toca el inventario — hacerlo restaba dos pajillas por una sola monta.

El evento referencia el **lote** (`pajillas.id`), no `toro_ref_id`. Ese campo es texto libre y está repetido (en producción "NA" lo comparten cinco toros y "TRO-001A" otros dos), así que agrupar por él fusionaba lotes de toros distintos y escondía inventario. Usa `getLotesPajillas()` para cualquier selector; `getPajillasPorToro()` queda solo para la tarjeta resumen y agrupa por nombre+ref. El selector oculta los lotes agotados salvo el que ya tenga seleccionado el evento que se edita, que puede estar a 0 justo porque esa inseminación gastó la última.

`aborto` (añadido el 2026-08-05) cierra la gestación igual que un `parto`: deja la vaca en `produccion` + `pre_servicio`, con lo que decaen solas las alertas de parto probable y secado (ambas exigen `cargada`) y arranca la de celo a los `DIAS_CELO_POST_PARTO`. `TIPOS_EVENTO_FIN_GESTACION` agrupa ambos para `calcularAlertas()`.

**Alertas** (`features/alertas`): 5 tipos — parto probable, pasar a secado, topizado, celo y revacunación. **No se guardan en tabla**: `calcularAlertas()` (`lib/calcular-alertas.ts`, función pura) las deriva de `animales` + `eventos_animal` en cada lectura, y una alerta desaparece cuando existe el evento que la resuelve. Se muestran en la campana del header, una tarjeta del dashboard y la ficha del animal; no hay página `/dashboard/alertas`.
- **Secado y parto se cuentan desde `eventos_animal.fecha` del último evento `inseminacion`/`monta`** — nunca desde la palpación, `created_at` ni la fecha del cambio de estado. Ambas solo aparecen con la vaca ya en `cargada`; si está cargada sin evento de servicio, la ficha muestra "Falta registrar la inseminación" en lugar de inventar fechas (`faltaRegistrarServicio()`).
- **Revacunación**: la única con **ventana propia**. El resto se emiten siempre y las recorta el horizonte del consumidor (`HORIZONTE_ALERTAS_DIAS` = 7 en campana y dashboard); la revacunación solo se emite a `DIAS_AVISO_REVACUNACION` (8) días o menos de `fecha_revacunacion`, y `dentroDelHorizonte()` la exime del recorte a 7 — si no, el primer día de su ventana no llegaría a la campana. Añade el `HORIZONTE_PROPIO` correspondiente si algún tipo nuevo necesita lo mismo. Va **antes** del `continue` por sexo dentro de `calcularAlertas()`: los machos también se vacunan. Solo la manda la **última** vacunación del animal, de modo que registrar la siguiente cierra sola la anterior; el reverso es que dos vacunas en paralelo con plazos distintos no se pueden seguir por separado (no hay catálogo de vacunas, el detalle va en `descripcion`). No es resoluble desde el panel: se cierra registrando la vacunación real desde la ficha, que trae su propio control de plazo.
- `getAlertas()`/`getAlertasAnimal()` viven en `alertas.queries.ts` (módulo plano con `React.cache()`, **no** `"use server"` — `cache()` no se puede exportar desde un fichero de Server Actions); layout, dashboard y ficha comparten una única lectura por request. Solo la mutación `resolverAlerta()` está en `alertas.actions.ts`.

**Avances automáticos por calendario** (`lib/animales/sincronizar-estados.ts`): `sincronizarEstadosAnimales()` agrupa dos pases. (1) **Crianza** (`sincronizarEstadosPorEdad`), que mueve dos ejes a la vez: el productivo `leche → levante_1 → levante_2` según `fecha_nacimiento`, y en hembras el reproductivo derivado de ese tramo — `leche → pre_puber`, `levante_1 → puber`, `levante_2 → servicio` (`estadoReproductivoPorCrianza()`). Esa escalera juvenil (`ORDEN_REPRODUCTIVO_JUVENIL`) solo avanza y solo mientras la vaca siga dentro de ella: en cuanto un evento la lleva a `por_confirmar`, `cargada` o `pre_servicio` deja de gobernarla, para no devolver a `servicio` una novilla ya inseminada en levante 2. `resolverEstadoReproductivo()` aplica la misma derivación al crear/editar un animal, para que una cría no salga sin estado hasta el cron del día siguiente. (2) **Pase a servicio** (`sincronizarPaseAServicio`): `pre_servicio → servicio` cumplidos `DIAS_PASE_A_SERVICIO` (61) días desde el último `parto`/`aborto` — nunca desde `created_at` ni desde la fecha del cambio de estado; una vaca en `pre_servicio` sin ese evento no tiene fecha base y se queda igual. El UPDATE lleva un `.eq("estado_reproductivo", "pre_servicio")` extra para no pisar un evento que haya cambiado el estado entre el SELECT y la escritura. **`DIAS_PASE_A_SERVICIO` = `DIAS_CELO_POST_PARTO` + 1 a propósito** (antes era una sola constante): el día 60 es la fecha objetivo de la alerta de celo y la vaca debe verse todavía en `pre_servicio`; el pase ocurre el 61, justo cuando esa alerta pasa a "vencida". La alerta de celo cubre `pre_servicio` **y** `servicio`, así que el pase no la apaga — solo se resuelve al registrar el celo o el servicio; no la filtres solo por `pre_servicio`. Ambos pases los ejecuta el cron diario `GET /api/cron/animales-estados` (Bearer `CRON_SECRET` + `createAdminClient()`, declarado en `vercel.json`) y, a mano, el botón "Recalcular estados" del listado. Es **monótono a propósito**: nunca retrocede, para no pisar una clasificación manual más avanzada que la fecha de nacimiento (hay animales con fecha aproximada). Usa `differenceInMonths` (meses cumplidos), no `differenceInCalendarMonths`, que contaría un animal nacido el 20/03 como de 5 meses ya el 01/08.

El `schedule` de `vercel.json` está en **UTC**: `"0 11 * * *"` = 6:00 a.m. en Colombia (UTC-5 todo el año, sin horario de verano). Vercel Cron **solo ejecuta los jobs desde el deploy de producción** — en los previews de `develop` nunca se dispara solo, ahí únicamente funciona el botón "Recalcular estados". Vercel añade el header `Authorization: Bearer $CRON_SECRET` automáticamente si la variable existe en el proyecto; si falta, la ruta responde `500` y si no coincide, `401`.

**Zod schemas**: `z.enum()` y `z.number()` en esta versión de Zod no aceptan `required_error`/`invalid_type_error`; usar `message`.

### Cooperativa Module

The cooperativa module manages a milk cooperative: farms (fincas), collection routes (rutas), driver itineraries (itinerarios), daily milk pickups (recolecciones), per-finca payments (pagos-cooperativa), user-to-itinerario assignments, and Excel report generation.

**Features and pages:**

| Feature | Route | Access |
|---|---|---|
| `fincas-cooperativa` | `/dashboard/fincas-cooperativa` | `cooperativa_admin` |
| `rutas-cooperativa` | `/dashboard/rutas-cooperativa` | `cooperativa_admin` |
| `itinerarios` | `/dashboard/itinerarios` | `cooperativa_admin` (manage), `cooperativa_user` (view own) |
| `recolecciones` | `/dashboard/recolecciones` | `cooperativa_admin`, `cooperativa_user` |
| `pagos-cooperativa` | `/dashboard/pagos-cooperativa` | `cooperativa_admin` |
| `usuarios-cooperativa` | `/dashboard/usuarios-cooperativa` | `cooperativa_admin` |
| `informes-cooperativa` | `/dashboard/informes-cooperativa` | `cooperativa_admin` |
| Overview | `/dashboard/cooperativa` | `cooperativa_admin`, `cooperativa_user` |

**`rutas` vs. `itinerarios`**: `rutas_cooperativa`/`rutas_fincas` is the coarser grouping used for Excel reports (`informes-cooperativa`'s `ruta` type) and for searching fincas in `pagos-cooperativa`. `itinerarios`/`itinerarios_fincas` is the actual conductor-facing assignment: `user_itinerarios` (la tabla `user_rutas` ya no existe) is what `usuarios-cooperativa` writes to, what `getItinerarioAsignado()`/the offline conductor view read from, and what `get_cooperativa_users()` joins against. A finca can belong to both a ruta and an itinerario independently — they aren't the same grouping.

**Data isolation for `cooperativa_user`**: In `getRecolecciones()`, if the caller's role is `cooperativa_user`, the query is automatically scoped to the fincas belonging to their assigned itinerario (`user_itinerarios` → `itinerarios_fincas`). If no itinerario is assigned, the function returns `[]`.

**Finca ordering**: both `rutas_fincas` and `itinerarios_fincas` have an `orden` column for drag-and-drop ordering (`FincasOrderEditor` / `itinerario-fincas-editor.tsx`).

**Recolecciones uniqueness**: `(finca_id, fecha)` has a UNIQUE constraint. The creation form excludes fincas that already have a collection on the selected date.

**Offline-first conductor flow** (`/dashboard/recolecciones` when role is `cooperativa_user`, rendered by `RutaConductorView`): IndexedDB (Dexie, `lib/offline/db.ts`) caches the assigned itinerario's fincas/precios and queues recolecciones + pago-estado changes locally so the conductor can keep working with no signal. `useSyncQueue()` syncs (`lib/offline/sync.ts`) on mount and on reconnect; see the offline-sync mutex/lost-update notes under Key Patterns before touching this code. `GET /api/itinerario-data` is the data source (always `NetworkOnly` in the service worker — never cached, since a cached response could replay yesterday's `syncedToday`). `POST /api/recolecciones-sync` and `POST /api/pagos-sync` upsert the queued changes; both are gated to `cooperativa_user`/`cooperativa_admin` via `getUserRole()`.

**Pagos por finca** (`pagos-cooperativa` feature, table `pagos_finca`): each `fincas_cooperativa` row has a `metodo_pago` (`conductor` | `punto_venta` | `gerente`) that's the default `responsable` for collecting payment. Flow: `getFincasConLitrosPorRuta(rutaId, fechaInicio, fechaFin)` finds fincas with recolecciones in a period (grouped by itinerario, with conductor emails resolved via `get_cooperativa_users()`); `activarPago(items, fechaInicio, fechaFin)` inserts `pagos_finca` rows (`estado: "pendiente"`) for the selected fincas, with `responsable` overridable per row. A pago's `estado` moves `pendiente` → `pagado` | `punto_venta` | `devuelto`, either by the conductor (offline-capable, only their own itinerario's `responsable: "conductor"` pagos — RLS-enforced, see below) or by an admin via `updateEstadoPago()` in the historial table. `getPagosHistorial(filters)` powers the filterable historial view (`historial-pagos-table.tsx`).

**Informe Excel**: `GET /api/informes-cooperativa` generates a single `.xlsx` with ExcelJS containing two sheets (unified in FIN-71 — payment vouchers used to be a separate download; `/api/comprobantes-pago` no longer exists). Supports four types: `finca` (single farm), `ruta` (all farms in a route), `itinerario` (all farms in an itinerario), `general` (all routes, grouped with subtotals). Auth-gated to `cooperativa_admin`. Supports both quincena mode (`quincena=1|2` + `mes` + `anio`) and free-range mode (`fechaDesde`/`fechaHasta`) for the Excel download; the `InformesForm` UI itself only exposes quincena mode for the download button (`"custom"` quincena disables it), custom range is only reachable via the preview.
- **Hoja 1 (resumen)**: top-left merged cells show the finca/ruta/itinerario name (row 1) and the generated period (row 2, `$A$2` — itinerario also appends `· Conductor: <email>` here), frozen above the header row (row 3, `ySplit: 3`). Columns: `ID` (1-based consecutivo, numbered continuously top-to-bottom — not reset per ruta section in `general`), `Finca`, `Ruta` (itinerario only — a finca's ruta can differ from its itinerario), day columns, `Precio/L`, `Total Litros`, `Precio Bruto`, `Des. Fedegan`, `Descuento almacén` (new — manual, defaults to `0`), `Precio Neto`. Every derived cell is a real Excel formula (`Total Litros = SUM(days)`, `Precio Bruto = Precio/L * Total Litros`, `Des. Fedegan = Precio Bruto * <pct>` with the per-route `getFedeganPct()` value baked in as a literal, `Precio Neto = Precio Bruto - Des. Fedegan - Descuento almacén`), including TOTAL/subtotal/grand-total rows (`general`'s grand total sums the individual subtotal-row cells, not a range, to avoid double-counting) — editing a day's liters by hand recalculates everything downstream without regenerating the report.
- **Hoja 2 (comprobantes de pago)**: compact 6-vouchers-wide × 10-rows-tall grid (2 Excel columns per voucher, no gap rows between bands), landscape — same dimensions as the reference format "Formato Reportes y Pagos.xlsx" this ticket restored (the old `/api/comprobantes-pago` 3×3 portrait grid was reported as noticeably bigger than expected). Every voucher cell is a formula referencing Hoja 1 directly by row (ID, Finca, Total Litros, Precio Bruto, Descuento almacén, Des. Fedegan) plus a manual `Saldo Anterior` (defaults `0`) and a `Total` formula — so a Descuento almacén edited on Hoja 1 updates its voucher automatically. `buildSheet1Simple`/`buildSheet1Itinerario`/`buildSheet1General` each return the written finca row numbers (`voucherRows`) and the resolved column layout (`ColLayout`, since itinerario's extra Ruta column shifts every later column by one) that `buildSheet2Comprobantes` needs to build these cross-sheet references.

**Shared cooperativa lib** (`lib/cooperativa/recolecciones.ts`): exports `fetchAllRecolecciones(supabase, fincaIds, start, end)` (paginated, bypasses PostgREST max_rows), `FEDEGAN_PCT = 0.0075`, `MESES` array, and `RecRow` type. `informe-data.ts` (shared by the preview API and the `informes-cooperativa` Excel export) imports from here. `cooperativa/page.tsx` and `recolecciones.actions.ts`'s `getRecolecciones()` each have their own near-identical paginated-fetch loop instead of reusing this helper — worth consolidating if touched again, but not currently broken.

**RLS policies**: every base table's RLS checks `roles.rol`, not just `TO authenticated`. Example, `recolecciones`:

| Operation | Allowed roles |
|---|---|
| SELECT | `admin`, `cooperativa_admin`, `cooperativa_user` |
| INSERT | `admin`, `cooperativa_admin`, `cooperativa_user` |
| UPDATE | `admin`, `cooperativa_admin`, `cooperativa_user` |
| DELETE | `admin`, `cooperativa_admin` |

`pagos_finca` is the one table with row-ownership policies beyond a flat role check: `cooperativa_admin` has full access; `cooperativa_user` can only SELECT/UPDATE rows for fincas in *their own* assigned itinerario (joins `roles` → `user_itinerarios` → `itinerarios_fincas`), and only UPDATE while `responsable = 'conductor'` and `estado = 'pendiente'`. Use this policy as the template for any future "user can only touch their own assignment" table.

**User-itinerario assignment**: `usuarios-cooperativa` uses `user_itinerarios` (upsert on `user_id`) and calls the `get_cooperativa_users` RPC (returns all users with `cooperativa_user` role + their assigned itinerario + email). That RPC is `SECURITY DEFINER` and must **never** be granted to `anon` or `PUBLIC` (Postgres grants `EXECUTE` to `PUBLIC` by default on function creation — revoking only the explicit `anon` grant is not enough, you also need `REVOKE EXECUTE ... FROM PUBLIC`) since it returns driver emails; it's deliberately granted to `authenticated` only. `getItinerarios()` additionally requires the caller's role be `admin`/`cooperativa_admin`/`cooperativa_user` before calling it, since farm-side roles (`user`/`viewer`) have no legitimate reason to read cooperative driver emails.

**Shared component**: `components/shared/finca-combobox.tsx` — searchable combobox for picking a finca, used in the informes form.

### Database Tables

| Table | Key columns |
|---|---|
| `extracciones_leche` | `id`, `fecha`, `litros_cantina` (se vende → ingreso), `litros_cria` (se queda para los terneros → gasto), `vacas_en_produccion` |
| `gastos` | `id`, `fecha`, `subconcepto_id` (FK), `valor`, `proveedor`, `numero_factura`, `pagado`, `observaciones`, `source` (NULL=manual, 'leche_cria' y 'arriendo_abono'=auto, mantenidos por su módulo) |
| `pagos` | `id`, `gasto_id` (UNIQUE FK→gastos), `forma_pago` (efectivo\|transferencia), `tipo_cuenta`, `banco`, `numero_cuenta` |
| `ingresos` | `id`, `fecha`, `subconcepto_id` (FK), `valor`, `observaciones`, `source` (NULL=manual, 'leche_extraccion'=auto) |
| `precios` | `id`, `created_at`, `valor`, `tipo` |
| `conceptos_gasto` + `subconceptos_gasto` | hierarchy for gastos categories |
| `conceptos_ingreso` + `subconceptos_ingreso` | hierarchy for ingresos categories |
| `animales` | `id` (UUID), `identificador` (text, **sin unique** — hay duplicados históricos, la unicidad por `(identificador, sexo)` se valida en código), `nombre`, `sexo` (enum `animal_sexo`), `raza` (enum `animal_raza`), `origen` (enum `vaca_origen`), `estado_productivo` (enum: leche\|levante_1\|levante_2\|produccion\|secado\|reproductor), `estado_reproductivo` (enum: pre_puber\|puber\|pre_servicio\|servicio\|por_confirmar\|rechequeo\|cargada, solo hembras), `fecha_compra`, `fecha_nacimiento`, `numero_registro`, `madre_id`/`padre_id` (FK→animales), `padre_pajilla_nombre`, `padre_alquiler_nombre`, `padre_alquiler_raza`, `nombre_largo` (solo El Velero), `madre_externa_nombre`, `sangre` (texto compuesto, solo El Velero), `concentrado_por_ordeno` (manual, solo hembras), `alta` |
| `eventos_animal` | `id`, `animal_id` (FK→animales, ON DELETE CASCADE), `animal_tipo` (vaca\|toro — vestigial, se deriva de `sexo`), `tipo_evento` (CHECK de 14 valores), `fecha`, `descripcion`, `responsable`, `resultado` (cargada\|rechequeo\|servicio, solo palpación/confirmación), `pajilla_id` (FK→pajillas, ON DELETE SET NULL — lote usado en la inseminación), `toro_id` (FK→animales), `requiere_revacunacion`/`periodo_revacunacion`/`fecha_revacunacion` (solo vacunación, con CHECK de coherencia), `created_at` |
| `pajillas` | `id` (UUID), `toro_nombre`, `toro_ref_id` (texto libre, **no es identificador**: hay refs repetidas como "NA"), `proveedor`, `fecha_compra`, `cantidad`, `cantidad_disponible`, `observaciones`, `created_at` |
| `arriendos` | `id` (UUID), `arrendatario`, `finca_nombre`, `fecha_inicio`, `fecha_fin`, `canon` (CHECK > 0), `observaciones`, `created_at` — CHECK `fecha_fin >= fecha_inicio`. El saldo **no** es columna |
| `arriendos_abonos` | `id` (UUID), `arriendo_id` (FK→arriendos, ON DELETE CASCADE), `fecha`, `valor` (CHECK > 0), `observaciones`, `gasto_id` (FK→gastos, ON DELETE SET NULL, único parcial), `created_at` |
| `vacas_legacy` / `toros_legacy` | Tablas previas a la unificación. **Ningún código las lee**; se conservan solo como respaldo del refactor — son el único sitio donde queda el `estado` antiguo (`jardin`\|`pre_jardin`\|`transicion`\|`produccion`\|`secado`) tras eliminarlo de `animales`. |
| `tenants` | `id`, `nombre`, `slug` (unique), `vertical` (enum `vertical`, sin DEFAULT), `estado` (enum `tenant_estado`), `plan` (text), `nit`, `logo_url`, `color_primario` (CHECK `#RRGGBB`), `zona_horaria`, `moneda`, `created_at`, `updated_at`/`updated_by` (trigger `set_updated`). Hoy: `villa-blanca`, `el-velero` (ganaderia) y `toca-lacteos` (cooperativa, solo fila) |
| `modulos` | `id` (text, `<vertical>.<nombre>`), `vertical` (NULL = núcleo), `nombre`, `descripcion`, `base`. Catálogo global sin `tenant_id`, lectura para `authenticated`, escritura solo plataforma |
| `tenant_modulos` | PK `(tenant_id, modulo_id)` + `id` (uuid único, solo para `audit.activar`), `activo`, `config` (jsonb), `activado_at`, `activado_por`. Lectura: el propio cliente; escritura: solo plataforma. Auditada |
| `series_consecutivo` | PK `(tenant_id, serie)` + `id` (uuid único, solo para `audit.activar`), `descripcion`, `formato` (`{serie}-{anio}-{n:4}`), `reinicia_anual`, `activo`. Lectura: miembros del tenant; escritura: `owner`/`admin`. Auditada |
| `consecutivos` | PK `(tenant_id, serie, anio)` (`anio = 0` si no reinicia), `ultimo`. FK a `series_consecutivo` (restrict). Solo la escribe `siguiente_consecutivo()`; nadie tiene INSERT/UPDATE/DELETE |
| `tarifas` | `id`, `tenant_id`, `concepto` (`cafe.trilla`), `valor` numeric(14,2), `unidad` (kg\|g\|unidad\|litro), `vigente_desde`, `observaciones`, `created_at/by`. **Append-only** (sin UPDATE; DELETE solo programadas). Auditada |
| `parametros` | PK `(tenant_id, clave)` + `id` (solo para `audit.activar`), `valor` jsonb, `updated_at/by`. Escribe `owner`/`admin`, solo el `valor`. Auditada |
| `roles` | `user_id`, `rol` (Postgres enum `rol`: `admin`\|`user`\|`viewer`\|`cooperativa_admin`\|`cooperativa_user`) |
| `fincas_cooperativa` | `id`, `nombre`, `precio_litro`, `activa`, `metodo_pago` (conductor\|punto_venta\|gerente), `created_at` |
| `rutas_cooperativa` | `id`, `nombre`, `created_at` |
| `rutas_fincas` | `ruta_id` (FK), `finca_id` (FK), `orden` (int) — unique (finca_id) |
| `recolecciones` | `id`, `finca_id` (FK), `fecha`, `litros`, `precio_litro`, `created_at` — unique (finca_id, fecha) |
| `itinerarios` | `id`, `nombre`, `created_at` |
| `itinerarios_fincas` | `itinerario_id` (FK→itinerarios), `finca_id` (FK→fincas_cooperativa), `orden` (int) |
| `user_itinerarios` | `user_id` (unique FK→auth.users), `itinerario_id` (FK→itinerarios) |
| `pagos_finca` | `id`, `finca_id` (FK), `itinerario_id` (FK, nullable), `fecha_inicio`, `fecha_fin`, `litros`, `estado` (pendiente\|pagado\|punto_venta\|devuelto), `responsable` (conductor\|punto_venta\|gerente), `fecha_marcado`, `activado_por`/`marcado_por` (FK→auth.users), `created_at`, `updated_at` |

### Dashboard

The dashboard page (`app/dashboard/page.tsx`) accepts `searchParams` with optional `mes` and `anio` query params for filtering. Uses "effective month/year" (filtered or current) and compares against previous month for trend badges.

- **Cards**:
  1. Gastos del mes + tendencia vs mes anterior
  2. Ingresos del mes (neto) + desglose bruto/aportación + tendencia
  3. Leche hoy (total extraído) + desglose cantina/cría + promedio por vaca en producción
  4. Leche del mes (total extraído) + desglose cantina/cría + corte por quincenas (Q1/Q2, **solo cantina**, que es la que va con dinero) + descuento Fedegan (0.75%) + promedio por vaca
  5. Vacas (alta) + distribución por estado (`produccion`, `secado`, `transicion`, `pre_jardin`, `jardin`)
- **Charts** (top to bottom):
  1. `ExtraccionesLineChart` — histórico mensual sin filtro o desglose diario con filtro activo
  2. `ConceptosDonutChart` — combinado gastos/ingresos por concepto (filtrado por DB si hay filtro)
  3. `GastosIngresosLineChart` — histórico completo, siempre sin filtrar

`dashboard/page.tsx` fetches `gastos`/`ingresos`/`extracciones_leche` once each as full history (with concept joins included) and derives current/previous month, quincenas, and donut/line chart data in JS by filtering on `fecha` — don't reintroduce separate per-range Supabase queries for numbers that are subsets of data already fetched. There's a route-level `loading.tsx` for instant navigation feedback, but no component-level `Suspense` here: the KPI cards and the charts all depend on the same already-resolved queries, so a chart-only `Suspense` boundary would just wrap an already-settled promise with no streaming benefit.

`cooperativa/page.tsx` (`/dashboard/cooperativa`) does have a real `Suspense` split: the KPI cards and the ruta/finca charts only need the current month (`fetchRecMes()`); the trend/gastos charts need the full recolecciones history, fetched by a `React.cache()`-wrapped `fetchAllRecCooperativa()` and rendered by two async Server Components (`TrendChartSection`, `GastosChartSection`) each in their own `<Suspense fallback={<ChartSkeleton />}>`. The `cache()` wrap is what lets both Suspense boundaries share one paginated fetch instead of duplicating it — if you add a third consumer of the full history, call the same cached function rather than re-querying.

### Authentication Flow

1. Middleware (`proxy.ts` / `middleware.ts`) redirects unauthenticated users from `/dashboard/*` to `/login`, and authenticated users from `/login` or `/signup` to `/dashboard`.
2. Supabase session is stored in cookies; the server client in `lib/supabase/server.ts` reads cookies via Next.js's `cookies()`.

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY
SUPABASE_SERVICE_ROLE_KEY            # server-only — createAdminClient() (cron de estados)
CRON_SECRET                          # server-only — Bearer que valida /api/cron/animales-estados
SENTRY_DSN                           # server-only — vacío = Sentry desactivado
NEXT_PUBLIC_SENTRY_DSN               # cliente — mismo DSN; vacío = Sentry desactivado en el navegador
SENTRY_ENVIRONMENT                   # production | staging | development (ver *Observabilidad*)
SENTRY_AUTH_TOKEN                    # solo BUILD — sube sourcemaps; sin él el build no sube nada ni falla
SENTRY_ORG / SENTRY_PROJECT          # solo BUILD — los lee el plugin de Sentry para la subida de sourcemaps
```

Both required vars are set in `.env.local`. The app uses the modern publishable key format (`sb_publishable_...`), not the legacy anon JWT.

Hay **dos proyectos Supabase separados**, ambos con el schema `public`: producción y staging. Los clientes (`lib/supabase/{server,client,admin}.ts`) ya no eligen schema — usan el `public` por defecto —, así que cambiar de entorno es solo cambiar `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` / `SUPABASE_SERVICE_ROLE_KEY`. En Vercel: **Production → proyecto de producción; Preview (`develop`) → proyecto de staging**. `NEXT_PUBLIC_SUPABASE_SCHEMA` ya no existe (no lo reintroduzcas) y el schema `preview` del proyecto de producción es un resto que se borrará en CO-19 tras validar staging. En local, `.env.local` apunta a la **Supabase local** (ver *Desarrollo local*); si alguna vez lo apuntas a un proyecto remoto, que sea staging, nunca producción.

### Desarrollo local

Toda la base corre en local con el CLI de Supabase (necesita **Docker** en marcha). Flujo:

```bash
cp .env.local.example .env.local   # una vez; rellena las dos claves con la salida de `pnpm db:status`
pnpm db:start                      # Postgres + Auth + PostgREST + Studio (http://127.0.0.1:54323)
pnpm db:reset                      # aplica supabase/migrations/ y luego supabase/seed.sql
pnpm dev
```

`pnpm db:stop` apaga el stack. `pnpm db:reset` borra y recrea la base local entera: úsalo cada vez que quieras volver a los datos de ejemplo.

**Usuarios de prueba** (`supabase/seed.sql`; contraseña `password123`, **solo local**):

| Email | Rol | Cliente |
|---|---|---|
| `admin@vb.test` | `admin` | Villa Blanca (demo) |
| `user@vb.test` | `user` | Villa Blanca (demo) |
| `viewer@vb.test` | `viewer` | Villa Blanca (demo) |
| `admin@velero.test` | `admin` | El Velero (demo) |
| `coop.admin@test` | `cooperativa_admin` | — |
| `coop.user@test` | `cooperativa_user` | — (itinerario 1) |

- Cada cliente trae 3 animales, 5 eventos, 10 días de extracciones, el catálogo de conceptos/subconceptos, un precio de leche, un lote de pajillas y un gasto/ingreso de ejemplo; la cooperativa trae 2 fincas, 1 ruta, 1 itinerario y 5 recolecciones. Las fechas son relativas a `current_date`, así que el dashboard del mes en curso nunca sale vacío.
- Los tenants del seed usan los **slugs reales** (`villa-blanca`, `el-velero`) y solo el nombre dice "demo": el código compara el slug en algunos sitios (campos de sangre de El Velero) y los módulos del seed (`tenant_modulos`) se asignan por esos tenants: Arriendos solo a Villa Blanca. Con otros slugs esas pantallas no se verían en local.
- En el seed, `tenant_id` va **siempre explícito**: su `DEFAULT tenant_actual()` depende de `auth.uid()` y el seed corre sin sesión (devolvería NULL). Las tablas con id serial (`fincas_cooperativa`, `rutas_cooperativa`) no llevan id fijo, o la secuencia se quedaría en 1 y el siguiente alta desde la app chocaría.
- **No ejecutes `seed.sql` contra staging ni producción**: crea usuarios con contraseña conocida.

**Tras cada migración: `pnpm db:types`.** Regenera `src/lib/supabase/database.types.ts` desde la base local (de ahí sale `UserRole` y los enums). Si cambias el esquema, commitea migración y tipos juntos. El script usa `--schema public,cafe` para que no entre `graphql_public`. **El CLI de Supabase está fijado como devDependency (`supabase@2.122.0`)**: los scripts `db:*` y `pnpm exec supabase …` usan siempre esa versión, así que el fichero de tipos sale idéntico en cualquier máquina y en el CI, y no hace falta `brew`. El fichero versionado es la salida literal de ese CLI (formato crudo, sin prettier): no lo edites a mano ni lo formatees; si el diff sale enorme, es que alguien lo generó con otra versión. Para subir de versión: `pnpm add -D supabase@<x.y.z>`, `pnpm db:types` y commitear el cambio junto. Sin Docker no se puede generar (el CLI usa el postgres-meta de la base local).

### Migraciones

La fuente de verdad del esquema es `supabase/migrations/` (CLI de Supabase). `20261019000000_baseline.sql` es el esquema `public` completo de producción a 2026-10-19, sin datos; recrea un proyecto vacío: se aplicó a staging (FIN-81) y el esquema resultante coincide con producción. Los `.sql` fechados anteriores y los scripts del antiguo schema `preview` viven en `supabase/legacy/` **solo como historia** — no se ejecutan ni se editan. `supabase/README.md` documenta el enlace a staging y los usuarios de prueba.

Flujo de un cambio de esquema: **local → `db diff` → PR → staging → prod**.
1. Edita el esquema en local y genera el fichero con `pnpm db:diff <nombre>` → `supabase/migrations/<timestamp>_<nombre>.sql`. Revísalo a mano: el diff no captura bien `GRANT`/`REVOKE`, ni cambios de datos.
2. Abre la PR con la migración junto al código que la usa.
3. Aplícala a staging (`supabase link --project-ref <staging>` + `pnpm db:push:staging`) y valida en el preview de `develop`.
4. Solo tras validar, aplícala a producción (`supabase link --project-ref <prod>` + `supabase db push`), con el proyecto enlazado comprobado a mano antes de empujar.

Reglas: nunca edites una migración ya aplicada (crea otra), no mezcles datos de clientes en las migraciones, y toda tabla nueva lleva `tenant_id NOT NULL DEFAULT tenant_actual()`, RLS activada y políticas con la misma matriz de roles que sus `requireRole(...)` (ver *Multi-tenancy*).

### Auditoría

Todo cambio en las tablas de negocio queda en `audit.log` (migración `20261026120000_auditoria.sql`, FIN-88): tabla, `registro_id`, acción (`INSERT`/`UPDATE`/`DELETE`), `antes`/`despues` completos, `cambios` (solo las claves modificadas de un UPDATE, con su valor nuevo), `user_id` (`auth.uid()`) y `at`. Lo escribe un trigger genérico, `audit.registrar_cambio()` (`SECURITY DEFINER`, `search_path = ''`); el código de la app **no** registra nada ni pasa el usuario. Un UPDATE sin cambios reales —o que solo toca `updated_at`/`updated_by`— no genera fila.
- **Qué está auditado**: `precios`, `gastos`, `ingresos`, `eventos_animal`, `animales`, `pajillas`, `arriendos`, `arriendos_abonos`, `fincas_cooperativa`, `pagos_finca`, `roles`, `tenants`, `tenant_modulos`, `tenant_members`, `series_consecutivo`, `articulos`, `terceros`, `tarifas`, `parametros`. **No** `recolecciones` ni `extracciones_leche` (alto volumen diario, no aporta), ni `consecutivos` (cambia en cada documento), ni el resto de tablas de catálogo (`conceptos_*`, `subconceptos_*`, `itinerarios*`, `rutas*`, `pagos`…). Para sumar una: `select audit.activar('public.<tabla>');` en una migración nueva (la tabla necesita columna `id`).
- **Tenant del log**: sale de `tenant_id` de la fila (`to_jsonb`); `audit.activar('public.tenants', 'id')` pasa otra columna cuando la fila es el propio cliente. `fincas_cooperativa` y `pagos_finca` no tienen `tenant_id` (son de la cooperativa) y `roles.tenant_id` es NULL en los roles de cooperativa: esas filas se registran con `tenant_id` NULL y **ningún usuario las ve por RLS** (solo postgres/service role, hasta que se decida quién audita la cooperativa).
- **Lectura**: RLS de `audit.log` → SELECT solo con `rol_en_tenant() in ('owner','admin')` y `tenant_id = tenant_actual()` (FIN-90; antes `rol_actual() = 'admin'`); nadie tiene INSERT/UPDATE/DELETE. El esquema `audit` **no** está en `[api] schemas` ni en `db:types`: la app lee con la RPC `public.historial_cambios(p_tabla, p_registro_id, p_limite)` (`SECURITY DEFINER`, solo `authenticated`; revalida owner/admin+tenant porque salta RLS y devuelve el email solo de miembros del mismo cliente, vía `tenant_members`). Los emails nunca salen de otro cliente. En `src/modules/core/auditoria/` están `getHistorialCambios()` (solo `admin`) y el componente `HistorialCambios`; **aún no están integrados en ninguna pantalla** (Fase 1).
- **`user_id` NULL**: el cron (service role), el seed y cualquier escritura sin sesión (SQL editor) dejan `user_id` NULL; el componente los muestra como «Sistema». `audit.log.user_id` no tiene FK a propósito: el log sobrevive al borrado del usuario.
- **Retención**: no se purga nada en Fase 0 (volumen bajo). Revisarlo antes de auditar tablas de alto volumen.
- **Aviso del linter**: `historial_cambios()` es `SECURITY DEFINER` ejecutable por `authenticated`, igual que `tenant_actual()`/`rol_actual()` (ver *Multi-tenancy*): es inevitable y esperado. `registrar_cambio()`, `activar()` y `set_updated()` no son ejecutables por `anon`/`authenticated`.

**Convención para TABLAS NUEVAS** (en cualquier esquema; las del núcleo y del vertical de café nacen así):

```sql
created_at timestamptz not null default now(),
created_by uuid default auth.uid() references auth.users,
updated_at timestamptz,
updated_by uuid references auth.users,
-- y tras crearla:
create trigger set_updated before update on esquema.tabla
  for each row execute function public.set_updated();   -- rellena updated_at = now(), updated_by = auth.uid()
select audit.activar('esquema.tabla');
```

Las tablas **existentes** no llevan `updated_at`/`updated_by` (salvo `pagos_finca.updated_at`, que ya estaba): no se añadieron porque el log ya guarda quién y cuándo, y así la migración no toca ninguna fila. `set_updated()` asigna ambas columnas, así que no se puede enganchar a una tabla que no las tenga. El test pgTAP de una tabla nueva debería comprobar que sus INSERT/UPDATE/DELETE dejan fila en `audit.log` (ver `supabase/tests/20_auditoria.test.sql`, que filtra por registro porque el seed ya genera filas de log).

### Arquitectura modular

La app evoluciona a un **monolito modular** multi-vertical. El esqueleto vive en `src/modules/` (FIN-86); las features existentes **siguen en `src/features/`** y se migran en la Fase 2.

```
src/modules/
├── core/          # núcleo de plataforma (rpc, auditoria, tenants, registry, consecutivos, inventario, terceros, tarifas, parametros, export, print): nada que conozca vacas ni café
├── registry.ts    # agregador de manifiestos: getNavParaSesion() (el ÚNICO fichero que ve todos los verticales)
├── cafe/          # vertical de café (manifest.ts con nav vacío hasta la Fase 1)
├── ganaderia/     # manifest.ts; el código sigue en src/features hasta la Fase 2
└── cooperativa/   # manifest.ts; el código sigue en src/features hasta la Fase 2
```

Cada submódulo sigue el patrón actual: `<feature>/{actions,components,schemas,lib}`. Cada carpeta tiene un `README.md` que explica qué va dentro.

**Reglas de dependencia** (`eslint-plugin-boundaries`, configuradas en `eslint.config.mjs` y aplicadas **solo a `src/modules/**`**; el resto del código no se ve afectado). Elementos: `core`, `vertical` (`cafe|ganaderia|cooperativa`, captura el nombre), `legacy-feature` (`src/features/**`), `ui` (`src/components/**`), `lib` (`src/lib/**`), `app` (`src/app/**`), más la categoría de fichero `registry` (`src/modules/registry.ts`, vía `boundaries/files`).
- Permitido: `vertical` → `core`, `ui`, `lib` y **el mismo** vertical; `core` → `ui`, `lib`; `app` → todo; `registry.ts` → `core`, **todos** los `vertical`, `ui`, `lib` (es la única excepción a «vertical → vertical», y está acotada a ese fichero).
- Prohibido: `vertical` → otro `vertical`; `core` → cualquier `vertical`; `src/modules/*` → `src/features/**`; `core`/`vertical` → `registry.ts` (crearía un ciclo con los manifiestos). Lo que dos verticales necesiten en común sube a `core`.
- `pnpm lint` falla (error, no aviso) ante una violación. Un import `@/modules/...` desde `src/app` o `src/features` no está restringido.

**Registro de módulos y barra lateral (FIN-92)**: cada módulo declara su navegación en un manifiesto y la barra lateral se construye con los de los módulos activos del cliente y el rol del usuario. No hay lista de rutas en `sidebar.tsx`.
- `core/registry/types.ts` define `NavItemDef` (`href`, `label`, `icon` como **nombre** de icono, `modulo: ModuloId`, `roles` (membresía, para módulos nuevos) y/o `rolesLegacy` (tabla `roles`, para las pantallas existentes; toda entrada declara al menos uno), `grupo?`, `hideInPWA?`, `orden`) y `ModuleManifest = { vertical: Vertical | 'core'; nav }`. Manifiestos: `ganaderia/manifest.ts` y `cooperativa/manifest.ts` (las entradas de siempre, tal cual), `cafe/manifest.ts` (vacío hasta la Fase 1) y `core/manifest.ts` (Terceros y Tarifas y parámetros: declaradas para FIN-93/FIN-94, **invisibles mientras ningún cliente tenga `core.terceros`**).
- `getNavParaSesion(sesion, { pwa? })` (`src/modules/registry.ts`) es **pura**: filtra por vertical del cliente (o `core`), módulo activo, rol (`roles` contra `rolTenant`; `rolesLegacy` contra `rolLegacy`; si hay ambos, deben cumplirse los dos) y PWA, y ordena por grupo (`ORDEN_GRUPOS`; sin grupo primero) y `orden`. La lógica vive en `core/registry/nav.ts` (`construirNav`), que no conoce ningún vertical; `registry.ts` solo le pasa la lista de manifiestos. El layout del dashboard la llama en el servidor y pasa los items a `Sidebar`, que solo los pinta: el mapa nombre → componente está en `components/layout/icon-map.tsx` (cliente) y exige una entrada por cada nombre de `ICONOS_NAV`. Lo único que decide el cliente es la PWA (`ocultoEnPWA()`: oculta `hideInPWA` solo a `cooperativa_user`; el admin de la cooperativa sigue viendo Itinerarios).
- **Para añadir una pantalla nueva: entrada en el manifiesto de su módulo + `requireModuloPagina(modulo)` en su `page.tsx`/`layout.tsx` + `requireModulo(modulo)` en sus Server Actions.** Las tres piezas hacen falta: la entrada solo esconde la opción (cosmético), la página redirige a `/dashboard` y cada action lanza `AuthorizationError`. Para un módulo nuevo del catálogo: fila en `public.modulos` + id en `MODULOS` (ver *Módulos por cliente*). Un vertical nuevo añade su manifiesto a `MANIFIESTOS` en `registry.ts`.
- **Páginas de inicio**: `paginaInicial(sesion)` (`core/registry/pagina-inicial.ts`) es la fuente de a dónde se manda a quien no tiene acceso a lo que pidió: por rol legacy (`PAGINA_INICIAL_POR_ROL`, lo que antes era `ROLE_HOME`) y, sin rol legacy, por vertical (`PAGINA_INICIAL_POR_VERTICAL`: ganadería → `/dashboard/extracciones`, cooperativa → `/dashboard/cooperativa`; café se define en la Fase 1). `checkRoutePermission()` y `/dashboard` la usan.
- Un cliente al que se le quita un módulo base pierde sus entradas del menú (antes solo Arriendos dependía de `tenant_modulos`); las páginas legacy de esas entradas siguen protegidas solo por `checkRoutePermission()` hasta que se les añada `requireModuloPagina()`. Los tests `src/modules/registry.test.ts` fijan el menú de cada usuario del seed (`registry.baseline.ts`): si cambia, cambia el menú de alguien.

**Nada de `if (tenant === ...)`**: lo que cambia entre clientes es **configuración** (manifiesto de módulos, datos), no ramas en el código.

**Schema `cafe`** (migración `20261025120000_schema_cafe.sql`): nace vacío y alberga las tablas del vertical de café. Solo `authenticated` y `service_role` tienen `USAGE` (`anon` no), y las tablas/secuencias/funciones futuras heredan sus privilegios por defecto. Se consulta con el mismo cliente: `supabase.schema("cafe").from(...)` / `.rpc(...)` (ver comentario en `lib/supabase/server.ts`), sin un segundo cliente. `db:types` usa `--schema public,cafe`, por lo que `database.types.ts` incluye `cafe`.
- Local: expuesto vía `[api] schemas`/`extra_search_path` en `supabase/config.toml`. Un stack local ya creado antes de esta migración no arranca (PostgREST falla con `schema "cafe" does not exist`): aplica antes la migración (`pnpm db:reset`, o arranca con el `config.toml` anterior y haz `supabase migration up --local`).
- **Paso MANUAL en staging y producción**: tras aplicar la migración, añadir `cafe` en *Settings → API → Exposed schemas* de cada proyecto; sin eso `.schema("cafe")` responde `PGRST106`.

### Escrituras transaccionales

**Regla: si una operación toca más de una tabla —o necesita ser atómica— es una función Postgres (`plpgsql`) llamada por RPC.** PostgREST no ofrece transacciones a través de varias llamadas, así que encadenar `insert`s desde un Server Action obliga a compensar a mano. El Server Action solo autentica (`requireRole(...)`), valida con Zod, llama a `callRpc()` y traduce el resultado; la lógica y las escrituras viven en la función, y si algo falla a mitad **no queda nada escrito**. Código nuevo (café y lo que venga) nace así; las escrituras de una sola tabla siguen siendo `from(...).insert/update` normales.

Plantilla SQL (va en una migración, ver *Migraciones*):

```sql
create or replace function <schema>.<verbo>_<entidad>(p_input jsonb)   -- o parámetros tipados
returns jsonb
language plpgsql
security invoker            -- RLS sigue aplicando con el usuario real
set search_path = ''        -- todo calificado: public.tabla, no tabla
as $$
declare v_id uuid;
begin
  -- 1) reglas de negocio ANTES de escribir
  if <condición> then
    raise exception using errcode = 'P0001', message = 'codigo_error', detail = 'texto para el usuario';
  end if;
  -- 2) escrituras: todas en la misma transacción implícita de la función
  -- 3) return jsonb_build_object('id', v_id);
end $$;

revoke execute on function <schema>.<fn>(jsonb) from public, anon;
grant execute on function <schema>.<fn>(jsonb) to authenticated;
```

- **Errores de negocio**: `errcode = 'P0001'` y `message` = código estable en snake_case (`stock_insuficiente`, `orden_proceso_invalido`, `consecutivo_bloqueado`); el texto legible va en `detail`. Un `raise exception 'texto libre'` también es P0001 pero `callRpc()` no lo toma por código (lo trata como error inesperado).
- **Nunca `SECURITY DEFINER` para lógica de negocio**: saltaría RLS y el aislamiento por `tenant_id`. Única excepción hoy: `siguiente_consecutivo()` (ver *Consecutivos por serie y año*), que comprueba tenant y rol por sí misma. `security invoker` + RLS + `DEFAULT tenant_actual()` hacen que la función herede el aislamiento sin código extra (y no pases `tenant_id` en el payload).
- El `revoke`/`grant` es obligatorio: Postgres da `EXECUTE` a `PUBLIC` al crear la función.
- Cada función lleva su test pgTAP (`supabase/tests/`); el ejemplo de referencia es `30_rpc_transaccional.test.sql` (`ping_transaccional`, que **solo existe dentro del test**, no en migraciones) y demuestra el rollback completo ante un fallo a mitad.

Wrapper TS (`src/modules/core/rpc/call-rpc.ts`, exportado por `@/modules/core`):

```ts
const r = await callRpc("cafe", "crear_lote", { p_input: datos });   // Result<T>
if (!r.ok) return { error: r.message };   // r.code para ramificar; r.message va al toast
```

`Result<T> = { ok: true; data: T } | { ok: false; code: string; message: string }`. Mapea `42501` → `no_autorizado`, `23505` → `duplicado`, `23503` → `referencia_invalida`, `P0001` → `message` como código y `detail` como mensaje, y cualquier otro → `error_inesperado` (se reporta a Sentry solo con el nombre de la función y el SQLSTATE: **nunca** los argumentos). `mensajes.ts` guarda el diccionario código → mensaje en español para los toasts: al estrenar un código en SQL, añádelo ahí. `args` y el retorno se tipan con `Database[schema]["Functions"][fn]` (tras `pnpm db:types`); mientras la función no esté en los tipos generados `args` es un objeto libre y el retorno `unknown`, que se puede afinar con el genérico `T`. El wrapper no valida en ejecución lo que devuelve Postgres.

> **DEUDA TÉCNICA (Fase 2)**: hoy hay escrituras multi-tabla con **compensación manual** que deberían migrar a RPC y **no se han tocado**: *arriendos* (abono + gasto espejo: se crea el gasto y se borra si el abono falla; al borrar un arriendo se quitan a mano los gastos de sus abonos) y *pajillas* (se descuenta el stock al registrar la inseminación y se reintegra si el insert del evento falla; `ajustarStockPajilla()`). No copies esa técnica en código nuevo.

**Inventario tipo kardex (FIN-96)** (`src/modules/core/inventario/`, migración `20261029130000_inventario_kardex.sql`): inventario genérico del núcleo para cualquier vertical (insumos de empaque y producto terminado del café; ganadería sigue con `pajillas.cantidad_disponible`, que **no** se migra en Fase 0).
- **El stock es siempre la suma de movimientos; nadie edita un número de stock.** `articulos` (catálogo: `tipo`, `unidad`, `atributos` jsonb, `stock_minimo`, `activo`) + `movimientos_inventario` (`cantidad` con signo, `motivo`, `costo_unitario`, `ref_tipo`/`ref_id`, `observaciones`). `v_stock` (stock actual y `bajo_minimo`, estricto `stock < stock_minimo`; NULL = sin alerta) y `v_kardex` (saldo acumulado por artículo, ordenado por `fecha, created_at, seq`) son `security_invoker`, así que el RLS filtra por cliente.
- **Append-only**: `movimientos_inventario` no tiene UPDATE ni DELETE para nadie (privilegios revocados, también a `service_role`, y sin política). Corregir = un movimiento `ajuste` con observación obligatoria (CHECK). Signo y motivo van coherentes por CHECK (`movimiento_signo_valido()`): `saldo_inicial|compra|produccion|devolucion` > 0, `consumo|venta|cortesia|muestra|perdida|reapertura` < 0, `ajuste` cualquiera.
- **`registrar_movimientos(p_movs jsonb, p_permitir_negativo boolean)` es la ÚNICA vía de escritura de movimientos** (`SECURITY INVOKER`, patrón de *Escrituras transaccionales*; en TS `registrarMovimientos()`). Nunca `.insert()` directo desde la app: la RPC acepta varios movimientos en una transacción (empacar = −bolsa −etiqueta +producto terminado), serializa por artículo, comprueba el stock y devuelve `{ movimientos, stocks, advertencias }`. Una salida que deja un artículo en negativo falla con `stock_insuficiente` (`P0001`, no queda nada escrito) salvo `p_permitir_negativo = true` (caso venta), que registra y lo devuelve en `advertencias`. Otros códigos: `movimientos_invalidos`, `movimiento_invalido`, `articulo_no_encontrado`, `articulo_inactivo` (ya en `mensajes.ts`).
- **La serialización usa `pg_advisory_xact_lock` por artículo, no `select … for update`**: con `FOR UPDATE` el RLS exige también la política de UPDATE de `articulos` (solo `owner|admin`) y un `operativo`, que sí registra movimientos, no vería filas que bloquear. Vale porque toda escritura de movimientos pasa por la RPC.
- **Roles (membresías, no `roles` legacy)**: lectura para cualquier miembro; `articulos` INSERT/UPDATE solo `owner|admin`, sin DELETE (**un artículo usado no se borra, se desactiva**, y un desactivado no admite movimientos); `movimientos_inventario` INSERT `owner|admin|operativo` (necesario porque la RPC es `SECURITY INVOKER`). Los Server Actions comprueban el rol con `rol_en_tenant()` (`lib/autorizar.ts`).
- **Detalles del esquema**: `articulos.tipo` y `unidad` no se editan una vez creado (UPDATE por columnas); `unique (tenant_id, tipo, atributos)` evita dos "Excelso 500 g" pero es **parcial** (`where atributos <> '{}'`) para que los artículos sin atributos no queden limitados a uno por tipo; la FK compuesta `(tenant_id, articulo_id)` impide por construcción un movimiento sobre el artículo de otro cliente; `movimientos_inventario.seq` (identity) desempata los movimientos de una misma llamada para que el saldo sea determinista. `articulos` está auditada; los movimientos no (ya son un log).
- Sin página propia en Fase 0 (la pondrá el vertical de café en Fase 1). `database.types.ts` ya incluye estos objetos, pero `lib/cliente.ts` sigue tipándolos a mano (deuda: sustituirlo por `createClient()` directo, ver su TODO); fuera de alcance: costeo promedio ponderado.

### Consecutivos por serie y año (FIN-95)

Los códigos de negocio con número correlativo (`MP-2026-0001` lote de marca propia, `MQ-…` lote de servicio, `REM-…` remisión) los genera **un único generador atómico por `(tenant, serie, año)`**: `public.siguiente_consecutivo(p_serie text, p_fecha date default null) returns text`. **Nunca `max(codigo) + 1`**: con dos usuarios a la vez los dos leen el mismo máximo y generan el mismo código, y tampoco reinicia por año.

- **Tablas**: `series_consecutivo (tenant_id, serie, descripcion, formato, reinicia_anual, activo)` es la configuración (PK `(tenant_id, serie)`, más `id` para `audit.activar`; auditada); `consecutivos (tenant_id, serie, anio, ultimo)` es el contador (`anio = 0` si la serie no reinicia). SELECT para cualquier miembro del tenant; `series_consecutivo` la escriben `owner`/`admin`; `consecutivos` **no la escribe nadie** (privilegios revocados, ni `service_role`): el único camino es la función. Un contador se corrige a mano solo desde el SQL editor.
- **Definir una serie nueva** es una fila, sin deploy (la hace el alta de tenants, FIN-98, o un `owner`/`admin`; `tenant_id` sale de `tenant_actual()` y desde SQL/service role va explícito):

  ```sql
  insert into public.series_consecutivo (tenant_id, serie, descripcion, formato, reinicia_anual)
  values ('<tenant>', 'MP', 'Lotes de marca propia', '{serie}-{anio}-{n:4}', true);
  ```

  `serie` son 1–10 letras, cifras o `_`. `formato` admite `{serie}`, `{anio}` y `{n:4}` (número relleno con ceros hasta 4 cifras; `{n}` sin relleno) y **debe llevar `{n}`** (CHECK); si el número supera el ancho sigue creciendo sin truncar (`MP-2026-10000`). Con `reinicia_anual = false` el contador es uno solo y `{anio}` muestra el año de la fecha. Decide `reinicia_anual` **antes** de usar la serie: cambiarlo después no migra los contadores. `activo = false` apaga la serie (`serie_no_configurada`); una serie con contadores no se puede borrar (`on delete restrict`), se desactiva.
- **Llamarla desde una RPC**, dentro de **su** transacción, en el mismo bloque que inserta el documento:

  ```sql
  -- dentro de una función plpgsql `security invoker` (ver Escrituras transaccionales)
  v_codigo := public.siguiente_consecutivo('MP', p_fecha_recepcion);   -- null → fecha local del tenant
  insert into cafe.lotes (codigo, ...) values (v_codigo, ...);
  ```

  Pasa la fecha del **documento** si la RPC la conoce; con `null` usa la fecha local del tenant (`tenants.zona_horaria`, no UTC: el 31/12 a las 20:00 en Bogotá no es año nuevo). Es `SECURITY DEFINER` —**excepción documentada** a la regla de `security invoker`, porque los usuarios no deben poder editar contadores— y comprueba ella misma `tenant_actual()` no nulo y `rol_en_tenant() in ('owner','admin','operativo')` (un `viewer` o un usuario sin tenant → `42501`, `callRpc` lo da como `no_autorizado`) y que la serie exista y esté activa (si no, `P0001` `serie_no_configurada`). El tenant nunca viene por parámetro.
- **Concurrencia**: el número sale de un `insert … on conflict (tenant_id, serie, anio) do update set ultimo = ultimo + 1 returning ultimo`; el bloqueo de fila del upsert serializa a quien pide la misma serie y año (quien llega segundo espera a que el primero termine). Verificado con `pnpm test:concurrencia` (`scripts/test-consecutivos-concurrencia.ts`: 20 llamadas en paralelo vía supabase-js contra la Supabase local → 20 códigos distintos y consecutivos).
- **Huecos**: el contador va en la transacción de quien llama, así que si la RPC falla **después** de pedir número, el rollback revierte también el contador y el número **no se consume** (lo recibe la siguiente llamada; `60_consecutivos.test.sql` lo prueba). Sí puede quedar un hueco cuando un número ya confirmado pierde su documento (se borra o se anula): **no se reutiliza ni se rellena** a mano. Por eso pide el número lo más tarde posible dentro de la RPC y nunca lo pidas desde el cliente "para mostrarlo": para previsualizar ("Próximo número: MP-2026-0013") lee `consecutivos.ultimo` y formatea con `formatearConsecutivo(formato, serie, anio, n)` (`@/modules/core`, `src/modules/core/consecutivos/formato.ts`), que da lo mismo que `public.formatear_consecutivo()` (mismos casos en `formato.test.ts` y en el test pgTAP) y **no reserva nada**.
- Un código de error nuevo se añade a `mensajes.ts`; `serie_no_configurada` ya está.

### Terceros (FIN-93)

**Maestro único de terceros** (`public.terceros`, módulo `core.terceros`; `src/modules/core/terceros/`, página `/dashboard/terceros`): proveedores y clientes en una sola tabla; cada tercero combina **roles** (`roles text[]`: `proveedor`, `cliente`, `cliente_servicio`, con CHECK; el formulario exige al menos uno, la base no). Hoy **ningún cliente tiene el módulo**: se activa con una fila en `tenant_modulos` (ver *Módulos por cliente*).
- **El módulo se exige en el RLS**, no solo en la app: las tres políticas llevan `(select public.tenant_tiene_modulo('core.terceros'))` además del `tenant_id`. SELECT cualquier miembro; INSERT `owner|admin|operativo` (la HU permite crear en línea desde una recepción o una venta); UPDATE de datos maestros solo `owner|admin`, por columnas (`tenant_id`, `es_consumidor_final` y `created_*` no se tocan); **DELETE nadie** (`activo = false`). Un cliente sin el módulo no ve ni escribe nada aunque llame a la API.
- **Normalización en el trigger** `terceros_normalizar` (`BEFORE INSERT/UPDATE`): `identificacion` sin espacios, puntos ni guiones y en mayúsculas (`900.123.456-7` = `9001234567`), `nombre`/`direccion`/`telefono` con `trim` y espacios colapsados, `email` en minúsculas. La unicidad es `(tenant_id, tipo_identificacion, identificacion)` ya normalizada → `23505`. `normalizar_identificacion()`/`normalizar_nombre()` (SQL) y `lib/normalizar.ts` (TS) deben dar lo mismo: `normalizar.test.ts` y `supabase/tests/80_terceros.test.sql` comparten casos. El dígito de verificación (NIT) es un campo aparte y opcional; la identificación guardada incluye el que se haya escrito junto al número.
- **Consumidor final**: `public.asegurar_consumidor_final(p_tenant uuid default null)` (`SECURITY INVOKER`, idempotente, devuelve el id) crea `Consumidor final / OTRO / 222222222222 / roles ['cliente']`. Con sesión usa `tenant_actual()` y el RLS decide quién puede; **sin sesión (alta de clientes / seed de vertical) hay que pasar `p_tenant`** (el seed corre sin `auth.uid()`, ver *Desarrollo local*). El trigger `terceros_proteger_consumidor_final` lo hace un registro del sistema: al insertarlo fija los datos canónicos, y una vez creado no admite UPDATE de ningún tipo (`consumidor_final_protegido`, `P0001`). Solo hay uno por cliente (índice único parcial). Si otro tercero ya ocupa `222222222222` falla con `consumidor_final_no_disponible`.
- **Duplicados**: la RPC `public.buscar_terceros_similares(p_nombre, p_identificacion)` (`STABLE`, `SECURITY INVOKER`) devuelve hasta 5 terceros con la misma identificación normalizada (de cualquier tipo) **o** `similarity(nombre) > 0.4` (`pg_trgm`, esquema `extensions`: dentro de funciones con `search_path = ''` hay que calificar `extensions.similarity`). Incluye inactivos. Es **un aviso, no un bloqueo**: el formulario lo muestra al salir de nombre/identificación y, si hay parecidos que el usuario aún no vio, el primer intento de guardar se detiene; la identificación repetida sí la bloquea la base (`23505`).
- **Código**: Server Actions `crearTercero`/`actualizarTercero`/`desactivarTercero`/`reactivarTercero`/`buscarSimilares`/`listarOpcionesTerceros`/`asegurarConsumidorFinal`, todas con `requireModulo('core.terceros')` + `requireRolTenant([...])`; `listarTerceros()` pagina con `.range()`. **`TerceroCombobox`** (`components/tercero-combobox.tsx`) es el selector reutilizable: props `rol` (filtra), `permitirCrear` (abre el formulario y deja el nuevo seleccionado, sin recargar) e `incluirConsumidorFinal`. Se importa directo del fichero, no del barril `@/modules/core`.
- **Fuera de alcance**: `gastos.proveedor` y `pajillas.proveedor` siguen siendo texto libre (Fase 2).

### Tarifas y parámetros por cliente (FIN-94)

Dos piezas genéricas del núcleo (`src/modules/core/{tarifas,parametros}/`, migración `20261030120000_tarifas_parametros.sql`), con pantalla en `/dashboard/tarifas` (`src/app/dashboard/tarifas/`). `public.precios` (precio del litro de ganadería) **no se toca**.

- **`public.tarifas` es append-only**: `(tenant_id, concepto, valor numeric(14,2), unidad, vigente_desde)`, único por `(tenant, concepto, vigente_desde)`. **Cambiar una tarifa es insertar otra**; nadie tiene UPDATE (privilegio revocado, también a `service_role`) y el DELETE solo lo hace `owner`/`admin` (o `tiene_permiso('tarifas.editar')`) sobre tarifas **programadas** (`vigente_desde > now()`). Lo ya cobrado no cambia porque cada proceso guarda el valor que usó: calcúlalo con `calcularValor(pesoKg, tarifa)` (`Math.round` a pesos) y guárdalo en el proceso.
- **`public.tarifa_vigente(p_concepto, p_at default now())`** (`STABLE`, `SECURITY INVOKER`, filtra por `tenant_actual()`): la última con `vigente_desde <= p_at`; sin ninguna lanza `tarifa_no_definida` (`P0001`, concepto en `detail`; ya en `mensajes.ts`). Dentro de una RPC se llama directamente; desde TypeScript, `getTarifaVigente(concepto, fecha?)` (devuelve `Result<number>`, nunca 0 por defecto). `v_tarifas_vigentes` (`security_invoker`) da la que rige ahora por concepto y `tarifas_historial()` (`SECURITY DEFINER`, solo `owner`/`admin`, solo el cliente actual) el historial con el email de quien la creó.
- **`public.parametros`**: `(tenant_id, clave, valor jsonb)` con PK `(tenant_id, clave)` + `id` (solo para `audit.activar`). Lectura: cualquier miembro; escribe solo `owner`/`admin`, **solo el `valor`** (UPDATE por columnas), nadie borra. Se guarda con la RPC `guardar_parametro(clave, valor)` y se lee dentro de una RPC con `public.parametro(clave, default)`. Un JSON `null` guardado es un valor ("sin configurar"), no "falta".
- **Las definiciones viven en el código de cada módulo**, no en la base: `ParametroDef` (`clave`, `modulo`, `etiqueta`, `schema` Zod, `defecto`, `grupo`, `tipo`, `unidad`) y `ConceptoTarifaDef` (`concepto`, `modulo`, `etiqueta`, `unidad`). Las de café están en `src/modules/cafe/parametros.ts` (`PARAMETROS_CAFE`, `CONCEPTOS_TARIFA_CAFE`). Como `core` no puede importar un vertical, **las inyecta `src/modules/registry.ts`** llamando a `defineParametros()` / `defineConceptosTarifa()` al cargarse. El registro es estado de módulo: quien lo lea (la página y los Server Actions de la pantalla) debe hacer `import "@/modules/registry"` en su propio módulo; por eso los Server Actions reales viven en `src/app/dashboard/tarifas/actions.ts` y delegan en `*.service.ts` del núcleo (sin `"use server"`).
- **`getParametro(def | clave)`** (`parametros.queries.ts`, una consulta por request con `React.cache()`): valida con el `schema` de la definición y devuelve el `defecto` si no hay valor o es inválido (en ese caso, además, lo reporta a Sentry sin el valor). **Un vertical debería pasar su propia definición** (`getParametro(PARAMETROS_CAFE.capacidadTostadoraKg)`: tipado y sin depender del registro) en vez de la clave. Un fallo de lectura **lanza**: no se disfraza de defecto.
- **Visibilidad**: la entrada "Tarifas y parámetros" (`core/manifest.ts`) y la página usan el módulo `core.terceros` (no hay `core.tarifas` en el catálogo; no se inventó uno) y rol `owner`/`admin`; la pantalla solo ofrece las definiciones cuyo `modulo` tiene activo el cliente (hoy ninguno de ganadería). `crearTarifa` rechaza vigencias en el pasado (una tarifa nueva solo afecta a lo que se registre después) y conceptos que ningún módulo declara.
- Para **añadir** un parámetro o un concepto: su definición en el fichero del módulo (más su test) y nada más; sin migración ni deploy de base. Sembrar valores por defecto a un cliente nuevo es del alta de tenants (FIN-98).

### Exportación a Excel e impresión térmica (FIN-97)

Dos utilidades del núcleo (`src/modules/core/{export,print}/`) para cualquier vertical. **No** sustituyen a los informes que ya existen (`informes-cooperativa`, `informes-animales`), que siguen con su ExcelJS a mano.

**Excel** (`core/export/`):
- `generarExcel(hojas, { tenant, filtrosAplicados })` arma el libro (cliente en la fila 1, título + filtros en la 2, cabecera congelada en la 3, `ySplit: 3`); la fila de `totales` lleva fórmulas `SUM` reales (con `result` en caché solo para visores que no recalculan). El formato lo fija la columna: `moneda` COP `"$"#,##0`, `peso` `#,##0.000` (el issue lo mencionaba pero no estaba en la lista de formatos), `porcentaje` `0.0%`. **El porcentaje espera la fracción** (0,19 → 19,0 %). Los totales solo admiten columnas numéricas, nunca la primera (lleva "TOTAL"), y se refieren a la columna por su `key`.
- **Fechas**: un `YYYY-MM-DD` (columna `date`) se escribe tal cual, sin pasarlo por `new Date()` (se correría un día en UTC-5); un instante (`timestamptz`) se lleva a la hora de pared de `tenant.zonaHoraria` y se escribe como `Date` UTC con esos mismos componentes, porque Excel no tiene zonas horarias.
- `fetchAllPaginado(pagina, pageSize = 1000, limite = 50_000)` recibe una **función `(desde, hasta) => consulta`** (no un builder: el de supabase-js muta con `.range()`), que debe ordenar de forma estable. A diferencia de `fetchAllRecolecciones` **lanza** si una página falla (un Excel truncado que parece completo es peor que un error) y al pasar del límite (`ExportError`).
- **Registro de recursos exportables**: cada módulo declara un `ExportadorDef` (`recurso`, `modulo`, `roles` de membresía y opcional `rolesLegacy`, `generar({ sesion, filtros })`) y `src/modules/registry.ts` lo agrega con `defineExportadores()` (mismo patrón que `defineParametros`; `core` no importa verticales). El del núcleo es `core/terceros/exportador.ts` y es la referencia: usa la misma consulta que la pantalla. Café añadirá `lotes` en la Fase 1 (una entrada más en `registry.ts`, sin tocar la ruta).
- `GET /api/export/<recurso>?…filtros` (`src/app/api/export/[recurso]/route.ts`): `getSesion()` → 401; recurso desconocido → 404; módulo no activo o rol no permitido → 403 (`autorizarExport()`, pura); error de la consulta → 500 con Sentry; demasiado grande → 413. Los `searchParams` son los de la pantalla. La ruta hace `import "@/modules/registry"` (el registro es estado de módulo). **Una pantalla que exporta pasa sus filtros por query string** para que el Excel los respete; el nombre sale de `nombreArchivoExport()`: `${slug}_${recurso}_${desde}_${hasta}.xlsx`.

**Impresión térmica** (`core/print/`, grupo de rutas `src/app/(print)/`):
- El layout `(print)` exige sesión él mismo (el proxy solo protege `/dashboard`), sin barra lateral ni header, y lee el ancho del rollo del parámetro **`core.impresora_ancho_mm`** (58 u 80, defecto 80; definido en `core/print/parametros.ts` y registrado en `registry.ts`). Va bajo el módulo `core.terceros` —no hay uno de impresión en el catálogo y crearlo exige migración— así que solo se edita en Tarifas y parámetros de clientes que ya lo tienen; sin valor rige 80.
- **`@page { size: 80mm auto }` NO funciona** (el issue lo proponía): Chrome descarta la declaración entera y imprime en Carta (comprobado con `--print-to-pdf`). Se usa `size: <ancho>mm 297mm` (`ALTO_PAGINA_MM`) y cada `.ticket` termina en salto de página. Si con la impresora real queda demasiado papel en blanco tras el corte, el alto es lo único que hay que tocar (o quitar `size` y dejar que el driver ponga el rollo).
- `?copias=N` = tiquetes **en total** (original + N−1 `CopiaCliente`, máximo 5); `?ancho=58|80` fuerza otro ancho en una página concreta volviendo a montar `EstiloTermico` (así calibra `/print/prueba`). Las páginas de impresión formatean fechas y pesos **en el servidor** (zona del cliente); no uses `window`/`Intl` del navegador para el contenido del tiquete.
- Componentes (`core/print/components/ticket.tsx`, de servidor): `TicketHeader`, `TicketLinea`, `TicketTabla`, `TicketSeparador`, `TicketPie`, `CopiaCliente`/`TicketCopias`; `ImprimirButton` es el único de cliente. Un tiquete nuevo = página bajo `src/app/(print)/print/<nombre>/` con esas piezas dentro de `<TicketCopias copias={…}>`. Calibración: `/print/prueba`.

### Path Alias

`@/*` maps to `src/*` (configured in `tsconfig.json`).

### Deployment

Deployed on Vercel. The `.npmrc` file at the root is intentionally committed to configure pnpm for Vercel's build environment. The `develop` branch deploys as a preview environment against the **staging** Supabase project (see *Environment Variables* and *Migraciones*); `main` deploys to production.

**CI y migraciones automáticas (GitHub Actions, `.github/`)**
- **`ci.yml`** corre en cada PR hacia `develop` y `main`, en un único job llamado exactamente **`ci`** (la protección de ramas exige ese check). Pasos: `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm exec tsc --noEmit` → `pnpm test` → Supabase local (`pnpm exec supabase start -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,realtime,storage-api`; `start` ya aplica migraciones y seed) → `pnpm test:db` → **drift de tipos** (`pnpm db:types` + `git diff --exit-code -- src/lib/supabase/database.types.ts`: falla si cambias una migración sin regenerar los tipos) → `pnpm build` con variables ficticias. Usa Node 22 (mínimo real: vitest 5 exige ^22.12 y pnpm 11 ≥22.13) y el CLI de Supabase fijado como devDependency, **nunca** `supabase/setup-cli`. El repo no declara `packageManager`: la versión de pnpm (11) vive en los workflows.
- **`migrate.yml`** se dispara en `push` cuando cambia `supabase/migrations/` (o `workflow_dispatch`): `develop` → job `staging` (`supabase link` + `db push`); `main` → job `production`, con `environment: Production` (aprobación manual configurada en GitHub) y un paso de guarda antes del push. Secrets de Actions: `SUPABASE_ACCESS_TOKEN`, `STAGING_PROJECT_REF`, `STAGING_DB_PASSWORD`, `PROD_PROJECT_REF`, `PROD_DB_PASSWORD`. Refs reales: staging `wiquvwviaawvpjkthdam`, producción `tqaprzgccgoiiqxzincv`.
- **Paso manual único antes del primer `db push` a producción**: la baseline `20261019000000` ya está aplicada en el esquema de producción, pero su historial de migraciones no la registra. Con el proyecto de producción enlazado (`supabase link --project-ref tqaprzgccgoiiqxzincv`) ejecuta una sola vez `supabase migration repair --status applied 20261019000000`. El job `production` lo comprueba (`.github/scripts/verificar-baseline.mjs` sobre `supabase migration list --linked --output-format json`) y **falla con ese mensaje** si la baseline sigue pendiente, en lugar de intentar reaplicarla. En staging ya está registrada.
- Si el CLI falla con "Found local migration files to be inserted before the last migration on remote", es una migración con timestamp anterior a la última aplicada: renómbrala con un timestamp posterior (nunca `--include-all` a ciegas).

**Orden con Vercel: expand → migrate → contract.** La migración se aplica (workflow) en paralelo al despliegue de Vercel, sin garantía de orden, y el código antiguo sigue sirviendo tráfico mientras tanto. Por eso toda migración debe ser **compatible hacia atrás**: primero *expand* (añadir columnas nullable/con default, tablas, funciones nuevas), luego el código que las usa, y solo en un release posterior *contract* (borrar o renombrar lo que ya nadie lee). **Nunca renombres ni borres columnas en el mismo release que cambia el código que las usa.**

### Observabilidad (Sentry)

`@sentry/nextjs` (v11) reporta errores de servidor y de cliente con el **cliente** (`tenant`), el `rol` y el `id` de usuario como contexto —nunca email—. Sin DSN todo queda apagado (`enabled: false`) y la app y el build funcionan igual, así que CI y local no necesitan ninguna variable de Sentry.
- **Ficheros**: `src/instrumentation.ts` (registra la config y exporta `onRequestError`), `src/instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`; las opciones comunes viven en `src/lib/sentry/opciones.ts` y los filtros (puros, sin servidor) en `src/lib/sentry/filtros.ts`. `next.config.ts` envuelve el resultado de `withPWA(...)` con `withSentryConfig` (import desde `@sentry/nextjs/config`), sin túnel (`tunnelRoute`) ni subida de sourcemaps si falta `SENTRY_AUTH_TOKEN`.
- **Entornos**: `SENTRY_ENVIRONMENT` = `production` | `staging` | `development`. `tracesSampleRate` es 0.1 en producción y 1.0 en el resto. `next.config.ts` copia `SENTRY_ENVIRONMENT` a `NEXT_PUBLIC_SENTRY_ENVIRONMENT` para que lo vea el bundle de cliente. En Vercel: **Production → `production`; Preview (`develop`) → `staging`**; las cuatro variables de Sentry se definen allí a mano, nunca en el repo.
- **Proyectos de Sentry** (organización `blue-t3`, región `de.sentry.io`): **`blue-ganadero-pro`** para Production y **`blue-ganadero-pre`** para Preview (`develop`). Cada entorno lleva el DSN de su proyecto en `SENTRY_DSN` y `NEXT_PUBLIC_SENTRY_DSN` (los dos con el mismo valor) y su slug en `SENTRY_PROJECT`; `SENTRY_ORG` es `blue-t3` en ambos. Un DSN no es un secreto (solo permite enviar eventos) y se saca con `find_dsns` del MCP de Sentry o desde *Project Settings → Client Keys*; `SENTRY_AUTH_TOKEN` (token de organización, solo build) sí es secreto: **Sensitive** en Vercel. Que `SENTRY_PROJECT` coincida con el DSN del mismo entorno: si no, los sourcemaps se suben al proyecto equivocado y los errores salen ilegibles.
- **Sin datos personales**: en v11 ya **no existe `sendDefaultPii`**; lo sustituye `dataCollection`, cuyos valores por defecto SÍ recogen cookies, cabeceras, cuerpos HTTP, query strings y datos de consultas. `opciones.ts` los apaga todos (`SIN_DATOS_PERSONALES`) y `filtros.ts` lo repite en `beforeSend`/`beforeSendSpan`: deja solo `user.id`, quita cuerpo/cookies/cabeceras/query string de `request`, sustituye cualquier email por `[email]` y descarta los breadcrumbs de consola. Si subes de versión o añades una integración, comprueba que no abre un hueco.
- **Contexto**: `registrarContextoSentry()` (`lib/sentry/contexto.ts`, cacheada con `React.cache()`) pone los tags `tenant`, `vertical` y `rol` y `setUser({ id })`. La llaman el layout del dashboard, `checkRoutePermission()` y `requireRole()` —layout y página se renderizan en paralelo y un Server Action no pasa por el layout hasta después de ejecutarse—. El tag `vertical` está preparado pero **no se envía** hasta que `tenants` tenga ese dato (CO-09/FIN-86): sácalo en esa función. Los route handlers que no pasan por `requireRole()` no etiquetan.
- **Errores esperados que NO se reportan**: `redirect()`/`notFound()` y demás errores de control de Next (por `digest`) y `AuthorizationError` (`lib/auth/errors.ts`, mismo mensaje "No autorizado"). `requireRole()`, `requireModulo()` y las comprobaciones de `itinerarios.actions.ts` lanzan esa clase: **lanza `AuthorizationError`, no `new Error("No autorizado")`**, para toda denegación nueva. En el cliente, en producción Next sustituye el mensaje de los errores de servidor por un `digest`, así que ahí el filtro por clase no puede actuar. `instrumentation-client.ts` también ignora los `Failed to fetch` de red: el conductor trabaja sin señal (PWA offline).
- **Error boundaries**: `app/global-error.tsx` y `app/dashboard/error.tsx` llaman a `Sentry.captureException`.

**Checklist manual antes de cada release a producción**: revisar en Supabase → *Advisors* (**Security** y **Performance**) —en staging con las migraciones ya aplicadas, y de nuevo en producción tras el release— y resolver los avisos nuevos. Los avisos conocidos e inevitables (p. ej. `tenant_actual()`/`rol_actual()` como `SECURITY DEFINER` ejecutables por `authenticated`, ver *Multi-tenancy*) se ignoran.
