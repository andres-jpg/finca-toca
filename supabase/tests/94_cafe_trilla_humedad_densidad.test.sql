-- Trilla: peso final, humedad y densidad (FIN-150 · B-04): columnas nuevas de cafe.procesos, validaciones de registrar_proceso,
-- el peso final como entrada de la tostión, el detalle de la remisión y el aislamiento entre clientes.
--   a1 owner A   a2 admin A   a3 operativo A   a4 viewer A   a5 owner B
begin;

select plan(10);

-- 0. Preparación --------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000150a1', 'authenticated', 'authenticated', 'owner-a@trilla.test'),
  ('00000000-0000-0000-0000-0000000150a2', 'authenticated', 'authenticated', 'admin-a@trilla.test'),
  ('00000000-0000-0000-0000-0000000150a3', 'authenticated', 'authenticated', 'operativo-a@trilla.test'),
  ('00000000-0000-0000-0000-0000000150a4', 'authenticated', 'authenticated', 'viewer-a@trilla.test'),
  ('00000000-0000-0000-0000-0000000150a5', 'authenticated', 'authenticated', 'owner-b@trilla.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Trilla A', 'trilla-a-t', 'cafe');
select platform.crear_tenant('Trilla B', 'trilla-b-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'trilla-a-t'
union all select 'b', id from public.tenants where slug = 'trilla-b-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), m.rol::public.rol_tenant
  from (values
    ('00000000-0000-0000-0000-0000000150a1', 'a', 'owner'),
    ('00000000-0000-0000-0000-0000000150a2', 'a', 'admin'),
    ('00000000-0000-0000-0000-0000000150a3', 'a', 'operativo'),
    ('00000000-0000-0000-0000-0000000150a4', 'a', 'viewer'),
    ('00000000-0000-0000-0000-0000000150a5', 'b', 'owner')) as m(user_id, t, rol);

-- Terceros: ca (cliente de servicios de A), pa (proveedor de A), cb (cliente de servicios de B). Excelso de A.
with t as (
  insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles)
  select i.id, x.nombre, 'Calle 1', '3000000000', x.identificacion, x.roles
    from (values ('a', 'Cliente A',   '9500001', array['cliente_servicio']),
                 ('a', 'Proveedor A', '9500002', array['proveedor']),
                 ('b', 'Cliente B',   '9500003', array['cliente_servicio'])) as x(t, nombre, identificacion, roles)
    join ids i on i.clave = x.t
  returning identificacion, id
)
insert into ids select case identificacion when '9500001' then 'ca' when '9500002' then 'pa' else 'cb' end, id from t;
insert into ids select 'xa', t.id from cafe.tipos_cafe t join ids i on i.id = t.tenant_id and i.clave = 'a' where t.nombre = 'Excelso';

-- Resultados de las RPC por clave, para comprobarlos sin repetir llamadas.
create temp table res (k text primary key, r jsonb);
grant select, insert on res to authenticated;

-- Fecha de hoy como la mandaría la app.
create or replace function pg_temp.hoy() returns text language sql as $$ select to_char(current_date, 'YYYY-MM-DD') $$;
grant execute on function pg_temp.hoy() to authenticated;

-- Recibe un café de cliente (servicio) y guarda el resultado bajo `k`.
create or replace function pg_temp.recibir(p_k text, p_peso numeric, p_n integer, p_servicios text[],
                                           p_nivel text default null, p_ter text default 'ca')
returns void language plpgsql as $$
begin
  insert into res
  select p_k, cafe.registrar_recepcion(jsonb_build_object(
    'tercero_id', (select id from ids where clave = p_ter), 'fecha', pg_temp.hoy(), 'peso_kg', p_peso,
    'num_bultos', p_n, 'servicios', to_jsonb(p_servicios), 'nivel_tueste', p_nivel));
end $$;
grant execute on function pg_temp.recibir(text, numeric, integer, text[], text, text) to authenticated;

-- Compra de café para marca propia (Excelso de A a $20.000/kg).
create or replace function pg_temp.comprar(p_k text, p_peso numeric, p_n integer)
returns void language plpgsql as $$
begin
  insert into res
  select p_k, cafe.registrar_compra(jsonb_build_object(
    'tercero_id', (select id from ids where clave = 'pa'), 'tipo_cafe_id', (select id from ids where clave = 'xa'),
    'fecha', pg_temp.hoy(), 'peso_kg', p_peso, 'num_bultos', p_n, 'precio_kg', 20000));
end $$;
grant execute on function pg_temp.comprar(text, numeric, integer) to authenticated;

create or replace function pg_temp.lid(p_k text) returns uuid language sql as $$ select (r ->> 'id')::uuid from res where k = p_k $$;
grant execute on function pg_temp.lid(text) to authenticated;


create or replace function pg_temp.lid(p_k text) returns uuid language sql as $$ select (r ->> 'id')::uuid from res where k = p_k $$;
grant execute on function pg_temp.lid(text) to authenticated;

create or replace function pg_temp.trilla(p_res text, p_k text, p_extra jsonb)
returns void language plpgsql as $$
begin
  insert into res values (p_res, cafe.registrar_proceso(jsonb_build_object('lote_id', pg_temp.lid(p_k), 'tipo', 'trilla', 'fecha', pg_temp.hoy()) || p_extra));
end $$;
grant execute on function pg_temp.trilla(text, text, jsonb) to authenticated;

select tests.autenticar_como('operativo-a@trilla.test');

-- B-04: 250,0 → 202,5 kg, humedad y densidad al finalizar.
select pg_temp.recibir('L1', 250, 4, array['trilla']);
select pg_temp.trilla('T1', 'L1', '{"peso_salida_kg": 202.5, "humedad_pct": 11.2, "densidad_gl": 720}');
select is(
  (select row(r ->> 'merma_pct', r ->> 'desvio', r ->> 'humedad_pct', r ->> 'densidad_gl')::text from res where k = 'T1'),
  row('19.000', 'false', '11.20', '720.00')::text, '250 → 202,5 kg: merma 19,0 % en rango, con humedad y densidad');
select is(
  (select row(humedad_pct, densidad_gl)::text from cafe.procesos where id = (select (r ->> 'id')::uuid from res where k = 'T1')),
  row(11.20, 720.00)::text, 'humedad y densidad quedan guardadas en el proceso de trilla');
select is(cafe.peso_disponible(pg_temp.lid('L1'), 'tostion'), 202.500, 'el peso final es la entrada de la tostión');

-- Validaciones
select pg_temp.recibir('L2', 250, 4, array['trilla']);
select throws_ok(
  $$select cafe.registrar_proceso(jsonb_build_object('lote_id', pg_temp.lid('L2'), 'tipo', 'trilla', 'fecha', pg_temp.hoy(), 'peso_salida_kg', 260))$$,
  'P0001', 'peso_final_supera_entrada', 'peso final mayor que la entrada: peso_final_supera_entrada');
select throws_ok(
  $$select cafe.registrar_proceso(jsonb_build_object('lote_id', pg_temp.lid('L2'), 'tipo', 'trilla', 'fecha', pg_temp.hoy(), 'peso_salida_kg', 200, 'humedad_pct', 101))$$,
  'P0001', 'datos_invalidos', 'humedad fuera de 0..100 se rechaza');
select throws_ok(
  $$select cafe.registrar_proceso(jsonb_build_object('lote_id', pg_temp.lid('L2'), 'tipo', 'trilla', 'fecha', pg_temp.hoy(), 'peso_salida_kg', 200, 'densidad_gl', 0))$$,
  'P0001', 'datos_invalidos', 'densidad cero se rechaza');
select throws_ok(
  $$select cafe.registrar_proceso(jsonb_build_object('lote_id', pg_temp.lid('L2'), 'tipo', 'trilla', 'fecha', pg_temp.hoy(), 'peso_salida_kg', 200, 'humedad_pct', 'x'))$$,
  'P0001', 'datos_invalidos', 'humedad que no es número se rechaza');

-- Sin humedad ni densidad: opcionales
select pg_temp.trilla('T2', 'L2', '{"peso_salida_kg": 200}');
select is((select r ->> 'humedad_pct' from res where k = 'T2'), null, 'humedad y densidad son opcionales');

-- La remisión copia humedad y densidad de la trilla en el detalle.
reset role;
select tests.autenticar_como('admin-a@trilla.test');
insert into res select 'REM', cafe.entregar_lotes(jsonb_build_object('lote_ids', jsonb_build_array(pg_temp.lid('L1')), 'fecha', pg_temp.hoy(),
  'recibe_nombre', 'Juan Pérez', 'recibe_documento', '1020304050'));
select is(
  (select d ->> 'humedad_pct' || '/' || (d ->> 'densidad_gl') from cafe.remisiones_lotes rl, jsonb_array_elements(rl.detalle) d
    where rl.lote_id = pg_temp.lid('L1') and d ->> 'servicio' = 'trilla'),
  '11.20/720.00', 'el detalle de la remisión lleva humedad y densidad de la trilla');

-- Aislamiento
reset role;
select tests.autenticar_como('owner-b@trilla.test');
select is((select count(*)::int from cafe.procesos where humedad_pct is not null), 0, 'otro cliente no ve la humedad ni la densidad de A');

select * from finish();
rollback;
