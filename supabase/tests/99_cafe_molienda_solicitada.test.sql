-- B-03 / B-06 / B-07 · Molienda solicitada: columnas, estimado del servidor, decisión por tanda, confirmación sin pesos y
-- aislamiento por cliente. Casos compartidos con Vitest (`molienda.test.ts`): 50,0 kg con trilla 19 % y tostión 18 % → 33,2
-- tostados, mitad 16,6; 54,0 kg tostión con 10,0 kg → 44,3 tostados y 34,3 en grano; mitad de 44,3 → 22,2.
begin;

select plan(29);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000099a1', 'authenticated', 'authenticated', 'owner-a@moler.test'),
  ('00000000-0000-0000-0000-0000000099a2', 'authenticated', 'authenticated', 'admin-a@moler.test'),
  ('00000000-0000-0000-0000-0000000099a3', 'authenticated', 'authenticated', 'operativo-a@moler.test'),
  ('00000000-0000-0000-0000-0000000099a4', 'authenticated', 'authenticated', 'viewer-a@moler.test'),
  ('00000000-0000-0000-0000-0000000099a5', 'authenticated', 'authenticated', 'owner-b@moler.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Moler A', 'moler-a-t', 'cafe');
select platform.crear_tenant('Moler B', 'moler-b-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'moler-a-t'
union all select 'b', id from public.tenants where slug = 'moler-b-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), m.rol::public.rol_tenant
  from (values
    ('00000000-0000-0000-0000-0000000099a1', 'a', 'owner'),
    ('00000000-0000-0000-0000-0000000099a2', 'a', 'admin'),
    ('00000000-0000-0000-0000-0000000099a3', 'a', 'operativo'),
    ('00000000-0000-0000-0000-0000000099a4', 'a', 'viewer'),
    ('00000000-0000-0000-0000-0000000099a5', 'b', 'owner')) as m(user_id, t, rol);

with t as (
  insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles)
  select i.id, x.nombre, 'Calle 1', '3000000000', x.identificacion, x.roles
    from (values ('a', 'Proveedor A', '9900001', array['proveedor']),
                 ('a', 'Cliente A', '9900002', array['cliente_servicio']),
                 ('b', 'Proveedor B', '9900003', array['proveedor'])) as x(t, nombre, identificacion, roles)
    join ids i on i.clave = x.t
  returning identificacion, id
)
insert into ids select case identificacion when '9900001' then 'pa' when '9900002' then 'ca' else 'pb' end, id from t;
insert into ids select 'xa', t.id from cafe.tipos_cafe t join ids i on i.id = t.tenant_id and i.clave = 'a' where t.nombre = 'Excelso';
insert into ids select 'xb', t.id from cafe.tipos_cafe t join ids i on i.id = t.tenant_id and i.clave = 'b' where t.nombre = 'Excelso';

create temp table res (k text primary key, r jsonb);
grant select, insert on res to authenticated;

create or replace function pg_temp.hoy() returns text language sql as $$ select to_char(current_date, 'YYYY-MM-DD') $$;
grant execute on function pg_temp.hoy() to authenticated;
create or replace function pg_temp.lid(p_k text) returns uuid language sql as $$ select (r ->> 'id')::uuid from res where k = p_k $$;
grant execute on function pg_temp.lid(text) to authenticated;
create or replace function pg_temp.rid(p_k text) returns uuid language sql as $$ select coalesce((r ->> 'id')::uuid, (r ->> 'proceso_id')::uuid) from res where k = p_k $$;
grant execute on function pg_temp.rid(text) to authenticated;

-- Compra de marca propia (Excelso de A) y recepción de servicio.
create or replace function pg_temp.comprar(p_k text, p_peso numeric) returns void language plpgsql as $$
begin
  insert into res select p_k, cafe.registrar_compra(jsonb_build_object(
    'tercero_id', (select id from ids where clave = 'pa'), 'tipo_cafe_id', (select id from ids where clave = 'xa'),
    'fecha', pg_temp.hoy(), 'peso_kg', p_peso, 'precio_kg', 20000));
end $$;
grant execute on function pg_temp.comprar(text, numeric) to authenticated;

create or replace function pg_temp.comprar_b() returns void language plpgsql as $$
begin
  insert into res select 'MPB', cafe.registrar_compra(jsonb_build_object(
    'tercero_id', (select id from ids where clave = 'pb'), 'tipo_cafe_id', (select id from ids where clave = 'xb'),
    'fecha', pg_temp.hoy(), 'peso_kg', 50, 'precio_kg', 20000));
end $$;
grant execute on function pg_temp.comprar_b() to authenticated;

create or replace function pg_temp.recibir(p_k text, p_peso numeric, p_servicios text[]) returns void language plpgsql as $$
begin
  insert into res select p_k, cafe.registrar_recepcion(jsonb_build_object(
    'tercero_id', (select id from ids where clave = 'ca'), 'fecha', pg_temp.hoy(), 'peso_kg', p_peso,
    'servicios', to_jsonb(p_servicios), 'nivel_tueste', 'medio'));
end $$;
grant execute on function pg_temp.recibir(text, numeric, text[]) to authenticated;

-- Baches de `p_kg` según `cafe.sugerir_baches` (solo entrada: la tostión no tiene salida).
create or replace function pg_temp.baches(p_kg numeric) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('peso_entrada_kg', e.v::numeric, 'temperatura_c', 216, 'tiempo_min', 17) order by e.n)
    from jsonb_array_elements_text(cafe.sugerir_baches(p_kg) -> 'baches') with ordinality as e(v, n)
$$;
grant execute on function pg_temp.baches(numeric) to authenticated;

-- Registra un proceso del lote `p_lote` y guarda el resultado bajo `p_res`.
create or replace function pg_temp.reg(p_res text, p_lote text, p_tipo text, p_extra jsonb default '{}') returns void language plpgsql as $$
begin
  insert into res select p_res, cafe.registrar_proceso(
    jsonb_build_object('lote_id', pg_temp.lid(p_lote), 'tipo', p_tipo, 'fecha', pg_temp.hoy()) || p_extra);
end $$;
grant execute on function pg_temp.reg(text, text, text, jsonb) to authenticated;

create or replace function pg_temp.detalle(p_sql text) returns text language plpgsql as $$
declare d text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  return d;
end $$;
grant execute on function pg_temp.detalle(text) to authenticated;


select has_column('cafe', 'lotes', 'molienda_solicitada_modo', 'el lote guarda el modo de molienda pedido');
select has_column('cafe', 'procesos', 'molienda_kg', 'la tostión guarda los kilos a moler de la tanda');
select ok(not (select prosecdef from pg_proc where oid = 'cafe.confirmar_molienda(jsonb)'::regprocedure), 'confirmar_molienda es invoker');

-- B-03 · recepción -------------------------------------------------------------------------------------------------
select tests.autenticar_como('operativo-a@moler.test');
create or replace function pg_temp.recibir_m(p_k text, p_peso numeric, p_servicios text[], p_extra jsonb default '{}') returns void language plpgsql as $$
begin
  insert into res select p_k, cafe.registrar_recepcion(jsonb_build_object(
    'tercero_id', (select id from ids where clave = 'ca'), 'fecha', pg_temp.hoy(), 'peso_kg', p_peso,
    'servicios', to_jsonb(p_servicios), 'nivel_tueste', 'medio') || p_extra);
end $$;
grant execute on function pg_temp.recibir_m(text, numeric, text[], jsonb) to authenticated;

select pg_temp.recibir_m('R1', 50, array['trilla', 'tostion', 'molienda'], '{"molienda_modo": "mitad"}');
select is((select molienda_solicitada_modo || ':' || molienda_solicitada_kg from cafe.lotes where id = pg_temp.lid('R1')), 'mitad:16.600', '50,0 kg con trilla y tostión, «Mitad» → 16,6 kg a moler');
select is(
  (select e ->> 'peso_kg' from jsonb_array_elements((select r -> 'estimacion' from res where k = 'R1')) e where e ->> 'servicio' = 'molienda'),
  '16.6', 'la estimación de molienda cobra los kilos a moler');
select pg_temp.recibir_m('R2', 50, array['trilla', 'tostion', 'molienda'], '{"molienda_modo": "kg", "molienda_kg": 10}');
select is((select molienda_solicitada_modo || ':' || molienda_solicitada_kg from cafe.lotes where id = pg_temp.lid('R2')), 'kg:10.000', '«Otra cantidad» guarda lo digitado');
select pg_temp.recibir_m('R3', 50, array['trilla', 'tostion'], '{"molienda_modo": "mitad"}');
select is((select molienda_solicitada_modo from cafe.lotes where id = pg_temp.lid('R3')), 'ninguna', 'sin molienda contratada se guarda «ninguna»');
select is((select molienda_solicitada_kg from cafe.lotes where id = pg_temp.lid('R3')), null, 'y sin kilos');
select pg_temp.recibir_m('R4', 50, array['trilla', 'tostion', 'molienda']);
select is((select molienda_solicitada_modo from cafe.lotes where id = pg_temp.lid('R4')), 'todo', 'sin elegir, es «todo»');
select throws_ok(
  $$select cafe.registrar_recepcion(jsonb_build_object('tercero_id', (select id from ids where clave = 'ca'), 'fecha', pg_temp.hoy(), 'peso_kg', 50, 'servicios', '["trilla","tostion","molienda"]'::jsonb, 'nivel_tueste', 'medio', 'molienda_modo', 'kg', 'molienda_kg', 40))$$,
  'P0001', 'molienda_supera_tostado', '«Otra cantidad» no pasa del tostado estimado');
select throws_ok(
  $$select cafe.registrar_recepcion(jsonb_build_object('tercero_id', (select id from ids where clave = 'ca'), 'fecha', pg_temp.hoy(), 'peso_kg', 50, 'servicios', '["trilla","tostion","molienda"]'::jsonb, 'nivel_tueste', 'medio', 'molienda_modo', 'raro'))$$,
  'P0001', 'datos_invalidos', 'un modo desconocido se rechaza');

-- B-06 · tostión de marca propia: decisión por tanda -----------------------------------------------------------------
select pg_temp.comprar('MP1', 320);
select pg_temp.reg('T1', 'MP1', 'tostion', jsonb_build_object('nivel_tueste', 'medio', 'peso_entrada_kg', 54, 'baches', pg_temp.baches(54), 'molienda', jsonb_build_object('modo', 'kg', 'kg', 10)));
select is((select molienda_modo || ':' || molienda_kg from cafe.procesos where id = pg_temp.rid('T1')), 'kg:10.000', '54,0 kg con «Otra cantidad» 10,0 guarda 10,0 kg a moler');
select pg_temp.reg('T2', 'MP1', 'tostion', jsonb_build_object('nivel_tueste', 'medio', 'peso_entrada_kg', 64, 'baches', pg_temp.baches(64), 'molienda', jsonb_build_object('modo', 'mitad')));
select is((select molienda_kg from cafe.procesos where id = pg_temp.rid('T2')), 26.3::numeric, 'mitad de 52,5 kg tostados → 26,3 kg (el servidor recalcula)');
select pg_temp.reg('T3', 'MP1', 'tostion', jsonb_build_object('nivel_tueste', 'medio', 'peso_entrada_kg', 20, 'baches', pg_temp.baches(20), 'molienda', jsonb_build_object('modo', 'ninguna', 'kg', 5)));
select is((select molienda_modo || ':' || coalesce(molienda_kg::text, 'null') from cafe.procesos where id = pg_temp.rid('T3')), 'ninguna:null', '«Sin molienda» no lleva kilos');
select throws_ok(
  format($$select cafe.registrar_proceso(jsonb_build_object('lote_id', %L, 'tipo', 'tostion', 'fecha', pg_temp.hoy(), 'nivel_tueste', 'medio', 'peso_entrada_kg', 20, 'baches', pg_temp.baches(20), 'molienda', jsonb_build_object('modo', 'kg', 'kg', 30)))$$, pg_temp.lid('MP1')),
  'P0001', 'molienda_supera_tostado', 'no se pide moler más que el tostado');
select ok(cafe.tanda_requiere_molienda(pg_temp.rid('T1')) and not cafe.tanda_requiere_molienda(pg_temp.rid('T3')), 'la fuente única dice qué tandas pasan por molienda');
select ok('molienda' = any(cafe.servicios_requeridos((select l from cafe.lotes l where l.id = pg_temp.lid('MP1')))), 'marca propia con tandas a moler exige molienda');
select throws_ok(
  format($$select cafe.confirmar_molienda(jsonb_build_object('lote_id', %L, 'tostion_proceso_id', %L, 'fecha', pg_temp.hoy()))$$, pg_temp.lid('MP1'), pg_temp.rid('T3')),
  'P0001', 'molienda_no_solicitada', 'una tanda sin molienda no se confirma sin cambiar la cantidad');

-- B-07 · confirmar sin pesos --------------------------------------------------------------------------------------------
select throws_ok(
  format($$select cafe._insertar_proceso(%L::uuid, 'empaque'::cafe.tipo_proceso, pg_temp.hoy()::date, %L::uuid, 40::numeric, 40::numeric, null::cafe.nivel_tueste, null::jsonb, null::text)$$, pg_temp.lid('MP1'), pg_temp.rid('T1')),
  'P0001', 'orden_proceso_invalido', 'el empaque de una tanda que se muele espera su molienda');
insert into res select 'M1', cafe.confirmar_molienda(jsonb_build_object('lote_id', pg_temp.lid('MP1'), 'tostion_proceso_id', pg_temp.rid('T1'), 'fecha', pg_temp.hoy()));
select is((select peso_entrada_kg || ':' || coalesce(peso_salida_kg::text, 'null') from cafe.procesos where id = pg_temp.rid('M1')), '10.000:null', 'confirmar registra 10,0 kg estimados, sin salida ni merma');
select is((select merma_kg from cafe.procesos where id = pg_temp.rid('M1')), null, 'la molienda no genera merma');
select is((select created_by is not null from cafe.procesos where id = pg_temp.rid('M1')), true, 'queda quién y cuándo (created_by/created_at)');
select throws_ok(
  format($$select cafe.confirmar_molienda(jsonb_build_object('lote_id', %L, 'tostion_proceso_id', %L, 'fecha', pg_temp.hoy()))$$, pg_temp.lid('MP1'), pg_temp.rid('T1')),
  'P0001', 'molienda_ya_confirmada', 'no se confirma dos veces la misma tanda');
-- «Modificar cantidad» antes de confirmar: T2 pasa de mitad a todo
insert into res select 'M2', cafe.confirmar_molienda(jsonb_build_object('lote_id', pg_temp.lid('MP1'), 'tostion_proceso_id', pg_temp.rid('T2'), 'fecha', pg_temp.hoy(), 'modo', 'todo'));
select is((select peso_entrada_kg from cafe.procesos where id = pg_temp.rid('M2')), 52.5::numeric, 'modificar a «Todo» muele los 52,5 kg tostados');
select is((select molienda_modo from cafe.procesos where id = pg_temp.rid('T2')), 'todo', 'y la decisión de la tanda queda actualizada');

-- Terceros: el cambio en la tostión actualiza el lote -----------------------------------------------------------------------
select pg_temp.recibir_m('S1', 100, array['tostion', 'molienda'], '{"molienda_modo": "mitad"}');
select pg_temp.reg('TS', 'S1', 'tostion', jsonb_build_object('nivel_tueste', 'medio', 'peso_entrada_kg', 100, 'baches', pg_temp.baches(100), 'molienda', jsonb_build_object('modo', 'kg', 'kg', 5)));
select is((select molienda_solicitada_modo || ':' || molienda_solicitada_kg from cafe.lotes where id = pg_temp.lid('S1')), 'kg:5.000', 'terceros: cambiar la cantidad en la tostión actualiza molienda_solicitada_* del lote (aun siendo operativo)');

-- Aislamiento y permisos ---------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('viewer-a@moler.test');
select throws_ok(
  format($$select cafe.confirmar_molienda(jsonb_build_object('lote_id', %L, 'tostion_proceso_id', %L, 'fecha', pg_temp.hoy()))$$, pg_temp.lid('S1'), pg_temp.rid('TS')),
  '42501', 'no_autorizado', 'el viewer no confirma moliendas');
reset role;
select tests.autenticar_como('owner-b@moler.test');
select is((select count(*)::int from cafe.procesos where molienda_modo is not null), 0, 'otro cliente no ve las decisiones de molienda');
select throws_ok(
  format($$select cafe.confirmar_molienda(jsonb_build_object('lote_id', %L, 'tostion_proceso_id', %L, 'fecha', pg_temp.hoy()))$$, pg_temp.lid('S1'), pg_temp.rid('TS')),
  'P0001', null, 'ni confirmar la molienda de una tanda ajena');

select * from finish();
rollback;
