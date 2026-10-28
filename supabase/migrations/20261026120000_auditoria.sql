-- Auditoría automática (FIN-88 · CO-08).
--
--  1. Esquema `audit` con `audit.log`: quién cambió qué y cuándo, con el antes/después.
--  2. `audit.registrar_cambio()`: trigger genérico (AFTER INSERT/UPDATE/DELETE) que escribe en el log.
--  3. `audit.activar(tabla)`: engancha ese trigger a una tabla.
--  4. `public.set_updated()`: trigger BEFORE UPDATE para las tablas NUEVAS que lleven
--     `updated_at`/`updated_by` (convención en CLAUDE.md → Auditoría).
--  5. `public.historial_cambios()`: lectura del log para la app (el esquema `audit` NO se expone en la API).
--  6. Auditoría activada en las tablas de negocio existentes.
--
-- Pensada para bases CON DATOS: no reescribe ninguna fila (solo crea triggers, que toman un lock
-- breve) y no añade columnas a las tablas existentes. Es idempotente (create or replace / if not
-- exists / drop trigger if exists), así que se puede reaplicar.
--
-- `auth.uid()` queda NULL en `user_id` cuando no hay sesión de usuario: el cron (service role),
-- el seed y cualquier escritura hecha desde el SQL editor.
-- No hay purga: en Fase 0 el volumen es bajo y se conserva todo.

-- 1. Esquema y tabla -----------------------------------------------------------------------------

create schema if not exists audit;

create table if not exists audit.log (
  id          bigint generated always as identity primary key,
  tenant_id   uuid,                         -- NULL en tablas sin tenant (p. ej. roles de cooperativa)
  tabla       text not null,                -- 'public.gastos', 'cafe.lotes'
  registro_id text not null,
  accion      text not null check (accion in ('INSERT', 'UPDATE', 'DELETE')),
  antes       jsonb,
  despues     jsonb,
  cambios     jsonb,                        -- solo las claves modificadas (con su valor nuevo) en UPDATE
  user_id     uuid default auth.uid(),      -- sin FK a propósito: el log sobrevive al borrado del usuario
  at          timestamptz not null default now()
);

create index if not exists log_tenant_at_idx on audit.log (tenant_id, at desc);
create index if not exists log_tabla_registro_idx on audit.log (tabla, registro_id);

-- 2. Trigger genérico ----------------------------------------------------------------------------
-- SECURITY DEFINER: es la única vía de escritura en audit.log (nadie más tiene INSERT).
-- `to_jsonb(new)` hace que funcione con cualquier tabla, tenga o no `tenant_id`.
-- Argumento opcional del trigger (tg_argv[0]): nombre de la columna que hace de tenant; para
-- `public.tenants` es `id`, porque la fila ES el cliente.

create or replace function audit.registrar_cambio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes   jsonb;
  v_despues jsonb;
  v_fila    jsonb;
  v_cambios jsonb;
begin
  if tg_op = 'INSERT' then
    v_despues := to_jsonb(new);
    v_fila := v_despues;
  elsif tg_op = 'DELETE' then
    v_antes := to_jsonb(old);
    v_fila := v_antes;
  else
    v_antes := to_jsonb(old);
    v_despues := to_jsonb(new);
    v_fila := v_despues;

    select jsonb_object_agg(d.key, d.value)
      into v_cambios
      from jsonb_each(v_despues) as d
     where d.key not in ('updated_at', 'updated_by')
       and (v_antes -> d.key) is distinct from d.value;

    -- UPDATE sin cambios reales (o que solo toca updated_at/updated_by): no hay nada que auditar.
    if v_cambios is null then
      return null;
    end if;
  end if;

  insert into audit.log (tenant_id, tabla, registro_id, accion, antes, despues, cambios)
  values (
    (v_fila ->> coalesce(tg_argv[0], 'tenant_id'))::uuid,
    tg_table_schema || '.' || tg_table_name,
    coalesce(v_fila ->> 'id', ''),
    tg_op,
    v_antes,
    v_despues,
    v_cambios
  );

  return null; -- trigger AFTER: el valor de retorno se ignora
end;
$$;

-- 3. Activar auditoría en una tabla ---------------------------------------------------------------
-- Uso: select audit.activar('public.gastos');
--      select audit.activar('public.tenants', 'id');   -- si el tenant no está en `tenant_id`
-- La tabla debe tener una columna `id` (es el `registro_id` del log).

create or replace function audit.activar(p_tabla regclass, p_columna_tenant text default 'tenant_id')
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_nombre text;
begin
  if not exists (
    select 1 from pg_attribute
     where attrelid = p_tabla and attname = 'id' and attnum > 0 and not attisdropped
  ) then
    raise exception 'audit.activar: % no tiene columna id', p_tabla;
  end if;

  v_nombre := 'audit_' || (select relname from pg_class where oid = p_tabla);

  execute format('drop trigger if exists %I on %s', v_nombre, p_tabla);
  execute format(
    'create trigger %I after insert or update or delete on %s for each row execute function audit.registrar_cambio(%L)',
    v_nombre, p_tabla, p_columna_tenant
  );
end;
$$;

-- 4. updated_at / updated_by ---------------------------------------------------------------------
-- Para tablas con esas dos columnas: create trigger set_updated before update on <tabla>
--   for each row execute function public.set_updated();

create or replace function public.set_updated()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

-- 5. RLS y privilegios de audit.log ---------------------------------------------------------------
-- SELECT: solo el admin del mismo cliente. Sin INSERT/UPDATE/DELETE para nadie: solo escribe el
-- trigger (SECURITY DEFINER, que corre como dueño de la tabla y salta RLS).
-- `audit` no está en [api] schemas, así que PostgREST no llega a esta tabla; el acceso a través
-- de la app es `public.historial_cambios()`. RLS queda como defensa en profundidad.

alter table audit.log enable row level security;

drop policy if exists "audit_log_select_admin" on audit.log;
create policy "audit_log_select_admin" on audit.log
  for select to authenticated
  using (
    (select public.rol_actual()) = 'admin'
    and tenant_id = (select public.tenant_actual())
  );

revoke all on schema audit from public, anon;
grant usage on schema audit to authenticated, service_role;

revoke all on table audit.log from public, anon, authenticated;
grant select on table audit.log to authenticated;

-- Funciones: nunca anon ni PUBLIC (Postgres da EXECUTE a PUBLIC por defecto al crearlas).
-- Las de trigger no necesitan EXECUTE para dispararse (se comprueba al crear el trigger).
revoke all on function audit.registrar_cambio() from public, anon, authenticated;
revoke all on function audit.activar(regclass, text) from public, anon, authenticated;
revoke all on function public.set_updated() from public, anon, authenticated;

-- 6. Lectura para la app --------------------------------------------------------------------------
-- Cambios de un registro (o de una tabla) del cliente del llamante, con el email de quien los hizo.
-- Solo `admin`. Devuelve email únicamente de miembros del mismo cliente (hoy, filas de `roles` con
-- el mismo tenant_id; CO-10 lo adaptará a membresías): quien actuó sin sesión (cron, seed) o ya no
-- pertenece al cliente sale con email NULL.

create or replace function public.historial_cambios(
  p_tabla       text,
  p_registro_id text default null,
  p_limite      integer default 50
)
returns table (
  id          bigint,
  at          timestamptz,
  tabla       text,
  registro_id text,
  accion      text,
  cambios     jsonb,
  user_id     uuid,
  email       text
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.at, l.tabla, l.registro_id, l.accion,
         case l.accion when 'UPDATE' then l.cambios when 'INSERT' then l.despues else l.antes end,
         l.user_id,
         u.email::text
    from audit.log l
    left join public.roles r
           on r.user_id = l.user_id
          and r.tenant_id = l.tenant_id
    left join auth.users u on u.id = r.user_id
   where (select public.rol_actual()) = 'admin'
     and l.tenant_id = (select public.tenant_actual())
     and l.tabla = p_tabla
     and (p_registro_id is null or l.registro_id = p_registro_id)
   order by l.at desc, l.id desc
   limit least(greatest(coalesce(p_limite, 50), 1), 200)
$$;

revoke all on function public.historial_cambios(text, text, integer) from public, anon;
grant execute on function public.historial_cambios(text, text, integer) to authenticated, service_role;

-- 7. Tablas existentes ----------------------------------------------------------------------------
-- NO se auditan `recolecciones` ni `extracciones_leche` (alto volumen diario, no aporta).
-- No se añaden updated_at/updated_by a estas tablas: el log ya guarda quién y cuándo, y no hace
-- falta reescribir nada. Los triggers se crean sin tocar filas.

select audit.activar('public.precios');
select audit.activar('public.gastos');
select audit.activar('public.ingresos');
select audit.activar('public.eventos_animal');
select audit.activar('public.animales');
select audit.activar('public.pajillas');
select audit.activar('public.arriendos');
select audit.activar('public.arriendos_abonos');
select audit.activar('public.fincas_cooperativa');  -- sin tenant_id (cooperativa): tenant_id NULL en el log
select audit.activar('public.pagos_finca');         -- ídem
select audit.activar('public.roles');               -- tenant_id nullable (NULL en roles de cooperativa)
select audit.activar('public.tenants', 'id');       -- la fila es el propio cliente
