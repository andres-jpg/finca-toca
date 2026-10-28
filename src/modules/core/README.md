# core — núcleo de plataforma

Lo que comparten **todos** los verticales (café, ganadería, cooperativa) y que no sabe nada de ninguno de ellos: nada que conozca vacas, litros de leche ni café.

Aquí van las piezas transversales que irán llegando en CO-08 … CO-18 (multi-tenancy, autorización, registro de módulos, etc.).

El núcleo también publica su propio `manifest.ts` (entradas de menú que sirven a cualquier vertical); ver `registry/` más abajo.

## Reglas

- `core` puede importar de `@/components` (ui) y `@/lib`.
- `core` **no** puede importar de ningún vertical (`cafe`, `ganaderia`, `cooperativa`) ni de `@/features`. ESLint lo comprueba (ver `eslint.config.mjs`).
- Todo lo que cambia entre clientes es configuración que `core` recibe, nunca un `if (tenant === ...)`.

Cada submódulo sigue el patrón de `src/features`: `<modulo>/{actions,components,schemas,lib}`.

## `rpc/` — escrituras transaccionales

Convención única: toda operación que toque **más de una tabla** o necesite atomicidad es una función Postgres (`plpgsql`) llamada por RPC. El Server Action solo autentica, valida con Zod y traduce errores; si la función falla a mitad, no queda nada escrito. (Guía completa en *Escrituras transaccionales*, CLAUDE.md.)

### Plantilla SQL

```sql
create or replace function <schema>.<verbo>_<entidad>(p_input jsonb)   -- o parámetros tipados
returns jsonb
language plpgsql
security invoker            -- RLS sigue aplicando con el usuario real
set search_path = ''        -- todo calificado: public.tabla, no tabla
as $$
declare v_id uuid;
begin
  -- 1) reglas de negocio antes de escribir
  if <condición> then
    raise exception using errcode = 'P0001', message = 'codigo_error', detail = 'texto para el usuario';
  end if;
  -- 2) escrituras (misma transacción implícita)
  -- 3) return jsonb_build_object('id', v_id);
end $$;

revoke execute on function <schema>.<fn>(jsonb) from public, anon;
grant execute on function <schema>.<fn>(jsonb) to authenticated;
```

- `security invoker` + `set search_path = ''`: **nunca `SECURITY DEFINER` para lógica de negocio** (saltaría RLS y el aislamiento por `tenant_id`).
- Errores de negocio: `errcode = 'P0001'`, `message` = código estable en snake_case (`stock_insuficiente`, `orden_proceso_invalido`, `consecutivo_bloqueado`), `detail` = texto para el usuario.
- `revoke ... from public, anon` + `grant ... to authenticated`: Postgres da `EXECUTE` a `PUBLIC` por defecto.
- Cada función lleva su test pgTAP. Referencia: `supabase/tests/30_rpc_transaccional.test.sql`.

### Wrapper TypeScript

`callRpc(schema, fn, args)` (`rpc/call-rpc.ts`) usa el cliente de servidor (sesión del usuario) y devuelve `Result<T>` en vez de lanzar:

| Postgres | `code` |
|---|---|
| `42501` | `no_autorizado` |
| `23505` | `duplicado` |
| `23503` | `referencia_invalida` |
| `P0001` | `error.message` (con `error.details` como mensaje) |
| otro | `error_inesperado` (+ Sentry, sin argumentos del usuario) |

`rpc/mensajes.ts` traduce cada código a un mensaje en español para los toasts (`mensajeRpc()`); al estrenar un código en SQL, se añade ahí.

Tipado: `args` y el retorno se validan con `Database[schema]["Functions"][fn]` (`pnpm db:types`). Mientras la función no aparezca en los tipos generados —hoy `cafe` no tiene ninguna— `args` es un objeto libre y el retorno `unknown`; el genérico `T` lo afina (`callRpc<"cafe", "crear_lote", { id: string }>(...)`) pero es una afirmación, no una validación en ejecución.

## `tenants/` — cliente actual y módulos activos

El cliente de la sesión (con `vertical`, plan, marca y **módulos activos**) y la comprobación de módulos. Lo que tiene cada cliente vive en la base (`tenants`, `modulos`, `tenant_modulos`), no en el código: activar un módulo es una fila, sin deploy.

| Fichero | Qué es |
|---|---|
| `modulos.ts` | **Puro** (sin servidor): `MODULOS` (`as const`, debe coincidir con el seed de `public.modulos`), el tipo `ModuloId` y `tieneModulo(modulos, id)`. Es lo que importa la barra lateral (cliente), directamente y no desde el barril. |
| `tenant.queries.ts` | `getTenantActual()` (`React.cache()`): `tenant_actual()` (RPC) + una consulta filtrada por ese id con join a `tenant_modulos` activos → `{ id, nombre, slug, vertical, plan, estado, logoUrl, colorPrimario, zonaHoraria, moneda, modulos }`. `null` si no hay sesión o el usuario no tiene tenant (desde FIN-90 la cooperativa también lo tiene: Toca Lácteos). |
| `tenant.guards.ts` | `tenantTieneModulo(id)` para páginas y `requireModulo(id)` para Server Actions (lanza `AuthorizationError`). |

`modulos.test.ts` compara `MODULOS` con el SQL de la migración (siempre) y con la base local (si está levantada y `.env.local` apunta a ella). Para activar un módulo a un cliente, ver *Módulos por cliente* en CLAUDE.md.

## `registry/` — manifiestos y barra lateral (FIN-92)

Cada módulo declara su navegación en un `manifest.ts` y la barra lateral sale de los manifiestos de los módulos activos del cliente. `core` solo tiene los tipos y la lógica; **no importa ningún vertical**: la lista de manifiestos la monta `src/modules/registry.ts` (único fichero con permiso para ver todos los verticales, ver `eslint.config.mjs`).

| Fichero | Qué es |
|---|---|
| `registry/types.ts` | `NavItemDef` (entrada del menú: `modulo`, `roles` / `rolesLegacy`, `grupo`, `orden`, `hideInPWA`, `icon` como nombre) y `ModuleManifest`. |
| `registry/nav.ts` | **Puro**: `construirNav(manifiestos, sesion, { pwa })` (filtra por vertical, módulo, rol y PWA; ordena por grupo y `orden`) y `ocultoEnPWA()`. |
| `registry/iconos.ts` | **Puro**: `ICONOS_NAV`, los nombres de icono permitidos; el cliente los resuelve en `components/layout/icon-map.tsx`. |
| `registry/pagina-inicial.ts` | **Puro**: `paginaInicial(sesion)`, a dónde se manda a quien no tiene acceso (por rol legacy o, sin él, por vertical). |
| `manifest.ts` | Entradas del núcleo: Terceros (FIN-93) y Tarifas y parámetros (FIN-94), solo visibles si el cliente tiene `core.terceros`. Las páginas todavía no existen. |

`tenants/tenant.guards.ts` suma `requireModuloPagina(modulo)` (páginas/layouts: redirect a `/dashboard`) junto a `requireModulo()` (Server Actions). **Pantalla nueva = entrada en el manifiesto de su módulo + `requireModuloPagina` en la página + `requireModulo` en sus actions.**

## `inventario/` — kardex genérico

Artículos y movimientos append-only; el stock es la suma de movimientos y se escribe solo con la RPC `registrar_movimientos`. Detalle en [`inventario/README.md`](./inventario/README.md) y *Inventario tipo kardex* en CLAUDE.md.

## `consecutivos/` — numeración por serie y año

Códigos correlativos de negocio (`MP-2026-0001`, `MQ-…`, `REM-…`) sin carreras: los genera `public.siguiente_consecutivo(serie, fecha)` en Postgres (upsert atómico por `(tenant, serie, año)`), nunca `max(codigo) + 1`. Lo llaman otras RPC **dentro de su transacción**; si fallan después, el rollback devuelve el número (no hay huecos por fallos). Es `SECURITY DEFINER` —**excepción documentada** a la plantilla de arriba— porque nadie puede escribir en `consecutivos`; comprueba tenant y rol (`owner|admin|operativo`) por sí misma. Guía completa (definir una serie, llamarla desde una RPC, huecos) en *Consecutivos por serie y año*, CLAUDE.md.

| Fichero | Qué es |
|---|---|
| `formato.ts` | **Puro**: `formatearConsecutivo(formato, serie, anio, n)`, solo para previsualizar ("Próximo número: MP-2026-0013"). No reserva nada y debe dar lo mismo que `public.formatear_consecutivo()`; `formato.test.ts` y `supabase/tests/60_consecutivos.test.sql` comparten los casos. |

Prueba de concurrencia: `pnpm test:concurrencia` (`scripts/test-consecutivos-concurrencia.ts`, necesita la Supabase local).

## `auth/` — sesión unificada (FIN-91)

`getSesion()` (`auth/sesion.ts`) es el **único punto de entrada a la sesión para código nuevo**: usuario, cliente activo (con vertical y módulos), `rolTenant`, `rolLegacy`, `esPlatformAdmin` y membresías, con dos round-trips en total (Auth + RPC `public.mi_sesion()`). Es un módulo plano con `React.cache()`: no le pongas `"use server"`.

```ts
const sesion = await requireSesion();                         // página/layout: redirect a /login
const { tenant, rolTenant } = await requireRolTenant(["owner", "admin"]); // Server Action: lanza AuthorizationError
```

`getSesionBase()` es la misma lectura sin exigir cliente activo (para el platform admin que aún no eligió uno). `requireRole()` / `checkRoutePermission()` siguen existiendo para las pantallas legacy y están `@deprecated`.

`tenants/` incluye el selector de cliente (`TenantSwitcher` + `cambiarTenantActivo`): la autorización la hace la RPC `cambiar_tenant_activo()`, no la UI.

## `tarifas/` y `parametros/` — valores configurables por cliente (FIN-94)

Tarifas versionadas con vigencia (append-only: cambiar = insertar otra con `vigente_desde`) y parámetros clave → valor tipado por cliente. Las **definiciones** (etiqueta, schema Zod, defecto) las declara cada módulo en su código (`cafe/parametros.ts`) y las inyecta `src/modules/registry.ts` con `defineParametros()` / `defineConceptosTarifa()`; `core` no conoce ninguna. Guía completa en *Tarifas y parámetros por cliente*, CLAUDE.md.

| Fichero | Qué es |
|---|---|
| `parametros/registry.ts` | `ParametroDef`, `defineParametros()`, búsqueda por clave y por módulos activos. Puro (sin servidor). |
| `parametros/lib/valor.ts` | **Puro**: `resolverParametro(def, guardado)` → valor efectivo (defecto si falta o no cumple el schema). |
| `parametros/queries/parametros.queries.ts` | `getParametro(def \| clave)` (una consulta por request) y `getParametrosConValor()` para la pantalla. |
| `parametros/actions/parametros.service.ts` | `guardarParametro()`: `owner`/`admin` + módulo dueño + validación Zod + RPC `guardar_parametro`. **Sin `"use server"`**: el Server Action real está en `src/app/dashboard/tarifas/actions.ts`. |
| `tarifas/registry.ts` | `ConceptoTarifaDef`, `defineConceptosTarifa()`. |
| `tarifas/lib/calcular-valor.ts` | **Puro**: `calcularValor(pesoKg, tarifa)`, redondeo a pesos. |
| `tarifas/queries/tarifas.queries.ts` | `getTarifaVigente()` (RPC; `tarifa_no_definida` si no hay), `getTarifasVigentes()`, `getHistorialTarifas()`. |
| `tarifas/actions/tarifas.service.ts` | `crearTarifa()` y `eliminarTarifaProgramada()` (misma regla de "sin `"use server"`"). |
| `components/` | `TarifasPanel` y `ParametrosForm`: reciben las acciones por props desde la página (`core` no puede importar `src/app`). |
