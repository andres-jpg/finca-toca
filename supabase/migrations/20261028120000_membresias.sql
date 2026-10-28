-- Membresías usuario–tenant con roles genéricos, platform admin y funciones de sesión (FIN-90 · CO-10).
--
--  1. Enum `rol_tenant` y tablas `tenant_members`, `platform_admins` y `user_tenant_activo`.
--  2. Backfill de `tenant_members` desde `roles` (idempotente) + trigger que lo mantiene al día.
--  3. Funciones de sesión: `tenant_actual()` REDEFINIDA, `rol_en_tenant()`, `es_platform_admin()`,
--     `tiene_permiso()` y `cambiar_tenant_activo()`. `rol_actual()` NO cambia.
--  4. RLS y privilegios de las tablas nuevas.
--  5. `tenants_select` (el platform admin ve todos) y `audit.log` / `historial_cambios()` por membresía.
--  6. Auditoría de `tenant_members`.
--
-- Estrategia *expand*: `roles` sigue existiendo y gobernando las tablas legacy (las 14 del lado finca y las
-- de cooperativa) hasta la Fase 2; sus políticas siguen exigiendo `rol_actual()`. Las tablas nuevas
-- (núcleo y café) usan solo membresías (`rol_en_tenant()`).
--
-- Efecto a tener presente: los roles de cooperativa (`tenant_id` NULL en `roles`) pasan a tener
-- `tenant_actual()` = Toca Lácteos (antes NULL). No ven más datos de finca: esas políticas siguen
-- exigiendo `rol_actual() in ('admin','user','viewer')`.
--
-- Pensada para bases CON DATOS (staging/producción): todo lo que inserta usa ON CONFLICT DO NOTHING y
-- las funciones se crean con CREATE OR REPLACE, así que se puede reaplicar. Insertar a un platform
-- admin NO va aquí (es manual, por SQL en cada entorno):
--     insert into public.platform_admins (user_id) select id from auth.users where email = '...';

-- 1. Tipos y tablas -------------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'rol_tenant') then
    create type public.rol_tenant as enum ('owner', 'admin', 'operativo', 'viewer');
  end if;
end $$;

-- `id` existe solo para `audit.activar()` (exige una columna `id` como registro_id del log); la clave
-- primaria sigue siendo (user_id, tenant_id).
create table if not exists public.tenant_members (
  id         uuid not null default gen_random_uuid() unique,
  user_id    uuid not null references auth.users on delete cascade,
  tenant_id  uuid not null references public.tenants on delete cascade,
  rol        public.rol_tenant not null,
  permisos   text[] not null default '{}',     -- permisos finos opcionales: 'cafe.tarifas.editar'
  activo     boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz,
  updated_by uuid,
  primary key (user_id, tenant_id)
);

-- La PK cubre "membresías de un usuario"; este índice cubre "miembros de un tenant".
create index if not exists tenant_members_tenant_id_idx on public.tenant_members (tenant_id);

drop trigger if exists set_updated on public.tenant_members;
create trigger set_updated before update on public.tenant_members
  for each row execute function public.set_updated();

-- Quién puede entrar a cualquier tenant (soporte). Solo la leen las funciones SECURITY DEFINER.
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users on delete cascade
);

-- Tenant que el usuario eligió como activo. Solo se escribe vía `cambiar_tenant_activo()`.
create table if not exists public.user_tenant_activo (
  user_id    uuid primary key references auth.users on delete cascade,
  tenant_id  uuid not null references public.tenants on delete cascade,
  updated_at timestamptz not null default now()
);

-- 2. Backfill desde `roles` -----------------------------------------------------------------------
-- admin → admin, user → operativo, viewer → viewer en `roles.tenant_id`;
-- cooperativa_admin → admin y cooperativa_user → operativo en Toca Lácteos.
-- Las filas que no se pueden mapear (rol de finca sin tenant_id, o cooperativa si falta `toca-lacteos`)
-- se cuentan y se avisan, pero no abortan la migración.

create or replace function public.rol_legacy_a_membresia(p_rol public.rol, p_tenant_id uuid)
returns table (tenant_id uuid, rol public.rol_tenant)
language sql
stable
set search_path = ''
as $$
  select
    case p_rol
      when 'cooperativa_admin' then (select t.id from public.tenants t where t.slug = 'toca-lacteos')
      when 'cooperativa_user'  then (select t.id from public.tenants t where t.slug = 'toca-lacteos')
      else p_tenant_id
    end,
    case p_rol
      when 'admin'             then 'admin'::public.rol_tenant
      when 'cooperativa_admin' then 'admin'::public.rol_tenant
      when 'user'              then 'operativo'::public.rol_tenant
      when 'cooperativa_user'  then 'operativo'::public.rol_tenant
      when 'viewer'            then 'viewer'::public.rol_tenant
    end
$$;

revoke all on function public.rol_legacy_a_membresia(public.rol, uuid) from public, anon, authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select r.user_id, m.tenant_id, m.rol
  from public.roles r
 cross join lateral public.rol_legacy_a_membresia(r.rol, r.tenant_id) m
 where m.tenant_id is not null
on conflict (user_id, tenant_id) do nothing;

do $$
declare
  v_huerfanas integer;
begin
  select count(*) into v_huerfanas
    from public.roles r
   cross join lateral public.rol_legacy_a_membresia(r.rol, r.tenant_id) m
   where m.tenant_id is null;
  if v_huerfanas > 0 then
    raise notice 'membresías: % fila(s) de roles sin tenant (rol de finca sin tenant_id, o falta toca-lacteos): no tienen membresía', v_huerfanas;
  end if;
end $$;

-- Trigger: mientras `roles` siga mandando (hasta la Fase 2), las altas, cambios y bajas manuales
-- siguen funcionando y la membresía los replica. SECURITY DEFINER porque escribe en `tenant_members`
-- sea cual sea quien toque `roles` (hoy solo SQL manual / service role).
create or replace function public.sincronizar_membresia_desde_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes_tenant   uuid;
  v_antes_rol      public.rol_tenant;
  v_despues_tenant uuid;
  v_despues_rol    public.rol_tenant;
begin
  -- Ojo: OLD no está asignado en un INSERT ni NEW en un DELETE, así que cada uno se toca solo en su rama.
  if tg_op in ('UPDATE', 'DELETE') then
    select m.tenant_id, m.rol into v_antes_tenant, v_antes_rol
      from public.rol_legacy_a_membresia(old.rol, old.tenant_id) m;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    select m.tenant_id, m.rol into v_despues_tenant, v_despues_rol
      from public.rol_legacy_a_membresia(new.rol, new.tenant_id) m;
  end if;

  if tg_op = 'UPDATE' then
    -- UPDATE que no toca nada relevante para la membresía.
    if old.user_id = new.user_id
       and v_antes_tenant is not distinct from v_despues_tenant
       and v_antes_rol is not distinct from v_despues_rol then
      return null;
    end if;
  end if;

  -- La membresía anterior deja de estar respaldada por `roles`: se desactiva (no se borra).
  if tg_op = 'DELETE' then
    update public.tenant_members
       set activo = false
     where user_id = old.user_id and tenant_id = v_antes_tenant and activo;
  elsif tg_op = 'UPDATE' then
    if old.user_id <> new.user_id or v_antes_tenant is distinct from v_despues_tenant then
      update public.tenant_members
         set activo = false
       where user_id = old.user_id and tenant_id = v_antes_tenant and activo;
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and v_despues_tenant is not null then
    insert into public.tenant_members (user_id, tenant_id, rol)
    values (new.user_id, v_despues_tenant, v_despues_rol)
    on conflict (user_id, tenant_id)
      do update set rol = excluded.rol, activo = true;
  end if;

  return null; -- trigger AFTER
end;
$$;

revoke all on function public.sincronizar_membresia_desde_roles() from public, anon, authenticated;

drop trigger if exists sincronizar_membresia on public.roles;
create trigger sincronizar_membresia
  after insert or update or delete on public.roles
  for each row execute function public.sincronizar_membresia_desde_roles();

-- 3. Funciones de sesión --------------------------------------------------------------------------
-- Todas STABLE SECURITY DEFINER con search_path vacío (salvo `cambiar_tenant_activo`, volátil): se
-- evalúan con los privilegios del dueño para leer tablas que el usuario no puede ver (`platform_admins`,
-- `user_tenant_activo`), y solo devuelven datos del propio llamante.

create or replace function public.es_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.platform_admins p where p.user_id = (select auth.uid()))
$$;

-- REDEFINIDA con la misma firma y tipo: las políticas RLS y los `DEFAULT tenant_actual()` de las 14
-- tablas del lado finca no se tocan. Orden de resolución:
--   1. el tenant que eligió el usuario (`user_tenant_activo`), si sigue siendo suyo (membresía activa)
--      o es platform admin;
--   2. si no, su única membresía activa;
--   3. si no, `roles.tenant_id` (compatibilidad con usuarios sin membresía).
-- Con varias membresías y ningún tenant elegido, el paso 2 no decide y cae al 3: el legacy sigue
-- mandando. Un usuario sin sesión (auth.uid() NULL) obtiene NULL.
create or replace function public.tenant_actual()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select a.tenant_id
       from public.user_tenant_activo a
      where a.user_id = (select auth.uid())
        and (exists (select 1 from public.tenant_members m
                      where m.user_id = a.user_id and m.tenant_id = a.tenant_id and m.activo)
             or exists (select 1 from public.platform_admins p where p.user_id = a.user_id))),
    (select (array_agg(m.tenant_id))[1]
       from public.tenant_members m
      where m.user_id = (select auth.uid()) and m.activo
     having count(*) = 1),
    (select r.tenant_id from public.roles r where r.user_id = (select auth.uid()))
  )
$$;

-- Rol de la membresía en el tenant actual. El platform admin sin membresía allí actúa como `owner`.
create or replace function public.rol_en_tenant()
returns public.rol_tenant
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.rol
       from public.tenant_members m
      where m.user_id = (select auth.uid())
        and m.tenant_id = (select public.tenant_actual())
        and m.activo),
    case when (select public.es_platform_admin()) then 'owner'::public.rol_tenant end
  )
$$;

-- Permiso fino: owner/admin lo tienen todo; el resto, solo los que figuren en `permisos`.
create or replace function public.tiene_permiso(p text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select public.rol_en_tenant()) in ('owner', 'admin'), false)
      or exists (
           select 1
             from public.tenant_members m
            where m.user_id = (select auth.uid())
              and m.tenant_id = (select public.tenant_actual())
              and m.activo
              and p = any (m.permisos)
         )
$$;

-- Cambia el tenant activo del llamante. Errores de negocio (convención de `callRpc`): P0001 con el código
-- en `message` y el texto para el usuario en `detail`.
create or replace function public.cambiar_tenant_activo(p_tenant uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if v_user is null then
    raise exception using errcode = '42501', message = 'no_autenticado';
  end if;

  if not exists (select 1 from public.tenants t where t.id = p_tenant) then
    raise exception using errcode = 'P0001', message = 'tenant_no_encontrado',
      detail = 'El cliente indicado no existe.';
  end if;

  if not (
    exists (select 1 from public.tenant_members m
             where m.user_id = v_user and m.tenant_id = p_tenant and m.activo)
    or exists (select 1 from public.platform_admins p where p.user_id = v_user)
  ) then
    raise exception using errcode = 'P0001', message = 'tenant_no_permitido',
      detail = 'No tienes acceso a ese cliente.';
  end if;

  insert into public.user_tenant_activo (user_id, tenant_id, updated_at)
  values (v_user, p_tenant, now())
  on conflict (user_id) do update set tenant_id = excluded.tenant_id, updated_at = excluded.updated_at;

  return p_tenant;
end;
$$;

-- `rol_actual()` no se toca. Privilegios: nunca PUBLIC ni anon (Postgres da EXECUTE a PUBLIC al crear).
revoke all on function public.es_platform_admin() from public, anon;
revoke all on function public.tenant_actual() from public, anon;
revoke all on function public.rol_en_tenant() from public, anon;
revoke all on function public.tiene_permiso(text) from public, anon;
revoke all on function public.cambiar_tenant_activo(uuid) from public, anon;
grant execute on function public.es_platform_admin() to authenticated, service_role;
grant execute on function public.tenant_actual() to authenticated, service_role;
grant execute on function public.rol_en_tenant() to authenticated, service_role;
grant execute on function public.tiene_permiso(text) to authenticated, service_role;
grant execute on function public.cambiar_tenant_activo(uuid) to authenticated, service_role;

-- 4. RLS y privilegios de las tablas nuevas ---------------------------------------------------------

alter table public.tenant_members enable row level security;
alter table public.platform_admins enable row level security;
alter table public.user_tenant_activo enable row level security;

-- tenant_members ----------------------------------------------------------------------------------
-- SELECT: la propia fila, o cualquiera del tenant actual si eres owner/admin.
-- INSERT/UPDATE: solo owner/admin del tenant actual; solo un owner asigna (o toca) `owner`.
-- DELETE: nadie (se desactiva con `activo = false`).

drop policy if exists tenant_members_select on public.tenant_members;
create policy tenant_members_select on public.tenant_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (tenant_id = (select public.tenant_actual())
        and (select public.rol_en_tenant()) in ('owner', 'admin'))
  );

drop policy if exists tenant_members_insert on public.tenant_members;
create policy tenant_members_insert on public.tenant_members
  for insert to authenticated
  with check (
    tenant_id = (select public.tenant_actual())
    and (select public.rol_en_tenant()) in ('owner', 'admin')
    and (rol <> 'owner' or (select public.rol_en_tenant()) = 'owner')
  );

drop policy if exists tenant_members_update on public.tenant_members;
create policy tenant_members_update on public.tenant_members
  for update to authenticated
  using (
    tenant_id = (select public.tenant_actual())
    and (select public.rol_en_tenant()) in ('owner', 'admin')
    and (rol <> 'owner' or (select public.rol_en_tenant()) = 'owner')
  )
  with check (
    tenant_id = (select public.tenant_actual())
    and (select public.rol_en_tenant()) in ('owner', 'admin')
    and (rol <> 'owner' or (select public.rol_en_tenant()) = 'owner')
  );

revoke all on table public.tenant_members from public, anon, authenticated;
grant select, insert on table public.tenant_members to authenticated;
-- UPDATE por columnas: `user_id` y `tenant_id` no cambian nunca (se crea otra membresía).
grant update (rol, permisos, activo) on table public.tenant_members to authenticated;
grant all on table public.tenant_members to service_role;

-- platform_admins: sin políticas ni privilegios para authenticated; solo las funciones DEFINER (y el
-- service_role / SQL como dueño) la tocan.
revoke all on table public.platform_admins from public, anon, authenticated;
grant all on table public.platform_admins to service_role;

-- user_tenant_activo: se lee la propia fila; se escribe solo vía `cambiar_tenant_activo()`.
drop policy if exists user_tenant_activo_select on public.user_tenant_activo;
create policy user_tenant_activo_select on public.user_tenant_activo
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on table public.user_tenant_activo from public, anon, authenticated;
grant select on table public.user_tenant_activo to authenticated;
grant all on table public.user_tenant_activo to service_role;

-- 5. Políticas existentes que pasan a membresías ------------------------------------------------------

-- El platform admin ve todos los clientes (para el selector de tenant); el resto, solo el suyo.
drop policy if exists tenants_select on public.tenants;
create policy tenants_select on public.tenants
  for select to authenticated
  using (id = (select public.tenant_actual()) or (select public.es_platform_admin()));

-- Auditoría: owner/admin del tenant (antes: `rol_actual() = 'admin'`).
drop policy if exists "audit_log_select_admin" on audit.log;
create policy "audit_log_select_admin" on audit.log
  for select to authenticated
  using (
    (select public.rol_en_tenant()) in ('owner', 'admin')
    and tenant_id = (select public.tenant_actual())
  );

-- Misma regla en la lectura para la app, y el email sale ahora de las membresías del mismo cliente
-- (el CO-10 anunciado en 20261026120000). Quien actuó sin sesión (cron, seed) o ya no pertenece al
-- cliente sigue saliendo con email NULL.
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
    left join public.tenant_members m
           on m.user_id = l.user_id
          and m.tenant_id = l.tenant_id
    left join auth.users u on u.id = m.user_id
   where (select public.rol_en_tenant()) in ('owner', 'admin')
     and l.tenant_id = (select public.tenant_actual())
     and l.tabla = p_tabla
     and (p_registro_id is null or l.registro_id = p_registro_id)
   order by l.at desc, l.id desc
   limit least(greatest(coalesce(p_limite, 50), 1), 200)
$$;

revoke all on function public.historial_cambios(text, text, integer) from public, anon;
grant execute on function public.historial_cambios(text, text, integer) to authenticated, service_role;

-- 6. Auditoría --------------------------------------------------------------------------------------
-- Al final, para que el backfill (que es la migración y no un cambio de usuario) no llene el log.

select audit.activar('public.tenant_members');
