-- Ventas de marca propia y cortesías (FIN-112 · CO-31): cafe.ventas, cafe.venta_lineas, cafe.registrar_venta,
-- cafe.anular_venta, cafe.resumen_ventas, la lista de precios (public.tarifas) y la serie VT.
-- Cubre el ejemplo de la tarea (3 × Consumo 500 g + 1 × Excelso 500 g a Consumidor final = $98.000), vender sin stock
-- (avisa y no bloquea), la cortesía (total 0, motivo `cortesia`), el nº de factura de Aliados pendiente que se completa
-- después, el snapshot del precio, la anulación que repone el stock, los roles y el aislamiento entre clientes.
-- Todo se crea AQUÍ dentro de la transacción (rollback al final): dos clientes de café con el módulo (A y B) y uno sin
-- él (C), sin depender del seed.
--   a1 owner A   a2 admin A   a3 operativo A   a4 viewer A   a5 owner B   a6 owner C (sin cafe.ventas)
begin;

select plan(114);

-- 0. Preparación --------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000089a1', 'authenticated', 'authenticated', 'owner-a@ventas.test'),
  ('00000000-0000-0000-0000-0000000089a2', 'authenticated', 'authenticated', 'admin-a@ventas.test'),
  ('00000000-0000-0000-0000-0000000089a3', 'authenticated', 'authenticated', 'operativo-a@ventas.test'),
  ('00000000-0000-0000-0000-0000000089a4', 'authenticated', 'authenticated', 'viewer-a@ventas.test'),
  ('00000000-0000-0000-0000-0000000089a5', 'authenticated', 'authenticated', 'owner-b@ventas.test'),
  ('00000000-0000-0000-0000-0000000089a6', 'authenticated', 'authenticated', 'owner-c@ventas.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Ventas A', 'ventas-a-t', 'cafe', null, null, array['cafe.ventas']);
select platform.crear_tenant('Ventas B', 'ventas-b-t', 'cafe', null, null, array['cafe.ventas']);
select platform.crear_tenant('Ventas C', 'ventas-c-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'ventas-a-t'
union all select 'b', id from public.tenants where slug = 'ventas-b-t'
union all select 'c', id from public.tenants where slug = 'ventas-c-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), m.rol::public.rol_tenant
  from (values
    ('00000000-0000-0000-0000-0000000089a1', 'a', 'owner'),
    ('00000000-0000-0000-0000-0000000089a2', 'a', 'admin'),
    ('00000000-0000-0000-0000-0000000089a3', 'a', 'operativo'),
    ('00000000-0000-0000-0000-0000000089a4', 'a', 'viewer'),
    ('00000000-0000-0000-0000-0000000089a5', 'b', 'owner'),
    ('00000000-0000-0000-0000-0000000089a6', 'c', 'owner')) as m(user_id, t, rol);

-- Clientes: Cliente A (rol cliente), uno inactivo, un proveedor (sin rol cliente) y Cliente B. El Consumidor final lo
-- siembra el alta.
with t as (
  insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles, activo)
  select i.id, x.nombre, 'Calle 1', '3000000000', x.identificacion, x.roles, x.activo
    from (values ('a', 'Cliente A',     '8900001', array['cliente'],   true),
                 ('a', 'Cliente Viejo', '8900002', array['cliente'],   false),
                 ('a', 'Proveedor A',   '8900003', array['proveedor'], true),
                 ('b', 'Cliente B',     '8900004', array['cliente'],   true)) as x(t, nombre, identificacion, roles, activo)
    join ids i on i.clave = x.t
  returning identificacion, id
)
insert into ids select case identificacion when '8900001' then 'ca' when '8900002' then 'cv' when '8900003' then 'pa' else 'cb' end, id from t;
insert into ids select 'cf', id from public.terceros where tenant_id = (select id from ids where clave = 'a') and es_consumidor_final;

-- Saldo de producto terminado, como lo cargará la función de arranque (CO-37: ref_tipo `cafe.arranque`, el único
-- camino distinto al empaque): Consumo 500 g = 10, Excelso 500 g = 10, Excelso 2.500 g = 2. Cliente B: Excelso 500 g = 5.
insert into public.movimientos_inventario (tenant_id, articulo_id, cantidad, motivo, ref_tipo)
select a.tenant_id, a.id, s.cantidad, 'saldo_inicial', 'cafe.arranque'
  from public.articulos a
  join (values ('Consumo 500 g', 10), ('Excelso 500 g', 10), ('Excelso 2.500 g', 2)) as s(nombre, cantidad) on s.nombre = a.nombre
 where a.tenant_id = (select id from ids where clave = 'a') and a.tipo = 'producto_terminado';
insert into public.movimientos_inventario (tenant_id, articulo_id, cantidad, motivo, ref_tipo)
select a.tenant_id, a.id, 5, 'saldo_inicial', 'cafe.arranque'
  from public.articulos a
 where a.tenant_id = (select id from ids where clave = 'b') and a.nombre = 'Excelso 500 g';

create temp table res (k text primary key, r jsonb);
grant select, insert on res to authenticated;

create or replace function pg_temp.hoy() returns text language sql as $$ select to_char(current_date, 'YYYY-MM-DD') $$;
grant execute on function pg_temp.hoy() to authenticated;
create or replace function pg_temp.anio() returns text language sql as $$ select to_char(current_date, 'YYYY') $$;
grant execute on function pg_temp.anio() to authenticated;

-- Stock y artículo por nombre, para el cliente que esté autenticado.
create or replace function pg_temp.stock(p_nombre text) returns numeric language sql as $$
  select stock from public.v_stock where nombre = p_nombre
$$;
grant execute on function pg_temp.stock(text) to authenticated;
create or replace function pg_temp.aid(p_nombre text) returns uuid language sql as $$
  select articulo_id from public.v_stock where nombre = p_nombre
$$;
grant execute on function pg_temp.aid(text) to authenticated;
create or replace function pg_temp.tid(p_clave text) returns uuid language sql as $$ select id from ids where clave = p_clave $$;
grant execute on function pg_temp.tid(text) to authenticated;

-- Entrada de registrar_venta: `p_lineas` = [[nombre, cantidad, precio], …] y `p_extra` se mezcla encima.
create or replace function pg_temp.pv(p_tercero text, p_lineas jsonb, p_extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('tipo', 'venta', 'fecha', pg_temp.hoy(), 'tercero_id', pg_temp.tid(p_tercero),
         'lineas', (select jsonb_agg(jsonb_build_object('articulo_id', pg_temp.aid(l ->> 0), 'cantidad', (l ->> 1)::numeric,
                                                       'precio_unitario', (l ->> 2)::numeric) order by n)
                      from jsonb_array_elements(p_lineas) with ordinality as e(l, n))) || p_extra
$$;
grant execute on function pg_temp.pv(text, jsonb, jsonb) to authenticated;

create or replace function pg_temp.vender(p_k text, p_tercero text, p_lineas jsonb, p_extra jsonb default '{}')
returns void language plpgsql as $$
begin
  insert into res select p_k, cafe.registrar_venta(pg_temp.pv(p_tercero, p_lineas, p_extra));
end $$;
grant execute on function pg_temp.vender(text, text, jsonb, jsonb) to authenticated;

create or replace function pg_temp.vid(p_k text) returns uuid language sql as $$ select (r ->> 'id')::uuid from res where k = p_k $$;
grant execute on function pg_temp.vid(text) to authenticated;

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

create or replace function pg_temp.filas(p_sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function pg_temp.filas(text) to authenticated;

-- Una venta cuyo total no es la suma de sus líneas: el trigger diferido la rechaza al cierre.
create or replace function pg_temp.incoherente() returns void language plpgsql as $$
declare v uuid;
begin
  set constraints all deferred;
  insert into cafe.ventas (numero, tipo, fecha, tercero_id, total)
  values ('X-0001', 'venta', current_date, pg_temp.tid('cf'), 999) returning id into v;
  insert into cafe.venta_lineas (venta_id, articulo_pt_id, cantidad, precio_unitario)
  values (v, pg_temp.aid('Consumo 500 g'), 1, 500);
  set constraints all immediate;
end $$;
grant execute on function pg_temp.incoherente() to authenticated;

-- 1. Estructura y privilegios -------------------------------------------------------------------------------
select has_table('cafe', 'ventas', 'existe cafe.ventas');
select has_table('cafe', 'venta_lineas', 'existe cafe.venta_lineas');
select ok(
  (select bool_and(relrowsecurity) from pg_class where oid in ('cafe.ventas'::regclass, 'cafe.venta_lineas'::regclass)),
  'ventas y venta_lineas tienen RLS activada'
);
select ok(
  not has_table_privilege('authenticated', 'cafe.venta_lineas', 'update')
  and not has_table_privilege('authenticated', 'cafe.venta_lineas', 'delete')
  and not has_table_privilege('service_role', 'cafe.venta_lineas', 'update')
  and not has_table_privilege('service_role', 'cafe.venta_lineas', 'delete')
  and not has_table_privilege('authenticated', 'cafe.ventas', 'delete')
  and not has_table_privilege('service_role', 'cafe.ventas', 'delete')
  and not has_table_privilege('anon', 'cafe.ventas', 'select'),
  'las líneas son inmutables, nadie borra ventas y anon no las lee'
);
select ok(
  has_column_privilege('authenticated', 'cafe.ventas', 'numero_factura_aliados', 'update')
  and not has_column_privilege('authenticated', 'cafe.ventas', 'total', 'update')
  and not has_column_privilege('authenticated', 'cafe.ventas', 'fecha', 'update')
  and not has_column_privilege('authenticated', 'cafe.ventas', 'tercero_id', 'update')
  and not has_column_privilege('authenticated', 'cafe.ventas', 'anulada_por', 'update'),
  'de una venta solo se actualizan el nº de factura y la anulación (por columnas)'
);
select is(
  (select array_agg(p.prosecdef order by p.proname)
     from pg_proc p
    where p.oid in ('cafe.registrar_venta(jsonb)'::regprocedure, 'cafe.anular_venta(uuid,text)'::regprocedure,
                    'cafe.resumen_ventas(date,date,uuid,text,boolean,text,text)'::regprocedure)),
  array[false, false, false], 'registrar_venta, anular_venta y resumen_ventas son SECURITY INVOKER'
);
select ok(
  not has_function_privilege('anon', 'cafe.registrar_venta(jsonb)', 'execute')
  and not has_function_privilege('anon', 'cafe.anular_venta(uuid,text)', 'execute')
  and has_function_privilege('authenticated', 'cafe.registrar_venta(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'cafe.ventas_proteger()', 'execute')
  and not has_function_privilege('authenticated', 'cafe.ventas_verificar_total()', 'execute'),
  'anon no ejecuta las RPC y las funciones de los triggers no se llaman a mano'
);
select ok(
  (select bool_and(coalesce(c.reloptions, '{}') @> array['security_invoker=true'])
     from pg_class c where c.oid in ('cafe.v_ventas'::regclass, 'cafe.v_ventas_factura_pendiente'::regclass)),
  'las vistas de ventas son security_invoker (el RLS filtra por cliente)'
);

-- 2. Lista de precios y serie, sembradas por el alta ------------------------------------------------------------
reset role;
select tests.autenticar_como('operativo-a@ventas.test');

select is(
  (select jsonb_object_agg(a.nombre, v.valor)
     from public.v_tarifas_vigentes v join public.articulos a on cafe.concepto_precio(a.id) = v.concepto),
  '{"Consumo 500 g": 23000, "Excelso 500 g": 29000}'::jsonb,
  'el alta siembra Consumo 500 g = 23.000 y Excelso 500 g = 29.000; las de 2.500 g quedan sin precio'
);
select is(
  cafe.concepto_precio('3f2a1b4c-0d5e-4f60-8a71-92b3c4d5e6f7'),
  'cafe.precio_3f2a1b4c0d5e4f608a7192b3c4d5e6f7', 'el concepto es cafe.precio_ + el uuid sin guiones (lo mismo que conceptoPrecio() en TS)'
);
select is(
  (select unidad from public.tarifas where concepto = cafe.concepto_precio(pg_temp.aid('Consumo 500 g'))), 'unidad',
  'los precios son por unidad'
);
select is(
  (select array_agg(s.serie order by s.serie) from public.series_consecutivo s where s.activo and s.reinicia_anual),
  array['MP', 'MQ', 'REM', 'VT'], 'el alta siembra la serie VT junto a MP, MQ y REM'
);

-- 3. El ejemplo de la tarea: Consumidor final, 3 × Consumo 500 g + 1 × Excelso 500 g = $98.000 --------------------------
select pg_temp.vender('V1', 'cf', '[["Consumo 500 g", 3, 23000], ["Excelso 500 g", 1, 29000]]');
select is((select r ->> 'numero' from res where k = 'V1'), 'VT-' || pg_temp.anio() || '-0001', 'la primera venta es VT-<año>-0001');
select is((select (r ->> 'total')::numeric from res where k = 'V1'), 98000::numeric, 'total $98.000');
select is(jsonb_array_length((select r -> 'advertencias' from res where k = 'V1')), 0, 'con stock suficiente no hay advertencias');
select is(
  (select row(v.tipo, v.total, v.tercero_id = pg_temp.tid('cf'), v.fecha = current_date, v.requiere_factura, v.anulada_at)::text
     from cafe.ventas v where v.id = pg_temp.vid('V1')),
  row('venta'::cafe.tipo_venta, 98000.00::numeric, true, true, false, null::timestamptz)::text,
  'la venta guarda tipo, total, el Consumidor final y la fecha'
);
select is(
  (select array_agg(row(a.nombre, l.cantidad, l.precio_unitario, l.subtotal)::text order by a.nombre)
     from cafe.venta_lineas l join public.articulos a on a.id = l.articulo_pt_id where l.venta_id = pg_temp.vid('V1')),
  array[row('Consumo 500 g', 3, 23000.00::numeric, 69000.00::numeric)::text, row('Excelso 500 g', 1, 29000.00::numeric, 29000.00::numeric)::text],
  'dos líneas con su precio de ese momento y el subtotal calculado'
);
select is(
  array[pg_temp.stock('Consumo 500 g'), pg_temp.stock('Excelso 500 g')], array[7.000, 9.000],
  'el stock baja 3 de Consumo 500 g y 1 de Excelso 500 g'
);
select is(
  (select array_agg(row(a.nombre, m.cantidad, m.motivo, m.ref_tipo, m.ref_id = pg_temp.vid('V1'), m.observaciones)::text order by a.nombre)
     from public.movimientos_inventario m join public.articulos a on a.id = m.articulo_id where m.ref_id = pg_temp.vid('V1')),
  array[row('Consumo 500 g', -3.000::numeric, 'venta'::public.motivo_movimiento, 'cafe.venta', true, 'Venta VT-' || pg_temp.anio() || '-0001')::text,
        row('Excelso 500 g', -1.000::numeric, 'venta'::public.motivo_movimiento, 'cafe.venta', true, 'Venta VT-' || pg_temp.anio() || '-0001')::text],
  'dos movimientos de salida con motivo venta, ligados a la venta (ref_tipo cafe.venta)'
);
select is(
  (select array_agg(row(k.motivo, k.cantidad, k.saldo)::text order by k.seq)
     from public.v_kardex k where k.articulo_nombre = 'Consumo 500 g'),
  array[row('saldo_inicial'::public.motivo_movimiento, 10.000::numeric, 10.000::numeric)::text,
        row('venta'::public.motivo_movimiento, -3.000::numeric, 7.000::numeric)::text],
  'el kardex del producto muestra la venta con su saldo'
);
select is(
  (select row(n_lineas, unidades, estado, factura_estado, es_consumidor_final, tercero_nombre)::text from cafe.v_ventas where id = pg_temp.vid('V1')),
  row(2, 4, 'vigente', 'no_requerida', true, 'Consumidor final')::text,
  'v_ventas: 2 líneas, 4 unidades, vigente, sin factura y a Consumidor final'
);

-- 4. Cambiar el precio vigente no altera ventas anteriores (snapshot) -------------------------------------------------------
select throws_ok(
  $$insert into public.tarifas (concepto, valor, unidad, vigente_desde)
    values (cafe.concepto_precio(pg_temp.aid('Consumo 500 g')), 24000, 'unidad', now() + interval '1 minute')$$,
  '42501', null, 'un operativo no cambia la lista de precios'
);
reset role;
select tests.autenticar_como('owner-a@ventas.test');
select lives_ok(
  $$insert into public.tarifas (concepto, valor, unidad, vigente_desde)
    values (cafe.concepto_precio(pg_temp.aid('Consumo 500 g')), 24000, 'unidad', now() + interval '1 minute')$$,
  'el owner programa Consumo 500 g a $24.000'
);
select is(
  public.tarifa_vigente(cafe.concepto_precio(pg_temp.aid('Consumo 500 g')), now() + interval '2 minutes'), 24000.00::numeric,
  'la lista de precios devuelve $24.000 desde su vigencia (y $23.000 antes)'
);
select is(
  (select l.precio_unitario from cafe.venta_lineas l where l.venta_id = pg_temp.vid('V1') and l.articulo_pt_id = pg_temp.aid('Consumo 500 g')),
  23000.00::numeric, 'la venta anterior conserva su precio de $23.000'
);
reset role;
select tests.autenticar_como('operativo-a@ventas.test');

-- 5. Factura de Aliados: pendiente y se completa después ---------------------------------------------------------------------
select pg_temp.vender('V2', 'ca', '[["Consumo 500 g", 2, 24000]]', '{"requiere_factura": true}');
select is(
  (select row(v.requiere_factura, v.numero_factura_aliados, v.factura_estado, v.factura_pendiente)::text from cafe.v_ventas v where v.id = pg_temp.vid('V2')),
  row(true, null::text, 'pendiente', true)::text, 'requiere factura sin número: queda «pendiente»'
);
select is((select count(*)::int from cafe.v_ventas_factura_pendiente), 1, 'y aparece en la lista de facturas pendientes');
select is(
  pg_temp.filas(format($q$update cafe.ventas set numero_factura_aliados = 'FE-1001' where id = %L$q$, pg_temp.vid('V2'))),
  1::bigint, 'el operativo completa el nº de factura de Aliados después'
);
select is(
  (select row(v.numero_factura_aliados, v.factura_estado, v.factura_pendiente, v.total)::text from cafe.v_ventas v where v.id = pg_temp.vid('V2')),
  row('FE-1001', 'emitida', false, 48000.00::numeric)::text, 'queda «emitida» y el resto de la venta no cambia'
);
select is((select count(*)::int from cafe.v_ventas_factura_pendiente), 0, 'ya no está en la lista de pendientes');
select throws_ok(
  format($q$update cafe.ventas set total = 1 where id = %L$q$, pg_temp.vid('V2')),
  '42501', null, 'solo se puede editar el nº de factura: el total no se toca (privilegio por columna)'
);
select throws_ok(
  format($q$update cafe.ventas set fecha = current_date - 1 where id = %L$q$, pg_temp.vid('V2')),
  '42501', null, 'ni la fecha'
);
select throws_ok(
  format($q$update cafe.ventas set numero_factura_aliados = 'FE-9' where id = %L$q$, pg_temp.vid('V1')),
  'P0001', 'factura_no_requerida', 'una venta que no requiere factura no admite número de Aliados'
);
select pg_temp.vender('V3', 'ca', '[["Excelso 500 g", 1, 29000]]', '{"requiere_factura": true, "numero_factura_aliados": "  FE-2000  "}');
select is(
  (select row(numero_factura_aliados, factura_estado)::text from cafe.v_ventas where id = pg_temp.vid('V3')),
  row('FE-2000', 'emitida')::text, 'se puede guardar el número desde el principio (sin espacios sobrantes)'
);

-- 6. Vender más de lo que hay: avisa y no bloquea -------------------------------------------------------------------------------
select pg_temp.vender('V4', 'ca', '[["Excelso 2.500 g", 5, 120000]]');
select is(
  (select jsonb_agg(jsonb_build_object('articulo', a ->> 'articulo', 'stock', (a ->> 'stock_resultante')::numeric))
     from res, jsonb_array_elements(r -> 'advertencias') a where k = 'V4'),
  '[{"articulo": "Excelso 2.500 g", "stock": -3}]'::jsonb, 'vender 5 con 2 en inventario guarda la venta y avisa: quedan −3'
);
select is(pg_temp.stock('Excelso 2.500 g'), -3.000, 'el stock queda negativo (en rojo en la pantalla)');
select is((select (r ->> 'total')::numeric from res where k = 'V4'), 600000::numeric, 'y la venta existe con su total');

-- 7. Cortesía: total 0, motivo cortesía -------------------------------------------------------------------------------------
select pg_temp.vender('C1', 'ca', '[["Excelso 500 g", 2, 5000]]', '{"tipo": "cortesia"}');
select is(
  (select row(v.tipo, v.total, v.requiere_factura)::text from cafe.ventas v where v.id = pg_temp.vid('C1')),
  row('cortesia'::cafe.tipo_venta, 0.00::numeric, false)::text, 'la cortesía vale $0 aunque se mande un precio'
);
select is(
  (select row(l.precio_unitario, l.subtotal)::text from cafe.venta_lineas l where l.venta_id = pg_temp.vid('C1')),
  row(0.00::numeric, 0.00::numeric)::text, 'su línea se fuerza a precio 0'
);
select is(
  (select row(m.motivo, m.cantidad, m.observaciones)::text from public.movimientos_inventario m where m.ref_id = pg_temp.vid('C1')),
  row('cortesia'::public.motivo_movimiento, -2.000::numeric, 'Cortesía VT-' || pg_temp.anio() || '-0005')::text,
  'el movimiento es una salida con motivo cortesía'
);
select is(pg_temp.stock('Excelso 500 g'), 6.000, 'la cortesía también descuenta del inventario (10 − 1 de V1 − 1 de V3 − 2 = 6)');
select throws_ok(
  $$select cafe.registrar_venta(pg_temp.pv('ca', '[["Excelso 500 g", 1, 0]]', '{"tipo": "cortesia", "requiere_factura": true}'))$$,
  'P0001', 'datos_invalidos', 'una cortesía no lleva factura'
);
select throws_ok(
  $$insert into cafe.ventas (numero, tipo, fecha, tercero_id, total) values ('Y-1', 'cortesia', current_date, pg_temp.tid('cf'), 5)$$,
  '23514', null, 'la base rechaza una cortesía con valor (cortesia_sin_valor_ck)'
);

-- 8. Resumen del periodo ----------------------------------------------------------------------------------------------------------
select is(
  cafe.resumen_ventas(),
  '{"n_ventas": 4, "n_anuladas": 0, "n_cortesias": 1, "total_ventas": 775000, "unidades_cortesia": 2, "n_factura_pendiente": 0}'::jsonb,
  'resumen: 4 ventas por $775.000; la cortesía se cuenta aparte (2 unidades) y no suma'
);
select is((cafe.resumen_ventas(p_tipo => 'cortesia') ->> 'n_ventas')::int, 0, 'filtrado por cortesías no hay ventas');
select is((cafe.resumen_ventas(p_tercero => pg_temp.tid('cf')) ->> 'total_ventas')::numeric, 98000::numeric, 'filtrado por cliente: Consumidor final $98.000');
select is((cafe.resumen_ventas(p_desde => current_date + 1) ->> 'n_ventas')::int, 0, 'filtrado por fecha futura: nada');
select is(
  (cafe.resumen_ventas(p_q => 'VT-' || pg_temp.anio() || '-0002') ->> 'total_ventas')::numeric, 48000::numeric, 'filtrado por número'
);

-- 9. Validaciones: nada se escribe ni se consume número ------------------------------------------------------------------------------------
select throws_ok($$select cafe.registrar_venta(null)$$, 'P0001', 'datos_invalidos', 'sin datos: datos_invalidos');
select throws_ok($$select cafe.registrar_venta('{"tipo": "venta"}')$$, 'P0001', 'datos_invalidos', 'faltan campos: datos_invalidos');
select throws_ok(
  $$select cafe.registrar_venta(pg_temp.pv('ca', '[]', '{"lineas": []}'))$$, 'P0001', 'datos_invalidos', 'sin ninguna línea: datos_invalidos'
);
select throws_ok(
  $$select cafe.registrar_venta(pg_temp.pv('ca', '[["Consumo 500 g", 0, 23000]]'))$$, 'P0001', 'datos_invalidos', 'cero unidades: datos_invalidos'
);
select throws_ok(
  $$select cafe.registrar_venta(pg_temp.pv('ca', '[["Consumo 500 g", 1.5, 23000]]'))$$, 'P0001', 'datos_invalidos', 'unidades con decimales: datos_invalidos'
);
select throws_ok(
  $$select cafe.registrar_venta(pg_temp.pv('ca', '[["Consumo 500 g", 1, 0]]'))$$, 'P0001', 'datos_invalidos', 'una venta con precio 0: datos_invalidos'
);
select throws_ok(
  $$select cafe.registrar_venta(pg_temp.pv('ca', '[["Consumo 500 g", 1, 100.555]]'))$$, 'P0001', 'datos_invalidos', 'precio con más de 2 decimales: datos_invalidos'
);
select throws_ok(
  $$select cafe.registrar_venta(pg_temp.pv('ca', '[["Consumo 500 g", 1, 23000], ["Consumo 500 g", 2, 23000]]'))$$,
  'P0001', 'datos_invalidos', 'el mismo producto dos veces: datos_invalidos'
);
select throws_ok(
  $$select cafe.registrar_venta(pg_temp.pv('ca', '[["Consumo 500 g", 1, 23000]]', '{"tipo": "regalo"}'))$$, 'P0001', 'datos_invalidos', 'un tipo desconocido: datos_invalidos'
);
select throws_ok(
  $$select cafe.registrar_venta(pg_temp.pv('ca', '[["Consumo 500 g", 1, 23000]]', '{"fecha": "ayer"}'))$$, 'P0001', 'datos_invalidos', 'una fecha ilegible: datos_invalidos'
);
select throws_ok(
  $$select cafe.registrar_venta(pg_temp.pv('ca', '[["Consumo 500 g", 1, 23000]]', '{"numero_factura_aliados": "FE-1"}'))$$,
  'P0001', 'datos_invalidos', 'un nº de factura sin marcar «requiere factura»: datos_invalidos'
);
select throws_ok(
  $$select cafe.registrar_venta(pg_temp.pv('ca', '[["Bolsa 500 g", 1, 100]]'))$$, 'P0001', 'articulo_no_encontrado', 'un insumo no se vende: articulo_no_encontrado'
);
select throws_ok(
  $$select cafe.registrar_venta(pg_temp.pv('ca', '[["Consumo 500 g", 1, 23000]]', jsonb_build_object('lineas',
      jsonb_build_array(jsonb_build_object('articulo_id', '00000000-0000-0000-0000-000000000000', 'cantidad', 1, 'precio_unitario', 100)))))$$,
  'P0001', 'articulo_no_encontrado', 'un producto que no existe: articulo_no_encontrado'
);
select throws_ok(
  $$select cafe.registrar_venta(pg_temp.pv('cv', '[["Consumo 500 g", 1, 23000]]'))$$, 'P0001', 'tercero_inactivo', 'un cliente desactivado: tercero_inactivo'
);
select throws_ok(
  $$select cafe.registrar_venta(pg_temp.pv('pa', '[["Consumo 500 g", 1, 23000]]'))$$, 'P0001', 'tercero_no_cliente', 'un proveedor no es cliente: tercero_no_cliente'
);
select throws_ok(
  $$select cafe.registrar_venta(pg_temp.pv('cb', '[["Consumo 500 g", 1, 23000]]'))$$, 'P0001', 'tercero_no_encontrado', 'el cliente de otro cliente (tenant): tercero_no_encontrado'
);

reset role;
update public.articulos set activo = false where tenant_id = (select id from ids where clave = 'a') and nombre = 'Excelso 2.500 g';
select tests.autenticar_como('operativo-a@ventas.test');
select throws_ok(
  $$select cafe.registrar_venta(jsonb_build_object('tipo', 'venta', 'fecha', pg_temp.hoy(), 'tercero_id', pg_temp.tid('ca'),
      'lineas', jsonb_build_array(jsonb_build_object('articulo_id', (select id from public.articulos where nombre = 'Excelso 2.500 g'), 'cantidad', 1, 'precio_unitario', 100000))))$$,
  'P0001', 'articulo_inactivo', 'un producto desactivado no se vende: articulo_inactivo'
);
reset role;
update public.articulos set activo = true where tenant_id = (select id from ids where clave = 'a') and nombre = 'Excelso 2.500 g';
select tests.autenticar_como('operativo-a@ventas.test');

select is(
  (select count(*)::int from cafe.ventas), 5, 'ninguna validación fallida dejó una venta (5: V1 a V4 y la cortesía)'
);
select pg_temp.vender('V6', 'cf', '[["Consumo 500 g", 1, 24000]]');
select is(
  (select r ->> 'numero' from res where k = 'V6'), 'VT-' || pg_temp.anio() || '-0006',
  'los intentos fallidos no consumieron número: la siguiente es la 6, sin huecos'
);

-- 10. Anular: solo owner/admin, repone el stock ----------------------------------------------------------------------------------------------
select throws_ok(
  format($q$select cafe.anular_venta(%L, 'error de digitación')$q$, pg_temp.vid('V1')),
  '42501', 'no_autorizado', 'un operativo no puede anular'
);
select throws_ok(
  format($q$update cafe.ventas set anulada_at = now(), motivo_anulacion = 'x' where id = %L$q$, pg_temp.vid('V1')),
  '42501', 'no_autorizado', 'ni anulando con un UPDATE directo (lo frena el trigger)'
);
reset role;
select tests.autenticar_como('viewer-a@ventas.test');
select throws_ok(
  format($q$select cafe.anular_venta(%L, 'error')$q$, pg_temp.vid('V1')), '42501', 'no_autorizado', 'Gerencia (viewer) tampoco anula'
);
select throws_ok(
  $$select cafe.registrar_venta(pg_temp.pv('ca', '[["Consumo 500 g", 1, 23000]]'))$$, '42501', 'no_autorizado', 'ni registra ventas'
);
select is((select count(*)::int from cafe.v_ventas), 6, 'pero sí ve todas las ventas del cliente (consulta)');
select is(
  pg_temp.filas(format($q$update cafe.ventas set numero_factura_aliados = 'FE-7' where id = %L$q$, pg_temp.vid('V2'))),
  0::bigint, 'y no completa facturas (el RLS no le deja ninguna fila)'
);

reset role;
select tests.autenticar_como('admin-a@ventas.test');
select throws_ok(
  format($q$select cafe.anular_venta(%L, '   ')$q$, pg_temp.vid('V1')), 'P0001', 'datos_invalidos', 'anular exige el motivo'
);
select throws_ok(
  $$select cafe.anular_venta('00000000-0000-0000-0000-000000000000', 'x')$$, 'P0001', 'venta_no_encontrada', 'una venta que no existe: venta_no_encontrada'
);
select lives_ok(format($q$select cafe.anular_venta(%L, 'cliente devolvió todo')$q$, pg_temp.vid('V1')), 'el admin anula la venta V1');
select is(
  (select row(v.estado, v.motivo_anulacion, v.anulada_por = '00000000-0000-0000-0000-0000000089a2', v.anulada_at is not null)::text
     from cafe.v_ventas v where v.id = pg_temp.vid('V1')),
  row('anulada', 'cliente devolvió todo', true, true)::text, 'queda anulada con motivo, quién y cuándo'
);
select is(
  array[pg_temp.stock('Consumo 500 g'), pg_temp.stock('Excelso 500 g')], array[7.000, 7.000],
  'se repone el stock: Consumo 500 g +3 (4 → 7) y Excelso 500 g +1 (6 → 7)'
);
select is(
  (select array_agg(row(a.nombre, m.cantidad, m.motivo, m.ref_tipo, m.observaciones)::text order by a.nombre)
     from public.movimientos_inventario m join public.articulos a on a.id = m.articulo_id
    where m.ref_id = pg_temp.vid('V1') and m.motivo = 'devolucion'),
  array[row('Consumo 500 g', 3.000::numeric, 'devolucion'::public.motivo_movimiento, 'cafe.venta', 'Anulación VT-' || pg_temp.anio() || '-0001')::text,
        row('Excelso 500 g', 1.000::numeric, 'devolucion'::public.motivo_movimiento, 'cafe.venta', 'Anulación VT-' || pg_temp.anio() || '-0001')::text],
  'la reposición son movimientos devolucion ligados a la venta'
);
select throws_ok(
  format($q$select cafe.anular_venta(%L, 'otra vez')$q$, pg_temp.vid('V1')), 'P0001', 'venta_anulada', 'anular dos veces: venta_anulada (no repone dos veces)'
);
select is(pg_temp.stock('Consumo 500 g'), 7.000, 'y el stock no cambió');
select throws_ok(
  format($q$update cafe.ventas set numero_factura_aliados = 'FE-1' where id = %L$q$, pg_temp.vid('V1')),
  'P0001', 'venta_anulada', 'una venta anulada ya no se modifica'
);
select lives_ok(format($q$select cafe.anular_venta(%L, 'no se entregó')$q$, pg_temp.vid('C1')), 'también se anula una cortesía');
select is(pg_temp.stock('Excelso 500 g'), 9.000, 'y devuelve las 2 unidades de Excelso 500 g');
select lives_ok(format($q$select cafe.anular_venta(%L, 'prueba de cantidad')$q$, pg_temp.vid('V4')), 'se anula la venta que dejó el stock en negativo');
select is(pg_temp.stock('Excelso 2.500 g'), 2.000, 'y el stock vuelve a 2');
select is(
  cafe.resumen_ventas(),
  '{"n_ventas": 3, "n_anuladas": 3, "n_cortesias": 0, "total_ventas": 101000, "unidades_cortesia": 0, "n_factura_pendiente": 0}'::jsonb,
  'las anuladas no suman: quedan V2 ($48.000), V3 ($29.000) y V6 ($24.000)'
);
select is((cafe.resumen_ventas(p_estado => 'anulada') ->> 'n_anuladas')::int, 3, 'filtrado por anuladas: 3');
select throws_ok(
  $$insert into public.movimientos_inventario (articulo_id, cantidad, motivo) values (pg_temp.aid('Excelso 500 g'), 1, 'devolucion')$$,
  'P0001', 'entrada_pt_no_permitida', 'una devolución de producto terminado sin venta sigue rechazada: solo el empaque y la anulación suman'
);

-- 11. Pendientes de factura ---------------------------------------------------------------------------------------------------------------
select pg_temp.vender('V7', 'ca', '[["Consumo 500 g", 1, 24000]]', '{"requiere_factura": true}');
select is((select count(*)::int from cafe.v_ventas_factura_pendiente), 1, 'una venta nueva con «requiere factura» sin número entra a la lista de pendientes');
select is((cafe.resumen_ventas(p_factura_pendiente => true) ->> 'n_factura_pendiente')::int, 1, 'y el resumen filtra por pendientes');
select lives_ok(format($q$select cafe.anular_venta(%L, 'duplicada')$q$, pg_temp.vid('V7')), 'anularla...');
select is((select count(*)::int from cafe.v_ventas_factura_pendiente), 0, '...la saca de los pendientes');

-- 12. El total siempre es la suma de las líneas ---------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('owner-a@ventas.test');
select lives_ok($$set constraints all immediate$$, 'todas las ventas hechas por la RPC cumplen total = Σ subtotales');
select throws_ok(
  $$insert into cafe.ventas (numero, tipo, fecha, tercero_id, total) values ('X-0002', 'venta', current_date, pg_temp.tid('cf'), 500)$$,
  'P0001', 'venta_total_incoherente', 'una venta sin líneas no se guarda'
);
select throws_ok($$select pg_temp.incoherente()$$, 'P0001', 'venta_total_incoherente', 'una venta con un total distinto a sus líneas tampoco');
select lives_ok($$set constraints all deferred$$, 'restaura el modo diferido');

-- 13. Módulo y roles ------------------------------------------------------------------------------------------------------------------------
select lives_ok(
  $$select pg_temp.vender('V8', 'cf', '[["Excelso 500 g", 1, 29000]]')$$, 'el owner también vende'
);
reset role;
select tests.autenticar_como('owner-c@ventas.test');
select throws_ok(
  $$select cafe.registrar_venta('{"tipo": "venta"}')$$, '42501', 'no_autorizado', 'sin el módulo cafe.ventas: no_autorizado'
);
select is((select count(*)::int from cafe.ventas), 0, 'y no ve ventas');
reset role;
select tests.como_anon();
select throws_ok(
  $$select cafe.registrar_venta('{"tipo": "venta"}')$$, '42501', null, 'sin sesión no se ejecuta la RPC'
);

-- 14. Aislamiento entre clientes ----------------------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('owner-b@ventas.test');
select is(
  (select count(*)::int from cafe.ventas) + (select count(*)::int from cafe.venta_lineas) + (select count(*)::int from cafe.v_ventas),
  0, 'otro cliente no ve ventas, líneas ni el listado de A'
);
select throws_ok(
  format($q$select cafe.anular_venta(%L, 'ajena')$q$, pg_temp.vid('V2')), 'P0001', 'venta_no_encontrada', 'no anula la venta de otro cliente'
);
select is(
  pg_temp.filas(format($q$update cafe.ventas set numero_factura_aliados = 'FE-X' where id = %L$q$, pg_temp.vid('V2'))),
  0::bigint, 'ni le cambia el nº de factura'
);
select throws_ok(
  $$select cafe.registrar_venta(jsonb_build_object('tipo', 'venta', 'fecha', pg_temp.hoy(), 'tercero_id', pg_temp.tid('ca'),
      'lineas', jsonb_build_array(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'cantidad', 1, 'precio_unitario', 100))))$$,
  'P0001', 'tercero_no_encontrado', 'no vende a un cliente de A'
);
select throws_ok(
  format($q$insert into cafe.venta_lineas (venta_id, articulo_pt_id, cantidad, precio_unitario)
            values (%L, %L, 1, 1)$q$, pg_temp.vid('V2'), pg_temp.aid('Excelso 500 g')),
  '23503', null, 'ni cuelga una línea de una venta de A (la FK compuesta ata el cliente)'
);
select lives_ok(
  $$insert into res select 'B1', cafe.registrar_venta(jsonb_build_object('tipo', 'venta', 'fecha', pg_temp.hoy(), 'tercero_id', pg_temp.tid('cb'),
      'lineas', jsonb_build_array(jsonb_build_object('articulo_id', pg_temp.aid('Excelso 500 g'), 'cantidad', 2, 'precio_unitario', 29000))))$$,
  'B vende lo suyo'
);
select is((select r ->> 'numero' from res where k = 'B1'), 'VT-' || pg_temp.anio() || '-0001', 'con su propio contador (VT-<año>-0001)');
select is(pg_temp.stock('Excelso 500 g'), 3.000, 'y descuenta de su inventario (5 − 2), no del de A');

reset role;
select tests.autenticar_como('operativo-a@ventas.test');
select is(
  (select count(*)::int from cafe.ventas where id = pg_temp.vid('B1')), 0, 'A no ve la venta de B'
);
select is(pg_temp.stock('Excelso 500 g'), 8.000, 'y el inventario de A sigue como estaba (10 − 1 − 1 − 2 + 1 + 2 − 1)');

-- 15. Auditoría ---------------------------------------------------------------------------------------------------------------------------------
reset role;
select is(
  (select array_agg(l.accion order by l.id) from audit.log l where l.tabla = 'cafe.ventas' and l.registro_id = pg_temp.vid('V1')::text),
  array['INSERT', 'UPDATE'], 'la venta y su anulación quedan en audit.log'
);
select is(
  (select count(*)::int from audit.log l
    where l.tabla = 'cafe.venta_lineas' and l.accion = 'INSERT'
      and l.registro_id in (select id::text from cafe.venta_lineas where venta_id = pg_temp.vid('V1'))),
  2, 'y cada línea'
);
select is(
  (select l.cambios from audit.log l where l.tabla = 'cafe.ventas' and l.registro_id = pg_temp.vid('V2')::text and l.accion = 'UPDATE'),
  '{"numero_factura_aliados": "FE-1001"}'::jsonb, 'completar el nº de factura deja solo ese cambio'
);

select * from finish();
rollback;
