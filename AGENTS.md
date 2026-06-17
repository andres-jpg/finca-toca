# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

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
│   │   └── informes-cooperativa/     # GET → Excel report (ExcelJS), cooperativa_admin only
│   ├── dashboard/
│   │   ├── cooperativa/              # Cooperativa overview
│   │   ├── fincas-cooperativa/       # Finca CRUD
│   │   ├── rutas-cooperativa/        # Route CRUD + drag-and-drop finca ordering
│   │   ├── recolecciones/            # Daily milk collections
│   │   ├── usuarios-cooperativa/     # User → route assignment (admin only)
│   │   ├── informes-cooperativa/     # Excel report generator
│   │   ├── vacas/[id]/               # Vaca detail page
│   │   ├── toros/[id]/               # Toro detail page
│   │   └── ...                       # gastos, ingresos, extracciones, inventario, configuracion
│   └── (auth)/                       # login, signup
├── features/                         # Feature modules — one per domain entity
│   ├── fincas-cooperativa/
│   ├── rutas-cooperativa/
│   ├── recolecciones/
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
│   ├── supabase/admin.ts             # Service-role client (server-only)
│   └── auth/                         # getUserRole, checkRoutePermission, canWrite, requireRole
├── charts/
│   ├── chart-wrappers.tsx            # Static barrel re-exporting all charts (avoids dynamic imports)
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

**Role-based access control** is enforced at two levels:
- Route level: `await checkRoutePermission(["admin", "viewer"])` in page Server Components — redirects to `/dashboard/extracciones` if unauthorized
- Write level: `canWrite(role)` returns `false` for the `"viewer"` role; pass this boolean down to client components to hide mutation UI
- Server Action level: `await requireRole(["cooperativa_admin"])` throws if the caller's role is not in the allowed list

Roles: `"admin" | "user" | "viewer" | "cooperativa_admin" | "cooperativa_user"` — stored in the `roles` table, not in Supabase Auth metadata.

**Server vs. Client Components**: Pages and layout containers are Server Components that fetch data. Interactive UI (forms, modals, state) uses `"use client"`. The `dashboard-layout-client.tsx` is the client boundary for the dashboard shell; it receives `userRole` as a prop from the server layout.

**Forms** use React Hook Form + Zod (via `zodResolver`). Schemas live in `features/[feature]/schemas/`.

**Data tables** use the shared `components/shared/data-table.tsx` wrapper around TanStack React Table v8 with built-in column filtering, sorting, and pagination.

**Read-only detail modals**: Tables that need a view-only mode use an inline detail component (not the form) rendered inside `EntityModal`. The eye icon (`Eye` from lucide-react) triggers it and is visible for all roles including `viewer`.

**Supabase one-to-one joins**: When a table has a `UNIQUE` FK (e.g. `pagos.gasto_id`), PostgREST may return the embedded resource as an object rather than an array. Always handle both cases: `Array.isArray(row.rel) ? row.rel[0] : row.rel ?? null`.

**PostgREST row cap**: PostgREST has a `max_rows` cap (default 1000). For queries that may exceed this, paginate using `.range(from, from + PAGE - 1)` in a `while` loop until `data.length < PAGE`. The `informes-cooperativa` API route uses this pattern (`fetchAllRecolecciones`).

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

**Zod schemas**: `z.enum()` and `z.number()` in this project's Zod version do NOT accept `required_error`/`invalid_type_error` — use `message` instead.

### Cooperativa Module

The cooperativa module manages a milk cooperative: farms (fincas), collection routes (rutas), daily milk pickups (recolecciones), user-to-route assignments, and Excel report generation.

**Features and pages:**

| Feature | Route | Access |
|---|---|---|
| `fincas-cooperativa` | `/dashboard/fincas-cooperativa` | `cooperativa_admin` |
| `rutas-cooperativa` | `/dashboard/rutas-cooperativa` | `cooperativa_admin` |
| `recolecciones` | `/dashboard/recolecciones` | `cooperativa_admin`, `cooperativa_user` |
| `usuarios-cooperativa` | `/dashboard/usuarios-cooperativa` | `cooperativa_admin` |
| `informes-cooperativa` | `/dashboard/informes-cooperativa` | `cooperativa_admin` |
| Overview | `/dashboard/cooperativa` | `cooperativa_admin`, `cooperativa_user` |

**Data isolation for `cooperativa_user`**: In `getRecolecciones()`, if the caller's role is `cooperativa_user`, the query is automatically scoped to the fincas belonging to their assigned route (`user_rutas` → `rutas_fincas`). If no route is assigned, the function returns `[]`.

**Finca ordering in routes**: `rutas_fincas` has an `orden` column. The `FincasOrderEditor` component lets admins drag-and-drop fincas within a route; `updateFincasOrden()` updates each row.

**Recolecciones uniqueness**: `(finca_id, fecha)` has a UNIQUE constraint. The creation form excludes fincas that already have a collection on the selected date.

**Informe Excel**: `GET /api/informes-cooperativa` generates an `.xlsx` with ExcelJS. Supports three types: `finca` (single farm), `ruta` (all farms in a route), `general` (all routes, grouped with subtotals). Applies a 0.75% Fedegan discount. Auth-gated to `cooperativa_admin`.

**RLS policies for `recolecciones`** (public schema):

| Operation | Allowed roles |
|---|---|
| SELECT | `admin`, `cooperativa_admin`, `cooperativa_user` |
| INSERT | `admin`, `cooperativa_admin`, `cooperativa_user` |
| UPDATE | `admin`, `cooperativa_admin`, `cooperativa_user` |
| DELETE | `admin`, `cooperativa_admin` |

**User-route assignment**: `usuarios-cooperativa` uses `user_rutas` (upsert on `user_id`) and calls the `get_cooperativa_users` RPC (returns all users with `cooperativa_user` role + their assigned route).

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
| `roles` | `user_id`, `rol` |
| `fincas_cooperativa` | `id`, `nombre`, `precio_litro`, `activa`, `created_at` |
| `rutas_cooperativa` | `id`, `nombre`, `created_at` |
| `rutas_fincas` | `ruta_id` (FK), `finca_id` (FK, unique), `orden` (int) |
| `recolecciones` | `id`, `finca_id` (FK), `fecha`, `litros`, `precio_litro`, `created_at` — unique (finca_id, fecha) |
| `user_rutas` | `user_id` (unique FK→auth.users), `ruta_id` (FK→rutas_cooperativa) |

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

### Path Alias

`@/*` maps to `src/*` (configured in `tsconfig.json`).

### Deployment

Deployed on Vercel. The `.npmrc` file at the root is intentionally committed to configure pnpm for Vercel's build environment. The `develop` branch deploys as a preview environment.
