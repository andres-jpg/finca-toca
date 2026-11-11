-- Varios perfiles de tueste por lote (FIN-148 · B-02): cafe.lote_perfil_tostion, snapshot del perfil vigente en la compra,
-- `perfiles` en registrar_recepcion con validación de la suma de kilos, y aislamiento entre clientes.
--   e1 owner A   e2 viewer A   e3 owner B
begin;

select plan(16);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'owner-a@lpt.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'viewer-a@lpt.test'),
  ('00000000-0000-0000-0000-0000000000e3', 'authenticated', 'authenticated', 'owner-b@lpt.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('LPT A', 'lpt-a-t', 'cafe');
select platform.crear_tenant('LPT B', 'lpt-b-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'lpt-a-t'
union all select 'b', id from public.tenants where slug = 'lpt-b-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), m.rol::public.rol_tenant
  from (values ('00000000-0000-0000-0000-0000000000e1', 'a', 'owner'),
               ('00000000-0000-0000-0000-0000000000e2', 'a', 'viewer'),
               ('00000000-0000-0000-0000-0000000000e3', 'b', 'owner')) as m(user_id, t, rol);

with t as (
  insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles)
  select i.id, x.nombre, 'Calle 1', '3000000000', x.ident, x.roles
    from (values ('a', 'Cliente A', '8100001', array['cliente_servicio']),
                 ('a', 'Proveedor A', '8100002', array['proveedor']),
                 ('b', 'Cliente B', '8100003', array['cliente_servicio'])) as x(t, nombre, ident, roles)
    join ids i on i.clave = x.t
  returning identificacion, id
)
insert into ids select case identificacion when '8100001' then 'ca' when '8100002' then 'pa' else 'cb' end, id from t;

insert into ids select 'xa', id from cafe.tipos_cafe where tenant_id = (select id from ids where clave = 'a') and nombre = 'Excelso';

create temp table res (k text primary key, r jsonb);
grant select, insert on res to authenticated;

create or replace function pg_temp.carga(p_extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('tercero_id', (select id from ids where clave = 'ca'),
                            'fecha', to_char(current_date, 'YYYY-MM-DD'), 'peso_kg', 40.5,
                            'servicios', jsonb_build_array('tostion')) || p_extra
$$;
grant execute on function pg_temp.carga(jsonb) to authenticated;

select tests.autenticar_como('owner-a@lpt.test');

-- 1. Marca propia: snapshot del perfil vigente del tipo (Excelso: Medio 216 °C 17 min) ------------------------------
insert into res select 'compra', cafe.registrar_compra(jsonb_build_object(
  'tercero_id', (select id from ids where clave = 'pa'), 'tipo_cafe_id', (select id from ids where clave = 'xa'),
  'fecha', to_char(current_date, 'YYYY-MM-DD'), 'peso_kg', 100, 'precio_kg', 18500));

select is(
  (select (p.nivel, p.temp_c, p.tiempo_min, p.kg, p.orden)::text from cafe.lote_perfil_tostion p
    where p.lote_id = (select (r ->> 'id')::uuid from res where k = 'compra')),
  '(medio,216.0,17.0,100.000,1)', 'la compra de marca propia copia el perfil vigente del tipo (216 °C · 17 min)');

-- Cambiar la configuración después no toca el lote ya recibido.
insert into cafe.perfil_tueste_tipo (tipo_cafe_id, nivel, temp_c, tiempo_min, vigente_desde)
values ((select id from ids where clave = 'xa'), 'alto', 230, 20, date '2100-01-01');
select is(
  (select p.temp_c from cafe.lote_perfil_tostion p where p.lote_id = (select (r ->> 'id')::uuid from res where k = 'compra')),
  216.0, 'cambiar el perfil del tipo no altera el snapshot de lotes ya recibidos');

-- 2. Maquila: un perfil, varios perfiles, suma de kilos -------------------------------------------------------------------
insert into res select 'uno', cafe.registrar_recepcion(pg_temp.carga(jsonb_build_object(
  'perfiles', jsonb_build_array(jsonb_build_object('nivel', 'medio', 'temp_c', 222, 'tiempo_min', 17)))));
select is(
  (select (p.nivel, p.temp_c, p.tiempo_min, p.kg)::text from cafe.lote_perfil_tostion p
    where p.lote_id = (select (r ->> 'id')::uuid from res where k = 'uno')),
  '(medio,222.0,17.0,40.500)', 'un solo perfil sin kilos: toma todo lo que entra a tostión (40,5 kg)');

insert into res select 'varios', cafe.registrar_recepcion(pg_temp.carga(jsonb_build_object(
  'perfiles', jsonb_build_array(
    jsonb_build_object('nivel', 'medio', 'temp_c', 222, 'tiempo_min', 17, 'kg', 27.0),
    jsonb_build_object('nivel', 'alto', 'temp_c', 230, 'tiempo_min', 15, 'kg', 13.5)))));
select is(
  (select string_agg((p.orden, p.nivel, p.kg)::text, ' ' order by p.orden) from cafe.lote_perfil_tostion p
    where p.lote_id = (select (r ->> 'id')::uuid from res where k = 'varios')),
  '(1,medio,27.000) (2,alto,13.500)', '27,0 + 13,5 kg sobre 40,5 kg guarda dos perfiles en orden');
select is(
  (select (l.nivel_tueste, l.perfil_temp_c)::text from cafe.lotes l
    where l.id = (select (r ->> 'id')::uuid from res where k = 'varios')),
  '(medio,222.0)', 'las columnas del lote guardan el perfil 1 (compatibilidad)');

select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga(jsonb_build_object('perfiles', jsonb_build_array(
       jsonb_build_object('nivel', 'medio', 'kg', 27.0), jsonb_build_object('nivel', 'alto', 'kg', 10.0))))) $$,
  'P0001', 'perfiles_no_suman', '27,0 + 10,0 kg no suman 40,5 kg: se rechaza');
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga()) $$, 'P0001', 'falta_nivel_tueste', 'con tostión y sin perfil: falta el nivel');
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga(jsonb_build_object('perfiles', jsonb_build_array(
       jsonb_build_object('nivel', 'medio', 'kg', 20.0), jsonb_build_object('nivel', 'alto'))))) $$,
  'P0001', 'datos_invalidos', 'con varios perfiles cada uno lleva sus kilos');
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga(jsonb_build_object('perfiles', jsonb_build_array(
       jsonb_build_object('nivel', 'medio', 'temp_c', 500, 'kg', 40.5))))) $$,
  'P0001', 'datos_invalidos', 'la temperatura fuera de rango se rechaza');

-- Con trilla, la suma debe igualar lo que entra a la tostión (40,5 × 0,81 = 32,805 kg con la merma de 19 %).
insert into res select 'trilla', cafe.registrar_recepcion(pg_temp.carga(jsonb_build_object(
  'servicios', jsonb_build_array('trilla', 'tostion'),
  'perfiles', jsonb_build_array(jsonb_build_object('nivel', 'medio', 'kg', 20.0), jsonb_build_object('nivel', 'bajo', 'kg', 12.8)))));
select ok((select (r ->> 'id') is not null from res where k = 'trilla'), 'con trilla la suma se compara con los kilos estimados a tostión (32,8)');
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga(jsonb_build_object(
       'servicios', jsonb_build_array('trilla', 'tostion'),
       'perfiles', jsonb_build_array(jsonb_build_object('nivel', 'medio', 'kg', 40.5)))))  $$,
  'P0001', 'perfiles_no_suman', 'con trilla, 40,5 kg ya no cuadra');

-- Cliente anterior: perfil único por las columnas viejas.
insert into res select 'legado', cafe.registrar_recepcion(pg_temp.carga(jsonb_build_object('nivel_tueste', 'bajo', 'perfil_temp_c', 205, 'perfil_tiempo_min', 12)));
select is(
  (select (p.nivel, p.temp_c, p.tiempo_min, p.kg)::text from cafe.lote_perfil_tostion p
    where p.lote_id = (select (r ->> 'id')::uuid from res where k = 'legado')),
  '(bajo,205.0,12.0,40.500)', 'sin `perfiles` vale el perfil único de las columnas anteriores');

-- 3. Aislamiento entre clientes y permisos --------------------------------------------------------------------------------
select is((select count(*)::int from cafe.lote_perfil_tostion), 7, 'A ve sus 7 filas de perfil');

reset role;
select tests.autenticar_como('owner-b@lpt.test');
select is((select count(*)::int from cafe.lote_perfil_tostion), 0, 'B no ve los perfiles de los lotes de A');

reset role;
select tests.autenticar_como('viewer-a@lpt.test');
select is((select count(*)::int from cafe.lote_perfil_tostion), 7, 'el viewer del cliente A los lee');
select throws_ok(
  $$ insert into cafe.lote_perfil_tostion (lote_id, orden, nivel, kg)
     values ((select id from cafe.lotes limit 1), 9, 'medio', 1) $$,
  '42501', null, 'el viewer no inserta perfiles');

select * from finish();
rollback;
