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
│   │   └── ...                       # gastos, ingresos, extracciones, inventario, configuracion
│   └── (auth)/                       # login, signup
├── features/                         # Feature modules — one per domain entity
│   ├── animales/
│   ├── eventos-animal/
│   ├── alertas/                      # lib/calcular-alertas.ts (pura) + queries + campana/tarjeta/ficha
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

**Apuntes automáticos de la leche** (`extracciones.actions.ts`): cada extracción se parte en `litros_cantina` (se vende) y `litros_cria` (se queda para los terneros). `sincronizarApuntesLeche(fecha)` regenera **los dos** apuntes contables de esa fecha con el precio vigente del litro: `upsertIngresoLeche` → `ingresos.source = 'leche_extraccion'`, `upsertGastoLecheCria` → `gastos.source = 'leche_cria'` (subconcepto "Leche para crías", bajo "Alimentación animal", uno por tenant; se inserta con `pagado: true` porque no es una factura pendiente con un tercero). Ambos se recalculan por fecha completa —no por fila— y se **borran** si el día se queda sin litros de ese destino o si no hay precio registrado; al cambiar la fecha de una extracción hay que sincronizar también la fecha vieja. Llama siempre a `sincronizarApuntesLeche()`, no a un upsert suelto, o el otro apunte queda desincronizado.

**Role-based access control** is enforced at three levels — all three matter, since RLS is the only one a client can't bypass by calling Supabase's REST/RPC API directly with the public anon key:
- Route level: `await checkRoutePermission(["admin", "viewer"])` in page Server Components — redirects to `/dashboard/extracciones` if unauthorized
- Write level: `canWrite(role)` / `canDelete(role)` return `false` for the `"viewer"` role; pass these booleans down to client components to hide mutation UI
- Server Action / API route level: `await requireRole(["cooperativa_admin"])` throws if the caller's role is not in the allowed list (use this in every mutating Server Action — it's a public POST endpoint regardless of which UI calls it)
- **Database level (RLS)**: every `public` table's INSERT/UPDATE/DELETE policy checks `roles.rol` via `EXISTS (SELECT 1 FROM roles WHERE roles.user_id = auth.uid() AND roles.rol = ANY(ARRAY[...]))` — not just `TO authenticated USING (true)`. This is the actual authorization boundary; the three levels above are UX/defense-in-depth on top of it. When adding a new table, write its policies to match the same role matrix as the table's `requireRole(...)` calls — see "RLS policies" under Cooperativa Module.

**Multi-tenancy (lado finca)**: la app sirve a varios clientes — hoy Villa Blanca y El Velero. `tenants` es la tabla de clientes y `roles.tenant_id` ata cada usuario al suyo (NULL en los roles de cooperativa, que no son multi-tenant). Las 12 tablas del lado finca llevan `tenant_id NOT NULL`. **No se llama `finca_id` porque ese nombre ya significa "finca proveedora de la cooperativa"** en `recolecciones`/`rutas_fincas`/`itinerarios_fincas`/`pagos_finca`.
- El aislamiento no requiere tocar los Server Actions: **RLS filtra las lecturas** (`tenant_id = tenant_actual()`) y **`DEFAULT public.tenant_actual()` estampa las escrituras**, con el `WITH CHECK` impidiendo falsear el cliente. No añadas `tenant_id` a mano en los INSERT.
- `tenant_actual()` y `rol_actual()` son `STABLE SECURITY DEFINER` con `search_path = ''`: un lookup por consulta en vez del `EXISTS` sobre `roles` por fila que había antes. El linter de Supabase las marca como "SECURITY DEFINER ejecutable por authenticated" — es inevitable, las políticas se evalúan como el usuario, y solo devuelven el rol/cliente del propio llamante.
- El cron (`createAdminClient()`, service role) salta RLS **a propósito**: avanza estados de todos los clientes.
- Dar de alta un cliente nuevo es solo SQL (ver `supabase/2026-08-05-multitenancy.sql`): fila en `tenants`, usuario en Auth, fila en `roles` con su `tenant_id`. Ni código ni políticas nuevas.
- El nombre llega a la barra lateral vía `getTenantActual()` (`lib/auth/get-tenant.ts`, `React.cache()`), no está hardcodeado.

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

**Fichas de animales**: `vacas` y `toros` se unificaron en la tabla `animales`; la ficha vive en `/dashboard/animales/[id]` (las rutas `vacas/[id]` y `toros/[id]` solo redirigen) y contiene:
- información básica (incluye **días en leche** y **concentrado por ordeño**, ambos solo en hembras)
- genealogía (madre/padre con enlaces cruzados)
- crías (incluyendo estados y alta/baja)
- alertas pendientes de ese animal
- historial de eventos

**Doble estado del animal** (`estado_productivo` + `estado_reproductivo`, enums de Postgres): sustituyen al antiguo campo único `estado`, **eliminado de `animales` el 2026-08-04** — `supabase/2026-08-04-drop-animales-estado.sql` documenta el DROP y guarda el rollback, y los valores originales siguen en `vacas_legacy.estado`/`toros_legacy.estado`. Productivo `leche → levante_1 → levante_2 → produccion ⇄ secado` (machos: `… → reproductor`); reproductivo, solo hembras, con dos entradas: la novilla sube `pre_puber → puber → servicio` (derivado del tramo productivo, no de eventos) y la vaca parida `pre_servicio → servicio`; desde `servicio` el flujo es `→ por_confirmar → cargada | rechequeo`; **`vacia` se eliminó el 2026-08-07** y una palpación con resultado "vacía" devuelve la vaca directamente a `servicio` (ver `estadoDesdeEvento()`). **`src/lib/animales/estados.ts` es la única fuente de verdad**: etiquetas, colores, hex, estados válidos por sexo, constantes de plazos (`MESES_SECADO`, `MESES_PARTO`, `DIAS_TOPIZADO`, `DIAS_CELO_POST_PARTO`, `DIAS_CICLO_CELO`), `estadoProductivoPorEdad()`, `estadoDesdeEvento()` y `formatEdad()` (edad en texto para la ficha — se calcula en el servidor y se pasa ya formateada, porque `parseFechaDB` resuelve en la zona local y en Vercel es UTC frente al UTC-5 del navegador). Antes estos mapas estaban duplicados en cuatro componentes — no los reintroduzcas localmente.

**Días en leche (DEL)**: **no se guarda en la tabla** — `calcularDiasEnLeche()` (`lib/animales/estados.ts`, función pura) lo deriva en cada lectura, igual que las alertas. La lactancia **arranca** con un `parto` o `aborto` y **se cierra** con un `secado` (contador a 0); gana el evento más reciente de esos tres. Se cuenta desde `eventos_animal.fecha`, nunca desde `created_at` ni desde la fecha del cambio de estado. Además devuelve 0 si `estado_productivo === "secado"` aunque no haya evento de secado, porque el estado se puede poner a mano. Sin parto/aborto registrado devuelve `null` y la ficha muestra "Sin parto registrado" en vez de inventar un número. Se calcula **en el servidor** y se pasa ya resuelto a la ficha, por la misma razón que `formatEdad()` (zona horaria de Vercel vs. navegador).

**Concentrado por ordeño** (`animales.concentrado_por_ordeno`, `real` nullable): cantidad de pienso por **cada** ordeño del día, no el total diario. Es manual y puramente informativo — ningún evento ni el cron lo tocan. Solo aplica a hembras: el formulario lo oculta para machos y tanto `createAnimal` como `updateAnimal` lo fuerzan a `null` si `sexo === "macho"`. `null` = sin definir, distinto de 0.

**Eventos por animal**: El módulo `features/eventos-animal` centraliza `getEventosAnimal()`, `createEventoAnimal()`, `updateEventoAnimal()`, `deleteEventoAnimal()`, la validación Zod, el formulario (`EventForm`, con campos condicionales por tipo) y el timeline (`EventsTimeline`). Añadir un `tipo_evento` obliga a tocar 5 sitios: el CHECK de Postgres, `TipoEvento` en `types/index.ts`, `eventoSchema`, `TIPO_LABELS` en `event-form.tsx` y `TIPO_CONFIG` en `events-timeline.tsx`. Si además mueve el estado del animal, súmale `estadoDesdeEvento()` y `TIPOS_EVENTO_CON_TRANSICION` en `lib/animales/estados.ts` (y `TIPOS_EVENTO_PARA_ALERTAS` si lo necesita `calcularAlertas()`).

Al crear/editar un evento, `aplicarTransicionEstado()` mueve el estado del animal según `estadoDesdeEvento()`. Es un modelo **delta hacia adelante**: solo escribe un eje si no existe ya un evento *posterior* que lo gobierne, de modo que registrar con retraso una inseminación antigua no revierte una vaca que ya parió, y un estado puesto a mano solo lo pisa un evento más nuevo.

Al borrarlo, `recalcularEstadoTrasBorrado()` hace lo inverso: si el evento borrado era el que gobernaba un eje (nada posterior lo pisa), ese eje vuelve al efecto del evento anterior que lo gobierne; si no queda ninguno, el estado se deja intacto en vez de inventar un valor. `eventos_animal` tiene política RLS de DELETE desde el 2026-08-05 (`admin`/`user`) — antes el borrado era un no-op silencioso, por lo que `deleteEventoAnimal()` comprueba `count === 0` para no dar por buena una fila no borrada.

**Inventario de pajillas** (`features/inventario/pajillas`): el consumo de stock ocurre **al registrar la inseminación**, no al dar de alta la cría. `createEventoAnimal` descuenta 1 del lote antes de insertar (y lo devuelve si el insert falla), `updateEventoAnimal` compensa al cambiar de lote y `deleteEventoAnimal` reintegra la pajilla; todo pasa por `ajustarStockPajilla()`, que acota el resultado a `[0, cantidad]`. `nombreToroDeLote()` en el alta de la cría ya **no** toca el inventario — hacerlo restaba dos pajillas por una sola monta.

El evento referencia el **lote** (`pajillas.id`), no `toro_ref_id`. Ese campo es texto libre y está repetido (en producción "NA" lo comparten cinco toros y "TRO-001A" otros dos), así que agrupar por él fusionaba lotes de toros distintos y escondía inventario. Usa `getLotesPajillas()` para cualquier selector; `getPajillasPorToro()` queda solo para la tarjeta resumen y agrupa por nombre+ref. El selector oculta los lotes agotados salvo el que ya tenga seleccionado el evento que se edita, que puede estar a 0 justo porque esa inseminación gastó la última.

`aborto` (añadido el 2026-08-05) cierra la gestación igual que un `parto`: deja la vaca en `produccion` + `pre_servicio`, con lo que decaen solas las alertas de parto probable y secado (ambas exigen `cargada`) y arranca la de celo a los `DIAS_CELO_POST_PARTO`. `TIPOS_EVENTO_FIN_GESTACION` agrupa ambos para `calcularAlertas()`.

**Alertas** (`features/alertas`): 4 tipos — parto probable, pasar a secado, topizado y celo. **No se guardan en tabla**: `calcularAlertas()` (`lib/calcular-alertas.ts`, función pura) las deriva de `animales` + `eventos_animal` en cada lectura, y una alerta desaparece cuando existe el evento que la resuelve. Se muestran en la campana del header, una tarjeta del dashboard y la ficha del animal; no hay página `/dashboard/alertas`.
- **Secado y parto se cuentan desde `eventos_animal.fecha` del último evento `inseminacion`/`monta`** — nunca desde la palpación, `created_at` ni la fecha del cambio de estado. Ambas solo aparecen con la vaca ya en `cargada`; si está cargada sin evento de servicio, la ficha muestra "Falta registrar la inseminación" en lugar de inventar fechas (`faltaRegistrarServicio()`).
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
| `gastos` | `id`, `fecha`, `subconcepto_id` (FK), `valor`, `proveedor`, `numero_factura`, `pagado`, `observaciones`, `source` (NULL=manual, 'leche_cria'=auto) |
| `pagos` | `id`, `gasto_id` (UNIQUE FK→gastos), `forma_pago` (efectivo\|transferencia), `tipo_cuenta`, `banco`, `numero_cuenta` |
| `ingresos` | `id`, `fecha`, `subconcepto_id` (FK), `valor`, `observaciones`, `source` (NULL=manual, 'leche_extraccion'=auto) |
| `precios` | `id`, `created_at`, `valor`, `tipo` |
| `conceptos_gasto` + `subconceptos_gasto` | hierarchy for gastos categories |
| `conceptos_ingreso` + `subconceptos_ingreso` | hierarchy for ingresos categories |
| `animales` | `id` (UUID), `identificador` (text, **sin unique** — hay duplicados históricos, la unicidad por `(identificador, sexo)` se valida en código), `nombre`, `sexo` (enum `animal_sexo`), `raza` (enum `animal_raza`), `origen` (enum `vaca_origen`), `estado_productivo` (enum: leche\|levante_1\|levante_2\|produccion\|secado\|reproductor), `estado_reproductivo` (enum: pre_puber\|puber\|pre_servicio\|servicio\|por_confirmar\|rechequeo\|cargada, solo hembras), `fecha_compra`, `fecha_nacimiento`, `numero_registro`, `madre_id`/`padre_id` (FK→animales), `padre_pajilla_nombre`, `padre_alquiler_nombre`, `padre_alquiler_raza`, `nombre_largo` (solo El Velero), `madre_externa_nombre`, `sangre` (solo El Velero), `concentrado_por_ordeno` (manual, solo hembras), `alta` |
| `eventos_animal` | `id`, `animal_id` (FK→animales, ON DELETE CASCADE), `animal_tipo` (vaca\|toro — vestigial, se deriva de `sexo`), `tipo_evento` (CHECK de 14 valores), `fecha`, `descripcion`, `responsable`, `resultado` (cargada\|rechequeo\|vacia, solo palpación/confirmación), `pajilla_id` (FK→pajillas, ON DELETE SET NULL — lote usado en la inseminación), `toro_id` (FK→animales), `created_at` |
| `pajillas` | `id` (UUID), `toro_nombre`, `toro_ref_id` (texto libre, **no es identificador**: hay refs repetidas como "NA"), `proveedor`, `fecha_compra`, `cantidad`, `cantidad_disponible`, `observaciones`, `created_at` |
| `vacas_legacy` / `toros_legacy` | Tablas previas a la unificación. **Ningún código las lee**; se conservan solo como respaldo del refactor — son el único sitio donde queda el `estado` antiguo (`jardin`\|`pre_jardin`\|`transicion`\|`produccion`\|`secado`) tras eliminarlo de `animales`. |
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
NEXT_PUBLIC_SUPABASE_SCHEMA          # optional — defaults to "public", set to "preview" for preview env
SUPABASE_SERVICE_ROLE_KEY            # server-only — createAdminClient() (cron de estados)
CRON_SECRET                          # server-only — Bearer que valida /api/cron/animales-estados
```

Both required vars are set in `.env.local`. The app uses the modern publishable key format (`sb_publishable_...`), not the legacy anon JWT.

`public` and `preview` are two schemas in the **same** Supabase project (no project-level branching) — switching `NEXT_PUBLIC_SUPABASE_SCHEMA` just points PostgREST at the other schema. `supabase/preview-schema.sql` is a from-scratch bootstrap script for the `preview` schema; it's a useful reference for RLS policy shape but is **not** kept in lockstep with `public` (it's missing `itinerarios`/`itinerarios_fincas`/`user_itinerarios`/`pagos_finca` and the older `get_cooperativa_users()` body it defines still joins `user_rutas` instead of `user_itinerarios`) — don't treat running it as reproducing a real clone of `public`. `supabase/copy-public-to-preview.sql` copies data `public` → `preview` (truncates `preview` first) and is structurally accurate since both schemas share the same table/column layout.

`preview` se migró a la entidad unificada `animales` el 2026-08-04 (`supabase/2026-08-04-preview-unificar-animales.sql`), preservando sus propios datos y los UUID originales; `vacas`/`toros` quedaron como `vacas_legacy`/`toros_legacy` igual que en `public`. Hoy ambos schemas tienen **las mismas 23 tablas y columnas idénticas** en `animales` y `eventos_animal`. Dos diferencias deliberadas que quedan: los enums (`animal_sexo`, `animal_raza`, `vaca_origen`, `estado_productivo`, `estado_reproductivo`, `rol`) existen **solo en `public`** y `preview` los referencia cualificados, y las políticas RLS de `preview` son `TO authenticated` mientras las de `public.animales` son `TO public` (irrelevante en la práctica: ambas exigen una fila en `roles` vía `auth.uid()`).

### Path Alias

`@/*` maps to `src/*` (configured in `tsconfig.json`).

### Deployment

Deployed on Vercel. The `.npmrc` file at the root is intentionally committed to configure pnpm for Vercel's build environment. The `develop` branch deploys as a preview environment.
