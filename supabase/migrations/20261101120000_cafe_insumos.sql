-- Insumos de empaque del vertical café (FIN-104 · CO-23).
--
--  1. Los ajustes de inventario (`motivo = 'ajuste'`, las correcciones) pasan a ser solo de owner/admin también
--     en el RLS de `movimientos_inventario`. Hasta ahora el INSERT dejaba a un `operativo` registrarlos (FIN-96
--     lo dejó anotado como trabajo de la tarea de inventario de café): compras, consumos y producción siguen
--     siendo de owner/admin/operativo. La UI y los Server Actions ya lo hacen, pero la frontera real es el RLS.
--  2. `public.nombres_usuarios_tenant(p_ids)`: el kardex muestra quién hizo cada movimiento (`created_by` es un
--     uuid de auth.users, que ningún cliente puede leer). Devuelve el email solo de los miembros del cliente
--     actual y solo a quien es miembro de él (cualquier rol: un viewer también ve el kardex).
--
-- No crea tablas ni toca filas: segura en bases con datos y se puede reaplicar (DROP IF EXISTS / OR REPLACE).

-- 1. RLS: ajustes solo owner/admin -----------------------------------------------------------------------------

drop policy if exists movimientos_inventario_insert on public.movimientos_inventario;
create policy movimientos_inventario_insert on public.movimientos_inventario for insert to authenticated
  with check (
    tenant_id = (select public.tenant_actual())
    and (
      (select public.rol_en_tenant()) in ('owner', 'admin')
      or ((select public.rol_en_tenant()) = 'operativo' and motivo <> 'ajuste')
    )
  );

-- 2. nombres_usuarios_tenant -----------------------------------------------------------------------------------
-- SECURITY DEFINER porque lee `auth.users`. Solo expone el email de miembros (activos o no: un exmiembro sigue
-- siendo autor de sus movimientos) del `tenant_actual()`, nunca el de otro cliente; el tenant no viene por
-- parámetro. Sin sesión o sin membresía en el cliente actual → 42501.

create or replace function public.nombres_usuarios_tenant(p_ids uuid[])
returns table (user_id uuid, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := (select public.tenant_actual());
begin
  if v_tenant is null or (select public.rol_en_tenant()) is null then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  return query
    select u.id, u.email::text
      from auth.users u
      join public.tenant_members m on m.user_id = u.id and m.tenant_id = v_tenant
     where u.id = any (coalesce(p_ids, '{}'::uuid[]));
end;
$$;

revoke execute on function public.nombres_usuarios_tenant(uuid[]) from public, anon;
grant execute on function public.nombres_usuarios_tenant(uuid[]) to authenticated;
