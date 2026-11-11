-- Panel de gerencia · proveedores de marca propia (FIN-137 · A-19): `cafe.proveedores_marca_propia` agrupa por proveedor los
-- lotes de marca propia recibidos en el periodo (precio/kg ponderado, humedad, merma de tostión y costo por kg tostado),
-- sin anulados ni lotes de servicio, y respeta el aislamiento por cliente y el módulo `cafe.dashboard`.
-- Todo se crea aquí dentro (rollback al final).   o1 owner A   p3 operativo A   p4 viewer A   o5 owner B (sin dashboard)   o6 owner C
begin;

select plan(14);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000093a1', 'authenticated', 'authenticated', 'owner-a@provs.test'),
  ('00000000-0000-0000-0000-0000000093a3', 'authenticated', 'authenticated', 'operativo-a@provs.test'),
  ('00000000-0000-0000-0000-0000000093a4', 'authenticated', 'authenticated', 'viewer-a@provs.test'),
  ('00000000-0000-0000-0000-0000000093a5', 'authenticated', 'authenticated', 'owner-b@provs.test'),
  ('00000000-0000-0000-0000-0000000093a6', 'authenticated', 'authenticated', 'owner-c@provs.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Provs A', 'provs-a-t', 'cafe', null, null, array['cafe.dashboard']);
select platform.crear_tenant('Provs B', 'provs-b-t', 'cafe');
select platform.crear_tenant('Provs C', 'provs-c-t', 'cafe', null, null, array['cafe.dashboard']);
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'provs-a-t'
union all select 'b', id from public.tenants where slug = 'provs-b-t'
union all select 'c', id from public.tenants where slug = 'provs-c-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), m.rol::public.rol_tenant
  from (values
    ('00000000-0000-0000-0000-0000000093a1', 'a', 'owner'),
    ('00000000-0000-0000-0000-0000000093a3', 'a', 'operativo'),
    ('00000000-0000-0000-0000-0000000093a4', 'a', 'viewer'),
    ('00000000-0000-0000-0000-0000000093a5', 'b', 'owner'),
    ('00000000-0000-0000-0000-0000000093a6', 'c', 'owner')) as m(user_id, t, rol);

with t as (
  insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles)
  select i.id, x.nombre, 'Calle 1', '3000000000', x.identificacion, x.roles
    from (values ('a', 'Proveedor Uno', '9300001', array['proveedor']),
                 ('a', 'Proveedor Dos', '9300002', array['proveedor']),
                 ('a', 'Cliente A',     '9300003', array['cliente_servicio']),
                 ('c', 'Proveedor C',   '9300004', array['proveedor'])) as x(t, nombre, identificacion, roles)
    join ids i on i.clave = x.t
  returning identificacion, id
)
insert into ids select case identificacion when '9300001' then 'p1' when '9300002' then 'p2' when '9300003' then 'ca' else 'pc' end, id from t;
insert into ids select 'xa', t.id from cafe.tipos_cafe t join ids i on i.id = t.tenant_id and i.clave = 'a' where t.nombre = 'Excelso';

create temp table res (k text primary key, r jsonb);
grant select, insert on res to authenticated;

create or replace function pg_temp.hoy() returns text language sql as $$ select to_char((now() at time zone 'America/Bogota')::date, 'YYYY-MM-DD') $$;
grant execute on function pg_temp.hoy() to authenticated;

-- Compra de café para marca propia (`p_tipo`: 'xa' Excelso, 'ka' Consumo; proveedor de A; $20.000/kg).
create or replace function pg_temp.comprar(p_k text, p_peso numeric, p_n integer, p_tipo text default 'xa', p_prov text default 'pa')
returns void language plpgsql as $$
begin
  insert into res
  select p_k, cafe.registrar_compra(jsonb_build_object(
    'tercero_id', (select id from ids where clave = p_prov), 'tipo_cafe_id', (select id from ids where clave = p_tipo),
    'fecha', pg_temp.hoy(), 'peso_kg', p_peso, 'num_bultos', p_n, 'precio_kg', 30000));
end $$;
grant execute on function pg_temp.comprar(text, numeric, integer, text, text) to authenticated;

create or replace function pg_temp.lid(p_k text) returns uuid language sql as $$ select (r ->> 'id')::uuid from res where k = p_k $$;
grant execute on function pg_temp.lid(text) to authenticated;

create or replace function pg_temp.barr(p_k text, p_nums integer[]) returns uuid[] language sql as $$
  select array_agg(b.id order by b.numero) from cafe.lote_bultos b where b.lote_id = pg_temp.lid(p_k) and b.numero = any(p_nums)
$$;
grant execute on function pg_temp.barr(text, integer[]) to authenticated;

-- Entrada de registrar_proceso: lote `p_k`, tipo, hoy, los bultos de `p_nums` (todos si es null) y `p_extra`.
create or replace function pg_temp.p(p_k text, p_tipo text, p_nums integer[] default null, p_extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('lote_id', pg_temp.lid(p_k), 'tipo', p_tipo, 'fecha', pg_temp.hoy(),
         'bultos', to_jsonb(pg_temp.barr(p_k, coalesce(p_nums, array(select generate_series(1, 200)))))) || p_extra
$$;
grant execute on function pg_temp.p(text, text, integer[], jsonb) to authenticated;

-- Los baches ya no llevan salida (B-05): estas pruebas parten de tostiones CON salida (la que antes pesaba cada bache), así que
-- se fija aquí como lo haría el empaque de la tanda (SECURITY DEFINER de prueba, con la bandera de edición de `editar_lote`).
create or replace function pg_temp.fijar_salida(p_proceso uuid, p_extra jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare v numeric;
begin
  select sum((b ->> 'peso_salida_kg')::numeric) into v from jsonb_array_elements(p_extra -> 'baches') b where b ? 'peso_salida_kg';
  if v is null then return; end if;
  perform set_config('cafe.edicion_lote', 'on', true);
  update cafe.procesos set peso_salida_kg = v where id = p_proceso;
  perform set_config('cafe.edicion_lote', 'off', true);
end $$;
grant execute on function pg_temp.fijar_salida(uuid, jsonb) to authenticated;

create or replace function pg_temp.reg(p_res text, p_k text, p_tipo text, p_nums integer[] default null, p_extra jsonb default '{}')
returns void language plpgsql as $$
declare v jsonb;
begin
  v := cafe.registrar_proceso(pg_temp.p(p_k, p_tipo, p_nums, p_extra));
  insert into res values (p_res, v);
  if p_tipo = 'tostion' then perform pg_temp.fijar_salida((v ->> 'id')::uuid, p_extra); end if;
end $$;
grant execute on function pg_temp.reg(text, text, text, integer[], jsonb) to authenticated;

-- Baches que reparten `p_entrada` según `cafe.sugerir_baches` y dejan salir `p_factor` de cada uno.
create or replace function pg_temp.baches(p_entrada numeric, p_factor numeric) returns jsonb language sql as $$
  select jsonb_build_object('baches', (
    select jsonb_agg(jsonb_build_object('peso_entrada_kg', e.v::numeric, 'peso_salida_kg', round(e.v::numeric * p_factor, 3)) order by e.n)
      from jsonb_array_elements_text(cafe.sugerir_baches(p_entrada) -> 'baches') with ordinality as e(v, n)))
$$;
grant execute on function pg_temp.baches(numeric, numeric) to authenticated;

-- Tostión de TODOS los bultos del lote `p_k` (100 kg → 81 kg, nivel medio), guardada bajo `p_res`.
create or replace function pg_temp.tostar(p_res text, p_k text) returns void language plpgsql as $$
begin
  perform pg_temp.reg(p_res, p_k, 'tostion', null, pg_temp.baches(100, 0.81) || '{"nivel_tueste": "medio"}');
end $$;
grant execute on function pg_temp.tostar(text, text) to authenticated;


-- 1. Datos: el proveedor 1 vende 100 kg (se tuestan: 100 → 81 kg) y 50 kg (sin tostar); el 2, 20 kg; un lote anulado; un servicio.
select tests.autenticar_como('operativo-a@provs.test');
select pg_temp.comprar('L1', 100, 2, 'xa', 'p1');
select pg_temp.comprar('L2', 50, 1, 'xa', 'p1');
select pg_temp.comprar('L3', 20, 1, 'xa', 'p2');
select pg_temp.comprar('L4', 500, 8, 'xa', 'p2');   -- se anula abajo
select pg_temp.tostar('T1', 'L1');
insert into res select 'S1', cafe.registrar_recepcion(jsonb_build_object(
  'tercero_id', (select id from ids where clave = 'ca'), 'fecha', pg_temp.hoy(), 'peso_kg', 200, 'num_bultos', 2, 'servicios', '["trilla"]'::jsonb));
reset role;
select tests.autenticar_como('owner-a@provs.test');
update cafe.lotes set anulado_at = now(), motivo_anulacion = 'Compra duplicada' where id = pg_temp.lid('L4');
reset role;

-- 2. Lectura ----------------------------------------------------------------------------------------------------------
select tests.autenticar_como('viewer-a@provs.test');
create temp table r as select cafe.proveedores_marca_propia() as j;
grant select on r to authenticated;
select is(jsonb_array_length((select j -> 'proveedores' from r)), 2, 'dos proveedores: sin el lote anulado ni el de servicio');
select is((select (p ->> 'nombre') from r, jsonb_array_elements(j -> 'proveedores') p limit 1), 'Proveedor Uno', 'el de más kilos primero');
select is(
  (select row((p ->> 'lotes')::int, (p ->> 'kg')::numeric, (p ->> 'precio_kg')::numeric)::text
     from r, jsonb_array_elements(j -> 'proveedores') p where p ->> 'nombre' = 'Proveedor Uno'),
  '(2,150.000,30000.00)', 'proveedor 1: 2 lotes, 150 kg, precio por kg ponderado');
select is(
  (select (p ->> 'merma_tostion_pct')::numeric from r, jsonb_array_elements(j -> 'proveedores') p where p ->> 'nombre' = 'Proveedor Uno'),
  19.000, 'merma de tostión ponderada con la tostión del lote 1 (100 → 81 kg)');
select is(
  (select (p ->> 'costo_kg_tostado')::numeric from r, jsonb_array_elements(j -> 'proveedores') p where p ->> 'nombre' = 'Proveedor Uno'),
  37037.04, 'costo por kg tostado = precio / (1 − merma) = 30.000 / 0,81');
select is(
  (select p -> 'humedad_pct' from r, jsonb_array_elements(j -> 'proveedores') p where p ->> 'nombre' = 'Proveedor Uno'),
  'null'::jsonb, 'sin humedad medida no se inventa');
select is(
  (select p -> 'merma_tostion_pct' from r, jsonb_array_elements(j -> 'proveedores') p where p ->> 'nombre' = 'Proveedor Dos'),
  'null'::jsonb, 'sin tostión: merma y costo por kg tostado quedan en null');
select is(
  (select p -> 'costo_kg_tostado' from r, jsonb_array_elements(j -> 'proveedores') p where p ->> 'nombre' = 'Proveedor Dos'),
  'null'::jsonb, 'idem el costo por kg tostado');

-- 3. Periodo, validaciones y permisos ---------------------------------------------------------------------------------
select is(jsonb_array_length(cafe.proveedores_marca_propia(current_date + 1, current_date + 2) -> 'proveedores'), 0, 'otro periodo: sin proveedores');
select throws_ok($$select cafe.proveedores_marca_propia(current_date, current_date - 1)$$, 'P0001', 'datos_invalidos', 'un rango invertido se rechaza');
reset role;
select tests.autenticar_como('owner-b@provs.test');
select throws_ok($$select cafe.proveedores_marca_propia()$$, '42501', null, 'un cliente sin el módulo cafe.dashboard no recibe cifras');
reset role;
select tests.autenticar_como('owner-c@provs.test');
select is(jsonb_array_length(cafe.proveedores_marca_propia() -> 'proveedores'), 0, 'otro cliente con el módulo no ve los proveedores de A');
reset role;
select ok(not has_function_privilege('anon', 'cafe.proveedores_marca_propia(date, date)', 'execute'), 'anon no puede ejecutarla');
select ok(has_function_privilege('authenticated', 'cafe.proveedores_marca_propia(date, date)', 'execute'), 'authenticated sí');

select * from finish();
rollback;
