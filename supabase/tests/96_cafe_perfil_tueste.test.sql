-- Perfil de tueste pedido por el cliente (FIN-127 · A-09): perfil_temp_c / perfil_tiempo_min en cafe.lotes,
-- validación en cafe.registrar_recepcion(), CHECK de la tabla, v_lotes y aislamiento entre clientes.
--   r1 owner A   r2 owner B
begin;

select plan(11);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'owner-a@perfil.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'authenticated', 'authenticated', 'owner-b@perfil.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Perfil A', 'perfil-a-t', 'cafe');
select platform.crear_tenant('Perfil B', 'perfil-b-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'perfil-a-t'
union all select 'b', id from public.tenants where slug = 'perfil-b-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), 'owner'::public.rol_tenant
  from (values ('00000000-0000-0000-0000-0000000000d1', 'a'),
               ('00000000-0000-0000-0000-0000000000d2', 'b')) as m(user_id, t);

with t as (
  insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles)
  select i.id, 'Cliente ' || x.t, 'Calle 1', '3000000000', x.ident, array['cliente_servicio']
    from (values ('a', '8000001'), ('b', '8000002')) as x(t, ident) join ids i on i.clave = x.t
  returning identificacion, id
)
insert into ids select case identificacion when '8000001' then 'ca' else 'cb' end, id from t;

create temp table res (k text primary key, r jsonb);
grant select, insert on res to authenticated;

create or replace function pg_temp.carga(p_extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('tercero_id', (select id from ids where clave = 'ca'),
                            'fecha', to_char(current_date, 'YYYY-MM-DD'), 'peso_kg', 40.5, 'num_bultos', 1,
                            'servicios', jsonb_build_array('tostion'), 'nivel_tueste', 'medio') || p_extra
$$;
grant execute on function pg_temp.carga(jsonb) to authenticated;

select tests.autenticar_como('owner-a@perfil.test');

insert into res select 'con_perfil',
  cafe.registrar_recepcion(pg_temp.carga(jsonb_build_object('perfil_temp_c', 205, 'perfil_tiempo_min', 12)));
insert into res select 'sin_perfil', cafe.registrar_recepcion(pg_temp.carga());

select is(
  (select (l.perfil_temp_c, l.perfil_tiempo_min)::text from cafe.lotes l
    where l.id = (select (r ->> 'id')::uuid from res where k = 'con_perfil')),
  '(205.0,12.0)', 'el perfil pedido (205 °C, 12 min) queda en el lote');
select is(
  (select (l.perfil_temp_c is null and l.perfil_tiempo_min is null) from cafe.lotes l
    where l.id = (select (r ->> 'id')::uuid from res where k = 'sin_perfil')),
  true, 'el perfil es opcional: sin él quedan en NULL');
select is(
  (select (v.perfil_temp_c, v.perfil_tiempo_min)::text from cafe.v_lotes v
    where v.id = (select (r ->> 'id')::uuid from res where k = 'con_perfil')),
  '(205.0,12.0)', 'v_lotes expone el perfil');

-- Solo la temperatura, solo el tiempo
select lives_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga(jsonb_build_object('perfil_temp_c', 190))) $$,
  'se admite solo la temperatura');
select lives_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga(jsonb_build_object('perfil_tiempo_min', 10.5))) $$,
  'se admite solo el tiempo');

-- Validaciones
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga(jsonb_build_object('perfil_temp_c', -5))) $$,
  'P0001', 'datos_invalidos', 'temperatura negativa se rechaza');
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga(jsonb_build_object('perfil_tiempo_min', 500))) $$,
  'P0001', 'datos_invalidos', 'tiempo fuera de rango se rechaza');
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga(jsonb_build_object('perfil_temp_c', 'caliente'))) $$,
  'P0001', 'datos_invalidos', 'temperatura no numérica se rechaza');

-- Sin tostión el perfil se ignora (no hay nivel de tueste)
insert into res select 'sin_tostion', cafe.registrar_recepcion(pg_temp.carga(jsonb_build_object(
  'servicios', jsonb_build_array('trilla'), 'nivel_tueste', null, 'perfil_temp_c', 205)));
select is(
  (select l.perfil_temp_c is null from cafe.lotes l
    where l.id = (select (r ->> 'id')::uuid from res where k = 'sin_tostion')),
  true, 'sin tostión el perfil no se guarda');

-- CHECK de la tabla: perfil sin nivel de tueste
reset role;
select throws_ok(
  $$ update cafe.lotes set nivel_tueste = null, servicios = '{trilla}', perfil_temp_c = 200
      where id = (select (r ->> 'id')::uuid from res where k = 'con_perfil') $$,
  '23514', null, 'la tabla no admite perfil sin nivel de tueste');

-- Aislamiento: otro cliente no ve el lote
select tests.autenticar_como('owner-b@perfil.test');
select is(
  (select count(*)::int from cafe.v_lotes v where v.id = (select (r ->> 'id')::uuid from res where k = 'con_perfil')),
  0, 'otro cliente no ve el lote ni su perfil');

select * from finish();
rollback;
