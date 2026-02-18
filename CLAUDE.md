# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Finca Toca** is a farm management dashboard for tracking cattle operations, milk extraction, expenses, and income. Built with Next.js 16 (App Router), React 19, TypeScript, Supabase (PostgreSQL + Auth), TailwindCSS v4, and shadcn/ui.

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
├── app/                    # Next.js App Router pages
│   ├── dashboard/          # Protected routes (gastos, ingresos, extracciones, vacas)
│   └── (auth)/             # login, signup
├── features/               # Feature modules — one per domain entity
│   └── [feature]/
│       ├── actions/        # Server Actions (data mutations + queries)
│       ├── components/     # Feature-specific UI
│       └── schemas/        # Zod validation schemas
├── components/
│   ├── layout/             # Sidebar, header, dashboard shell
│   ├── shared/             # data-table, entity-modal, date-picker, etc.
│   └── ui/                 # shadcn/ui primitives
├── lib/
│   ├── supabase/server.ts  # Server-side Supabase client (cookie-based)
│   ├── supabase/client.ts  # Client-side Supabase client
│   └── auth/               # getUserRole, checkRoutePermission, canWrite
├── charts/                 # Recharts visualizations
└── types/index.ts          # Shared TypeScript interfaces
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

### Database Tables

| Table | Key columns |
|---|---|
| `extracciones_leche` | `id`, `fecha`, `litros` |
| `gastos` | `id`, `fecha`, `concepto`, `valor`, `observaciones` |
| `ingresos` | `id`, `fecha`, `concepto`, `valor`, `observaciones` |
| `vacas` | `id` (UUID), `vaca_id` (number), `nombre` |
| `roles` | `user_id`, `rol` |

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
