-- Vertical café: lectura de la ficha del lote (FIN-110 · CO-29, HU-F1-05 y HU-F1-12).
--
-- El listado y la ficha leen las vistas `cafe.v_lotes`, `cafe.v_lote_etapas` y `cafe.v_bultos_estado` (CO-27) y las
-- tablas `procesos`, `baches` y `movimientos_inventario` con el RLS del usuario: no hace falta esquema nuevo. Lo único
-- que la app no puede resolver sola es «quién lo registró»: el email vive en `auth.users` y ni `viewer` ni `operativo`
-- tienen un camino hacia él (`listar_miembros_tenant()` es solo de `owner`/`admin` y exige `core.equipo`).
--
-- `cafe.responsables_lote(p_lote)` devuelve el email de quienes tocaron el lote (lo registraron, registraron o anularon
-- alguno de sus procesos, o lo anularon), SOLO si son miembros del cliente actual. Es SECURITY DEFINER porque lee
-- `auth.users`: por eso comprueba ella misma cliente, membresía y módulo, y nunca devuelve usuarios de otro cliente
-- (mismo criterio que `historial_cambios()`). Un lote ajeno o inexistente devuelve cero filas.
-- Solo añade una función: segura en bases con datos.

create or replace function cafe.responsables_lote(p_lote uuid)
returns table (user_id uuid, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := (select public.tenant_actual());
begin
  if v_tenant is null
     or (select public.rol_en_tenant()) is null
     or not (select public.tenant_tiene_modulo('cafe.recepcion')) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  return query
    select u.id, u.email::text
      from auth.users u
     where u.id in (
             select l.created_by from cafe.lotes l where l.id = p_lote and l.tenant_id = v_tenant
             union
             select l.anulado_por from cafe.lotes l where l.id = p_lote and l.tenant_id = v_tenant
             union
             select p.created_by from cafe.procesos p where p.lote_id = p_lote and p.tenant_id = v_tenant
             union
             select p.anulado_por from cafe.procesos p where p.lote_id = p_lote and p.tenant_id = v_tenant)
       and exists (select 1 from public.tenant_members m where m.user_id = u.id and m.tenant_id = v_tenant);
end $$;

revoke all on function cafe.responsables_lote(uuid) from public, anon;
grant execute on function cafe.responsables_lote(uuid) to authenticated, service_role;
