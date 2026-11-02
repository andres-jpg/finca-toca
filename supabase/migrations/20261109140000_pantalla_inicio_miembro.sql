-- A-07 (FIN-125): pantalla de inicio por usuario (Cofradía: un solo rol Operativo, cada operativo aterriza en
-- Planta o en Recibir café). Es un dato de la MEMBRESÍA, no del rol: NULL = la de por defecto del rol.
--
-- Cambios (todos aditivos, compatibles con el código anterior):
--   1. tenant_members.pantalla_inicio (text, CHECK planta|recibir, nullable) + GRANT UPDATE de la columna.
--   2. mi_sesion() devuelve 'pantalla_inicio' de la membresía del cliente activo.
--   3. listar_miembros_tenant() devuelve también pantalla_inicio (cambia el RETURNS TABLE: drop + create).
--   4. cambiar_pantalla_inicio_miembro(p_user, p_pantalla): SECURITY INVOKER, el UPDATE pasa por el RLS de
--      tenant_members; owner/admin con el módulo core.equipo.
--
-- Rollback (documentado, no se ejecuta):
--   alter table public.tenant_members drop column pantalla_inicio;
--   drop function public.cambiar_pantalla_inicio_miembro(uuid, text);
--   y recrear mi_sesion() / listar_miembros_tenant() con sus definiciones de 20261029110000 / 20261101110000.

alter table public.tenant_members
  add column pantalla_inicio text
  constraint tenant_members_pantalla_inicio_check check (pantalla_inicio in ('planta', 'recibir'));

grant update (pantalla_inicio) on public.tenant_members to authenticated;

-- 2. mi_sesion() ---------------------------------------------------------------------------------------------
create or replace function public.mi_sesion()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when (select auth.uid()) is null then null else jsonb_build_object(
    'tenant', (
      select jsonb_build_object(
               'id', t.id,
               'nombre', t.nombre,
               'slug', t.slug,
               'vertical', t.vertical,
               'plan', t.plan,
               'estado', t.estado,
               'logo_url', t.logo_url,
               'color_primario', t.color_primario,
               'zona_horaria', t.zona_horaria,
               'moneda', t.moneda,
               'modulos', coalesce(
                 (select jsonb_agg(tm.modulo_id order by tm.modulo_id)
                    from public.tenant_modulos tm
                   where tm.tenant_id = t.id and tm.activo),
                 '[]'::jsonb)
             )
        from public.tenants t
       where t.id = (select public.tenant_actual())
    ),
    'rol_tenant', coalesce(
      (select public.rol_en_tenant()),
      (select m.rol from public.rol_legacy_a_membresia((select public.rol_actual()), (select public.tenant_actual())) m)
    ),
    'rol_legacy', (select public.rol_actual()),
    'es_platform_admin', (select public.es_platform_admin()),
    'pantalla_inicio', (
      select m.pantalla_inicio
        from public.tenant_members m
       where m.user_id = (select auth.uid())
         and m.tenant_id = (select public.tenant_actual())
         and m.activo
    ),
    'membresias', coalesce(
      (select jsonb_agg(
                jsonb_build_object(
                  'tenant_id', t.id,
                  'nombre', t.nombre,
                  'slug', t.slug,
                  'vertical', t.vertical,
                  'rol', m.rol)
                order by t.nombre)
         from public.tenant_members m
         join public.tenants t on t.id = m.tenant_id
        where m.user_id = (select auth.uid()) and m.activo),
      '[]'::jsonb)
  ) end
$$;

revoke all on function public.mi_sesion() from public, anon;
grant execute on function public.mi_sesion() to authenticated, service_role;

-- 3. listar_miembros_tenant() --------------------------------------------------------------------------------
drop function public.listar_miembros_tenant();

create function public.listar_miembros_tenant()
returns table (
  id              uuid,
  user_id         uuid,
  email           text,
  rol             public.rol_tenant,
  activo          boolean,
  ultimo_acceso   timestamptz,
  created_at      timestamptz,
  pantalla_inicio text
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
    select m.id, m.user_id, u.email::text, m.rol, m.activo, u.last_sign_in_at, m.created_at, m.pantalla_inicio
      from public.tenant_members m
      join auth.users u on u.id = m.user_id
     where m.tenant_id = v_tenant
     order by m.activo desc, m.rol, u.email;
end;
$$;

revoke all on function public.listar_miembros_tenant() from public, anon;
grant execute on function public.listar_miembros_tenant() to authenticated, service_role;

-- 4. cambiar_pantalla_inicio_miembro -------------------------------------------------------------------------
-- p_pantalla NULL = volver a la de por defecto. Sí se permite sobre uno mismo (no toca rol ni estado).
create function public.cambiar_pantalla_inicio_miembro(p_user uuid, p_pantalla text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tenant   uuid := (select public.tenant_actual());
  v_llamante public.rol_tenant := (select public.rol_en_tenant());
  v_filas    integer;
begin
  if v_tenant is null
     or v_llamante is null
     or v_llamante not in ('owner', 'admin')
     or not (select public.tenant_tiene_modulo('core.equipo')) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  if p_user is null or (p_pantalla is not null and p_pantalla not in ('planta', 'recibir')) then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Indica el miembro y una pantalla de inicio válida.';
  end if;

  update public.tenant_members set pantalla_inicio = p_pantalla where user_id = p_user and tenant_id = v_tenant;
  get diagnostics v_filas = row_count;
  if v_filas = 0 then
    raise exception using errcode = 'P0001', message = 'miembro_no_encontrado', detail = 'Ese usuario no es miembro del equipo.';
  end if;
end;
$$;

revoke all on function public.cambiar_pantalla_inicio_miembro(uuid, text) from public, anon;
grant execute on function public.cambiar_pantalla_inicio_miembro(uuid, text) to authenticated, service_role;
