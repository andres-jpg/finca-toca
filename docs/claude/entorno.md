# Entorno: auth, variables, desarrollo local, E2E, migraciones, despliegue, CI y Sentry

> Detalle movido desde CLAUDE.md. Léelo antes de tocar esta área.

### Authentication Flow

1. El proxy de Next (`src/proxy.ts`; en Next 16 sustituye a `middleware.ts`) redirige a `/login` a quien no tiene sesión en `/dashboard/*` y `/admin/*`, y a `/dashboard` a quien ya la tiene en `/login` o `/signup`. Las rutas `(print)` no pasan por aquí: su layout exige sesión él mismo.
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
| `coop.admin@test` | `cooperativa_admin` | Toca Lácteos |
| `coop.user@test` | `cooperativa_user` | Toca Lácteos (itinerario 1) |

- Cada cliente trae 3 animales, 5 eventos, 10 días de extracciones, el catálogo de conceptos/subconceptos, un precio de leche, un lote de pajillas y un gasto/ingreso de ejemplo; la cooperativa trae 2 fincas, 1 ruta, 1 itinerario y 5 recolecciones. Las fechas son relativas a `current_date`, así que el dashboard del mes en curso nunca sale vacío.
- Los tenants del seed usan los **slugs reales** (`villa-blanca`, `el-velero`) y solo el nombre dice "demo": el código compara el slug en algunos sitios (campos de sangre de El Velero) y los módulos del seed (`tenant_modulos`) se asignan por esos tenants: Arriendos solo a Villa Blanca. Con otros slugs esas pantallas no se verían en local.
- En el seed, `tenant_id` va **siempre explícito**: su `DEFAULT tenant_actual()` depende de `auth.uid()` y el seed corre sin sesión (devolvería NULL). Las tablas con id serial (`fincas_cooperativa`, `rutas_cooperativa`) no llevan id fijo, o la secuencia se quedaría en 1 y el siguiente alta desde la app chocaría.
- El seed **no crea platform admins**: para probar `/admin` en local, `insert into public.platform_admins (user_id) select id from auth.users where email = 'admin@vb.test';` (ver *Altas manuales*).
- **No ejecutes `seed.sql` contra staging ni producción**: crea usuarios con contraseña conocida.

**Tras cada migración: `pnpm db:types`.** Regenera `src/lib/supabase/database.types.ts` desde la base local (de ahí sale `UserRole` y los enums). Si cambias el esquema, commitea migración y tipos juntos. El script usa `--schema public,cafe` para que no entre `graphql_public`. **El CLI de Supabase está fijado como devDependency (`supabase@2.122.0`)**: los scripts `db:*` y `pnpm exec supabase …` usan siempre esa versión, así que el fichero de tipos sale idéntico en cualquier máquina y en el CI, y no hace falta `brew`. El fichero versionado es la salida literal de ese CLI (formato crudo, sin prettier): no lo edites a mano ni lo formatees; si el diff sale enorme, es que alguien lo generó con otra versión. Para subir de versión: `pnpm add -D supabase@<x.y.z>`, `pnpm db:types` y commitear el cambio junto. Sin Docker no se puede generar (el CLI usa el postgres-meta de la base local).

### Tests E2E (Playwright, FIN-117)

Tercera suite, la única que recorre los flujos como un usuario en el navegador: pgTAP cubre la base, Vitest las funciones puras y esto cubre lo que solo se ve de punta a punta (formularios de planta con bultos, baches y líneas, permisos por rol, impresión, exportación). Código en `e2e/`, config en `playwright.config.ts`; los ficheros son `*.spec.ts` (Vitest solo recoge `src/**/*.test.ts` y excluye `e2e/`).

```bash
pnpm db:start && pnpm db:reset      # base limpia (los tests no la limpian: cada uno crea sus propios datos)
pnpm exec playwright install chromium   # una vez por máquina (en CI: `--with-deps`)
pnpm test:e2e                                  # toda la suite: `pnpm build` + `pnpm start` y a correr (~2 min)
pnpm test:e2e -g "marca propia"                # un solo escenario, por parte de su título
pnpm test:e2e --project=chromium e2e/cafe/permisos.spec.ts
E2E_SERVER=dev pnpm test:e2e --ui              # depurar con `pnpm dev` y el modo interactivo; el informe HTML queda en playwright-report/
```

- **Entorno**: Supabase local (`.env.local`, ver *Desarrollo local*) y la app en el puerto **3100** (`E2E_PORT`; no 3000, que suele estar ocupado). Playwright arranca el servidor solo y reutiliza uno ya levantado en ese puerto fuera de CI. `E2E_SERVER` elige cómo se levanta: por defecto `pnpm build && pnpm start` (la app compilada; las variables de `.env.local` se incrustan en el build); `start` salta el build (el CI construye en su propio paso); `dev` usa `pnpm dev`. **El modo por defecto no es `pnpm dev`** (la tarea lo proponía) porque `next dev` compila cada ruta la primera vez que se pide: la suite tardó ~14 min y las esperas se agotaban en frío; compilada pasa estable en ~1 min. Con `dev` los timeouts son holgados (120 s por test) y `irA()` espera a que React hidrate antes de escribir en un formulario, pero no lo uses para la suite entera. Ojo: `build` y `dev` comparten `.next`, no los lances a la vez.
- **Seed E2E (`supabase/dev/e2e-seed.sql`)**: lo aplica `e2e/global-setup.ts` en cada ejecución, por `docker exec` al contenedor `supabase_db_finca-toca` (`E2E_DB_CONTAINER` lo cambia). Crea el cliente «Cofradía (E2E)» (slug `cafe-e2e`, módulos base + panel, exportación y ventas) con `admin@cafe.test`, `operativo@cafe.test` y `gerencia@cafe.test` (contraseña `password123`), un proveedor, un cliente de servicios, rangos de humedad 10–12 / densidad 600–750 y stock de bolsas y etiquetas. Es idempotente y se niega a correr si `NEXT_PUBLIC_SUPABASE_URL` no es local. Las regresiones de ganadería y cooperativa usan los usuarios de `seed.sql` (`admin@vb.test`, `coop.admin@test`, `coop.user@test`).
  - **Por qué no está en `supabase/seed.sql`** (la tarea lo proponía): un cliente de café extra rompe pgTAP (varios ficheros de `pnpm test:db` cuentan clientes o dependen de claves que se duplican; es lo mismo que pasa con `supabase/dev/cafe-demo.sql`). El seed E2E convive con el demo, pero no con `pnpm test:db`: lanza pgTAP desde un `db:reset` limpio, antes de la suite E2E.
- **Sesión por rol**: `global-setup.ts` inicia sesión una vez por usuario (`e2e/fixtures/auth.ts` → `USUARIOS`) y guarda las cookies en `e2e/.auth/<rol>.json` (ignorado por git); cada fichero elige rol con `test.use(usarRol("cafeAdmin"))`. Va en el `globalSetup` y no en un proyecto `setup` porque `-g` filtraría también ese proyecto y la sesión no existiría.
- **Cada `test()` es independiente**: crea sus lotes, compras y ventas (`e2e/helpers/api.ts` monta el punto de partida por las mismas RPC que la app, como un usuario real; lo que el escenario quiere probar se hace SIEMPRE por la interfaz) y la base se comparte entre tests y entre ejecuciones. Por eso nunca compara stocks absolutos sino **diferencias** (`stockDe()` antes y después) y localiza su lote por el código que lee del aviso (`textoDelAviso`). `workers: 1`: un inventario compartido no admite dos escenarios a la vez.
- **Proyectos**: `chromium` (escritorio) corre todo; `tablet` (`devices['iPad (gen 7) landscape']` forzado a Chromium, para instalar un solo navegador) corre solo los tests con `@tablet` en el título, los formularios de planta que se piensan para la tablet. Trazas y capturas solo al fallar (`retain-on-failure`, `only-on-failure`).
- **Selectores**: por rol ARIA, etiqueta o texto visible; nunca por clases. `TerceroCombobox` no expone nombre accesible, así que se abre por su texto de marcador («Selecciona un proveedor»).
- **Escenarios**: `e2e/cafe/` — `marca-propia` (compra → tostión parcial 2/6 → resto → empaque 500 g y 2.500 g → venta con factura pendiente → número de Aliados), `servicio-completo` (recepción con aviso de humedad → trilla, tostión de 30 baches, molienda, empaque → remisión → impresión con copia = 2 tiquetes → «Entregado»), `solo-trilla` (desvío del 25 % + remisión), `permisos` (orden de pasos, operativo sin maestros, gerencia sin Planta y con Excel), `reapertura`, `cortesia` (destinatario obligatorio, sin consumidor final), `entrega` (remisión multi-lote desde `/planta/entregar` con quién recibe; y el diálogo «Lote listo · ¿Entregar ahora?» tras el último empaque de un lote de terceros, que lleva a `/planta/entregar?lote=` con el lote preseleccionado: el diálogo lo pinta la página con `?listo=1` (`LoteListoDialog`), no `EmpaqueForm`, porque la revalidación de `/planta/<lote>` cambia la `key` y desmonta el formulario), `baches` (tiempo/temperatura reales y pesaje agrupado), `inventario` (pestañas `?tab=` y Gerencia solo lectura), `venta-tarjetas` (venta por tarjetas de producto), `aislamiento` (otro vertical y sin sesión), y los cuatro de QA de FIN-140 (`qa-escenario-1-terceros-a-credito`; `qa-escenario-2-perfil-por-bache`; `qa-escenario-3-marca-propia`, con empaque grano + molido y sobrante a granel; `qa-escenario-4-correccion`, admin corrige y operativo sin «Editar») más `qa-transversal` (pestaña `<cliente> · <pantalla>` y menú 8/6) y `panel` (por cobrar, «Para decidir hoy», proveedores, merma de tostión con banda y renombres); `e2e/regresion/` — humo de Villa Blanca, cooperativa admin y conductor: solo navegan y exigen **consola sin errores** (`errores` de `fixtures/test.ts`).
- **Regla: un flujo nuevo de usuario lleva su escenario E2E** (pantalla con formulario, paso de planta, permiso nuevo, exportación). Si cambia un texto o una etiqueta de una pantalla cubierta, actualiza el escenario en la misma PR. Un fallo intermitente se arregla (esperar a un estado observable, no a un `sleep`), no se salta.
- **CI**: `.github/workflows/e2e.yml` (workflow aparte del `ci` obligatorio; no bloquea el merge salvo que se añada el job `e2e` a la protección de ramas): Supabase local con el CLI fijado, `.env.local` con sus claves, `playwright install --with-deps chromium`, `pnpm build`, `E2E_SERVER=start pnpm test:e2e`, y sube `playwright-report/` y `test-results/` como artefacto solo si falla.

### Migraciones

La fuente de verdad del esquema es `supabase/migrations/` (CLI de Supabase). `20261019000000_baseline.sql` es el esquema `public` completo de producción a 2026-10-19, sin datos; recrea un proyecto vacío: se aplicó a staging (FIN-81) y el esquema resultante coincide con producción. Los `.sql` fechados anteriores y los scripts del antiguo schema `preview` viven en `supabase/legacy/` **solo como historia** — no se ejecutan ni se editan. `supabase/README.md` documenta el enlace a staging y los usuarios de prueba.

Flujo de un cambio de esquema: **local → `db diff` → PR → staging → prod**.
1. Edita el esquema en local y genera el fichero con `pnpm db:diff <nombre>` → `supabase/migrations/<timestamp>_<nombre>.sql`. Revísalo a mano: el diff no captura bien `GRANT`/`REVOKE`, ni cambios de datos.
2. Abre la PR con la migración junto al código que la usa.
3. Al fusionar en `develop`, `migrate.yml` la aplica a staging (ver *CI y migraciones automáticas*); valida en el preview de `develop`.
4. Al fusionar `develop` en `main`, el mismo workflow la aplica a producción tras la aprobación manual del entorno `Production`.

Aplicar a mano (`supabase link --project-ref <proyecto>` + `pnpm db:push:staging` o `supabase db push`) queda como recurso para emergencias o para staging fuera del flujo: comprueba siempre antes a qué proyecto apunta el enlace (`cat supabase/.temp/project-ref`).

Reglas: nunca edites una migración ya aplicada (crea otra), no mezcles datos de clientes en las migraciones, y toda tabla nueva lleva `tenant_id NOT NULL DEFAULT tenant_actual()`, RLS activada y políticas con la misma matriz de roles que sus `requireRole(...)` (ver *Multi-tenancy*).


### Path Alias

`@/*` maps to `src/*` (configured in `tsconfig.json`).

### Deployment

Deployed on Vercel. The `.npmrc` file at the root is intentionally committed to configure pnpm for Vercel's build environment. The `develop` branch deploys as a preview environment against the **staging** Supabase project (see *Environment Variables* and *Migraciones*); `main` deploys to production.

**CI y migraciones automáticas (GitHub Actions, `.github/`)**
- **`ci.yml`** corre en cada PR hacia `develop` y `main`, en un único job llamado exactamente **`ci`** (la protección de ramas exige ese check). Pasos: `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm exec tsc --noEmit` → `pnpm test` → `node --test .github/scripts/verificar-baseline.test.mjs` (tests de los scripts de CI) → Supabase local (`pnpm exec supabase start -x studio,imgproxy,mailpit,edge-runtime,logflare,vector,supavisor,realtime,storage-api`; `start` ya aplica migraciones y seed) → `pnpm test:db` → **drift de tipos** (`pnpm db:types` + `git diff --exit-code -- src/lib/supabase/database.types.ts`: falla si cambias una migración sin regenerar los tipos) → `pnpm build` con variables ficticias. Usa Node 22 (mínimo real: vitest 5 exige ^22.12 y pnpm 11 ≥22.13) y el CLI de Supabase fijado como devDependency, **nunca** `supabase/setup-cli`. El repo no declara `packageManager`: la versión de pnpm (11) vive en los workflows.
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
- **Contexto**: `registrarContextoSentry()` (`lib/sentry/contexto.ts`, cacheada con `React.cache()`) pone los tags `tenant`, `vertical` y `rol` y `setUser({ id })`. La llaman el layout del dashboard, `checkRoutePermission()` y `requireRole()` —layout y página se renderizan en paralelo y un Server Action no pasa por el layout hasta después de ejecutarse—. `vertical` sale de `tenants.vertical`. Los route handlers que no pasan por `requireRole()` no etiquetan.
- **Errores esperados que NO se reportan**: `redirect()`/`notFound()` y demás errores de control de Next (por `digest`) y `AuthorizationError` (`lib/auth/errors.ts`, mismo mensaje "No autorizado"). `requireRole()`, `requireModulo()` y las comprobaciones de `itinerarios.actions.ts` lanzan esa clase: **lanza `AuthorizationError`, no `new Error("No autorizado")`**, para toda denegación nueva. En el cliente, en producción Next sustituye el mensaje de los errores de servidor por un `digest`, así que ahí el filtro por clase no puede actuar. `instrumentation-client.ts` también ignora los `Failed to fetch` de red: el conductor trabaja sin señal (PWA offline).
- **Error boundaries**: `app/global-error.tsx` y `app/dashboard/error.tsx` llaman a `Sentry.captureException`.

**Checklist manual antes de cada release a producción**: revisar en Supabase → *Advisors* (**Security** y **Performance**) —en staging con las migraciones ya aplicadas, y de nuevo en producción tras el release— y resolver los avisos nuevos. Los avisos conocidos e inevitables (p. ej. `tenant_actual()`/`rol_actual()` como `SECURITY DEFINER` ejecutables por `authenticated`, ver *Multi-tenancy*) se ignoran.

