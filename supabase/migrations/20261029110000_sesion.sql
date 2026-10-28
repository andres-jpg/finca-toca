-- Sesión unificada y selector de tenant (FIN-91 · CO-11).
--
--  1. `mi_sesion()`: todo lo que la app necesita saber de la sesión (cliente activo con sus módulos,
--     rol de la membresía, rol legacy, platform admin y membresías) en UN json, para que `getSesion()`
--     cueste un solo round-trip a la base.
--  2. `platform_listar_tenants()`: todos los clientes, solo para el platform admin (selector de soporte).
--
-- Ninguna crea tablas ni toca políticas. Se pueden reaplicar (CREATE OR REPLACE).

-- 1. mi_sesion() -----------------------------------------------------------------------------------
-- SECURITY DEFINER porque las membresías devuelven nombre/slug/vertical de clientes que `tenants_select`
-- no deja ver al usuario (solo ve el activo); lo único que lee es lo del propio `auth.uid()`.
-- Sin sesión devuelve NULL. `tenant` es NULL si el usuario no tiene cliente (ni membresía ni rol).
--
-- Forma del json:
--   { tenant: { id, nombre, slug, vertical, plan, estado, logo_url, color_primario, zona_horaria,
--               moneda, modulos: text[] } | null,
--     rol_tenant: 'owner'|'admin'|'operativo'|'viewer'|null,  (null solo si no hay cliente ni rol)
--     rol_legacy: 'admin'|'user'|'viewer'|'cooperativa_admin'|'cooperativa_user'|null,
--     es_platform_admin: boolean,
--     membresias: [{ tenant_id, nombre, slug, vertical, rol }] }
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
    -- Sin membresía en el tenant activo (usuario solo-legacy) cae al equivalente de su rol de `roles`,
    -- con el mismo mapeo del backfill, para que quien tenga cliente siempre tenga rol de membresía.
    'rol_tenant', coalesce(
      (select public.rol_en_tenant()),
      (select m.rol from public.rol_legacy_a_membresia((select public.rol_actual()), (select public.tenant_actual())) m)
    ),
    'rol_legacy', (select public.rol_actual()),
    'es_platform_admin', (select public.es_platform_admin()),
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

-- 2. platform_listar_tenants() ----------------------------------------------------------------------
-- La comprobación va DENTRO de la función (no basta con esconder el selector): es un endpoint RPC
-- público para cualquier usuario con sesión. Errores de negocio con la convención de `callRpc`.
create or replace function public.platform_listar_tenants()
returns table (
  id       uuid,
  nombre   text,
  slug     text,
  vertical public.vertical,
  estado   public.tenant_estado
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'no_autenticado';
  end if;

  if not (select public.es_platform_admin()) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  return query
    select t.id, t.nombre, t.slug, t.vertical, t.estado
      from public.tenants t
     order by t.nombre;
end;
$$;

-- Privilegios: nunca PUBLIC ni anon (Postgres da EXECUTE a PUBLIC al crear la función).
revoke all on function public.mi_sesion() from public, anon;
revoke all on function public.platform_listar_tenants() from public, anon;
grant execute on function public.mi_sesion() to authenticated, service_role;
grant execute on function public.platform_listar_tenants() to authenticated, service_role;
