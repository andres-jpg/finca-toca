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
```

Package manager is **pnpm**. There are no test commands configured.

## Architecture

### Directory Structure

```
src/
├── app/                              # Next.js App Router pages
│   ├── api/
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
│   │   ├── vacas/[id]/               # Vaca detail page
│   │   ├── toros/[id]/               # Toro detail page
│   │   └── ...                       # gastos, ingresos, extracciones, inventario, configuracion
│   └── (auth)/                       # login, signup
├── features/                         # Feature modules — one per domain entity
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
│   ├── supabase/admin.ts             # Service-role client (server-only), currently unused — no caller does its own authz, so anyone who imports it must add a requireRole()/getUserRole() check themselves
│   ├── auth/                         # getUserRole, getCurrentUser, checkRoutePermission, canWrite, canDelete, requireRole
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

**Role-based access control** is enforced at three levels — all three matter, since RLS is the only one a client can't bypass by calling Supabase's REST/RPC API directly with the public anon key:
- Route level: `await checkRoutePermission(["admin", "viewer"])` in page Server Components — redirects to `/dashboard/extracciones` if unauthorized
- Write level: `canWrite(role)` / `canDelete(role)` return `false` for the `"viewer"` role; pass these booleans down to client components to hide mutation UI
- Server Action / API route level: `await requireRole(["cooperativa_admin"])` throws if the caller's role is not in the allowed list (use this in every mutating Server Action — it's a public POST endpoint regardless of which UI calls it)
- **Database level (RLS)**: every `public` table's INSERT/UPDATE/DELETE policy checks `roles.rol` via `EXISTS (SELECT 1 FROM roles WHERE roles.user_id = auth.uid() AND roles.rol = ANY(ARRAY[...]))` — not just `TO authenticated USING (true)`. This is the actual authorization boundary; the three levels above are UX/defense-in-depth on top of it. When adding a new table, write its policies to match the same role matrix as the table's `requireRole(...)` calls — see "RLS policies" under Cooperativa Module.

Roles: `"admin" | "user" | "viewer" | "cooperativa_admin" | "cooperativa_user"` — Postgres enum type `rol`, stored in the `roles` table (`roles.user_id` → `roles.rol`), not in Supabase Auth metadata. There is no UI/Server Action that writes to `roles` — assigning a role to a new user is a manual step (Supabase dashboard/SQL) by the project owner. `getUserRole()` (`lib/auth/get-user-role.ts`) fails **closed**: a user with no row in `roles`, or a transient lookup error, gets `null` (no access), never an implicit role. New self-registered users (`/signup` is open, unauthenticated) therefore have zero dashboard access until an admin manually inserts their `roles` row.

**Server vs. Client Components**: Pages and layout containers are Server Components that fetch data. Interactive UI (forms, modals, state) uses `"use client"`. The `dashboard-layout-client.tsx` is the client boundary for the dashboard shell; it receives `userRole` as a prop from the server layout.

**Forms** use React Hook Form + Zod (via `zodResolver`). Schemas live in `features/[feature]/schemas/`.

**Data tables** use the shared `components/shared/data-table.tsx` wrapper around TanStack React Table v8 with built-in column filtering, sorting, and pagination.

**Read-only detail modals**: Tables that need a view-only mode use an inline detail component (not the form) rendered inside `EntityModal`. The eye icon (`Eye` from lucide-react) triggers it and is visible for all roles including `viewer`.

**Supabase one-to-one joins**: When a table has a `UNIQUE` FK (e.g. `pagos.gasto_id`), PostgREST may return the embedded resource as an object rather than an array. Always handle both cases: `Array.isArray(row.rel) ? row.rel[0] : row.rel ?? null`.

**PostgREST row cap**: PostgREST has a `max_rows` cap (default 1000). For queries that may exceed this, paginate using `.range(from, from + PAGE - 1)` in a `while` loop until `data.length < PAGE`. The `informes-cooperativa` API route uses this pattern (`fetchAllRecolecciones`). Several dashboard pages do an un-paginated `.select()` over a table's full history (e.g. `dashboard/page.tsx`'s `gastos`/`ingresos`/`extracciones_leche` fetches) — these are subject to the same 1000-row cap and will silently truncate once a table grows past it; only `informes-cooperativa` and its `/preview` JSON counterpart (both go through `buildInformeData`) currently paginate.

**Deduplicate `supabase.auth.getUser()` per request**: it always does a real round-trip to Supabase Auth (unlike `getSession()`, which just decodes the cookie locally). `getCurrentUser()` (`lib/auth/get-user-role.ts`) wraps it in `React.cache()`; `getUserRole()` calls `getCurrentUser()` internally. Always import `getCurrentUser` instead of calling `supabase.auth.getUser()` directly in a Server Action/Route Handler/Server Component that might run after `getUserRole()`/`requireRole()` already resolved the session — calling the raw method again is a second network round-trip that `cache()` would have deduplicated for free.

**`next/dynamic` with `{ ssr: false }`**: only allowed inside a `"use client"` module — calling it directly in a Server Component (e.g. a `page.tsx`) fails the build with "`ssr: false` is not allowed with `next/dynamic` in Server Components." Put the `dynamic()` calls in a small client wrapper file (see `chart-wrappers.tsx` / `cooperativa-chart-wrappers.tsx`) and import the already-wrapped component into the page.

**Offline sync mutex** (`hooks/useSyncQueue.ts`): the "is a sync already running" lock is a `useRef`, not a `useState` — a ref is read/written synchronously, so two near-simultaneous `syncNow()` calls (e.g. the mount effect and the reconnect-timer effect both firing) can't both pass the check before either sets the lock. A `useState`-based lock would race here because `setState` is batched/deferred. `isSyncing` (the `useState`) only drives the UI ("Sincronizando…" badge); never use it as the actual guard.

**Offline sync lost-update guard** (`lib/offline/sync.ts`): `syncQueue()`/`syncPagos()` snapshot the `pending` Dexie records, await the network round-trip, then must re-check the record in IndexedDB still matches the snapshot before marking it `synced` — if the conductor edited it again while the request was in flight, blindly overwriting `syncStatus` would silently drop that newer edit (it would never be retried, since it's no longer `pending`). Any new offline-sync write path must follow this same "compare-before-commit" pattern, not just flip the status on a successful response. All sync triggers should go through `useSyncQueue()`'s `syncNow()` (the guarded entry point) rather than calling `syncQueue()`/`syncPagos()` directly, to avoid two syncs running concurrently.

**Fichas de animales**: `vacas` y `toros` tienen páginas de detalle (`/dashboard/vacas/[id]`, `/dashboard/toros/[id]`) con:
- información básica
- genealogía (madre/padre con enlaces cruzados)
- crías (mezcla de vacas/toros, incluyendo estado y alta/baja)
- historial de eventos

**Eventos por animal**: El módulo `features/eventos-animal` centraliza:
- `getEventosAnimal()` y `createEventoAnimal()`
- validación Zod de tipos de evento
- formulario (`EventForm`) y timeline visual (`EventsTimeline`)
- revalidación de la ruta de ficha del animal al crear eventos

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

**`rutas` vs. `itinerarios`**: `rutas_cooperativa`/`rutas_fincas` is the coarser grouping used for Excel reports (`informes-cooperativa`'s `ruta` type) and for searching fincas in `pagos-cooperativa`. `itinerarios`/`itinerarios_fincas` is the actual conductor-facing assignment: `user_itinerarios` (not `user_rutas`) is what `usuarios-cooperativa` writes to, what `getItinerarioAsignado()`/the offline conductor view read from, and what `get_cooperativa_users()` joins against. A finca can belong to both a ruta and an itinerario independently — they aren't the same grouping.

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
| `extracciones_leche` | `id`, `fecha`, `litros` |
| `gastos` | `id`, `fecha`, `subconcepto_id` (FK), `valor`, `proveedor`, `numero_factura`, `pagado`, `observaciones` |
| `pagos` | `id`, `gasto_id` (UNIQUE FK→gastos), `forma_pago` (efectivo\|transferencia), `tipo_cuenta`, `banco`, `numero_cuenta` |
| `ingresos` | `id`, `fecha`, `subconcepto_id` (FK), `valor`, `observaciones`, `source` (NULL=manual, 'leche_extraccion'=auto) |
| `precios` | `id`, `created_at`, `valor`, `tipo` |
| `conceptos_gasto` + `subconceptos_gasto` | hierarchy for gastos categories |
| `conceptos_ingreso` + `subconceptos_ingreso` | hierarchy for ingresos categories |
| `vacas` | `id` (UUID), `vaca_id` (**text**, alphanumeric), `nombre`, `origen` (finca\|externa), `estado` (produccion\|secado\|pre_jardin\|jardin\|transicion), `fecha_compra`, `fecha_nacimiento`, `numero_registro`, `madre_id` (FK→vacas), `padre_id` (FK→toros), `alta` |
| `toros` | `id` (UUID), `toro_id` (int), `nombre`, `origen` (finca\|externa), `estado` (jardin\|reproductor), `fecha_compra`, `fecha_nacimiento`, `numero_registro`, `madre_id` (FK→vacas), `padre_id` (FK→toros), `alta` |
| `eventos_animal` | `id`, `animal_id` (UUID), `animal_tipo` (vaca\|toro), `tipo_evento`, `fecha`, `descripcion`, `responsable`, `created_at` |
| `roles` | `user_id`, `rol` (Postgres enum `rol`: `admin`\|`user`\|`viewer`\|`cooperativa_admin`\|`cooperativa_user`) |
| `fincas_cooperativa` | `id`, `nombre`, `precio_litro`, `activa`, `metodo_pago` (conductor\|punto_venta\|gerente), `created_at` |
| `rutas_cooperativa` | `id`, `nombre`, `created_at` |
| `rutas_fincas` | `ruta_id` (FK), `finca_id` (FK), `orden` (int) — unique (finca_id) |
| `recolecciones` | `id`, `finca_id` (FK), `fecha`, `litros`, `precio_litro`, `created_at` — unique (finca_id, fecha) |
| `user_rutas` | `user_id` (unique FK→auth.users), `ruta_id` (FK→rutas_cooperativa) — legacy, superseded by `user_itinerarios` for conductor assignment |
| `itinerarios` | `id`, `nombre`, `created_at` |
| `itinerarios_fincas` | `itinerario_id` (FK→itinerarios), `finca_id` (FK→fincas_cooperativa), `orden` (int) |
| `user_itinerarios` | `user_id` (unique FK→auth.users), `itinerario_id` (FK→itinerarios) |
| `pagos_finca` | `id`, `finca_id` (FK), `itinerario_id` (FK, nullable), `fecha_inicio`, `fecha_fin`, `litros`, `estado` (pendiente\|pagado\|punto_venta\|devuelto), `responsable` (conductor\|punto_venta\|gerente), `fecha_marcado`, `activado_por`/`marcado_por` (FK→auth.users), `created_at`, `updated_at` |

### Dashboard

The dashboard page (`app/dashboard/page.tsx`) accepts `searchParams` with optional `mes` and `anio` query params for filtering. Uses "effective month/year" (filtered or current) and compares against previous month for trend badges.

- **Cards**:
  1. Gastos del mes + tendencia vs mes anterior
  2. Ingresos del mes (neto) + desglose bruto/aportación + tendencia
  3. Leche hoy + promedio por vaca en producción
  4. Leche del mes + corte por quincenas (Q1/Q2) + descuento Fedegan (0.75%) + promedio por vaca
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
NEXT_PUBLIC_SUPABASE_SCHEMA          # optional — defaults to "public", set to "preview" for preview env
```

Both required vars are set in `.env.local`. The app uses the modern publishable key format (`sb_publishable_...`), not the legacy anon JWT.

`public` and `preview` are two schemas in the **same** Supabase project (no project-level branching) — switching `NEXT_PUBLIC_SUPABASE_SCHEMA` just points PostgREST at the other schema. `supabase/preview-schema.sql` is a from-scratch bootstrap script for the `preview` schema; it's a useful reference for RLS policy shape but is **not** kept in lockstep with `public` (it's missing `itinerarios`/`itinerarios_fincas`/`user_itinerarios`/`pagos_finca` and the older `get_cooperativa_users()` body it defines still joins `user_rutas` instead of `user_itinerarios`) — don't treat running it as reproducing a real clone of `public`. `supabase/copy-public-to-preview.sql` copies data `public` → `preview` (truncates `preview` first) and is structurally accurate since both schemas share the same table/column layout.

### Path Alias

`@/*` maps to `src/*` (configured in `tsconfig.json`).

### Deployment

Deployed on Vercel. The `.npmrc` file at the root is intentionally committed to configure pnpm for Vercel's build environment. The `develop` branch deploys as a preview environment.
