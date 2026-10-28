# core — núcleo de plataforma

Lo que comparten **todos** los verticales (café, ganadería, cooperativa) y que no sabe nada de ninguno de ellos: nada que conozca vacas, litros de leche ni café.

Aquí van las piezas transversales que irán llegando en CO-08 … CO-18 (multi-tenancy, autorización, registro de módulos, etc.).

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

## `consecutivos/` — numeración por serie y año

Códigos correlativos de negocio (`MP-2026-0001`, `MQ-…`, `REM-…`) sin carreras: los genera `public.siguiente_consecutivo(serie, fecha)` en Postgres (upsert atómico por `(tenant, serie, año)`), nunca `max(codigo) + 1`. Lo llaman otras RPC **dentro de su transacción**; si fallan después, el rollback devuelve el número (no hay huecos por fallos). Es `SECURITY DEFINER` —**excepción documentada** a la plantilla de arriba— porque nadie puede escribir en `consecutivos`; comprueba tenant y rol (`owner|admin|operativo`) por sí misma. Guía completa (definir una serie, llamarla desde una RPC, huecos) en *Consecutivos por serie y año*, CLAUDE.md.

| Fichero | Qué es |
|---|---|
| `formato.ts` | **Puro**: `formatearConsecutivo(formato, serie, anio, n)`, solo para previsualizar ("Próximo número: MP-2026-0013"). No reserva nada y debe dar lo mismo que `public.formatear_consecutivo()`; `formato.test.ts` y `supabase/tests/60_consecutivos.test.sql` comparten los casos. |

Prueba de concurrencia: `pnpm test:concurrencia` (`scripts/test-consecutivos-concurrencia.ts`, necesita la Supabase local).
