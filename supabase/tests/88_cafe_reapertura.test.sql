-- Reapertura de producto empacado de marca propia (FIN-114 · CO-33, HU-F1-16): cafe.reaperturas, cafe.reabrir_producto,
-- el proceso de molienda y de empaque sobre un café reabierto (registrar_proceso / registrar_empaque con reapertura_id)
-- y las vistas v_saldo_reabrible / v_reaperturas.
-- Cubre el ejemplo del ticket (lote con 120 × Excelso 500 g: reabrir 40 → stock −40, 20 kg; moler 20 → 19,8 kg;
-- empacar 7 × 2.500 g = 17,5 kg → Excelso 2.500 g +7), los errores (lote de servicio, más de lo empacado del lote, sin
-- stock global, trilla o tostión sobre una reapertura, duplicados), que la reapertura NO cuenta como avance del lote,
-- el rollback si falla, los roles, la auditoría y el aislamiento entre clientes.
-- Todo se crea AQUÍ dentro de la transacción (rollback al final): dos clientes de café (A y B), sin depender del seed.
--   p1 owner A   p2 admin A   p3 operativo A   p4 viewer A   p5 owner B
begin;

select plan(96);

-- 0. Preparación --------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000088a1', 'authenticated', 'authenticated', 'owner-a@reapertura.test'),
  ('00000000-0000-0000-0000-0000000088a2', 'authenticated', 'authenticated', 'admin-a@reapertura.test'),
  ('00000000-0000-0000-0000-0000000088a3', 'authenticated', 'authenticated', 'operativo-a@reapertura.test'),
  ('00000000-0000-0000-0000-0000000088a4', 'authenticated', 'authenticated', 'viewer-a@reapertura.test'),
  ('00000000-0000-0000-0000-0000000088a5', 'authenticated', 'authenticated', 'owner-b@reapertura.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Reapertura A', 'reapertura-a-t', 'cafe');
select platform.crear_tenant('Reapertura B', 'reapertura-b-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'reapertura-a-t'
union all select 'b', id from public.tenants where slug = 'reapertura-b-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), m.rol::public.rol_tenant
  from (values
    ('00000000-0000-0000-0000-0000000088a1', 'a', 'owner'),
    ('00000000-0000-0000-0000-0000000088a2', 'a', 'admin'),
    ('00000000-0000-0000-0000-0000000088a3', 'a', 'operativo'),
    ('00000000-0000-0000-0000-0000000088a4', 'a', 'viewer'),
    ('00000000-0000-0000-0000-0000000088a5', 'b', 'owner')) as m(user_id, t, rol);

-- Proveedor de A, cliente de servicios de A y los tipos Excelso/Consumo de A (los siembra el alta).
with t as (
  insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles)
  select i.id, x.nombre, 'Calle 1', '3000000000', x.identificacion, x.roles
    from (values ('a', 'Proveedor A', '8800001', array['proveedor']),
                 ('a', 'Cliente A',   '8800002', array['cliente_servicio'])) as x(t, nombre, identificacion, roles)
    join ids i on i.clave = x.t
  returning identificacion, id
)
insert into ids select case identificacion when '8800001' then 'pa' else 'ca' end, id from t;
insert into ids select case t.nombre when 'Excelso' then 'xa' else 'ka' end, t.id
  from cafe.tipos_cafe t join ids i on i.id = t.tenant_id and i.clave = 'a';

create temp table res (k text primary key, r jsonb);
grant select, insert on res to authenticated;

create or replace function pg_temp.hoy() returns text language sql as $$ select to_char(current_date, 'YYYY-MM-DD') $$;
grant execute on function pg_temp.hoy() to authenticated;

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

create or replace function pg_temp.barr(p_k text) returns uuid[] language sql as $$
  select array_agg(b.id order by b.numero) from cafe.lote_bultos b where b.lote_id = pg_temp.lid(p_k)
$$;
grant execute on function pg_temp.barr(text) to authenticated;

-- Tostión de TODOS los bultos del lote `p_k` (100 kg → 81 kg, nivel medio), guardada bajo `p_res`.
create or replace function pg_temp.tostar(p_res text, p_k text) returns void language plpgsql as $$
begin
  insert into res select p_res, cafe.registrar_proceso(jsonb_build_object(
    'lote_id', pg_temp.lid(p_k), 'tipo', 'tostion', 'fecha', pg_temp.hoy(), 'bultos', to_jsonb(pg_temp.barr(p_k)),
    'nivel_tueste', 'medio',
    'baches', (select jsonb_agg(jsonb_build_object('peso_entrada_kg', e.v::numeric, 'peso_salida_kg', round(e.v::numeric * 0.81, 3)) order by e.n)
                 from jsonb_array_elements_text(cafe.sugerir_baches(100) -> 'baches') with ordinality as e(v, n))));
end $$;
grant execute on function pg_temp.tostar(text, text) to authenticated;

-- Empaque de TODOS los bultos del lote `p_k` con las líneas `[[500, 120]]`.
create or replace function pg_temp.empacar(p_res text, p_k text, p_lineas integer[][]) returns void language plpgsql as $$
begin
  insert into res select p_res, cafe.registrar_empaque(jsonb_build_object(
    'lote_id', pg_temp.lid(p_k), 'fecha', pg_temp.hoy(), 'bultos', to_jsonb(pg_temp.barr(p_k)),
    'lineas', (select jsonb_agg(jsonb_build_object('presentacion_g', p_lineas[i][1], 'unidades', p_lineas[i][2]) order by i)
                 from generate_subscripts(p_lineas, 1) i)));
end $$;
grant execute on function pg_temp.empacar(text, text, integer[][]) to authenticated;

-- Reabrir producto del lote `p_k`: presentación y unidades.
create or replace function pg_temp.rp(p_k text, p_g integer, p_u integer, p_extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('lote_id', pg_temp.lid(p_k), 'presentacion_g', p_g, 'unidades', p_u, 'fecha', pg_temp.hoy()) || p_extra
$$;
grant execute on function pg_temp.rp(text, integer, integer, jsonb) to authenticated;

create or replace function pg_temp.reabrir(p_res text, p_k text, p_g integer, p_u integer, p_extra jsonb default '{}')
returns void language plpgsql as $$
begin
  insert into res select p_res, cafe.reabrir_producto(pg_temp.rp(p_k, p_g, p_u, p_extra));
end $$;
grant execute on function pg_temp.reabrir(text, text, integer, integer, jsonb) to authenticated;

create or replace function pg_temp.rid(p_res text) returns uuid language sql as $$ select (r ->> 'id')::uuid from res where k = p_res $$;
grant execute on function pg_temp.rid(text) to authenticated;

-- Proceso sobre una reapertura (molienda por `registrar_proceso`).
create or replace function pg_temp.pr(p_k text, p_reap text, p_tipo text, p_extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('lote_id', pg_temp.lid(p_k), 'tipo', p_tipo, 'fecha', pg_temp.hoy(), 'reapertura_id', pg_temp.rid(p_reap)) || p_extra
$$;
grant execute on function pg_temp.pr(text, text, text, jsonb) to authenticated;

-- Empaque sobre una reapertura: `[[2500, 7]]`.
create or replace function pg_temp.pe(p_k text, p_reap text, p_lineas integer[][], p_extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('lote_id', pg_temp.lid(p_k), 'fecha', pg_temp.hoy(), 'reapertura_id', pg_temp.rid(p_reap),
         'lineas', (select jsonb_agg(jsonb_build_object('presentacion_g', p_lineas[i][1], 'unidades', p_lineas[i][2]) order by i)
                      from generate_subscripts(p_lineas, 1) i)) || p_extra
$$;
grant execute on function pg_temp.pe(text, text, integer[][], jsonb) to authenticated;

create or replace function pg_temp.stock(p_nombre text) returns numeric language sql as $$
  select stock from public.v_stock where nombre = p_nombre
$$;
grant execute on function pg_temp.stock(text) to authenticated;
create or replace function pg_temp.aid(p_nombre text) returns uuid language sql as $$
  select articulo_id from public.v_stock where nombre = p_nombre
$$;
grant execute on function pg_temp.aid(text) to authenticated;

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

-- 1. Estructura y privilegios -------------------------------------------------------------------------------
select has_table('cafe', 'reaperturas', 'existe cafe.reaperturas');
select ok((select relrowsecurity from pg_class where oid = 'cafe.reaperturas'::regclass), 'reaperturas tiene RLS activada');
select ok(
  not has_table_privilege('authenticated', 'cafe.reaperturas', 'delete')
  and not has_table_privilege('service_role', 'cafe.reaperturas', 'delete')
  and not has_table_privilege('anon', 'cafe.reaperturas', 'select')
  and not has_column_privilege('authenticated', 'cafe.reaperturas', 'unidades', 'update')
  and has_column_privilege('authenticated', 'cafe.reaperturas', 'motivo', 'update'),
  'nadie borra una reapertura, anon no la lee y de ella solo se corrige el motivo'
);
select is(
  (select array_agg(p.prosecdef order by p.proname)
     from pg_proc p
    where p.oid in ('cafe.reabrir_producto(jsonb)'::regprocedure,
                    'cafe._insertar_proceso_reapertura(uuid,cafe.tipo_proceso,date,numeric,numeric,text)'::regprocedure)),
  array[false, false], 'reabrir_producto y el proceso de reapertura son SECURITY INVOKER'
);
select ok(
  not has_function_privilege('anon', 'cafe.reabrir_producto(jsonb)', 'execute')
  and has_function_privilege('authenticated', 'cafe.reabrir_producto(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'cafe.reaperturas_verificar()', 'execute'),
  'anon no ejecuta reabrir_producto y la función del trigger no se llama a mano'
);
select ok(
  exists (select 1 from pg_constraint where conname = 'procesos_reapertura_fk' and conrelid = 'cafe.procesos'::regclass and contype = 'f'),
  'procesos.reapertura_id tiene su FK a reaperturas'
);

-- 2. Lotes: MP1 (120 × Excelso 500 g empacadas), MP2 (otro lote, 30), servicio S1 y MP3 (Consumo) ------------------------
reset role;
select tests.autenticar_como('operativo-a@reapertura.test');

select lives_ok(
  $$ select public.registrar_movimientos(jsonb_build_array(
       jsonb_build_object('articulo_id', pg_temp.aid('Bolsa 500 g'), 'cantidad', 400, 'motivo', 'compra'),
       jsonb_build_object('articulo_id', pg_temp.aid('Etiqueta 500 g'), 'cantidad', 400, 'motivo', 'compra'),
       jsonb_build_object('articulo_id', pg_temp.aid('Bolsa 2.500 g'), 'cantidad', 20, 'motivo', 'compra'),
       jsonb_build_object('articulo_id', pg_temp.aid('Etiqueta 2.500 g'), 'cantidad', 20, 'motivo', 'compra'))) $$,
  'el operativo compra bolsas y etiquetas'
);

select pg_temp.comprar('MP1', 100, 4);
select pg_temp.tostar('MP1_t', 'MP1');
select pg_temp.empacar('MP1_e', 'MP1', array[[500, 120]]);
select pg_temp.comprar('MP2', 100, 4);
select pg_temp.tostar('MP2_t', 'MP2');
select pg_temp.empacar('MP2_e', 'MP2', array[[500, 30]]);
select pg_temp.comprar('MP3', 100, 4, 'ka');
select pg_temp.tostar('MP3_t', 'MP3');
select pg_temp.empacar('MP3_e', 'MP3', array[[500, 20]]);
insert into res select 'S1', cafe.registrar_recepcion(jsonb_build_object(
  'tercero_id', (select id from ids where clave = 'ca'), 'fecha', pg_temp.hoy(), 'peso_kg', 100, 'num_bultos', 2,
  'servicios', '["tostion"]'::jsonb, 'nivel_tueste', 'medio'));

select is(pg_temp.stock('Excelso 500 g'), 150.000, 'hay 150 × Excelso 500 g en el inventario (120 de MP1 y 30 de MP2)');
select is(
  (select array_agg(row(s.presentacion_g, s.unidades_empacadas, s.unidades_reabiertas, s.saldo)::text)
     from cafe.v_saldo_reabrible s where s.lote_id = pg_temp.lid('MP1')),
  array[row(500, 120, 0, 120)::text], 'saldo reabrible de MP1: 120 empacadas, 0 reabiertas'
);
select is(cafe.saldo_reabrible(pg_temp.lid('MP1'), 500), 120, 'saldo_reabrible(MP1, 500 g) = 120');
select is(cafe.saldo_reabrible(pg_temp.lid('MP1'), 2500), 0, 'saldo_reabrible de una presentación sin empacar = 0');
select is((select estado from cafe.v_lotes where id = pg_temp.lid('MP1')), 'listo', 'MP1 está listo (2 de 2) antes de reabrir');

-- 3. Errores de validación, ANTES de reabrir -------------------------------------------------------------------------------
select throws_ok(
  $$select cafe.reabrir_producto(pg_temp.rp('MP1', 500, 10) || jsonb_build_object('lote_id', (select r ->> 'id' from res where k = 'S1')))$$,
  'P0001', 'reapertura_solo_marca_propia', 'un lote de servicio no se reabre: reapertura_solo_marca_propia'
);
select throws_ok(
  $$select cafe.reabrir_producto(pg_temp.rp('MP1', 500, 121))$$,
  'P0001', 'reapertura_supera_saldo_lote', 'más de lo empacado del lote (121 de 120): reapertura_supera_saldo_lote'
);
select is(
  pg_temp.detalle($$select cafe.reabrir_producto(pg_temp.rp('MP1', 500, 121))$$),
  format('Del lote %s solo quedan 120 de 500 g por reabrir (empacadas 120, ya reabiertas 0).', (select codigo from cafe.lotes where id = pg_temp.lid('MP1'))),
  'el mensaje dice cuánto queda por reabrir del lote'
);
select throws_ok(
  $$select cafe.reabrir_producto(pg_temp.rp('MP1', 2500, 1))$$,
  'P0001', 'reapertura_supera_saldo_lote', 'una presentación que el lote no empacó: reapertura_supera_saldo_lote'
);
select throws_ok($$select cafe.reabrir_producto(pg_temp.rp('MP1', 500, 0))$$, 'P0001', 'datos_invalidos', 'cero unidades: datos_invalidos');
select throws_ok($$select cafe.reabrir_producto(pg_temp.rp('MP1', 500, 1, '{"unidades": 1.5}'))$$, 'P0001', 'datos_invalidos', 'unidades con decimales: datos_invalidos');
select throws_ok($$select cafe.reabrir_producto('{"lote_id": "no-es-uuid"}')$$, 'P0001', 'datos_invalidos', 'un uuid inválido no acaba en error inesperado');
select throws_ok(
  $$select cafe.reabrir_producto(pg_temp.rp('MP1', 500, 1, '{"lote_id": "00000000-0000-0000-0000-000000000000"}'))$$,
  'P0001', 'lote_no_encontrado', 'un lote que no existe: lote_no_encontrado'
);
select is(
  (select count(*)::int from cafe.reaperturas) + (select count(*)::int from public.movimientos_inventario where motivo = 'reapertura'),
  0, 'ninguna reapertura rechazada dejó filas ni movimientos'
);

-- Sin stock global (ya salió): MP3 empacó 20 × Consumo 500 g; se pierden 15 → quedan 5 y no se reabren 6.
select lives_ok(
  $$select cafe.registrar_salida_pt(jsonb_build_object('articulo_id', pg_temp.aid('Consumo 500 g'), 'motivo', 'perdida', 'unidades', 15, 'observaciones', 'Bolsas dañadas'))$$,
  '15 bolsas de Consumo 500 g se pierden (salida manual)'
);
select throws_ok(
  $$select cafe.reabrir_producto(pg_temp.rp('MP3', 500, 6))$$,
  'P0001', 'reapertura_sin_stock', 'el lote empacó 20 pero solo quedan 5 en el inventario: reapertura_sin_stock'
);
select is(
  pg_temp.detalle($$select cafe.reabrir_producto(pg_temp.rp('MP3', 500, 6))$$),
  'Solo hay 5 de Consumo 500 g en el inventario: lo demás ya salió (venta, cortesía, muestra…) y no se puede reabrir.',
  'el mensaje explica que lo vendido no se reabre'
);
select is(pg_temp.stock('Consumo 500 g'), 5.000, 'el intento rechazado no tocó el stock');

-- 4. El ejemplo del ticket: reabrir 40 × Excelso 500 g de MP1 ------------------------------------------------------------------
select pg_temp.reabrir('R1', 'MP1', 500, 40, '{"motivo": "Pedido de 2.500 g molido"}');
select is(
  (select row(r ->> 'peso_kg', r ->> 'unidades', r ->> 'producto', r ->> 'stock')::text from res where k = 'R1'),
  row('20.000', '40', 'Excelso 500 g', '110.000')::text, 'reabrir 40 × 500 g: equivale a 20 kg y el stock queda en 110'
);
select is(pg_temp.stock('Excelso 500 g'), 110.000, 'stock Excelso 500 g: 150 − 40 = 110');
select is(
  (select row(m.cantidad, m.motivo, m.ref_tipo, m.ref_id = pg_temp.lid('MP1'))::text
     from public.movimientos_inventario m where m.motivo = 'reapertura'),
  row(-40.000::numeric, 'reapertura'::public.motivo_movimiento, 'cafe.lote', true)::text,
  'un movimiento de reapertura −40 con ref_tipo cafe.lote y ref_id = el lote'
);
select is(
  (select m.observaciones from public.movimientos_inventario m where m.motivo = 'reapertura'),
  'Reapertura ' || (select codigo from cafe.lotes where id = pg_temp.lid('MP1')) || ' · Pedido de 2.500 g molido',
  'la observación del movimiento nombra el lote y el motivo'
);
select is(
  (select row(r.peso_kg, r.fecha = current_date, r.motivo, r.created_by = '00000000-0000-0000-0000-0000000088a3')::text
     from cafe.reaperturas r where r.id = pg_temp.rid('R1')),
  row(20.000::numeric, true, 'Pedido de 2.500 g molido', true)::text, 'la reapertura guarda el peso generado, la fecha, el motivo y quién la hizo'
);
select is(
  (select row(s.unidades_empacadas, s.unidades_reabiertas, s.saldo)::text from cafe.v_saldo_reabrible s
    where s.lote_id = pg_temp.lid('MP1') and s.presentacion_g = 500),
  row(120, 40, 80)::text, 'saldo reabrible de MP1: 120 − 40 = 80'
);
select is(
  (select row(estado, peso_disponible_kg, lote_codigo, producto)::text from cafe.v_reaperturas where id = pg_temp.rid('R1')),
  row('pendiente', 20.000::numeric, (select codigo from cafe.lotes where id = pg_temp.lid('MP1')), 'Excelso 500 g')::text,
  'la reapertura queda pendiente con 20 kg por trabajar'
);
select throws_ok(
  $$select cafe.reabrir_producto(pg_temp.rp('MP1', 500, 81))$$,
  'P0001', 'reapertura_supera_saldo_lote', 'ya no se pueden reabrir más de las 80 que quedan del lote'
);
-- Otro lote del mismo producto: MP2 tiene su propio saldo (30), aunque el stock global sea compartido.
select throws_ok(
  $$select cafe.reabrir_producto(pg_temp.rp('MP2', 500, 31))$$,
  'P0001', 'reapertura_supera_saldo_lote', 'MP2 solo empacó 30: el saldo es por lote aunque haya stock de sobra'
);

-- 5. La reapertura no cuenta como avance del lote ---------------------------------------------------------------------------
select is((select estado from cafe.v_lotes where id = pg_temp.lid('MP1')), 'listo', 'MP1 sigue listo tras reabrir');

-- 6. Molienda sobre la reapertura: 20 kg → 19,8 kg -----------------------------------------------------------------------------
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.pr('MP1', 'R1', 'tostion', '{"peso_salida_kg": 19, "nivel_tueste": "medio"}'))$$,
  'P0001', 'reapertura_solo_molienda_empaque', 'tostión sobre una reapertura: reapertura_solo_molienda_empaque'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.pr('MP1', 'R1', 'trilla', '{"peso_salida_kg": 19}'))$$,
  'P0001', 'reapertura_solo_molienda_empaque', 'trilla sobre una reapertura: reapertura_solo_molienda_empaque'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.pr('MP1', 'R1', 'molienda', jsonb_build_object('peso_salida_kg', 19.8, 'bultos', to_jsonb(pg_temp.barr('MP1')))))$$,
  'P0001', 'datos_invalidos', 'una reapertura no lleva bultos'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.pr('MP1', 'R1', 'molienda', '{"peso_salida_kg": 19.8, "peso_entrada_kg": 25}'))$$,
  'P0001', 'peso_supera_disponible', 'moler 25 kg de 20 reabiertos: peso_supera_disponible'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.pr('MP1', 'R1', 'molienda', '{"peso_salida_kg": 9, "peso_entrada_kg": 10}'))$$,
  'P0001', 'datos_invalidos', 'moler solo 10 de 20 kg perdería 10 kg de la trazabilidad: datos_invalidos'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.pr('MP1', 'R1', 'molienda', '{"peso_salida_kg": 21}'))$$,
  'P0001', 'salida_supera_entrada', 'la salida no supera la entrada'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.pr('MP1', 'R1', 'molienda'))$$,
  'P0001', 'datos_invalidos', 'la molienda exige el peso de salida'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.pr('MP1', 'R1', 'empaque', '{"peso_salida_kg": 19}'))$$,
  'P0001', 'usar_registrar_empaque', 'el empaque de una reapertura va por registrar_empaque'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.pr('MP2', 'R1', 'molienda', '{"peso_salida_kg": 19}'))$$,
  'P0001', 'datos_invalidos', 'una reapertura no se trabaja desde el lote equivocado'
);
select throws_ok(
  $$select cafe.registrar_proceso(jsonb_build_object('lote_id', pg_temp.lid('MP1'), 'tipo', 'molienda', 'fecha', pg_temp.hoy(),
       'reapertura_id', '00000000-0000-0000-0000-000000000000', 'peso_salida_kg', 19))$$,
  'P0001', 'reapertura_no_encontrada', 'una reapertura que no existe: reapertura_no_encontrada'
);

insert into res select 'M1', cafe.registrar_proceso(pg_temp.pr('MP1', 'R1', 'molienda', '{"peso_salida_kg": 19.8}'));
select is(
  (select row(r ->> 'peso_entrada_kg', r ->> 'peso_salida_kg', r ->> 'merma_kg', r ->> 'tarifa_kg', r ->> 'desvio', r ->> 'lote_estado')::text from res where k = 'M1'),
  row('20.000', '19.800', '0.200', '0.00', 'false', 'listo')::text,
  'moler 20 kg → 19,8 kg: merma 0,2 kg, sin tarifa ni desvío, y el lote sigue listo'
);
select is(
  (select row(p.reapertura_id = pg_temp.rid('R1'), p.tipo, p.merma_referencia_pct, p.valor,
              (select count(*) from cafe.proceso_bultos pb where pb.proceso_id = p.id))::text
     from cafe.procesos p where p.id = (select (r ->> 'id')::uuid from res where k = 'M1')),
  row(true, 'molienda'::cafe.tipo_proceso, null::numeric, 0.00::numeric, 0::bigint)::text,
  'el proceso cuelga de la reapertura, sin merma de referencia, valor ni bultos'
);
select is(
  (select row(estado, molienda_salida_kg, peso_disponible_kg)::text from cafe.v_reaperturas where id = pg_temp.rid('R1')),
  row('en_proceso', 19.800::numeric, 19.800::numeric)::text, 'la reapertura pasa a en_proceso con 19,8 kg disponibles'
);
select is(
  (select count(*)::int from cafe.v_lote_etapas where lote_id = pg_temp.lid('MP1') and tipo = 'molienda'), 0,
  'la molienda de la reapertura NO aparece como etapa del lote'
);
select is(
  (select row(estado, servicios_requeridos::text, avance_texto)::text from cafe.v_lotes where id = pg_temp.lid('MP1')),
  row('listo', '{tostion,empaque}', '2 de 2')::text, 'el lote sigue "listo, 2 de 2": la molienda de la reapertura no cambia sus pasos'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.pr('MP1', 'R1', 'molienda', '{"peso_salida_kg": 19}'))$$,
  'P0001', 'reapertura_proceso_duplicado', 'una reapertura admite una sola molienda'
);

-- 7. Empaque de la reapertura: 7 × 2.500 g = 17,5 kg ------------------------------------------------------------------------
select throws_ok(
  $$select cafe.registrar_empaque(pg_temp.pe('MP1', 'R1', array[[2500, 8]]))$$,
  'P0001', 'empaque_supera_peso', '8 × 2.500 g = 20 kg con 19,8 kg molidos: empaque_supera_peso'
);
select is(
  pg_temp.detalle($$select cafe.registrar_empaque(pg_temp.pe('MP1', 'R1', array[[2500, 8]]))$$),
  'Empacarías 20 kg y solo hay 19.8 kg disponibles en el café reabierto. Empaca solo lo que hay.',
  'el mensaje habla del café reabierto, no de bultos'
);
select throws_ok(
  $$select cafe.registrar_empaque(pg_temp.pe('MP1', 'R1', array[[2500, 7]], jsonb_build_object('bultos', to_jsonb(pg_temp.barr('MP1')))))$$,
  'P0001', 'datos_invalidos', 'el empaque de una reapertura no lleva bultos'
);
select throws_ok(
  $$select cafe.registrar_empaque(pg_temp.pe('MP2', 'R1', array[[2500, 7]]))$$,
  'P0001', 'datos_invalidos', 'ni se empaca la reapertura de otro lote'
);
select is(pg_temp.stock('Excelso 2.500 g'), 0.000, 'antes de empacar no hay Excelso 2.500 g');

insert into res select 'E1', cafe.registrar_empaque(pg_temp.pe('MP1', 'R1', array[[2500, 7]]));
select is(
  (select row(r ->> 'peso_entrada_kg', r ->> 'peso_salida_kg', r ->> 'merma_kg', r ->> 'lote_estado', r ->> 'avance_texto')::text from res where k = 'E1'),
  row('19.800', '17.500', '2.300', 'listo', '2 de 2')::text,
  'empacar 7 × 2.500 g = 17,5 kg de 19,8 kg molidos: merma de empaque 2,3 kg y el lote sigue listo'
);
select is(pg_temp.stock('Excelso 2.500 g'), 7.000, 'Excelso 2.500 g +7 (el producto del mismo tipo de café, nueva presentación)');
select is(
  array[pg_temp.stock('Bolsa 2.500 g'), pg_temp.stock('Etiqueta 2.500 g'), pg_temp.stock('Excelso 500 g')],
  array[13.000, 13.000, 110.000], 'se gastaron 7 bolsas y 7 etiquetas de 2.500 g; Excelso 500 g no se vuelve a tocar'
);
select is(
  (select row(count(*), count(*) filter (where m.motivo = 'produccion'), min(m.ref_tipo))::text
     from public.movimientos_inventario m where m.ref_id = (select (r ->> 'proceso_id')::uuid from res where k = 'E1')),
  row(3::bigint, 1::bigint, 'cafe.proceso')::text, 'tres movimientos del empaque con ref_tipo cafe.proceso (bolsa, etiqueta y producción)'
);
select is(
  (select row(p.reapertura_id = pg_temp.rid('R1'), p.tipo, p.tarifa_kg, p.lote_id = pg_temp.lid('MP1'))::text
     from cafe.procesos p where p.id = (select (r ->> 'proceso_id')::uuid from res where k = 'E1')),
  row(true, 'empaque'::cafe.tipo_proceso, 0.00::numeric, true)::text, 'el empaque cuelga de la reapertura y del lote original'
);
select is(
  (select estado from cafe.v_reaperturas where id = pg_temp.rid('R1')), 'completada', 'la reapertura queda completada'
);
select is(
  (select array_agg(row(s.presentacion_g, s.unidades_empacadas, s.unidades_reabiertas, s.saldo)::text order by s.presentacion_g)
     from cafe.v_saldo_reabrible s where s.lote_id = pg_temp.lid('MP1')),
  array[row(500, 120, 40, 80)::text, row(2500, 7, 0, 7)::text],
  'el origen no se pierde: MP1 figura con 120 × 500 g (40 reabiertas) y 7 × 2.500 g salidas de la reapertura'
);
select throws_ok(
  $$select cafe.registrar_empaque(pg_temp.pe('MP1', 'R1', array[[500, 1]]))$$,
  'P0001', 'reapertura_proceso_duplicado', 'una reapertura admite un solo empaque'
);
select is(
  (select count(*)::int from cafe.v_lote_etapas where lote_id = pg_temp.lid('MP1')), 2,
  'el lote sigue con sus dos etapas (tostión y empaque): la reapertura no suma etapas'
);
select is(
  (select e.num_procesos from cafe.v_lote_etapas e where e.lote_id = pg_temp.lid('MP1') and e.tipo = 'empaque'), 1,
  'el empaque de la reapertura no cuenta en las etapas del lote'
);

-- 8. Anulaciones --------------------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('admin-a@reapertura.test');
select throws_ok(
  format($$select cafe.anular_proceso(%L, 'Error')$$, (select r ->> 'id' from res where k = 'M1')),
  'P0001', 'proceso_con_dependientes', 'no se anula la molienda si ya hay un empaque hecho con ella'
);
select throws_ok(
  format($$select cafe.anular_proceso(%L, 'Error')$$, (select r ->> 'proceso_id' from res where k = 'E1')),
  'P0001', 'empaque_no_anulable', 'el empaque de la reapertura movió inventario y no se anula'
);

-- Segunda reapertura sin molienda: se empaca directo (el empaque admite reabrir y reempacar sin moler).
select pg_temp.reabrir('R2', 'MP1', 500, 10);
select throws_ok(
  $$select cafe.registrar_empaque(pg_temp.pe('MP1', 'R2', array[[2500, 3]]))$$,
  'P0001', 'empaque_supera_peso', 'R2 (10 × 500 g = 5 kg) no admite 3 × 2.500 g = 7,5 kg'
);
select lives_ok(
  $$select cafe.registrar_empaque(pg_temp.pe('MP1', 'R2', array[[2500, 1]]))$$,
  'R2 se empaca directamente (1 × 2.500 g de sus 5 kg), sin moler'
);
select is((select estado from cafe.v_reaperturas where id = pg_temp.rid('R2')), 'completada', 'R2 completada sin molienda');

-- Una molienda de reapertura SIN empaque sí se anula y la reapertura vuelve a pendiente.
select pg_temp.reabrir('R3', 'MP1', 500, 4);
insert into res select 'M3', cafe.registrar_proceso(pg_temp.pr('MP1', 'R3', 'molienda', '{"peso_salida_kg": 1.9}'));
select is((select estado from cafe.v_reaperturas where id = pg_temp.rid('R3')), 'en_proceso', 'R3 está molida');
select lives_ok(
  format($$select cafe.anular_proceso(%L, 'Error de pesaje')$$, (select r ->> 'id' from res where k = 'M3')),
  'el admin anula la molienda de R3 (aún sin empaque)'
);
select is((select estado from cafe.v_reaperturas where id = pg_temp.rid('R3')), 'pendiente', 'R3 vuelve a pendiente');
select lives_ok(
  $$select cafe.registrar_proceso(pg_temp.pr('MP1', 'R3', 'molienda', '{"peso_salida_kg": 1.95}'))$$,
  'y se puede moler de nuevo'
);

-- 9. Roles y módulo --------------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('viewer-a@reapertura.test');
select throws_ok($$select cafe.reabrir_producto(pg_temp.rp('MP1', 500, 1))$$, '42501', 'no_autorizado', 'el viewer no reabre');
select throws_ok($$select cafe.registrar_proceso(pg_temp.pr('MP1', 'R3', 'molienda', '{"peso_salida_kg": 1.9}'))$$, '42501', 'no_autorizado', 'ni muele una reapertura');
select is((select count(*)::int from cafe.v_reaperturas), 3, 'pero ve las reaperturas (Gerencia consulta)');
select is((select count(*)::int from cafe.reaperturas), 3, 'y la tabla');
select throws_ok(
  format($$insert into cafe.reaperturas (lote_id, articulo_pt_id, presentacion_g, unidades, fecha) values (%L, %L, 500, 1, current_date)$$,
         pg_temp.lid('MP1'), pg_temp.aid('Excelso 500 g')),
  '42501', null, 'el viewer tampoco inserta directo'
);

reset role;
update public.tenant_modulos set activo = false
 where tenant_id = (select id from ids where clave = 'a') and modulo_id = 'cafe.procesos';
select tests.autenticar_como('operativo-a@reapertura.test');
select throws_ok($$select cafe.reabrir_producto(pg_temp.rp('MP1', 500, 1))$$, '42501', 'no_autorizado', 'sin el módulo cafe.procesos no se reabre');
select is((select count(*)::int from cafe.reaperturas), 0, 'ni se leen las reaperturas');
reset role;
update public.tenant_modulos set activo = true
 where tenant_id = (select id from ids where clave = 'a') and modulo_id = 'cafe.procesos';

-- 10. Integridad: el trigger, el rollback y las restricciones ---------------------------------------------------------------------
select tests.autenticar_como('operativo-a@reapertura.test');
select throws_ok(
  format($$insert into cafe.reaperturas (lote_id, articulo_pt_id, presentacion_g, unidades, fecha) values (%L, %L, 500, 1, current_date)$$,
         (select r ->> 'id' from res where k = 'S1'), pg_temp.aid('Excelso 500 g')),
  'P0001', 'reapertura_solo_marca_propia', 'ni insertando directo se reabre un lote de servicio (trigger)'
);
select throws_ok(
  format($$update cafe.reaperturas set unidades = 1 where id = %L$$, pg_temp.rid('R1')),
  '42501', null, 'las unidades de una reapertura no se editan'
);
select throws_ok(format($$delete from cafe.reaperturas where id = %L$$, pg_temp.rid('R1')), '42501', null, 'ni se borra una reapertura');
select throws_ok(
  format($$insert into cafe.procesos (lote_id, tipo, fecha, peso_entrada_kg, peso_salida_kg, nivel_tueste, reapertura_id)
           values (%L, 'tostion', current_date, 10, 9, 'medio', %L)$$, pg_temp.lid('MP1'), pg_temp.rid('R1')),
  '23514', null, 'la base rechaza una tostión colgada de una reapertura (CHECK)'
);
select throws_ok(
  format($$insert into cafe.proceso_bultos (proceso_id, bulto_id, tipo, lote_id)
           select %L, b.id, 'molienda', b.lote_id from cafe.lote_bultos b where b.lote_id = %L limit 1$$,
         (select r ->> 'id' from res where k = 'M1'), pg_temp.lid('MP1')),
  'P0001', 'datos_invalidos', 'un proceso de reapertura no admite bultos (trigger)'
);

-- Atomicidad: si el movimiento falla (artículo inactivo), no queda reapertura.
reset role;
update public.articulos set activo = false where tenant_id = (select id from ids where clave = 'a') and nombre = 'Excelso 500 g';
select tests.autenticar_como('operativo-a@reapertura.test');
select throws_ok($$select cafe.reabrir_producto(pg_temp.rp('MP1', 500, 1))$$, 'P0001', 'articulo_inactivo',
  'si el producto está desactivado el movimiento falla');
reset role;
update public.articulos set activo = true where tenant_id = (select id from ids where clave = 'a') and nombre = 'Excelso 500 g';
select tests.autenticar_como('operativo-a@reapertura.test');
select is((select count(*)::int from cafe.reaperturas), 3, 'y no quedó ninguna reapertura de más (todo o nada)');

-- 11. Línea de tiempo: «quién lo registró» --------------------------------------------------------------------------------------------
select ok(
  exists (select 1 from cafe.responsables_lote(pg_temp.lid('MP1')) r where r.email = 'operativo-a@reapertura.test'),
  'responsables_lote incluye a quien reabrió producto del lote'
);

-- 12. Auditoría -------------------------------------------------------------------------------------------------------------------------
reset role;
select ok(
  (select count(*) = 3 from audit.log l
    where l.tabla = 'cafe.reaperturas' and l.accion = 'INSERT'
      and l.registro_id in (select id::text from cafe.reaperturas)),
  'cada reapertura queda en audit.log'
);

-- 13. Aislamiento entre clientes ----------------------------------------------------------------------------------------------------------
select tests.autenticar_como('owner-b@reapertura.test');
select is((select count(*)::int from cafe.reaperturas), 0, 'el otro cliente no ve las reaperturas de A');
select is((select count(*)::int from cafe.v_reaperturas) + (select count(*)::int from cafe.v_saldo_reabrible), 0, 'ni sus vistas');
select throws_ok(
  $$select cafe.reabrir_producto(pg_temp.rp('MP1', 500, 1))$$,
  'P0001', 'lote_no_encontrado', 'el otro cliente no puede reabrir un lote de A'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.pr('MP1', 'R3', 'molienda', '{"peso_salida_kg": 1.9}'))$$,
  'P0001', 'reapertura_no_encontrada', 'ni trabajar una reapertura de A'
);
select throws_ok(
  format($$insert into cafe.reaperturas (lote_id, articulo_pt_id, presentacion_g, unidades, fecha) values (%L, %L, 500, 1, current_date)$$,
         pg_temp.lid('MP1'), (select articulo_id from (select a.id as articulo_id from public.articulos a limit 1) x)),
  'P0001', 'reapertura_solo_marca_propia', 'ni colgar una reapertura de un lote de A (el trigger no lo ve: no es suyo)'
);

select * from finish();
rollback;
