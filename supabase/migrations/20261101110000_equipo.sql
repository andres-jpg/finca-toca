-- Equipo del cliente: el administrador gestiona a sus usuarios sin pasar por la plataforma (FIN-103 · CO-22).
--
--  1. Módulo `core.equipo` en el catálogo, activado a los clientes de café existentes. `platform.crear_tenant()`
--     lo activa a los nuevos (se redefine con la misma firma).
--  2. RPC `invitar_miembro_tenant`, `listar_miembros_tenant`, `cambiar_rol_miembro_tenant` y
--     `cambiar_estado_miembro_tenant`, con las reglas que el RLS de `tenant_members` no cubre:
--     nadie se modifica a sí mismo, un admin no crea ni toca owners y siempre queda un owner activo.
--
-- Sin tabla de invitaciones. `inviteUserByEmail` (Supabase Auth) crea la cuenta del invitado en el acto, así
-- que el flujo no necesita guardar nada pendiente: `invitar_miembro_tenant` solo puede ocurrir en dos estados.
--   · El email ya tiene cuenta  → crea (o reactiva) la membresía en `tenant_actual()` y devuelve
--     `{ pendiente: false }`.
--   · El email NO tiene cuenta  → no escribe nada y devuelve `{ pendiente: true }` DESPUÉS de haber autorizado
--     al llamante. El Server Action envía entonces la invitación de Auth (cliente admin, solo tras esa
--     autorización) y vuelve a llamar a la RPC, que ya encuentra la cuenta y crea la membresía.
-- Es idempotente: si la segunda llamada falla, repetir «Invitar» completa el alta. La alternativa (guardar la
-- invitación y convertirla con un trigger sobre `auth.users`) añadía una tabla y un trigger sobre un esquema
-- ajeno para un caso que el propio Auth ya resuelve.
--
-- Las cuatro son endpoints RPC públicos para cualquier usuario con sesión: la comprobación de rol y de módulo va
-- DENTRO de cada función. El tenant es siempre `tenant_actual()`, nunca un parámetro. `invitar` y `listar` son
-- SECURITY DEFINER porque leen `auth.users` (email, último acceso), que ningún cliente puede leer, y por eso
-- solo devuelven datos de miembros del propio tenant; los cambios de rol/estado son SECURITY INVOKER y el RLS
-- de `tenant_members` sigue aplicando (la fila de otro cliente no existe para ellos).
--
-- Pensada para bases CON DATOS: el catálogo y el backfill usan ON CONFLICT DO NOTHING y las funciones se
-- crean con CREATE OR REPLACE, así que se puede reaplicar.

-- 1. Módulo ---------------------------------------------------------------------------------------------
-- Va también a `MODULOS` en `src/modules/core/tenants/modulos.ts`.
-- Mientras `roles` (legacy) gobierne las tablas de ganadería y cooperativa, NO se activa a esos clientes:
-- cambiar la membresía desde aquí no tocaría su rol legacy. Para ellos lo siguen haciendo `/admin/tenants/[id]`
-- y `platform_agregar_miembro()`, que escriben las dos cosas.

insert into public.modulos (id, vertical, nombre, descripcion, base) values
  ('core.equipo', null, 'Equipo', 'Usuarios del cliente y sus roles', false)
on conflict (id) do nothing;

insert into public.tenant_modulos (tenant_id, modulo_id)
select t.id, 'core.equipo'
  from public.tenants t
 where t.vertical = 'cafe'
on conflict (tenant_id, modulo_id) do nothing;

-- Los clientes de café nuevos lo reciben del alta (misma función que en `platform_alta_tenants`, con el
-- módulo añadido a la lista de núcleo de café).
create or replace function platform.crear_tenant(
  p_nombre   text,
  p_slug     text,
  p_vertical public.vertical,
  p_nit      text default null,
  p_plan     text default null,
  p_modulos  text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid;
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_slug   text := btrim(coalesce(p_slug, ''));
  v_modulo text;
begin
  perform platform.exigir_operador();

  if length(v_nombre) < 2 then
    raise exception using errcode = 'P0001', message = 'nombre_invalido',
      detail = 'El nombre del cliente es obligatorio.';
  end if;

  if v_slug !~ '^[a-z0-9-]{3,40}$' then
    raise exception using errcode = 'P0001', message = 'slug_invalido',
      detail = 'El identificador debe tener de 3 a 40 caracteres: minúsculas, números y guiones.';
  end if;

  if p_vertical is null then
    raise exception using errcode = 'P0001', message = 'vertical_invalido',
      detail = 'Indica el vertical del cliente.';
  end if;

  if exists (select 1 from public.tenants t where t.slug = v_slug) then
    raise exception using errcode = 'P0001', message = 'slug_duplicado',
      detail = 'Ya existe un cliente con ese identificador.';
  end if;

  -- Cada módulo pedido debe existir y ser de su vertical o de núcleo.
  foreach v_modulo in array coalesce(p_modulos, '{}') loop
    if not exists (
         select 1 from public.modulos m
          where m.id = v_modulo and (m.vertical is null or m.vertical = p_vertical)) then
      raise exception using errcode = 'P0001', message = 'modulo_no_valido',
        detail = format('El módulo «%s» no existe o no corresponde al vertical del cliente.', v_modulo);
    end if;
  end loop;

  insert into public.tenants (nombre, slug, vertical, nit, plan)
  values (v_nombre, v_slug, p_vertical, nullif(btrim(coalesce(p_nit, '')), ''), coalesce(nullif(btrim(coalesce(p_plan, '')), ''), 'pro'))
  returning id into v_id;

  insert into public.tenant_modulos (tenant_id, modulo_id)
  select v_id, m.id
    from public.modulos m
   where (m.vertical = p_vertical and m.base)
      or (p_vertical = 'cafe' and m.id in ('core.terceros', 'core.auditoria', 'core.equipo'))
      or m.id = any (coalesce(p_modulos, '{}'))
  on conflict (tenant_id, modulo_id) do nothing;

  perform platform.seed_vertical(v_id, p_vertical);

  return v_id;
end;
$$;

revoke all on function platform.crear_tenant(text, text, public.vertical, text, text, text[]) from public, anon, authenticated;

-- 2. invitar_miembro_tenant -----------------------------------------------------------------------------
-- Devuelve { pendiente, user_id, reactivado }. `pendiente = true` significa «este email aún no tiene cuenta»
-- y NO ha escrito nada; el Server Action no debe mostrar esa diferencia al usuario (sería un oráculo de qué
-- emails están registrados en la plataforma): para el administrador, ambos casos son «invitación enviada».

create or replace function public.invitar_miembro_tenant(p_email text, p_rol public.rol_tenant)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant   uuid := (select public.tenant_actual());
  v_llamante public.rol_tenant := (select public.rol_en_tenant());
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_user     uuid;
  v_actual   public.tenant_members%rowtype;
begin
  if v_tenant is null
     or v_llamante is null
     or v_llamante not in ('owner', 'admin')
     or not (select public.tenant_tiene_modulo('core.equipo')) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  if p_rol is null then
    raise exception using errcode = 'P0001', message = 'rol_invalido', detail = 'Indica el rol del miembro.';
  end if;

  if length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception using errcode = 'P0001', message = 'email_invalido', detail = 'El correo electrónico no es válido.';
  end if;

  if p_rol = 'owner' and v_llamante <> 'owner' then
    raise exception using errcode = 'P0001', message = 'solo_owner_gestiona_owner',
      detail = 'Solo un propietario puede crear o modificar propietarios.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('equipo:' || v_tenant::text, 0));

  select u.id into v_user from auth.users u where lower(u.email) = v_email;
  if v_user is null then
    return jsonb_build_object('pendiente', true, 'user_id', null, 'reactivado', false);
  end if;

  select * into v_actual from public.tenant_members m where m.user_id = v_user and m.tenant_id = v_tenant;

  if found then
    if v_actual.activo then
      raise exception using errcode = 'P0001', message = 'ya_es_miembro',
        detail = 'Ese usuario ya es miembro del equipo.';
    end if;
    -- Reactivar a un propietario desactivado cambiándole el rol sería tocar a un owner.
    if v_actual.rol = 'owner' and v_llamante <> 'owner' then
      raise exception using errcode = 'P0001', message = 'solo_owner_gestiona_owner',
        detail = 'Solo un propietario puede crear o modificar propietarios.';
    end if;

    update public.tenant_members
       set rol = p_rol, activo = true
     where user_id = v_user and tenant_id = v_tenant;

    return jsonb_build_object('pendiente', false, 'user_id', v_user, 'reactivado', true);
  end if;

  insert into public.tenant_members (user_id, tenant_id, rol) values (v_user, v_tenant, p_rol);

  return jsonb_build_object('pendiente', false, 'user_id', v_user, 'reactivado', false);
end;
$$;

-- 3. listar_miembros_tenant ---------------------------------------------------------------------------------
-- Solo los miembros (activos e inactivos) del tenant actual, con el email y el último acceso de Auth. `id` es
-- el de la membresía: es el `registro_id` del historial (`audit.log`), para poder decir de quién es cada cambio.

create or replace function public.listar_miembros_tenant()
returns table (
  id            uuid,
  user_id       uuid,
  email         text,
  rol           public.rol_tenant,
  activo        boolean,
  ultimo_acceso timestamptz,
  created_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant   uuid := (select public.tenant_actual());
  v_llamante public.rol_tenant := (select public.rol_en_tenant());
begin
  if v_tenant is null
     or v_llamante is null
     or v_llamante not in ('owner', 'admin')
     or not (select public.tenant_tiene_modulo('core.equipo')) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  return query
    select m.id, m.user_id, u.email::text, m.rol, m.activo, u.last_sign_in_at, m.created_at
      from public.tenant_members m
      join auth.users u on u.id = m.user_id
     where m.tenant_id = v_tenant
     order by m.activo desc, m.rol, u.email;
end;
$$;

-- 4. cambiar_rol_miembro_tenant ------------------------------------------------------------------------------
-- SECURITY INVOKER: el UPDATE pasa por el RLS de `tenant_members` (que ya impide a un admin tocar o crear
-- owners); las comprobaciones de aquí dan el código de error legible y cubren lo que el RLS no puede: no
-- modificarse a sí mismo y no dejar el cliente sin propietario.

create or replace function public.cambiar_rol_miembro_tenant(p_user uuid, p_rol public.rol_tenant)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tenant   uuid := (select public.tenant_actual());
  v_llamante public.rol_tenant := (select public.rol_en_tenant());
  v_actual   public.tenant_members%rowtype;
  v_filas    integer;
begin
  if v_tenant is null
     or v_llamante is null
     or v_llamante not in ('owner', 'admin')
     or not (select public.tenant_tiene_modulo('core.equipo')) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  if p_rol is null or p_user is null then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Indica el miembro y su nuevo rol.';
  end if;

  if p_user = (select auth.uid()) then
    raise exception using errcode = 'P0001', message = 'no_puede_modificarse_a_si_mismo',
      detail = 'No puedes cambiar tu propio rol ni tu estado.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('equipo:' || v_tenant::text, 0));

  select * into v_actual from public.tenant_members m where m.user_id = p_user and m.tenant_id = v_tenant;
  if not found then
    raise exception using errcode = 'P0001', message = 'miembro_no_encontrado',
      detail = 'Ese usuario no es miembro del equipo.';
  end if;

  if (v_actual.rol = 'owner' or p_rol = 'owner') and v_llamante <> 'owner' then
    raise exception using errcode = 'P0001', message = 'solo_owner_gestiona_owner',
      detail = 'Solo un propietario puede crear o modificar propietarios.';
  end if;

  if v_actual.rol = 'owner' and p_rol <> 'owner' and v_actual.activo
     and not exists (
           select 1 from public.tenant_members o
            where o.tenant_id = v_tenant and o.rol = 'owner' and o.activo and o.user_id <> p_user) then
    raise exception using errcode = 'P0001', message = 'ultimo_owner',
      detail = 'Debe quedar al menos un propietario activo.';
  end if;

  update public.tenant_members set rol = p_rol where user_id = p_user and tenant_id = v_tenant;
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;
end;
$$;

-- 5. cambiar_estado_miembro_tenant ---------------------------------------------------------------------------
-- Desactivar o reactivar. Las mismas reglas; repetir el estado actual no es un error ni escribe nada.

create or replace function public.cambiar_estado_miembro_tenant(p_user uuid, p_activo boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tenant   uuid := (select public.tenant_actual());
  v_llamante public.rol_tenant := (select public.rol_en_tenant());
  v_actual   public.tenant_members%rowtype;
  v_filas    integer;
begin
  if v_tenant is null
     or v_llamante is null
     or v_llamante not in ('owner', 'admin')
     or not (select public.tenant_tiene_modulo('core.equipo')) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  if p_activo is null or p_user is null then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Indica el miembro y su estado.';
  end if;

  if p_user = (select auth.uid()) then
    raise exception using errcode = 'P0001', message = 'no_puede_modificarse_a_si_mismo',
      detail = 'No puedes cambiar tu propio rol ni tu estado.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('equipo:' || v_tenant::text, 0));

  select * into v_actual from public.tenant_members m where m.user_id = p_user and m.tenant_id = v_tenant;
  if not found then
    raise exception using errcode = 'P0001', message = 'miembro_no_encontrado',
      detail = 'Ese usuario no es miembro del equipo.';
  end if;

  if v_actual.rol = 'owner' and v_llamante <> 'owner' then
    raise exception using errcode = 'P0001', message = 'solo_owner_gestiona_owner',
      detail = 'Solo un propietario puede crear o modificar propietarios.';
  end if;

  if v_actual.activo = p_activo then
    return;
  end if;

  if v_actual.rol = 'owner' and v_actual.activo and not p_activo
     and not exists (
           select 1 from public.tenant_members o
            where o.tenant_id = v_tenant and o.rol = 'owner' and o.activo and o.user_id <> p_user) then
    raise exception using errcode = 'P0001', message = 'ultimo_owner',
      detail = 'Debe quedar al menos un propietario activo.';
  end if;

  update public.tenant_members set activo = p_activo where user_id = p_user and tenant_id = v_tenant;
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;
end;
$$;

-- Privilegios: nunca PUBLIC ni anon (Postgres da EXECUTE a PUBLIC al crear la función).
revoke all on function public.invitar_miembro_tenant(text, public.rol_tenant) from public, anon;
revoke all on function public.listar_miembros_tenant() from public, anon;
revoke all on function public.cambiar_rol_miembro_tenant(uuid, public.rol_tenant) from public, anon;
revoke all on function public.cambiar_estado_miembro_tenant(uuid, boolean) from public, anon;

grant execute on function public.invitar_miembro_tenant(text, public.rol_tenant) to authenticated, service_role;
grant execute on function public.listar_miembros_tenant() to authenticated, service_role;
grant execute on function public.cambiar_rol_miembro_tenant(uuid, public.rol_tenant) to authenticated, service_role;
grant execute on function public.cambiar_estado_miembro_tenant(uuid, boolean) to authenticated, service_role;
