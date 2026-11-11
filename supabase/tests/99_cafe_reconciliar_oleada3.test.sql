-- Reconciliación de la oleada 3 (migración 20261220100000): las capacidades de B-02 (perfiles por kilos), B-03/B-06 (molienda
-- solicitada) y B-04 (humedad y densidad de la trilla) conviven en las mismas funciones. Caso compartido con Vitest
-- (`estimar-servicios.test.ts`): 40,5 kg con 27,0 kg a tueste medio (18 %) y 13,5 a alto (21 %) → merma ponderada 19 % →
-- 32,805 kg tostados → 32,8 a 1 decimal (con solo «medio» serían 33,2).
begin;

select plan(8);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000099b1', 'authenticated', 'authenticated', 'owner-a@recon.test'),
  ('00000000-0000-0000-0000-0000000099b2', 'authenticated', 'authenticated', 'operativo-a@recon.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Recon A', 'recon-a-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as select 'a' as clave, id from public.tenants where slug = 'recon-a-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = 'a'), m.rol::public.rol_tenant
  from (values ('00000000-0000-0000-0000-0000000099b1', 'owner'), ('00000000-0000-0000-0000-0000000099b2', 'operativo')) as m(user_id, rol);

insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles)
select id, 'Cliente Recon', 'Calle 1', '3000000000', '9910001', array['cliente_servicio'] from ids where clave = 'a';
insert into ids select 'ca', t.id from public.terceros t where t.identificacion = '9910001';

-- Merma de referencia por nivel: medio 18 %, alto 21 % (sin ellas todos los niveles valen la general).
insert into public.parametros (tenant_id, clave, valor)
select id, p.clave, to_jsonb(p.v::numeric) from ids, (values ('cafe.merma_referencia_tostion_medio_pct', 18), ('cafe.merma_referencia_tostion_alto_pct', 21)) as p(clave, v)
 where ids.clave = 'a'
on conflict (tenant_id, clave) do update set valor = excluded.valor;

create temp table res (k text primary key, r jsonb);
grant select, insert on res to authenticated;

create or replace function pg_temp.hoy() returns text language sql as $$ select to_char(current_date, 'YYYY-MM-DD') $$;
grant execute on function pg_temp.hoy() to authenticated;
create or replace function pg_temp.lid(p_k text) returns uuid language sql as $$ select (r ->> 'id')::uuid from res where k = p_k $$;
grant execute on function pg_temp.lid(text) to authenticated;
create or replace function pg_temp.rid(p_k text) returns uuid language sql as $$ select coalesce((r ->> 'id')::uuid, (r ->> 'proceso_id')::uuid) from res where k = p_k $$;
grant execute on function pg_temp.rid(text) to authenticated;

create or replace function pg_temp.recibir(p_k text, p_peso numeric, p_servicios text[], p_extra jsonb default '{}') returns void language plpgsql as $$
begin
  insert into res select p_k, cafe.registrar_recepcion(jsonb_build_object(
    'tercero_id', (select id from ids where clave = 'ca'), 'fecha', pg_temp.hoy(), 'peso_kg', p_peso,
    'servicios', to_jsonb(p_servicios)) || p_extra);
end $$;
grant execute on function pg_temp.recibir(text, numeric, text[], jsonb) to authenticated;

create or replace function pg_temp.baches(p_kg numeric) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('peso_entrada_kg', e.v::numeric, 'temperatura_c', 216, 'tiempo_min', 17) order by e.n)
    from jsonb_array_elements_text(cafe.sugerir_baches(p_kg) -> 'baches') with ordinality as e(v, n)
$$;
grant execute on function pg_temp.baches(numeric) to authenticated;

create or replace function pg_temp.reg(p_res text, p_lote text, p_tipo text, p_extra jsonb default '{}') returns void language plpgsql as $$
begin
  insert into res select p_res, cafe.registrar_proceso(
    jsonb_build_object('lote_id', pg_temp.lid(p_lote), 'tipo', p_tipo, 'fecha', pg_temp.hoy()) || p_extra);
end $$;
grant execute on function pg_temp.reg(text, text, text, jsonb) to authenticated;

select tests.autenticar_como('operativo-a@recon.test');

-- Recepción: dos perfiles por kilos + molienda «todo» (B-02 + B-03) -------------------------------------------------
select pg_temp.recibir('R1', 40.5, array['tostion', 'molienda'], jsonb_build_object('molienda_modo', 'todo', 'perfiles', jsonb_build_array(
  jsonb_build_object('nivel', 'medio', 'temp_c', 222, 'tiempo_min', 17, 'kg', 27),
  jsonb_build_object('nivel', 'alto', 'temp_c', 226, 'tiempo_min', 18, 'kg', 13.5))));
select is((select count(*)::int from cafe.lote_perfil_tostion where lote_id = pg_temp.lid('R1')), 2, 'la recepción guarda los dos perfiles del lote');
select is((select molienda_solicitada_modo || ':' || molienda_solicitada_kg from cafe.lotes where id = pg_temp.lid('R1')), 'todo:32.800',
  'molienda «todo» con merma de tostión ponderada por kilos (19 %): 40,5 kg → 32,8 kg');
select is(
  (select e ->> 'peso_kg' from jsonb_array_elements((select r -> 'estimacion' from res where k = 'R1')) e where e ->> 'servicio' = 'molienda'),
  '32.8', 'la estimación de la molienda cobra los kilos ponderados');
select throws_ok(
  $$select cafe.registrar_recepcion(jsonb_build_object('tercero_id', (select id from ids where clave = 'ca'), 'fecha', pg_temp.hoy(), 'peso_kg', 40.5, 'servicios', '["tostion"]'::jsonb, 'perfiles', jsonb_build_array(jsonb_build_object('nivel', 'medio', 'kg', 27), jsonb_build_object('nivel', 'alto', 'kg', 10))))$$,
  'P0001', 'perfiles_no_suman', 'los kilos por perfil deben sumar lo que entra a la tostión');
select pg_temp.recibir('R2', 40.5, array['tostion', 'molienda'], jsonb_build_object('nivel_tueste', 'medio', 'molienda_modo', 'todo'));
select is((select molienda_solicitada_kg from cafe.lotes where id = pg_temp.lid('R2')), 33.2::numeric, 'con un solo perfil vale la merma de su nivel: 33,2 kg');

-- Trilla con humedad/densidad y tostión con molienda por la misma _insertar_proceso (B-04 + B-06) ---------------------
select pg_temp.recibir('R3', 100, array['trilla', 'tostion', 'molienda'], jsonb_build_object('nivel_tueste', 'medio', 'molienda_modo', 'todo'));
select pg_temp.reg('T1', 'R3', 'trilla', '{"peso_salida_kg": 81, "humedad_pct": 11.2, "densidad_gl": 720}');
select is((select humedad_pct || ':' || densidad_gl from cafe.procesos where id = pg_temp.rid('T1')), '11.20:720.00', 'la trilla guarda humedad y densidad');
select pg_temp.reg('T2', 'R3', 'tostion', jsonb_build_object('nivel_tueste', 'medio', 'peso_entrada_kg', 13.5, 'baches', pg_temp.baches(13.5), 'molienda', jsonb_build_object('modo', 'mitad')));
select is((select molienda_modo || ':' || molienda_kg from cafe.procesos where id = pg_temp.rid('T2')), 'mitad:5.600', 'la tostión guarda la molienda de la tanda (13,5 × 0,82 = 11,1 → mitad 5,6)');
select is((select count(*)::int from pg_proc where pronamespace = 'cafe'::regnamespace and proname = '_insertar_proceso'), 1, 'queda una sola firma de _insertar_proceso');

select * from finish();
rollback;
