# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Finca Toca** is a farm management dashboard for tracking cattle operations, milk extraction, expenses, and income. Built with Next.js 16 (App Router), React 19, TypeScript, Supabase (PostgreSQL + Auth), TailwindCSS v4, and shadcn/ui.

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
├── app/                        # Next.js App Router pages
│   ├── dashboard/              # Protected routes + detail pages (/vacas/[id], /toros/[id])
│   └── (auth)/                 # login, signup
├── features/                   # Feature modules — one per domain entity
│   └── [feature]/
│       ├── actions/            # Server Actions (data mutations + queries)
│       ├── components/         # Feature-specific UI
│       └── schemas/            # Zod validation schemas
├── components/
│   ├── layout/                 # Sidebar, header, dashboard shell
│   ├── shared/                 # data-table, entity-modal, date-picker, etc.
│   ├── dashboard/              # Dashboard-specific components (DashboardFilter)
│   └── ui/                     # shadcn/ui primitives
├── lib/
│   ├── supabase/server.ts      # Server-side Supabase client (cookie-based)
│   ├── supabase/client.ts      # Client-side Supabase client
│   └── auth/                   # getUserRole, checkRoutePermission, canWrite
├── charts/                     # Recharts visualizations
│   ├── gastos-ingresos-line-chart.tsx
│   ├── conceptos-donut-chart.tsx
│   └── extracciones-line-chart.tsx
└── types/index.ts              # Shared TypeScript interfaces
```

### Key Patterns

**Server Actions** are the mutation layer. Each feature's `actions/` folder contains async server functions that call Supabase and then call `revalidatePath()` to trigger ISR cache invalidation.

**Role-based access control** is enforced at two levels:
- Route level: `await checkRoutePermission(["admin", "viewer"])` in page Server Components — redirects to `/dashboard/extracciones` if unauthorized
- Write level: `canWrite(role)` returns `false` for the `"viewer"` role; pass this boolean down to client components to hide mutation UI

Roles (`"admin"` | `"user"` | `"viewer"`) come from the `roles` table in Supabase, not from Supabase Auth metadata.

**Server vs. Client Components**: Pages and layout containers are Server Components that fetch data. Interactive UI (forms, modals, state) uses `"use client"`. The `dashboard-layout-client.tsx` is the client boundary for the dashboard shell; it receives `userRole` as a prop from the server layout.

**Forms** use React Hook Form + Zod (via `zodResolver`). Schemas live in `features/[feature]/schemas/`.

**Data tables** use the shared `components/shared/data-table.tsx` wrapper around TanStack React Table v8 with built-in column filtering, sorting, and pagination.

**Read-only detail modals**: Tables that need a view-only mode use an inline detail component (not the form) rendered inside `EntityModal`. The eye icon (`Eye` from lucide-react) triggers it and is visible for all roles including `viewer`.

**Supabase one-to-one joins**: When a table has a `UNIQUE` FK (e.g. `pagos.gasto_id`), PostgREST may return the embedded resource as an object rather than an array. Always handle both cases: `Array.isArray(row.rel) ? row.rel[0] : row.rel ?? null`.

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
| `vacas` | `id` (UUID), `vaca_id` (int), `nombre`, `origen` (finca\|externa), `estado` (produccion\|secado\|pre_jardin\|jardin\|transicion), `fecha_compra`, `fecha_nacimiento`, `numero_registro`, `madre_id` (FK→vacas), `padre_id` (FK→toros), `alta` |
| `toros` | `id` (UUID), `toro_id` (int), `nombre`, `origen` (finca\|externa), `estado` (jardin\|reproductor), `fecha_compra`, `fecha_nacimiento`, `numero_registro`, `madre_id` (FK→vacas), `padre_id` (FK→toros), `alta` |
| `eventos_animal` | `id`, `animal_id` (UUID), `animal_tipo` (vaca\|toro), `tipo_evento`, `fecha`, `descripcion`, `responsable`, `created_at` |
| `roles` | `user_id`, `rol` |

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
```

Both are set in `.env.local`. The app uses the modern publishable key format (`sb_publishable_...`), not the legacy anon JWT.

### Path Alias

`@/*` maps to `src/*` (configured in `tsconfig.json`).

### Deployment

Deployed on Vercel. The `.npmrc` file at the root is intentionally committed to configure pnpm for Vercel's build environment.
