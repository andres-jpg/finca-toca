-- Bolsas de terceros de peso libre y presentaciones de marca propia en grano/molido (FIN-120 · A-02).
-- Cubre: la diferencia exige destino (suelto | granel | muestra | perdida) y cuadra con lo que llegó; «suelto» solo en
-- servicios a terceros y «granel» solo en marca propia; sin diferencia no se guarda destino; el saldo a granel por
-- lote (`cafe.v_granel_lote`); el empaque de servicios (líneas sin inventario, bolsa del cliente) y que sí se anula;
-- roles y aislamiento entre clientes. Todo se crea AQUÍ dentro de la transacción (rollback al final).
--   p1 owner A   p2 admin A   p3 operativo A   p4 viewer A   p5 owner B
begin;

select plan(19);

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


-- Insumos de 500 g y 2.500 g ---------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('operativo-a@empaque.test');
select lives_ok(
  $$ select public.registrar_movimientos(jsonb_build_array(
       jsonb_build_object('articulo_id', pg_temp.aid('Bolsa 500 g'), 'cantidad', 500, 'motivo', 'compra'),
       jsonb_build_object('articulo_id', pg_temp.aid('Etiqueta 500 g'), 'cantidad', 500, 'motivo', 'compra'),
       jsonb_build_object('articulo_id', pg_temp.aid('Bolsa 2.500 g'), 'cantidad', 100, 'motivo', 'compra'),
       jsonb_build_object('articulo_id', pg_temp.aid('Etiqueta 2.500 g'), 'cantidad', 100, 'motivo', 'compra'))) $$,
  'el operativo compra bolsas y etiquetas de 500 g y 2.500 g'
);

select pg_temp.comprar('M1', 100, 4);
select pg_temp.tostar('M1_t', 'M1');
select pg_temp.comprar('M2', 100, 4);
select pg_temp.tostar('M2_t', 'M2');
select pg_temp.comprar('M3', 100, 4);
select pg_temp.tostar('M3_t', 'M3');

-- 1. Molido sin molienda ni bultos molidos --------------------------------------------------------------------------------
select throws_ok(
  $$select cafe.registrar_empaque(pg_temp.pe('M1', array[[2500, 8]], null, '{"diferencia_destino": "granel"}')
       #- '{lineas,0}' || jsonb_build_object('lineas', jsonb_build_array(jsonb_build_object('presentacion_g', 2500, 'unidades', 8, 'forma', 'molido'))))$$,
  'P0001', 'molienda_requerida', 'un café molido sin molienda registrada ni bultos molidos no se empaca'
);

-- 2. Molido más grande que lo molido: nada queda escrito --------------------------------------------------------------------
select throws_ok(
  $$select cafe.registrar_empaque(jsonb_build_object('lote_id', pg_temp.lid('M1'), 'fecha', pg_temp.hoy(),
      'bultos', to_jsonb(pg_temp.barr('M1', array[1,2,3,4])), 'diferencia_destino', 'granel',
      'molienda', jsonb_build_object('peso_entrada_kg', 12, 'peso_salida_kg', 10),
      'lineas', jsonb_build_array(jsonb_build_object('presentacion_g', 2500, 'unidades', 8, 'forma', 'molido'))))$$,
  'P0001', 'empaque_supera_peso', '8 × 2.500 g molido (20 kg) con una molienda que dio 10 kg no cuadra'
);
select is(
  (select count(*) from cafe.procesos where lote_id = pg_temp.lid('M1') and tipo in ('molienda', 'empaque')), 0::bigint,
  'el empaque rechazado no dejó molienda ni empaque'
);

-- 3. Criterio: 40 × 500 g grano y 8 × 2.500 g molido ------------------------------------------------------------------------
select pg_temp.snap('b5', 'Bolsa 500 g');
select pg_temp.snap('e5', 'Etiqueta 500 g');
select pg_temp.snap('b25', 'Bolsa 2.500 g');
select pg_temp.snap('e25', 'Etiqueta 2.500 g');
select pg_temp.snap('g5', 'Excelso 500 g');
select pg_temp.snap('g25', 'Excelso 2.500 g');
insert into res select 'E1', cafe.registrar_empaque(jsonb_build_object('lote_id', pg_temp.lid('M1'), 'fecha', pg_temp.hoy(),
  'bultos', to_jsonb(pg_temp.barr('M1', array[1,2,3,4])), 'diferencia_destino', 'granel',
  'molienda', jsonb_build_object('peso_entrada_kg', 22, 'peso_salida_kg', 20.4),
  'lineas', jsonb_build_array(
    jsonb_build_object('presentacion_g', 500, 'unidades', 40, 'forma', 'grano'),
    jsonb_build_object('presentacion_g', 2500, 'unidades', 8, 'forma', 'molido'))));
select is(
  (select row(pg_temp.dl('b5', 'Bolsa 500 g'), pg_temp.dl('e5', 'Etiqueta 500 g'), pg_temp.dl('b25', 'Bolsa 2.500 g'), pg_temp.dl('e25', 'Etiqueta 2.500 g'))::text),
  row(-40.000::numeric, -40.000::numeric, -8.000::numeric, -8.000::numeric)::text,
  'descuenta 40 bolsas y etiquetas de 500 g y 8 de 2.500 g'
);
select is(
  (select row(pg_temp.dl('g5', 'Excelso 500 g'), pg_temp.stock('Excelso 2.500 g molido'), pg_temp.dl('g25', 'Excelso 2.500 g'))::text),
  row(40.000::numeric, 8.000::numeric, 0.000::numeric)::text,
  'el grano de 500 g suma 40; el molido de 2.500 g es otro producto con 8; el grano de 2.500 g no se toca'
);
select is(
  (select row(p.peso_entrada_kg, p.peso_salida_kg, p.merma_kg)::text from cafe.procesos p
    where p.lote_id = pg_temp.lid('M1') and p.tipo = 'molienda' and p.anulado_at is null),
  row(22.000::numeric, 20.400::numeric, 1.600::numeric)::text, 'se creó el proceso de molienda del lote (22 kg → 20,4 kg)'
);
select is(
  (select row(p.peso_entrada_kg, p.peso_salida_kg, p.diferencia_kg, p.diferencia_destino)::text from cafe.procesos p
    where p.id = (select (r ->> 'proceso_id')::uuid from res where k = 'E1')),
  row(79.400::numeric, 40.000::numeric, 39.400::numeric, 'granel')::text,
  'al empaque llegan lo no molido (59) más lo molido (20,4): 79,4 kg; 40 kg en bolsas y 39,4 a granel'
);
select is(
  (select array_agg(row(l.presentacion_g, l.unidades, l.forma)::text order by l.presentacion_g)
     from cafe.empaque_lineas l where l.proceso_id = (select (r ->> 'proceso_id')::uuid from res where k = 'E1')),
  array[row(500, 40, 'grano')::text, row(2500, 8, 'molido')::text], 'las líneas guardan su forma'
);
select is(
  (select r -> 'molienda' ->> 'peso_salida_kg' from res where k = 'E1'), '20.400', 'la respuesta trae la molienda'
);

-- 4. Segundo molido con bultos ya molidos: sin bloque de molienda --------------------------------------------------------
select pg_temp.reg('M2_m', 'M2', 'molienda', null, '{"peso_entrada_kg": 81, "peso_salida_kg": 79}');
insert into res select 'E2', cafe.registrar_empaque(jsonb_build_object('lote_id', pg_temp.lid('M2'), 'fecha', pg_temp.hoy(),
  'bultos', to_jsonb(pg_temp.barr('M2', array[1,2,3,4])), 'diferencia_destino', 'perdida',
  'lineas', jsonb_build_array(jsonb_build_object('presentacion_g', 500, 'unidades', 150, 'forma', 'molido'))));
select is(
  (select row(pg_temp.stock('Excelso 500 g molido'), (select count(*) from cafe.v_saldo_reabrible where lote_id = pg_temp.lid('M2')))::text),
  row(150.000::numeric, 0::bigint)::text,
  'bultos ya molidos se empacan como molido sin repetir la molienda; el molido no es reabrible'
);

-- 5. Servicios a terceros: peso libre, bolsa del cliente, sin inventario ---------------------------------------------------
insert into res select 'S1', cafe.registrar_recepcion(jsonb_build_object(
  'tercero_id', (select id from ids where clave = 'ca'), 'fecha', pg_temp.hoy(), 'peso_kg', 100, 'num_bultos', 2,
  'servicios', '["tostion","empaque"]'::jsonb, 'nivel_tueste', 'medio'));
select pg_temp.tostar('S1_t', 'S1');
select pg_temp.snap('sb5', 'Bolsa 500 g');
select pg_temp.snap('sb25', 'Bolsa 2.500 g');
select throws_ok(
  $$select cafe.registrar_empaque(jsonb_build_object('lote_id', pg_temp.lid('S1'), 'fecha', pg_temp.hoy(),
      'bultos', to_jsonb(pg_temp.barr('S1', array[1,2])), 'diferencia_destino', 'suelto',
      'lineas', jsonb_build_array(jsonb_build_object('presentacion_g', 5000, 'unidades', 2, 'forma', 'molido'))))$$,
  'P0001', 'datos_invalidos', 'en servicios no hay café molido'
);
select throws_ok(
  $$select cafe.registrar_empaque(jsonb_build_object('lote_id', pg_temp.lid('S1'), 'fecha', pg_temp.hoy(),
      'bultos', to_jsonb(pg_temp.barr('S1', array[1,2])), 'diferencia_destino', 'suelto',
      'molienda', jsonb_build_object('peso_entrada_kg', 5, 'peso_salida_kg', 4),
      'lineas', jsonb_build_array(jsonb_build_object('presentacion_g', 5000, 'unidades', 2))))$$,
  'P0001', 'datos_invalidos', 'ni bloque de molienda'
);
insert into res select 'E3', cafe.registrar_empaque(jsonb_build_object('lote_id', pg_temp.lid('S1'), 'fecha', pg_temp.hoy(),
  'bultos', to_jsonb(pg_temp.barr('S1', array[1,2])), 'diferencia_destino', 'suelto',
  'lineas', jsonb_build_array(
    jsonb_build_object('presentacion_g', 10000, 'unidades', 5, 'bolsa_cliente', false),
    jsonb_build_object('presentacion_g', 5000, 'unidades', 3),
    jsonb_build_object('presentacion_g', 2500, 'unidades', 2))));
select is(
  (select array_agg(row(l.presentacion_g, l.unidades, l.bolsa_cliente, l.forma, l.articulo_pt_id is null)::text order by l.presentacion_g)
     from cafe.empaque_lineas l where l.proceso_id = (select (r ->> 'proceso_id')::uuid from res where k = 'E3')),
  array[row(2500, 2, true, 'grano', true)::text, row(5000, 3, true, 'grano', true)::text, row(10000, 5, true, 'grano', true)::text],
  'bolsas de 10 kg, 5 kg y 2,5 kg: todas del cliente, sin producto terminado (aunque se mande bolsa_cliente = false)'
);
select is(
  (select row(pg_temp.dl('sb5', 'Bolsa 500 g'), pg_temp.dl('sb25', 'Bolsa 2.500 g'))::text),
  row(0.000::numeric, 0.000::numeric)::text, 'el stock de insumos no cambia'
);

-- 6. Roles y aislamiento ----------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('owner-b@empaque.test');
select is(
  (select count(*) from public.v_stock where nombre like '%molido'), 0::bigint, 'otro cliente no ve los productos molidos de A'
);
select is(
  (select count(*) from cafe.empaque_lineas where forma = 'molido'), 0::bigint, 'ni sus líneas'
);
reset role;
select tests.autenticar_como('viewer-a@empaque.test');
select throws_ok(
  $$select cafe._asegurar_producto_molido((select id from ids where clave = 'xa'), 500)$$,
  '42501', null, 'Gerencia (viewer) no crea productos molidos'
);
reset role;
select tests.autenticar_como('operativo-a@empaque.test');
select throws_ok(
  $$select cafe._asegurar_producto_molido((select id from ids where clave = 'xb'), 500)$$,
  'P0001', 'producto_no_configurado', 'un tipo de café de otro cliente no sirve'
);
reset role;

select * from finish();
rollback;
