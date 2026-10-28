-- Empaque de marca propia e inventario de producto terminado (FIN-111 · CO-30): cafe.empaque_lineas,
-- cafe.registrar_empaque, cafe.registrar_salida_pt y el trigger que solo deja entrar producto terminado por empaque.
-- Cubre el ejemplo del ticket (81 kg tostados → 120 × 500 g + 8 × 2.500 g: merma 1 kg, 1,23 %), el exceso de peso,
-- el empaque sin insumos (avisa y no bloquea), el empaque parcial por bultos, las entradas manuales rechazadas,
-- las salidas (muestra, pérdida, ajuste), el rollback si falla un movimiento, la anulación, los roles y el
-- aislamiento entre clientes.
-- Todo se crea AQUÍ dentro de la transacción (rollback al final): dos clientes de café (A y B), sin depender del seed.
--   p1 owner A   p2 admin A   p3 operativo A   p4 viewer A   p5 owner B
begin;

select plan(98);

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

-- 1. Estructura y privilegios -------------------------------------------------------------------------------
select has_table('cafe', 'empaque_lineas', 'existe cafe.empaque_lineas');
select ok((select relrowsecurity from pg_class where oid = 'cafe.empaque_lineas'::regclass), 'empaque_lineas tiene RLS activada');
select ok(
  not has_table_privilege('authenticated', 'cafe.empaque_lineas', 'update')
  and not has_table_privilege('authenticated', 'cafe.empaque_lineas', 'delete')
  and not has_table_privilege('service_role', 'cafe.empaque_lineas', 'update')
  and not has_table_privilege('service_role', 'cafe.empaque_lineas', 'delete')
  and not has_table_privilege('anon', 'cafe.empaque_lineas', 'select'),
  'las líneas de empaque son inmutables: nadie las edita ni las borra, y anon no las lee'
);
select is(
  (select array_agg(p.prosecdef order by p.proname)
     from pg_proc p
    where p.oid in ('cafe.registrar_empaque(jsonb)'::regprocedure, 'cafe.registrar_salida_pt(jsonb)'::regprocedure)),
  array[false, false], 'registrar_empaque y registrar_salida_pt son SECURITY INVOKER'
);
select ok(
  not has_function_privilege('anon', 'cafe.registrar_empaque(jsonb)', 'execute')
  and not has_function_privilege('anon', 'cafe.registrar_salida_pt(jsonb)', 'execute')
  and has_function_privilege('authenticated', 'cafe.registrar_empaque(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'cafe.proteger_entradas_pt()', 'execute')
  and not has_function_privilege('authenticated', 'cafe.procesos_empaque_no_anulable()', 'execute'),
  'anon no ejecuta las RPC de empaque y las funciones de los triggers no se llaman a mano'
);

-- 2. Stock inicial de insumos y lotes ---------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('operativo-a@empaque.test');

select is(pg_temp.stock('Excelso 500 g'), 0.000, 'el producto terminado Excelso 500 g existe (lo crea el alta) y arranca en cero');
select lives_ok(
  $$ select public.registrar_movimientos(jsonb_build_array(
       jsonb_build_object('articulo_id', pg_temp.aid('Bolsa 500 g'), 'cantidad', 200, 'motivo', 'compra'),
       jsonb_build_object('articulo_id', pg_temp.aid('Etiqueta 500 g'), 'cantidad', 200, 'motivo', 'compra'),
       jsonb_build_object('articulo_id', pg_temp.aid('Bolsa 2.500 g'), 'cantidad', 10, 'motivo', 'compra'),
       jsonb_build_object('articulo_id', pg_temp.aid('Etiqueta 2.500 g'), 'cantidad', 10, 'motivo', 'compra'))) $$,
  'el operativo compra bolsas y etiquetas (200 de 500 g, 10 de 2.500 g)'
);

-- MP1: 100 kg Excelso en 4 bultos, tostados a 81 kg. MP2 (para el exceso) igual con 2 bultos.
select pg_temp.comprar('MP1', 100, 4);
select pg_temp.tostar('MP1_t', 'MP1');
select pg_temp.comprar('MP2', 100, 2);
select pg_temp.tostar('MP2_t', 'MP2');
select is(cafe.peso_disponible(pg_temp.lid('MP1'), 'empaque', pg_temp.barr('MP1', array[1, 2, 3, 4])), 81.000,
  'tras la tostión hay 81 kg disponibles para empacar');

-- 3. Antes de empacar: los errores de validación -------------------------------------------------------------------------
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('MP1', 'empaque', null, '{"peso_salida_kg": 80}'))$$,
  'P0001', 'usar_registrar_empaque', 'el empaque de marca propia no se registra como proceso suelto'
);
select throws_ok(
  $$select cafe.registrar_empaque(pg_temp.pe('MP1', array[[500, 170]]))$$,
  'P0001', 'empaque_supera_peso', '170 × 500 g = 85 kg con 81 kg disponibles: empaque_supera_peso'
);
select is(
  pg_temp.detalle($$select cafe.registrar_empaque(pg_temp.pe('MP1', array[[500, 170]]))$$),
  'Empacarías 85 kg y solo hay 81 kg disponibles en los bultos elegidos. Empaca solo lo que hay o elige más bultos.',
  'el mensaje dice cuánto se quiso empacar y cuánto hay'
);
select is(
  (select count(*)::int from cafe.procesos where lote_id = pg_temp.lid('MP1') and tipo = 'empaque')
  + (select count(*)::int from cafe.empaque_lineas)
  + (select count(*)::int from public.movimientos_inventario where ref_tipo = 'cafe.proceso'),
  0, 'el empaque rechazado no dejó ningún proceso, línea ni movimiento'
);
select throws_ok(
  $$select cafe.registrar_empaque(pg_temp.pe('MP1', array[[1000, 10]]))$$,
  'P0001', 'insumo_no_configurado', 'una presentación sin bolsa ni etiqueta (1.000 g): insumo_no_configurado'
);
select is(
  pg_temp.detalle($$select cafe.registrar_empaque(pg_temp.pe('MP1', array[[1000, 10]]))$$),
  'Falta la bolsa y la etiqueta activa de 1.000 g en el inventario de insumos.',
  'el mensaje dice qué insumo falta'
);
select throws_ok(
  $$select cafe.registrar_empaque(pg_temp.pe('MP1', array[[500, 10], [500, 5]]))$$,
  'P0001', 'datos_invalidos', 'la misma presentación dos veces: datos_invalidos'
);
select throws_ok($$select cafe.registrar_empaque(pg_temp.pe('MP1', array[[500, 0]]))$$, 'P0001', 'datos_invalidos', 'cero unidades: datos_invalidos');
select throws_ok($$select cafe.registrar_empaque(pg_temp.pe('MP1', array[[500, 10]], null, '{"lineas": []}'))$$,
  'P0001', 'datos_invalidos', 'sin ninguna presentación: datos_invalidos');
select throws_ok($$select cafe.registrar_empaque('{"lote_id": "no-es-uuid", "fecha": "2026-01-01", "lineas": []}')$$,
  'P0001', 'datos_invalidos', 'un uuid inválido no acaba en error inesperado');
select throws_ok($$select cafe.registrar_empaque(pg_temp.pe('MP1', array[[500, 10]], null, '{"lote_id": "00000000-0000-0000-0000-000000000000"}'))$$,
  'P0001', 'lote_no_encontrado', 'un lote que no existe: lote_no_encontrado');

-- Un lote recién comprado, sin tostar: los bultos no han pasado por la tostión.
select pg_temp.comprar('MP0', 50, 2);
select throws_ok(
  $$select cafe.registrar_empaque(pg_temp.pe('MP0', array[[500, 10]], null, '{"peso_entrada_kg": 5}'))$$,
  'P0001', 'orden_proceso_invalido', 'sin tostión no se empaca: orden_proceso_invalido'
);
select is(
  pg_temp.detalle($$select cafe.registrar_empaque(pg_temp.pe('MP0', array[[500, 10]], null, '{"peso_entrada_kg": 5}'))$$),
  'Primero registra la tostión de estos bultos (1, 2).', 'el mensaje dice qué falta y en qué bultos'
);

-- Un lote de servicio.
insert into res select 'S1', cafe.registrar_recepcion(jsonb_build_object(
  'tercero_id', (select id from ids where clave = 'ca'), 'fecha', pg_temp.hoy(), 'peso_kg', 100, 'num_bultos', 2,
  'servicios', '["tostion"]'::jsonb, 'nivel_tueste', 'medio'));
select throws_ok(
  $$select cafe.registrar_empaque(pg_temp.pe('S1', array[[500, 10]]))$$,
  'P0001', 'usar_registrar_proceso', 'un lote de servicio no mueve inventario: usar_registrar_proceso'
);

-- 4. El ejemplo del ticket: 81 kg → 120 × 500 g + 8 × 2.500 g ---------------------------------------------------------------
select pg_temp.emp('E1', 'MP1', array[[500, 120], [2500, 8]]);
select is(
  (select row(r ->> 'merma_kg', r ->> 'merma_pct', r ->> 'peso_entrada_kg', r ->> 'peso_salida_kg', r ->> 'lote_estado', r ->> 'avance_texto')::text
     from res where k = 'E1'),
  row('1.000', '1.235', '81.000', '80.000', 'listo', '2 de 2')::text,
  '81 kg → 80 kg empacados: merma 1 kg (1,23 %), el lote queda listo (2 de 2)'
);
select is(
  (select round(p.merma_kg / p.peso_entrada_kg * 100, 2) from cafe.procesos p where p.id = (select (r ->> 'proceso_id')::uuid from res where k = 'E1')),
  1.23, 'la merma de empaque es 1,23 % a dos decimales'
);
select is(
  (select row(p.tipo, p.tarifa_kg, p.valor, p.merma_referencia_pct, p.desvio, p.nivel_tueste)::text
     from cafe.procesos p where p.id = (select (r ->> 'proceso_id')::uuid from res where k = 'E1')),
  row('empaque'::cafe.tipo_proceso, 0.00::numeric, 0.00::numeric, null::numeric, false, null::cafe.nivel_tueste)::text,
  'el empaque de marca propia no se cobra, no tiene merma de referencia ni desvío'
);
select is(
  (select array_agg(row(l.presentacion_g, l.unidades, a.nombre)::text order by l.presentacion_g)
     from cafe.empaque_lineas l join public.articulos a on a.id = l.articulo_pt_id
    where l.proceso_id = (select (r ->> 'proceso_id')::uuid from res where k = 'E1')),
  array[row(500, 120, 'Excelso 500 g')::text, row(2500, 8, 'Excelso 2.500 g')::text],
  'una línea por presentación, ligada a su producto terminado Excelso'
);
select is(
  (select jsonb_agg(row_to_json(x)::jsonb order by x.presentacion_g)
     from (select (l ->> 'presentacion_g')::int as presentacion_g, (l ->> 'unidades')::int as unidades, l ->> 'producto' as producto
             from res, jsonb_array_elements(r -> 'lineas') l where k = 'E1') x),
  '[{"presentacion_g": 500, "unidades": 120, "producto": "Excelso 500 g"}, {"presentacion_g": 2500, "unidades": 8, "producto": "Excelso 2.500 g"}]'::jsonb,
  'la respuesta trae las líneas con el nombre del producto (para el aviso «Empacadas 120 × Excelso 500 g…»)'
);
select is(
  array[pg_temp.stock('Excelso 500 g'), pg_temp.stock('Excelso 2.500 g'), pg_temp.stock('Consumo 500 g')],
  array[120.000, 8.000, 0.000], 'producto terminado: Excelso 500 g +120, Excelso 2.500 g +8; Consumo no se toca (tipo × presentación)'
);
select is(
  array[pg_temp.stock('Bolsa 500 g'), pg_temp.stock('Etiqueta 500 g'), pg_temp.stock('Bolsa 2.500 g'), pg_temp.stock('Etiqueta 2.500 g')],
  array[80.000, 80.000, 2.000, 2.000], 'insumos: bolsa y etiqueta de 500 g −120 y de 2.500 g −8'
);
select is(jsonb_array_length((select r -> 'advertencias' from res where k = 'E1')), 0, 'con insumos suficientes no hay advertencias');
select is(
  (select count(*)::int from jsonb_array_elements((select r -> 'stocks' from res where k = 'E1')) s), 6,
  'la respuesta trae el stock resultante de los 6 artículos tocados'
);
select is(
  (select row(count(*), count(*) filter (where ref_tipo = 'cafe.proceso' and ref_id = (select (r ->> 'proceso_id')::uuid from res where k = 'E1')),
              count(*) filter (where motivo = 'consumo'), count(*) filter (where motivo = 'produccion'),
              count(distinct observaciones), min(observaciones))::text
     from public.movimientos_inventario where ref_tipo = 'cafe.proceso'),
  row(6::bigint, 6::bigint, 4::bigint, 2::bigint, 1::bigint, 'Empaque ' || (select codigo from cafe.lotes where id = pg_temp.lid('MP1')))::text,
  '6 movimientos ligados al proceso: 4 consumos y 2 producciones, con el lote en la observación'
);
select is(
  (select array_agg(row(k.articulo_nombre, k.cantidad, k.saldo, k.ref_tipo)::text order by k.articulo_nombre, k.seq)
     from public.v_kardex k where k.articulo_nombre = 'Excelso 500 g'),
  array[row('Excelso 500 g', 120.000::numeric, 120.000::numeric, 'cafe.proceso')::text],
  'el kardex del producto terminado muestra la entrada por empaque con su origen'
);
select is(
  (select row(estado, avance_texto, peso_actual_kg)::text from cafe.v_lotes where id = pg_temp.lid('MP1')),
  row('listo', '2 de 2', 80.000::numeric)::text, 'v_lotes: el lote queda listo y lo que queda es el empacado (80 kg)'
);
select throws_ok(
  $$select cafe.registrar_empaque(pg_temp.pe('MP1', array[[500, 1]], array[1]))$$,
  'P0001', 'bulto_ya_procesado', 'los bultos ya empacados no se empacan otra vez'
);

-- 5. Sin insumos suficientes: se registra y avisa (decisión 14 de CO-20) -------------------------------------------------------
select pg_temp.comprar('MP3', 100, 2, 'ka');
select pg_temp.tostar('MP3_t', 'MP3');
select pg_temp.emp('E3', 'MP3', array[[500, 100]]);
select is(
  (select row(r ->> 'merma_kg', r ->> 'lote_estado')::text from res where k = 'E3'),
  row('31.000', 'listo')::text, 'empacar 100 × 500 g (50 kg) de 81 kg se registra aunque falten bolsas y etiquetas'
);
select is(
  array[pg_temp.stock('Bolsa 500 g'), pg_temp.stock('Etiqueta 500 g'), pg_temp.stock('Consumo 500 g')],
  array[-20.000, -20.000, 100.000], 'las bolsas y etiquetas quedan en −20 y el producto terminado Consumo sube 100'
);
select is(
  (select jsonb_agg(jsonb_build_object('articulo', a ->> 'articulo', 'stock', (a ->> 'stock_resultante')::numeric) order by a ->> 'articulo')
     from res, jsonb_array_elements(r -> 'advertencias') a where k = 'E3'),
  '[{"articulo": "Bolsa 500 g", "stock": -20}, {"articulo": "Etiqueta 500 g", "stock": -20}]'::jsonb,
  'las advertencias nombran la bolsa y la etiqueta que quedaron en −20'
);

-- 6. Empaque parcial por bultos, y con molienda ------------------------------------------------------------------------------
select pg_temp.comprar('MP4', 100, 4);
select pg_temp.tostar('MP4_t', 'MP4');
select pg_temp.emp('E4a', 'MP4', array[[500, 80]], array[1, 2]);
select is(
  (select row(r ->> 'peso_entrada_kg', r ->> 'peso_salida_kg', r ->> 'merma_kg', r ->> 'lote_estado', r ->> 'avance_texto')::text from res where k = 'E4a'),
  row('40.500', '40.000', '0.500', 'parcial', '1 de 2')::text,
  'empacar solo los bultos 1 y 2 (40,5 kg): el lote queda parcial, y la entrada es la parte que les toca de la tostión'
);
select is(cafe.peso_disponible(pg_temp.lid('MP4'), 'empaque', pg_temp.barr('MP4', array[3, 4])), 40.500,
  'los bultos 3 y 4 conservan sus 40,5 kg por empacar');
select pg_temp.emp('E4b', 'MP4', array[[500, 40], [2500, 8]], array[3, 4], '{"peso_entrada_kg": 40.5}');
select is(
  (select row(r ->> 'peso_salida_kg', r ->> 'lote_estado', r ->> 'avance_texto')::text from res where k = 'E4b'),
  row('40.000', 'listo', '2 de 2')::text, 'el segundo empaque (500 g y 2.500 g juntos, 40 kg) cierra el lote'
);
select is((select count(*)::int from cafe.empaque_lineas where proceso_id = (select (r ->> 'proceso_id')::uuid from res where k = 'E4b')), 2,
  'el segundo empaque tiene sus dos presentaciones');

-- Con molienda: bultos 1 y 2 molidos (40,5 → 40) y 3 y 4 sin moler; el empaque junta ambos orígenes.
select pg_temp.comprar('MP5', 100, 4);
select pg_temp.tostar('MP5_t', 'MP5');
select pg_temp.reg('MP5_m', 'MP5', 'molienda', array[1, 2], '{"peso_salida_kg": 40}');
select is(cafe.peso_disponible(pg_temp.lid('MP5'), 'empaque', pg_temp.barr('MP5', array[1, 2, 3, 4])), 80.500,
  'molidos (40 kg) + tostados sin moler (40,5 kg) = 80,5 kg para empacar');
select pg_temp.emp('E5', 'MP5', array[[500, 160]]);
select is((select r ->> 'merma_kg' from res where k = 'E5'), '0.500', 'empacar 160 × 500 g (80 kg) de 80,5 kg: merma 0,5 kg');

-- Un empaque de un día anterior mueve el inventario con esa fecha.
select pg_temp.comprar('MP6', 100, 2);
select pg_temp.tostar('MP6_t', 'MP6');
select pg_temp.emp('E6', 'MP6', array[[500, 10]], null, jsonb_build_object('fecha', to_char((now() at time zone 'America/Bogota')::date - 1, 'YYYY-MM-DD')));
select is(
  (select count(*)::int from public.movimientos_inventario
    where ref_id = (select (r ->> 'proceso_id')::uuid from res where k = 'E6')
      and (fecha at time zone 'America/Bogota')::date = (now() at time zone 'America/Bogota')::date - 1),
  3, 'los movimientos de un empaque de ayer llevan fecha de ayer'
);

-- 7. Solo el empaque crea producto terminado ------------------------------------------------------------------------------------------
select pg_temp.snap('s7', 'Excelso 500 g');
select throws_ok(
  $$select public.registrar_movimientos(jsonb_build_array(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'cantidad', 10, 'motivo', 'compra')))$$,
  'P0001', 'entrada_pt_no_permitida', 'una compra manual de producto terminado: entrada_pt_no_permitida'
);
select throws_ok(
  $$select public.registrar_movimientos(jsonb_build_array(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'cantidad', 10, 'motivo', 'produccion')))$$,
  'P0001', 'entrada_pt_no_permitida', 'tampoco una producción manual'
);
select throws_ok(
  $$select public.registrar_movimientos(jsonb_build_array(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'cantidad', 10, 'motivo', 'saldo_inicial')))$$,
  'P0001', 'entrada_pt_no_permitida', 'ni un saldo inicial'
);
select throws_ok(
  $$select public.registrar_movimientos(jsonb_build_array(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'cantidad', 10, 'motivo', 'devolucion')))$$,
  'P0001', 'entrada_pt_no_permitida', 'ni una devolución sin venta'
);
select throws_ok(
  $$select public.registrar_movimientos(jsonb_build_array(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'cantidad', 10, 'motivo', 'produccion',
      'ref_tipo', 'cafe.proceso', 'ref_id', gen_random_uuid())))$$,
  'P0001', 'entrada_pt_no_permitida', 'un ref_id de empaque inventado no sirve'
);
select throws_ok(
  format($$select public.registrar_movimientos(jsonb_build_array(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 2.500 g'), 'cantidad', 10, 'motivo', 'produccion',
      'ref_tipo', 'cafe.proceso', 'ref_id', %L)))$$, (select (r ->> 'proceso_id') from res where k = 'E5')),
  'P0001', 'entrada_pt_no_permitida', 'ni el de un empaque real para un producto que ese empaque no produjo'
);
select lives_ok(
  $$select public.registrar_movimientos(jsonb_build_array(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'cantidad', 1, 'motivo', 'devolucion',
      'ref_tipo', 'cafe.venta', 'ref_id', gen_random_uuid())))$$,
  'la anulación de una venta (devolución con ref_tipo cafe.venta, CO-31) sí entra'
);
select lives_ok(
  $$select public.registrar_movimientos(jsonb_build_array(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'cantidad', -1, 'motivo', 'venta')))$$,
  'las salidas siguen siendo libres (venta)'
);
select lives_ok(
  $$select public.registrar_movimientos(jsonb_build_array(jsonb_build_object('articulo_id', pg_temp.aid('Bolsa 500 g'), 'cantidad', 5, 'motivo', 'compra')))$$,
  'los insumos siguen aceptando compras'
);
select throws_ok(
  $$insert into public.movimientos_inventario (articulo_id, cantidad, motivo) values (pg_temp.aid('Excelso 500 g'), 3, 'produccion')$$,
  'P0001', 'entrada_pt_no_permitida', 'un INSERT directo tampoco entra: lo para el trigger, no solo la RPC'
);
select is(pg_temp.dl('s7', 'Excelso 500 g'), 0.000, 'devolución de venta (+1) y venta (−1): el stock queda como estaba; ninguna entrada rechazada escribió nada');

-- 8. Salidas manuales: muestra, pérdida y ajuste ----------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('operativo-a@empaque.test');
select pg_temp.snap('s8', 'Excelso 500 g');
select lives_ok(
  $$select cafe.registrar_salida_pt(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'motivo', 'muestra', 'unidades', 5))$$,
  'el operativo registra una muestra (sin observación)'
);
select is(pg_temp.dl('s8', 'Excelso 500 g'), -5.000, 'la muestra descuenta 5 unidades');
select throws_ok(
  $$select cafe.registrar_salida_pt(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'motivo', 'perdida', 'unidades', 2))$$,
  'P0001', 'observacion_obligatoria', 'una pérdida sin observación: observacion_obligatoria'
);
select throws_ok(
  $$select cafe.registrar_salida_pt(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'motivo', 'perdida', 'unidades', 2, 'observaciones', '   '))$$,
  'P0001', 'observacion_obligatoria', 'ni con una observación en blanco'
);
select lives_ok(
  $$select cafe.registrar_salida_pt(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'motivo', 'perdida', 'unidades', 2, 'observaciones', 'Bolsas rotas'))$$,
  'la pérdida con observación se registra'
);
select is(pg_temp.dl('s8', 'Excelso 500 g'), -7.000, 'la pérdida descuenta 2 unidades más');
select throws_ok(
  $$select cafe.registrar_salida_pt(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'motivo', 'ajuste', 'unidades', -1, 'observaciones', 'Conteo físico'))$$,
  '42501', 'no_autorizado', 'un ajuste de un operativo: no_autorizado (42501)'
);
select throws_ok(
  $$select cafe.registrar_salida_pt(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'motivo', 'muestra', 'unidades', 500))$$,
  'P0001', 'stock_insuficiente', 'una muestra mayor que el stock: stock_insuficiente (a diferencia de la venta, no deja negativo)'
);
select is(pg_temp.dl('s8', 'Excelso 500 g'), -7.000, 'y no descontó nada');
select throws_ok(
  $$select cafe.registrar_salida_pt(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'motivo', 'venta', 'unidades', 1))$$,
  'P0001', 'datos_invalidos', 'la venta no se registra aquí (es de CO-31)'
);
select throws_ok(
  $$select cafe.registrar_salida_pt(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'motivo', 'muestra', 'unidades', 0))$$,
  'P0001', 'datos_invalidos', 'cero unidades: datos_invalidos'
);
select throws_ok(
  $$select cafe.registrar_salida_pt(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'motivo', 'muestra', 'unidades', -3))$$,
  'P0001', 'datos_invalidos', 'una muestra con unidades negativas: datos_invalidos'
);
select throws_ok(
  $$select cafe.registrar_salida_pt(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'motivo', 'muestra', 'unidades', 1.5))$$,
  'P0001', 'datos_invalidos', 'unidades fraccionarias: datos_invalidos'
);
select throws_ok(
  $$select cafe.registrar_salida_pt(jsonb_build_object('articulo_id', pg_temp.aid('Bolsa 500 g'), 'motivo', 'muestra', 'unidades', 1))$$,
  'P0001', 'articulo_no_encontrado', 'solo aplica a producto terminado (una bolsa: articulo_no_encontrado)'
);

reset role;
select tests.autenticar_como('admin-a@empaque.test');
select lives_ok(
  $$select cafe.registrar_salida_pt(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'motivo', 'ajuste', 'unidades', -2, 'observaciones', 'Conteo físico'))$$,
  'el admin ajusta a la baja (−2) con observación'
);
select lives_ok(
  $$select cafe.registrar_salida_pt(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'motivo', 'ajuste', 'unidades', 3, 'observaciones', 'Conteo físico'))$$,
  'el admin ajusta al alza (+3): el ajuste sí puede sumar'
);
select is(pg_temp.dl('s8', 'Excelso 500 g'), -6.000, 'tras los dos ajustes (−2 y +3) el saldo desde la muestra es −5 − 2 − 2 + 3 = −6');
select pg_temp.snap('fin', 'Excelso 500 g');
select throws_ok(
  $$select cafe.registrar_salida_pt(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'motivo', 'ajuste', 'unidades', -1))$$,
  'P0001', 'observacion_obligatoria', 'un ajuste sin observación: observacion_obligatoria'
);
select is(
  array(select t.motivo::text from (select motivo, seq from public.v_kardex where articulo_nombre = 'Excelso 500 g'
                                      order by seq desc limit 6) t order by t.seq),
  array['devolucion', 'venta', 'muestra', 'perdida', 'ajuste', 'ajuste'],
  'el kardex lista cada movimiento con su motivo tipificado'
);

reset role;
select tests.autenticar_como('viewer-a@empaque.test');
select throws_ok(
  $$select cafe.registrar_salida_pt(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'motivo', 'muestra', 'unidades', 1))$$,
  '42501', 'no_autorizado', 'Gerencia (viewer) no registra salidas'
);
select throws_ok(
  $$select cafe.registrar_empaque(pg_temp.pe('MP2', array[[500, 10]]))$$,
  '42501', 'no_autorizado', 'ni empaca'
);
select is(pg_temp.dl('fin', 'Excelso 500 g'), 0.000, 'pero sí consulta el inventario de producto terminado');
select is((select count(*)::int from cafe.empaque_lineas), 8, 'y las líneas de empaque (E1: 2, E3: 1, E4a: 1, E4b: 2, E5: 1, E6: 1)');

-- 9. Rollback: si falla un movimiento no queda nada --------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('operativo-a@empaque.test');
select pg_temp.snap('b500', 'Bolsa 500 g');
select pg_temp.snap('e500', 'Etiqueta 500 g');
select pg_temp.snap('x500', 'Excelso 500 g');
reset role;
create function public.falla_empaque_test() returns trigger language plpgsql as $$
begin
  if new.observaciones like 'Empaque %' and new.motivo = 'produccion' then
    raise exception using errcode = 'P0001', message = 'movimiento_roto', detail = 'fallo de prueba';
  end if;
  return new;
end $$;
create trigger falla_empaque_test before insert on public.movimientos_inventario
  for each row execute function public.falla_empaque_test();

reset role;
select tests.autenticar_como('operativo-a@empaque.test');
select throws_ok(
  $$select cafe.registrar_empaque(pg_temp.pe('MP2', array[[500, 100]]))$$,
  'P0001', 'movimiento_roto', 'si falla un movimiento a mitad, el empaque falla'
);
select is(
  pg_temp.n_empaques('MP2')
  + (select count(*) from cafe.empaque_lineas where proceso_id in (select id from cafe.procesos where lote_id = pg_temp.lid('MP2')))
  + (select count(*) from cafe.proceso_bultos where lote_id = pg_temp.lid('MP2') and tipo = 'empaque'),
  0::bigint, 'no queda proceso, línea ni bulto marcado como empacado'
);
select is(
  array[pg_temp.dl('b500', 'Bolsa 500 g'), pg_temp.dl('e500', 'Etiqueta 500 g'), pg_temp.dl('x500', 'Excelso 500 g')],
  array[0.000, 0.000, 0.000], 'ni se movió el inventario (los consumos de bolsa y etiqueta se revierten con el resto)'
);
select is(
  (select estado from cafe.v_lotes where id = pg_temp.lid('MP2')), 'en_proceso',
  'el lote sigue como antes del intento (tostado, sin empacar)'
);
reset role;
drop trigger falla_empaque_test on public.movimientos_inventario;
drop function public.falla_empaque_test();
reset role;
select tests.autenticar_como('operativo-a@empaque.test');

-- Tras quitar el fallo, el mismo empaque se puede registrar.
select lives_ok($$select pg_temp.emp('E2', 'MP2', array[[500, 100]])$$, 'sin el fallo, el empaque del mismo lote se registra');

-- 10. Anulación y permisos del propio proceso -----------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('admin-a@empaque.test');
select throws_ok(
  format($$select cafe.anular_proceso(%L, 'Error de digitación')$$, (select r ->> 'proceso_id' from res where k = 'E1')),
  'P0001', 'empaque_no_anulable', 'un empaque que movió inventario no se anula (hasta la reapertura de CO-33)'
);
select is(
  (select anulado_at is null from cafe.procesos where id = (select (r ->> 'proceso_id')::uuid from res where k = 'E1')),
  true, 'y el proceso sigue vigente'
);

-- 11. Módulos y lote anulado ------------------------------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('operativo-a@empaque.test');
select pg_temp.comprar('MP7', 20, 1);
reset role;
update public.tenant_modulos set activo = false
 where tenant_id = (select id from ids where clave = 'a') and modulo_id = 'cafe.inventario';
reset role;
select tests.autenticar_como('operativo-a@empaque.test');
select throws_ok(
  $$select cafe.registrar_empaque(pg_temp.pe('MP7', array[[500, 1]]))$$,
  '42501', 'no_autorizado', 'sin el módulo de inventario no se empaca'
);
select throws_ok(
  $$select cafe.registrar_salida_pt(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'motivo', 'muestra', 'unidades', 1))$$,
  '42501', 'no_autorizado', 'ni se registran salidas'
);
reset role;
update public.tenant_modulos set activo = true
 where tenant_id = (select id from ids where clave = 'a') and modulo_id = 'cafe.inventario';
reset role;
select tests.autenticar_como('admin-a@empaque.test');
select lives_ok(
  format($$update cafe.lotes set anulado_at = now(), motivo_anulacion = 'Error de compra' where id = %L$$, pg_temp.lid('MP7')),
  'el admin anula un lote sin procesos'
);
select throws_ok(
  $$select cafe.registrar_empaque(pg_temp.pe('MP7', array[[500, 1]], null, '{"peso_entrada_kg": 1}'))$$,
  'P0001', 'lote_anulado', 'un lote anulado no se empaca'
);

-- 12. Integridad de las líneas, RLS y auditoría ---------------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('operativo-a@empaque.test');
select throws_ok(
  format($$insert into cafe.empaque_lineas (proceso_id, presentacion_g, unidades, articulo_pt_id) values (%L, 500, 1, pg_temp.aid('Excelso 500 g'))$$,
         (select r ->> 'id' from res where k = 'MP1_t')),
  'P0001', 'datos_invalidos', 'una línea de empaque no cuelga de una tostión'
);
select throws_ok(
  format($$update cafe.empaque_lineas set unidades = 1 where proceso_id = %L$$, (select r ->> 'proceso_id' from res where k = 'E1')),
  '42501', null, 'las líneas no se editan'
);
select throws_ok(
  format($$delete from cafe.empaque_lineas where proceso_id = %L$$, (select r ->> 'proceso_id' from res where k = 'E1')),
  '42501', null, 'ni se borran'
);

reset role;
select ok(
  (select count(*) = 2 from audit.log l
    where l.tabla = 'cafe.empaque_lineas'
      and l.registro_id in (select id::text from cafe.empaque_lineas where proceso_id = (select (r ->> 'proceso_id')::uuid from res where k = 'E1'))
      and l.accion = 'INSERT'),
  'cada línea de empaque queda en audit.log'
);

-- Otro cliente: no ve ni empaca ni toca lo de A.
reset role;
insert into ids select 'xa500', id from public.articulos where tenant_id = (select id from ids where clave = 'a') and nombre = 'Excelso 500 g';
select tests.autenticar_como('owner-b@empaque.test');
select is((select count(*)::int from cafe.empaque_lineas), 0, 'el otro cliente no ve las líneas de empaque de A');
select is((select count(*)::int from public.v_stock where tipo = 'producto_terminado' and stock <> 0), 0, 'ni el stock de producto terminado de A');
select throws_ok(
  $$select cafe.registrar_empaque(jsonb_build_object('lote_id', pg_temp.lid('MP2'), 'fecha', pg_temp.hoy(), 'lineas', '[{"presentacion_g": 500, "unidades": 1}]'::jsonb))$$,
  'P0001', 'lote_no_encontrado', 'el otro cliente no puede empacar un lote de A'
);
select throws_ok(
  $$select cafe.registrar_salida_pt(jsonb_build_object('articulo_id', (select id from ids where clave = 'xa500'), 'motivo', 'muestra', 'unidades', 1))$$,
  'P0001', 'articulo_no_encontrado', 'ni registrar salidas de un producto de A'
);

select * from finish();
rollback;
