# Patrones de código (Next.js, Supabase, formularios, tablas)

> Detalle movido desde CLAUDE.md. Léelo antes de tocar esta área.

### Key Patterns

**Server Actions** are the mutation layer. Each feature's `actions/` folder contains async server functions that call Supabase and then call `revalidatePath()` to trigger ISR cache invalidation.


**Server vs. Client Components**: Pages and layout containers are Server Components that fetch data. Interactive UI (forms, modals, state) uses `"use client"`. The `dashboard-layout-client.tsx` is the client boundary for the dashboard shell; it receives `userRole` as a prop from the server layout.

**Forms** use React Hook Form + Zod (via `zodResolver`). Schemas live in `features/[feature]/schemas/`.

**Data tables** use the shared `components/shared/data-table.tsx` wrapper around TanStack React Table v8 with built-in column filtering, sorting, and pagination.

**Read-only detail modals**: Tables that need a view-only mode use an inline detail component (not the form) rendered inside `EntityModal`. The eye icon (`Eye` from lucide-react) triggers it and is visible for all roles including `viewer`.

**Supabase one-to-one joins**: con un FK `UNIQUE` (p. ej. `pagos.gasto_id`) PostgREST puede devolver el recurso embebido como objeto o como array: normalízalo siempre con `aUno()`/`aLista()` (ver *Clientes Supabase tipados*), nunca asumas la forma.

**Clientes Supabase tipados** (`server.ts`, `client.ts`, `admin.ts` llevan `<Database>` de `database.types.ts`): las filas y los `select` con joins salen tipados, así que **no anotes `(row: any)`** en callbacks — se infiere solo, y `@typescript-eslint/no-explicit-any` es un error de lint. Para las relaciones embebidas que pueden venir como objeto o como array usa `aUno()` / `aLista()` de `lib/supabase/relaciones.ts` (y `Rel<T>` para tipar una fila a mano en un mapper), en vez de repetir `Array.isArray(...)`. Los campos que en BD son `text` con un CHECK (`estado`, `metodo_pago`, `responsable`…) llegan como `string`: se estrechan con un cast al tipo de `@/types`, comentando que es el CHECK. Si cambias el esquema, regenera los tipos (`pnpm db:types`) o los `select` dejarán de compilar — es el aviso que se busca.

**PostgREST row cap**: PostgREST has a `max_rows` cap (default 1000). For queries that may exceed this, paginate using `.range(from, from + PAGE - 1)` in a `while` loop until `data.length < PAGE`. The `informes-cooperativa` API route uses this pattern (`fetchAllRecolecciones`). Several dashboard pages do an un-paginated `.select()` over a table's full history (e.g. `dashboard/page.tsx`'s `gastos`/`ingresos`/`extracciones_leche` fetches) — these are subject to the same 1000-row cap and will silently truncate once a table grows past it; only `informes-cooperativa` and its `/preview` JSON counterpart (both go through `buildInformeData`) currently paginate.

**Deduplicate `supabase.auth.getUser()` per request**: it always does a real round-trip to Supabase Auth (unlike `getSession()`, which just decodes the cookie locally). `getCurrentUser()` (`lib/auth/get-user-role.ts`) wraps it in `React.cache()`; `getUserRole()` calls `getCurrentUser()` internally. Always import `getCurrentUser` instead of calling `supabase.auth.getUser()` directly in a Server Action/Route Handler/Server Component that might run after `getUserRole()`/`requireRole()` already resolved the session — calling the raw method again is a second network round-trip that `cache()` would have deduplicated for free.

**`next/dynamic` with `{ ssr: false }`**: only allowed inside a `"use client"` module — calling it directly in a Server Component (e.g. a `page.tsx`) fails the build with "`ssr: false` is not allowed with `next/dynamic` in Server Components." Put the `dynamic()` calls in a small client wrapper file (see `chart-wrappers.tsx` / `cooperativa-chart-wrappers.tsx`) and import the already-wrapped component into the page.

