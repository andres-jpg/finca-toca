-- El empaque sin merma y con la diferencia clasificada por destino (FIN-119 · A-01).
-- Cubre: la diferencia exige destino (suelto | granel | muestra | perdida) y cuadra con lo que llegó; «suelto» solo en
-- servicios a terceros y «granel» solo en marca propia; sin diferencia no se guarda destino; el saldo a granel por
-- lote (`cafe.v_granel_lote`); el empaque de servicios (líneas sin inventario, bolsa del cliente) y que sí se anula;
-- roles y aislamiento entre clientes. Todo se crea AQUÍ dentro de la transacción (rollback al final).
--   p1 owner A   p2 admin A   p3 operativo A   p4 viewer A   p5 owner B
begin;

select plan(25);

-- 0. Preparación --------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000092a1', 'authenticated', 'authenticated', 'owner-a@empaque.test'),
  ('00000000-0000-0000-0000-0000000092a2', 'authenticated', 'authenticated', 'admin-a@empaque.test'),
  ('00000000-0000-0000-0000-0000000092a3', 'authenticated', 'authenticated', 'operativo-a@empaque.test'),
  ('00000000-0000-0000-0000-0000000092a4', 'authenticated', 'authenticated', 'viewer-a@empaque.test'),
  ('00000000-0000-0000-0000-0000000092a5', 'authenticated', 'authenticated', 'owner-b@empaque.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Empaque A', 'empaque-a-t', 'cafe');
select platform.crear_tenant('Empaque B', 'empaque-b-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'empaque-a-t'
union all select 'b', id from public.tenants where slug = 'empaque-b-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), m.rol::public.rol_tenant
  from (values
    ('00000000-0000-0000-0000-0000000092a1', 'a', 'owner'),
    ('00000000-0000-0000-0000-0000000092a2', 'a', 'admin'),
    ('00000000-0000-0000-0000-0000000092a3', 'a', 'operativo'),
    ('00000000-0000-0000-0000-0000000092a4', 'a', 'viewer'),
    ('00000000-0000-0000-0000-0000000092a5', 'b', 'owner')) as m(user_id, t, rol);

-- Proveedores (A y B), cliente de servicios de A y los tipos Excelso/Consumo de A (los siembra el alta).
with t as (
  insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles)
  select i.id, x.nombre, 'Calle 1', '3000000000', x.identificacion, x.roles
    from (values ('a', 'Proveedor A', '9200001', array['proveedor']),
                 ('a', 'Cliente A',   '9200002', array['cliente_servicio']),
                 ('b', 'Proveedor B', '9200003', array['proveedor'])) as x(t, nombre, identificacion, roles)
    join ids i on i.clave = x.t
  returning identificacion, id
)
insert into ids select case identificacion when '9200001' then 'pa' when '9200002' then 'ca' else 'pb' end, id from t;
insert into ids select case t.nombre when 'Excelso' then 'xa' else 'ka' end, t.id
  from cafe.tipos_cafe t join ids i on i.id = t.tenant_id and i.clave = 'a';
insert into ids select 'xb', t.id from cafe.tipos_cafe t join ids i on i.id = t.tenant_id and i.clave = 'b' where t.nombre = 'Excelso';

create temp table res (k text primary key, r jsonb);
grant select, insert on res to authenticated;

create or replace function pg_temp.hoy() returns text language sql as $$ select to_char(current_date, 'YYYY-MM-DD') $$;
grant execute on function pg_temp.hoy() to authenticated;

-- Compra de café para marca propia (`p_tipo`: 'xa' Excelso, 'ka' Consumo; proveedor de A; $20.000/kg).
create or replace function pg_temp.comprar(p_k text, p_peso numeric, p_n integer, p_tipo text default 'xa')
returns void language plpgsql as $$
begin
  insert into res
  select p_k, cafe.registrar_compra(jsonb_build_object(
    'tercero_id', (select id from ids where clave = 'pa'), 'tipo_cafe_id', (select id from ids where clave = p_tipo),
    'fecha', pg_temp.hoy(), 'peso_kg', p_peso, 'num_bultos', p_n, 'precio_kg', 20000));
end $$;
grant execute on function pg_temp.comprar(text, numeric, integer, text) to authenticated;

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

create or replace function pg_temp.reg(p_res text, p_k text, p_tipo text, p_nums integer[] default null, p_extra jsonb default '{}')
returns void language plpgsql as $$
begin
  insert into res select p_res, cafe.registrar_proceso(pg_temp.p(p_k, p_tipo, p_nums, p_extra));
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

-- Entrada de registrar_empaque: lote `p_k`, hoy, los bultos de `p_nums` (todos si es null), las líneas
-- `[[500, 120], [2500, 8]]` y `p_extra`.
create or replace function pg_temp.pe(p_k text, p_lineas integer[][], p_nums integer[] default null, p_extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('lote_id', pg_temp.lid(p_k), 'fecha', pg_temp.hoy(),
         'bultos', to_jsonb(pg_temp.barr(p_k, coalesce(p_nums, array(select generate_series(1, 200))))),
         'diferencia_destino', 'perdida',   -- A-01: lo que sobra siempre dice adónde fue (si no sobra, se ignora)
         'lineas', (select jsonb_agg(jsonb_build_object('presentacion_g', p_lineas[i][1], 'unidades', p_lineas[i][2]) order by i)
                      from generate_subscripts(p_lineas, 1) i)) || p_extra
$$;
grant execute on function pg_temp.pe(text, integer[][], integer[], jsonb) to authenticated;

create or replace function pg_temp.emp(p_res text, p_k text, p_lineas integer[][], p_nums integer[] default null, p_extra jsonb default '{}')
returns void language plpgsql as $$
begin
  insert into res select p_res, cafe.registrar_empaque(pg_temp.pe(p_k, p_lineas, p_nums, p_extra));
end $$;
grant execute on function pg_temp.emp(text, text, integer[][], integer[], jsonb) to authenticated;

-- Stock y artículo por nombre, para el cliente que esté autenticado.
create or replace function pg_temp.stock(p_nombre text) returns numeric language sql as $$
  select stock from public.v_stock where nombre = p_nombre
$$;
grant execute on function pg_temp.stock(text) to authenticated;
create or replace function pg_temp.aid(p_nombre text) returns uuid language sql as $$
  select articulo_id from public.v_stock where nombre = p_nombre
$$;
grant execute on function pg_temp.aid(text) to authenticated;

-- Instantánea del stock de un artículo y diferencia desde entonces (los empaques de otros lotes también mueven
-- insumos y productos: las comprobaciones de los apartados 7 a 9 se hacen por diferencia).
create temp table sn (k text primary key, v numeric);
grant select, insert on sn to authenticated;
create or replace function pg_temp.snap(p_k text, p_nombre text) returns void language sql as $$
  insert into sn select p_k, pg_temp.stock(p_nombre) $$;
grant execute on function pg_temp.snap(text, text) to authenticated;
create or replace function pg_temp.dl(p_k text, p_nombre text) returns numeric language sql as $$
  select pg_temp.stock(p_nombre) - (select v from sn where k = p_k) $$;
grant execute on function pg_temp.dl(text, text) to authenticated;

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

-- Procesos de empaque vigentes de un lote y líneas de un proceso (para comprobar que NO quedó nada).
create or replace function pg_temp.n_empaques(p_k text) returns bigint language sql as $$
  select count(*) from cafe.procesos where lote_id = pg_temp.lid(p_k) and tipo = 'empaque' $$;
grant execute on function pg_temp.n_empaques(text) to authenticated;


-- Insumos para empacar 500 g y lotes ----------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('operativo-a@empaque.test');
select lives_ok(
  $$ select public.registrar_movimientos(jsonb_build_array(
       jsonb_build_object('articulo_id', pg_temp.aid('Bolsa 500 g'), 'cantidad', 500, 'motivo', 'compra'),
       jsonb_build_object('articulo_id', pg_temp.aid('Etiqueta 500 g'), 'cantidad', 500, 'motivo', 'compra'))) $$,
  'el operativo compra bolsas y etiquetas de 500 g'
);

-- G1, G2, G3: 100 kg de Excelso tostados a 81 kg cada uno.
select pg_temp.comprar('G1', 100, 4);
select pg_temp.tostar('G1_t', 'G1');
select pg_temp.comprar('G2', 100, 4);
select pg_temp.tostar('G2_t', 'G2');
select pg_temp.comprar('G3', 100, 4);
select pg_temp.tostar('G3_t', 'G3');

-- 1. Marca propia: la diferencia exige destino ---------------------------------------------------------------------------
select throws_ok(
  $$select cafe.registrar_empaque(pg_temp.pe('G1', array[[500, 100]], null, '{"diferencia_destino": null}'))$$,
  'P0001', 'diferencia_sin_destino', '81 kg llegan y 50 kg van en bolsas: sin destino de los 31 kg que sobran no se guarda'
);
select is(pg_temp.n_empaques('G1'), 0::bigint, 'el empaque rechazado no dejó ningún proceso');
select throws_ok(
  $$select cafe.registrar_empaque(pg_temp.pe('G1', array[[500, 100]], null, '{"diferencia_destino": "suelto"}'))$$,
  'P0001', 'datos_invalidos', '«se entrega suelto al cliente» no aplica a marca propia'
);
select throws_ok(
  $$select cafe.registrar_empaque(pg_temp.pe('G1', array[[500, 100]], null, '{"diferencia_destino": "regalo"}'))$$,
  'P0001', 'datos_invalidos', 'un destino desconocido: datos_invalidos'
);

-- 2. Queda a granel ---------------------------------------------------------------------------------------------------------
select pg_temp.emp('E1', 'G1', array[[500, 120]], null, '{"diferencia_destino": "granel"}');
select is(
  (select row(r ->> 'peso_entrada_kg', r ->> 'peso_salida_kg', r ->> 'diferencia_kg', r ->> 'diferencia_destino')::text from res where k = 'E1'),
  row('81.000', '60.000', '21.000', 'granel')::text,
  '81 kg llegan, 120 × 500 g = 60 kg en bolsas, 21 kg quedan a granel'
);
select is(
  (select row(p.diferencia_kg, p.diferencia_destino)::text from cafe.procesos p where p.id = (select (r ->> 'proceso_id')::uuid from res where k = 'E1')),
  row(21.000::numeric, 'granel')::text, 'el proceso guarda diferencia_kg y diferencia_destino'
);
select is(
  (select p.peso_salida_kg + p.diferencia_kg from cafe.procesos p where p.id = (select (r ->> 'proceso_id')::uuid from res where k = 'E1')),
  81.000, 'cuadre: empacado + diferencia = lo que llegó'
);
select is(
  (select kg_granel from cafe.v_granel_lote where lote_id = pg_temp.lid('G1')), 21.000,
  'el saldo de tostado a granel del lote es 21 kg'
);
select is(
  (select count(*) from cafe.v_granel_lote where lote_id = pg_temp.lid('G2')), 0::bigint,
  'un lote sin diferencia a granel no aparece en el saldo'
);

-- 3. Muestra y pérdida; sin diferencia no hay destino -----------------------------------------------------------------------
select pg_temp.emp('E2', 'G2', array[[500, 150]], null, '{"diferencia_destino": "muestra"}');
select is(
  (select r ->> 'diferencia_destino' from res where k = 'E2'), 'muestra', 'la diferencia (6 kg) se clasifica como muestra'
);
select is(
  (select count(*) from cafe.v_granel_lote where lote_id = pg_temp.lid('G2')), 0::bigint, 'la muestra no suma al saldo a granel'
);
select pg_temp.emp('E3', 'G3', array[[500, 162]], null, '{"diferencia_destino": "perdida"}');
select is(
  (select row(r ->> 'diferencia_kg', r ->> 'diferencia_destino')::text from res where k = 'E3'),
  row('0', null)::text, '162 × 500 g = 81 kg exactos: no hay diferencia y no se guarda destino'
);
select is(
  (select p.diferencia_destino from cafe.procesos p where p.id = (select (r ->> 'proceso_id')::uuid from res where k = 'E3')),
  null, 'el proceso tampoco guarda destino'
);
select throws_ok(
  $$select cafe.registrar_empaque(pg_temp.pe('G3', array[[500, 1]]))$$,
  'P0001', null, 'un lote ya empacado no se vuelve a empacar'
);

-- 4. Servicios a terceros: líneas sin inventario, «suelto» al cliente ----------------------------------------------
insert into res select 'S2', cafe.registrar_recepcion(jsonb_build_object(
  'tercero_id', (select id from ids where clave = 'ca'), 'fecha', pg_temp.hoy(), 'peso_kg', 100, 'num_bultos', 2,
  'servicios', '["tostion","empaque"]'::jsonb, 'nivel_tueste', 'medio'));
select pg_temp.tostar('S2_t', 'S2');
select pg_temp.snap('bolsa', 'Bolsa 500 g');
select throws_ok(
  $$select cafe.registrar_empaque(pg_temp.pe('S2', array[[5000, 10], [2500, 5]], null, '{"diferencia_destino": "granel"}'))$$,
  'P0001', 'datos_invalidos', '«queda a granel» no aplica a servicios a terceros'
);
select pg_temp.emp('E4', 'S2', array[[5000, 10], [2500, 5]], null, '{"diferencia_destino": "suelto"}');
select is(
  (select row(r ->> 'peso_salida_kg', r ->> 'diferencia_kg', r ->> 'diferencia_destino')::text from res where k = 'E4'),
  row('62.500', '18.500', 'suelto')::text, '10 × 5 kg + 5 × 2,5 kg = 62,5 kg en bolsas y 18,5 kg se entregan sueltos'
);
select is(
  (select array_agg(row(l.presentacion_g, l.unidades, l.articulo_pt_id is null)::text order by l.presentacion_g)
     from cafe.empaque_lineas l where l.proceso_id = (select (r ->> 'proceso_id')::uuid from res where k = 'E4')),
  array[row(2500, 5, true)::text, row(5000, 10, true)::text], 'servicios: una línea por tamaño y sin producto terminado'
);
select is(pg_temp.dl('bolsa', 'Bolsa 500 g'), 0.000, 'el empaque de servicios no toca el inventario de bolsas');
select is(
  (select count(*) from cafe.v_granel_lote where lote_id = pg_temp.lid('S2')), 0::bigint, '«suelto» no es saldo a granel'
);

-- 5. El empaque de servicios sí se anula (el de marca propia, no) ------------------------------------------------------
reset role;
select tests.autenticar_como('admin-a@empaque.test');
select lives_ok(
  $$select cafe.anular_proceso((select (r ->> 'proceso_id')::uuid from res where k = 'E4'), 'Registrado en el lote equivocado')$$,
  'un empaque de servicios sin inventario se anula'
);
select throws_ok(
  $$select cafe.anular_proceso((select (r ->> 'proceso_id')::uuid from res where k = 'E1'), 'Prueba')$$,
  'P0001', 'empaque_no_anulable', 'el de marca propia, que movió inventario, no'
);

-- 6. Roles y aislamiento ------------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('viewer-a@empaque.test');
select throws_ok(
  $$select cafe.registrar_empaque(pg_temp.pe('G3', array[[500, 1]]))$$, '42501', null, 'Gerencia (viewer) no empaca'
);
select is((select count(*) from cafe.v_granel_lote), 1::bigint, 'Gerencia sí ve el saldo a granel de su cliente');
reset role;
select tests.autenticar_como('owner-b@empaque.test');
select is((select count(*) from cafe.v_granel_lote), 0::bigint, 'otro cliente no ve el granel de A');
reset role;

select * from finish();
rollback;
