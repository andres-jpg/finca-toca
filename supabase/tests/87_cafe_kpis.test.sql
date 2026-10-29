-- Panel operativo de gerencia de café (FIN-115 · CO-34, HU-F1-14): cafe.kpis_periodo, cafe.produccion_diaria,
-- cafe.ventas_diarias y sus utilidades (hoy_local, linea_panel, rango_panel).
-- Dataset FIJO con resultados esperados a mano. Cliente A (fechas fijas 2026-03-09 y 2026-03-10, un periodo de dos días):
--   L1  servicio 500 kg / 8 bultos, trilla + tostión + molienda (+ empaque incluido) → línea MAQUILA. Cliente A.
--       trilla 500→405 (03-09), tostión 405→332 (30 baches), molienda 332→330, empaque 330→330 (03-10). Valor $1.923.000.
--   L2  servicio 200 kg, solo trilla → línea TRILLA. Trilla 200→160 (merma 20 %). Después se le genera la remisión: sale del
--       inventario de terceros. Cliente A.
--   L3  servicio 100 kg, solo trilla. Trilla 100→70 (merma 30 %: DESVÍO). Cliente A2.
--   L4  servicio 50 kg, solo trilla. Trilla 50→40 y se ANULA (no cuenta en mermas; el lote sigue recibido). Cliente A.
--   L5  servicio 60 kg, ANULADO sin procesos (no cuenta en lo recibido).
--   E1–E5  cinco lotes de trilla de 10 a 50 kg recibidos el 2026-02-01 (fuera del periodo: cuentan en el inventario de
--       terceros —es una foto de ahora— pero no en lo recibido). Clientes «Extra 1» … «Extra 5».
--   M1  marca propia 100 kg / 2 bultos, tostión 100→82 (03-10). M2 marca propia 100 kg recibido el 2026-03-02 (fuera del
--       periodo, sin procesar). M3 marca propia 20 kg / 1 bulto, tostión 20→16,4 y empaque 16,4→16 (32 × 500 g).
--   Ventas: 03-09 1 × Consumo 500 g ($23.000); 03-10 3 × Consumo 500 g + 1 × Excelso 500 g ($98.000), una cortesía de 2 ×
--   Excelso 500 g y una venta de $50.000 que se anula. Saldo inicial de producto terminado: 10 Consumo y 10 Excelso 500 g.
-- Cliente B: EL EJEMPLO DE LA TAREA con fecha de hoy (lote de servicio 500 kg trilla + tostión + molienda y una venta de
-- $98.000). Cliente C: de café pero sin `cafe.dashboard`.
-- Todo se crea AQUÍ dentro de la transacción (rollback al final), sin depender del seed.
--   a1 owner A   a2 operativo A   a3 viewer A   b1 owner B   b2 operativo B   c1 owner C
begin;

select plan(112);

-- 0. Preparación --------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000087a1', 'authenticated', 'authenticated', 'owner-a@kpis.test'),
  ('00000000-0000-0000-0000-0000000087a2', 'authenticated', 'authenticated', 'operativo-a@kpis.test'),
  ('00000000-0000-0000-0000-0000000087a3', 'authenticated', 'authenticated', 'viewer-a@kpis.test'),
  ('00000000-0000-0000-0000-0000000087b1', 'authenticated', 'authenticated', 'owner-b@kpis.test'),
  ('00000000-0000-0000-0000-0000000087b2', 'authenticated', 'authenticated', 'operativo-b@kpis.test'),
  ('00000000-0000-0000-0000-0000000087c1', 'authenticated', 'authenticated', 'owner-c@kpis.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Kpis A', 'kpis-a-t', 'cafe', null, null, array['cafe.dashboard', 'cafe.ventas']);
select platform.crear_tenant('Kpis B', 'kpis-b-t', 'cafe', null, null, array['cafe.dashboard', 'cafe.ventas']);
select platform.crear_tenant('Kpis C', 'kpis-c-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'kpis-a-t'
union all select 'b', id from public.tenants where slug = 'kpis-b-t'
union all select 'c', id from public.tenants where slug = 'kpis-c-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), m.rol::public.rol_tenant
  from (values
    ('00000000-0000-0000-0000-0000000087a1', 'a', 'owner'),
    ('00000000-0000-0000-0000-0000000087a2', 'a', 'operativo'),
    ('00000000-0000-0000-0000-0000000087a3', 'a', 'viewer'),
    ('00000000-0000-0000-0000-0000000087b1', 'b', 'owner'),
    ('00000000-0000-0000-0000-0000000087b2', 'b', 'operativo'),
    ('00000000-0000-0000-0000-0000000087c1', 'c', 'owner')) as m(user_id, t, rol);

-- Terceros: de A, el cliente de servicios «Cliente A», «Cliente A2», cinco «Extra n» y el proveedor; de B, «Cliente B».
with t as (
  insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles)
  select i.id, x.nombre, 'Calle 1', '3000000000', x.identificacion, x.roles
    from (values ('a', 'Cliente A',   '8700001', array['cliente_servicio']),
                 ('a', 'Cliente A2',  '8700002', array['cliente_servicio']),
                 ('a', 'Proveedor A', '8700003', array['proveedor']),
                 ('a', 'Extra 1',     '8700011', array['cliente_servicio']),
                 ('a', 'Extra 2',     '8700012', array['cliente_servicio']),
                 ('a', 'Extra 3',     '8700013', array['cliente_servicio']),
                 ('a', 'Extra 4',     '8700014', array['cliente_servicio']),
                 ('a', 'Extra 5',     '8700015', array['cliente_servicio']),
                 ('b', 'Cliente B',   '8700004', array['cliente_servicio'])) as x(t, nombre, identificacion, roles)
    join ids i on i.clave = x.t
  returning nombre, id
)
insert into ids select case nombre when 'Cliente A' then 'ca' when 'Cliente A2' then 'ca2' when 'Proveedor A' then 'pa'
                                   when 'Cliente B' then 'cb' else lower(replace(nombre, ' ', '')) end, id from t;
insert into ids select 'xa', t.id from cafe.tipos_cafe t join ids i on i.id = t.tenant_id and i.clave = 'a' where t.nombre = 'Excelso';
insert into ids select 'cfa', id from public.terceros where tenant_id = (select id from ids where clave = 'a') and es_consumidor_final;
insert into ids select 'cfb', id from public.terceros where tenant_id = (select id from ids where clave = 'b') and es_consumidor_final;

-- Las fechas del cliente A son del pasado: sus tarifas tienen que estar vigentes ya en 2026-03 (las del alta rigen desde hoy).
insert into public.tarifas (tenant_id, concepto, valor, unidad, vigente_desde)
select (select id from ids where clave = 'a'), x.concepto, x.valor, 'kg', timestamptz '2000-01-01'
  from (values ('cafe.trilla', 1400), ('cafe.tostion', 2200), ('cafe.molienda', 1000)) as x(concepto, valor);

-- Saldo inicial de producto terminado (como lo cargará CO-37, ref `cafe.arranque`): Consumo 500 g y Excelso 500 g = 10.
insert into public.movimientos_inventario (tenant_id, articulo_id, cantidad, motivo, ref_tipo)
select a.tenant_id, a.id, 10, 'saldo_inicial', 'cafe.arranque'
  from public.articulos a
 where a.tenant_id = (select id from ids where clave = 'a') and a.tipo = 'producto_terminado'
   and a.nombre in ('Consumo 500 g', 'Excelso 500 g');

create temp table res (k text primary key, r jsonb);
grant select, insert on res to authenticated;

-- «Hoy» como lo calcula el cliente autenticado (su zona), no current_date del servidor.
create or replace function pg_temp.hoy() returns text language sql as $$ select to_char(cafe.hoy_local(), 'YYYY-MM-DD') $$;
grant execute on function pg_temp.hoy() to authenticated;

create or replace function pg_temp.tid(p_clave text) returns uuid language sql as $$ select id from ids where clave = p_clave $$;
grant execute on function pg_temp.tid(text) to authenticated;
create or replace function pg_temp.lid(p_k text) returns uuid language sql as $$ select (r ->> 'id')::uuid from res where k = p_k $$;
grant execute on function pg_temp.lid(text) to authenticated;

-- Recibe un café de cliente (servicio) en `p_fecha` y guarda el resultado bajo `p_k`.
create or replace function pg_temp.recibir(p_k text, p_fecha text, p_peso numeric, p_n integer, p_servicios text[],
                                           p_nivel text default null, p_ter text default 'ca')
returns void language plpgsql as $$
begin
  insert into res
  select p_k, cafe.registrar_recepcion(jsonb_build_object(
    'tercero_id', pg_temp.tid(p_ter), 'fecha', p_fecha, 'peso_kg', p_peso,
    'num_bultos', p_n, 'servicios', to_jsonb(p_servicios), 'nivel_tueste', p_nivel));
end $$;
grant execute on function pg_temp.recibir(text, text, numeric, integer, text[], text, text) to authenticated;

-- Compra de café de marca propia (Excelso de A a $20.000/kg) en `p_fecha`.
create or replace function pg_temp.comprar(p_k text, p_fecha text, p_peso numeric, p_n integer)
returns void language plpgsql as $$
begin
  insert into res
  select p_k, cafe.registrar_compra(jsonb_build_object(
    'tercero_id', pg_temp.tid('pa'), 'tipo_cafe_id', pg_temp.tid('xa'),
    'fecha', p_fecha, 'peso_kg', p_peso, 'num_bultos', p_n, 'precio_kg', 20000));
end $$;
grant execute on function pg_temp.comprar(text, text, numeric, integer) to authenticated;

create or replace function pg_temp.barr(p_k text) returns uuid[] language sql as $$
  select array_agg(b.id order by b.numero) from cafe.lote_bultos b where b.lote_id = pg_temp.lid(p_k)
$$;
grant execute on function pg_temp.barr(text) to authenticated;

-- Proceso de TODOS los bultos del lote `p_k`; la fecha y los pesos van en `p_extra`.
create or replace function pg_temp.reg(p_res text, p_k text, p_tipo text, p_extra jsonb default '{}')
returns void language plpgsql as $$
begin
  insert into res select p_res, cafe.registrar_proceso(
    jsonb_build_object('lote_id', pg_temp.lid(p_k), 'tipo', p_tipo, 'fecha', pg_temp.hoy(), 'bultos', to_jsonb(pg_temp.barr(p_k))) || p_extra);
end $$;
grant execute on function pg_temp.reg(text, text, text, jsonb) to authenticated;

-- Baches que reparten `p_entrada` según `cafe.sugerir_baches` y dejan salir `p_factor` de cada uno.
create or replace function pg_temp.baches(p_entrada numeric, p_factor numeric) returns jsonb language sql as $$
  select jsonb_build_object('baches', (
    select jsonb_agg(jsonb_build_object('peso_entrada_kg', e.v::numeric, 'peso_salida_kg', round(e.v::numeric * p_factor, 3)) order by e.n)
      from jsonb_array_elements_text(cafe.sugerir_baches(p_entrada) -> 'baches') with ordinality as e(v, n)))
$$;
grant execute on function pg_temp.baches(numeric, numeric) to authenticated;

-- 30 baches de 13,5 kg que sacan 332 kg en total (la tostión de 405 kg del ejemplo del informe).
create or replace function pg_temp.baches_ejemplo() returns jsonb language sql as $$
  select jsonb_build_object('baches', (
    select jsonb_agg(jsonb_build_object('peso_entrada_kg', 13.5, 'peso_salida_kg', case when g <= 26 then 11 else 11.5 end) order by g)
      from generate_series(1, 30) g))
$$;
grant execute on function pg_temp.baches_ejemplo() to authenticated;

-- Venta o cortesía: `p_lineas` = [[nombre, cantidad, precio], …].
create or replace function pg_temp.vender(p_k text, p_tipo text, p_fecha text, p_cliente text, p_lineas jsonb)
returns void language plpgsql as $$
begin
  insert into res select p_k, cafe.registrar_venta(jsonb_build_object(
    'tipo', p_tipo, 'fecha', p_fecha, 'tercero_id', pg_temp.tid(p_cliente),
    'lineas', (select jsonb_agg(jsonb_build_object('articulo_id', (select articulo_id from public.v_stock where nombre = l ->> 0),
                                                   'cantidad', (l ->> 1)::numeric, 'precio_unitario', (l ->> 2)::numeric) order by n)
                 from jsonb_array_elements(p_lineas) with ordinality as e(l, n))));
end $$;
grant execute on function pg_temp.vender(text, text, text, text, jsonb) to authenticated;

-- Un valor del json de unas cifras guardadas bajo `p_k`.
create or replace function pg_temp.j(p_k text, p_ruta text[]) returns jsonb language sql as $$
  select r #> p_ruta from res where k = p_k
$$;
grant execute on function pg_temp.j(text, text[]) to authenticated;

-- `detail` del error que lanza una sentencia (NULL si no falla).
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
select has_function('cafe', 'kpis_periodo', array['date', 'date', 'text'], 'existe cafe.kpis_periodo');
select has_function('cafe', 'produccion_diaria', array['date', 'date', 'text'], 'existe cafe.produccion_diaria');
select has_function('cafe', 'ventas_diarias', array['date', 'date', 'text'], 'existe cafe.ventas_diarias');
select is(
  (select array_agg(p.prosecdef order by p.proname)
     from pg_proc p
    where p.oid in ('cafe.kpis_periodo(date,date,text)'::regprocedure, 'cafe.produccion_diaria(date,date,text)'::regprocedure,
                    'cafe.ventas_diarias(date,date,text)'::regprocedure, 'cafe.rango_panel(date,date,text)'::regprocedure,
                    'cafe.hoy_local()'::regprocedure)),
  array[false, false, false, false, false], 'ninguna es SECURITY DEFINER: el RLS de cada tabla sigue aplicando'
);
select is(
  (select array_agg(p.provolatile order by p.proname)
     from pg_proc p
    where p.oid in ('cafe.kpis_periodo(date,date,text)'::regprocedure, 'cafe.produccion_diaria(date,date,text)'::regprocedure,
                    'cafe.ventas_diarias(date,date,text)'::regprocedure)),
  array['s', 's', 's']::"char"[], 'kpis_periodo, produccion_diaria y ventas_diarias son STABLE'
);
select ok(
  not has_function_privilege('anon', 'cafe.kpis_periodo(date,date,text)', 'execute')
  and not has_function_privilege('anon', 'cafe.produccion_diaria(date,date,text)', 'execute')
  and not has_function_privilege('anon', 'cafe.ventas_diarias(date,date,text)', 'execute')
  and not has_function_privilege('anon', 'cafe.hoy_local()', 'execute')
  and has_function_privilege('authenticated', 'cafe.kpis_periodo(date,date,text)', 'execute'),
  'anon no ejecuta nada del panel; authenticated sí'
);
select is(cafe.linea_panel('marca_propia', array[]::cafe.tipo_proceso[]), 'marca_propia', 'línea del panel: marca propia');
select is(cafe.linea_panel('servicio', array['trilla']::cafe.tipo_proceso[]), 'trilla', 'línea del panel: solo trilla → trilla');
select is(cafe.linea_panel('servicio', array['trilla', 'tostion', 'empaque']::cafe.tipo_proceso[]), 'maquila',
  'línea del panel: trilla + maquila → maquila (no se cuenta dos veces)');
select is(cafe.linea_panel('servicio', array['tostion', 'molienda', 'empaque']::cafe.tipo_proceso[]), 'maquila', 'línea del panel: maquila');

-- 2. Datos del cliente A (como operativo) -------------------------------------------------------------------------------
select tests.autenticar_como('operativo-a@kpis.test');

select pg_temp.recibir('L1', '2026-03-09', 500, 8, array['trilla', 'tostion', 'molienda'], 'medio');
select pg_temp.recibir('L2', '2026-03-10', 200, 4, array['trilla']);
select pg_temp.recibir('L3', '2026-03-10', 100, 2, array['trilla'], null, 'ca2');
select pg_temp.recibir('L4', '2026-03-10', 50, 1, array['trilla']);
select pg_temp.recibir('L5', '2026-03-10', 60, 1, array['trilla']);
select pg_temp.recibir('E' || n, '2026-02-01', n * 10, 1, array['trilla'], null, 'extra' || n) from generate_series(1, 5) n;
select pg_temp.comprar('M1', '2026-03-09', 100, 2);
select pg_temp.comprar('M2', '2026-03-02', 100, 1);
select pg_temp.comprar('M3', '2026-03-10', 20, 1);

select pg_temp.reg('L1_trilla', 'L1', 'trilla', '{"fecha": "2026-03-09", "peso_salida_kg": 405}');
select pg_temp.reg('L1_tostion', 'L1', 'tostion', pg_temp.baches_ejemplo() || '{"fecha": "2026-03-10"}');
select pg_temp.reg('L1_molienda', 'L1', 'molienda', '{"fecha": "2026-03-10", "peso_salida_kg": 330}');
select pg_temp.reg('L1_empaque', 'L1', 'empaque', '{"fecha": "2026-03-10", "peso_salida_kg": 330}');
select pg_temp.reg('L2_trilla', 'L2', 'trilla', '{"fecha": "2026-03-10", "peso_salida_kg": 160}');
select pg_temp.reg('L3_trilla', 'L3', 'trilla', '{"fecha": "2026-03-10", "peso_salida_kg": 70}');
select pg_temp.reg('L4_trilla', 'L4', 'trilla', '{"fecha": "2026-03-10", "peso_salida_kg": 40}');
select pg_temp.reg('M1_tostion', 'M1', 'tostion', pg_temp.baches(100, 0.82) || '{"fecha": "2026-03-10", "nivel_tueste": "medio"}');
select pg_temp.reg('M3_tostion', 'M3', 'tostion', pg_temp.baches(20, 0.82) || '{"fecha": "2026-03-10", "nivel_tueste": "medio"}');
-- Empaque de M3: 32 × 500 g = 16 kg de los 16,4 que salieron de la tostión.
insert into res select 'M3_empaque', cafe.registrar_empaque(jsonb_build_object(
  'lote_id', pg_temp.lid('M3'), 'fecha', '2026-03-10', 'bultos', to_jsonb(pg_temp.barr('M3')),
  'lineas', jsonb_build_array(jsonb_build_object('presentacion_g', 500, 'unidades', 32))));

-- Ventas: 03-09 una de $23.000; 03-10 el ejemplo de $98.000, una cortesía y una venta de $50.000 que se anula.
select pg_temp.vender('V0', 'venta', '2026-03-09', 'cfa', '[["Consumo 500 g", 1, 23000]]');
select pg_temp.vender('V1', 'venta', '2026-03-10', 'cfa', '[["Consumo 500 g", 3, 23000], ["Excelso 500 g", 1, 29000]]');
select pg_temp.vender('C1', 'cortesia', '2026-03-10', 'cfa', '[["Excelso 500 g", 2, 0]]');
select pg_temp.vender('V2', 'venta', '2026-03-10', 'cfa', '[["Excelso 500 g", 2, 25000]]');

-- L2 queda entregado (remisión vigente): sale del inventario de terceros.
select cafe.generar_remision(jsonb_build_object('lote_id', pg_temp.lid('L2'), 'fecha', '2026-03-11'));

-- Correcciones del administrador: se anulan el proceso de L4, el lote L5 y la venta V2.
reset role;
select tests.autenticar_como('owner-a@kpis.test');
select cafe.anular_proceso((select (r ->> 'id')::uuid from res where k = 'L4_trilla'), 'Pesaje equivocado');
update cafe.lotes set anulado_at = now(), motivo_anulacion = 'Pesaje equivocado' where id = pg_temp.lid('L5');
select cafe.anular_venta((select (r ->> 'id')::uuid from res where k = 'V2'), 'Cliente se arrepintió');

-- 3. kpis_periodo del cliente A: todo el periodo, todas las líneas --------------------------------------------------------
insert into res select 'kA', cafe.kpis_periodo('2026-03-09', '2026-03-10');

select is(pg_temp.j('kA', '{desde}'), '"2026-03-09"'::jsonb, 'el periodo vuelve en la respuesta');
select is(pg_temp.j('kA', '{linea}'), 'null'::jsonb, 'sin línea: todo');
select is(jsonb_array_length(pg_temp.j('kA', '{recibido}')), 3, 'recibido trae una entrada por línea');
select is(pg_temp.j('kA', '{recibido,0}'), '{"linea": "marca_propia", "kg": 120, "lotes": 2}'::jsonb,
  'recibido marca propia: M1 + M3 = 120 kg (M2 es de otra fecha)');
select is(pg_temp.j('kA', '{recibido,1}'), '{"linea": "trilla", "kg": 350, "lotes": 3}'::jsonb,
  'recibido trilla: L2 + L3 + L4 = 350 kg (L5 está anulado)');
select is(pg_temp.j('kA', '{recibido,2}'), '{"linea": "maquila", "kg": 500, "lotes": 1}'::jsonb, 'recibido maquila: L1 = 500 kg');

select is(jsonb_array_length(pg_temp.j('kA', '{mermas}')), 4, 'mermas trae los cuatro tipos de proceso');
select is(pg_temp.j('kA', '{mermas,0,tipo}'), '"trilla"'::jsonb, 'el primero es la trilla');
select is(pg_temp.j('kA', '{mermas,0}') - 'tipo',
  '{"procesos": 3, "kg_entrada": 800, "kg_salida": 635, "merma_kg": 165, "merma_pct": 20.625, "desvios": 1}'::jsonb,
  'trilla: 500→405, 200→160 y 100→70 (el de L4 está anulado): 165 de 800 kg = 20,625 %, un desvío (L3)');
select is(pg_temp.j('kA', '{mermas,1}') - 'tipo',
  '{"procesos": 3, "kg_entrada": 525, "kg_salida": 430.4, "merma_kg": 94.6, "merma_pct": 18.019, "desvios": 0}'::jsonb,
  'tostión: 94,6 de 525 kg = 18,019 % PONDERADO (el promedio simple de los tres porcentajes daría 18,008)');
select is(pg_temp.j('kA', '{mermas,2}') - 'tipo',
  '{"procesos": 1, "kg_entrada": 332, "kg_salida": 330, "merma_kg": 2, "merma_pct": 0.602, "desvios": 0}'::jsonb, 'molienda: 2 de 332 kg');
select is(pg_temp.j('kA', '{mermas,3}') - 'tipo',
  '{"procesos": 2, "kg_entrada": 346.4, "kg_salida": 346, "merma_kg": 0.4, "merma_pct": 0.115, "desvios": 0}'::jsonb,
  'empaque: el de maquila (330→330) y el de marca propia (16,4→16): 0,4 de 346,4 kg');
select is(pg_temp.j('kA', '{desvios}'), '1'::jsonb, 'procesos con desvío: solo la trilla de L3 (30 % contra 19 ± 3)');

select is(pg_temp.j('kA', '{ingreso_marca_propia}'), '{"total": 121000, "ventas": 2, "cortesias": 1, "unidades_cortesia": 2}'::jsonb,
  'ingreso de marca propia: $23.000 + $98.000; la cortesía (2 unidades) no suma y la venta anulada de $50.000 tampoco');
select is(pg_temp.j('kA', '{ingreso_servicios,total}'), '2343000'::jsonb,
  'ingreso de servicios: $1.923.000 de L1 + $280.000 de L2 + $140.000 de L3 (el proceso anulado de L4 no cuenta)');
select is(pg_temp.j('kA', '{ingreso_servicios,por_linea}'),
  '[{"linea": "trilla", "valor": 420000}, {"linea": "maquila", "valor": 1923000}]'::jsonb,
  'ingreso de servicios por línea: trilla $420.000 y maquila $1.923.000 (la trilla de L1 es maquila)');

select is(pg_temp.j('kA', '{inventario_propio}'),
  '{"cafe_en_planta_kg": 182, "lotes_en_planta": 2, "producto_terminado_kg": 22.5}'::jsonb,
  'inventario propio: M1 tostado (82 kg) + M2 sin procesar (100 kg); lo empacado de M3 no cuenta como café en planta; producto terminado = (39 + 6) × 0,5 kg');
select is(pg_temp.j('kA', '{inventario_terceros,kg_en_planta}'), '600'::jsonb,
  'inventario de terceros: L1 330 + L3 70 + L4 50 + extras 150 (L2 está entregado, L5 anulado)');
select is(pg_temp.j('kA', '{inventario_terceros,lotes}'), '8'::jsonb, 'inventario de terceros: 8 lotes');
select is(pg_temp.j('kA', '{inventario_terceros,clientes}'), '7'::jsonb, 'inventario de terceros: 7 clientes');
select is(
  (pg_temp.j('kA', '{inventario_terceros,por_cliente}') #> '{0}') - 'tercero_id',
  '{"nombre": "Cliente A", "kg": 380, "lotes": 2}'::jsonb, 'el primer cliente: Cliente A, 380 kg en 2 lotes (L1 y L4)'
);
select is(
  (select jsonb_agg(c ->> 'nombre') from jsonb_array_elements(pg_temp.j('kA', '{inventario_terceros,por_cliente}')) c),
  '["Cliente A", "Cliente A2", "Extra 5", "Extra 4", "Extra 3"]'::jsonb, 'solo los cinco con más kilos, de mayor a menor'
);
select is(pg_temp.j('kA', '{insumos_bajo_minimo}'), '0'::jsonb, 'sin mínimos configurados no hay insumos bajo mínimo');

-- 4. Filtros por línea --------------------------------------------------------------------------------------------------
insert into res select 'kP', cafe.kpis_periodo('2026-03-09', '2026-03-10', 'marca_propia');
insert into res select 'kT', cafe.kpis_periodo('2026-03-09', '2026-03-10', 'trilla');
insert into res select 'kM', cafe.kpis_periodo('2026-03-09', '2026-03-10', 'maquila');

-- Marca propia: ni kg ni ingresos de servicios.
select is(pg_temp.j('kP', '{recibido}'), '[{"linea": "marca_propia", "kg": 120, "lotes": 2}]'::jsonb, 'marca propia: solo recibe lo propio');
select is(pg_temp.j('kP', '{ingreso_servicios}'), 'null'::jsonb, 'marca propia: sin ingreso de servicios');
select is(pg_temp.j('kP', '{inventario_terceros}'), 'null'::jsonb, 'marca propia: sin inventario de terceros');
select is(pg_temp.j('kP', '{ingreso_marca_propia,total}'), '121000'::jsonb, 'marca propia: el ingreso de las ventas');
select is(pg_temp.j('kP', '{inventario_propio,cafe_en_planta_kg}'), '182'::jsonb, 'marca propia: 182 kg de café en planta');
select is(pg_temp.j('kP', '{mermas,0,procesos}'), '0'::jsonb, 'marca propia: ninguna trilla');
select is(pg_temp.j('kP', '{mermas,0,merma_pct}'), 'null'::jsonb, 'sin procesos, la merma es null (no 0)');
select is(pg_temp.j('kP', '{mermas,1}') - 'tipo',
  '{"procesos": 2, "kg_entrada": 120, "kg_salida": 98.4, "merma_kg": 21.6, "merma_pct": 18.000, "desvios": 0}'::jsonb,
  'marca propia: tostión de M1 y M3 (18 %)');
select is(pg_temp.j('kP', '{mermas,3}') - 'tipo',
  '{"procesos": 1, "kg_entrada": 16.4, "kg_salida": 16, "merma_kg": 0.4, "merma_pct": 2.439, "desvios": 0}'::jsonb,
  'marca propia: empaque de M3 sin la maquila');

-- Trilla.
select is(pg_temp.j('kT', '{recibido}'), '[{"linea": "trilla", "kg": 350, "lotes": 3}]'::jsonb, 'trilla: solo recibe lo suyo');
select is(pg_temp.j('kT', '{ingreso_marca_propia}'), 'null'::jsonb, 'trilla: sin ingreso de marca propia');
select is(pg_temp.j('kT', '{inventario_propio}'), 'null'::jsonb, 'trilla: sin inventario propio');
select is(pg_temp.j('kT', '{mermas,0}') - 'tipo',
  '{"procesos": 2, "kg_entrada": 300, "kg_salida": 230, "merma_kg": 70, "merma_pct": 23.333, "desvios": 1}'::jsonb,
  'trilla: solo L2 y L3 (la trilla de L1 es maquila)');
select is(pg_temp.j('kT', '{mermas,1,procesos}'), '0'::jsonb, 'trilla: ninguna tostión');
select is(pg_temp.j('kT', '{ingreso_servicios}'), '{"total": 420000, "por_linea": [{"linea": "trilla", "valor": 420000}]}'::jsonb,
  'trilla: $420.000');
select is(pg_temp.j('kT', '{inventario_terceros,kg_en_planta}'), '270'::jsonb, 'trilla: L3 70 + L4 50 + extras 150 en planta');
select is(pg_temp.j('kT', '{inventario_terceros,lotes}'), '7'::jsonb, 'trilla: 7 lotes en planta');

-- Maquila: el ejemplo de la tarea dentro del dataset grande.
select is(pg_temp.j('kM', '{recibido}'), '[{"linea": "maquila", "kg": 500, "lotes": 1}]'::jsonb, 'maquila: 500 kg recibidos');
select is(pg_temp.j('kM', '{mermas,0}') - 'tipo',
  '{"procesos": 1, "kg_entrada": 500, "kg_salida": 405, "merma_kg": 95, "merma_pct": 19.000, "desvios": 0}'::jsonb, 'maquila: trilla 19 %');
select is(pg_temp.j('kM', '{mermas,1}') - 'tipo',
  '{"procesos": 1, "kg_entrada": 405, "kg_salida": 332, "merma_kg": 73, "merma_pct": 18.025, "desvios": 0}'::jsonb,
  'maquila: tostión 18,025 % (18,02 mostrado)');
select is(pg_temp.j('kM', '{ingreso_servicios}'), '{"total": 1923000, "por_linea": [{"linea": "maquila", "valor": 1923000}]}'::jsonb,
  'maquila: $1.923.000');
select is(pg_temp.j('kM', '{inventario_terceros,kg_en_planta}'), '330'::jsonb, 'maquila: 330 kg de L1 en planta');
select is(pg_temp.j('kM', '{inventario_terceros,clientes}'), '1'::jsonb, 'maquila: un cliente');

-- Los números coinciden con el resumen de ventas de CO-31 y con las series diarias.
select is(
  (cafe.resumen_ventas('2026-03-09', '2026-03-10') ->> 'total_ventas')::numeric, (pg_temp.j('kA', '{ingreso_marca_propia,total}') #>> '{}')::numeric,
  'el ingreso de marca propia es el «total vendido» de cafe.resumen_ventas'
);
select is(
  (cafe.resumen_ventas('2026-03-09', '2026-03-10') ->> 'unidades_cortesia')::numeric, 2::numeric, 'y las unidades de cortesía también'
);
-- Las cifras de los lotes recibidos coinciden con v_lotes (la hoja «Lotes» del Excel).
select is(
  (select sum(l.peso_recibido_kg) from cafe.v_lotes l
    where l.linea = 'servicio' and l.anulado_at is null and l.fecha_recepcion between '2026-03-09' and '2026-03-10'),
  (select sum((e ->> 'kg')::numeric) from jsonb_array_elements(pg_temp.j('kA', '{recibido}')) e where e ->> 'linea' in ('trilla', 'maquila')),
  'los kg recibidos de servicios coinciden con la suma de v_lotes'
);
-- El Excel del panel (CO-35: tipo=solo_trilla / tipo=maquila) filtra v_lotes con estas mismas condiciones: suman lo del panel.
select is(
  (select sum(l.peso_recibido_kg) from cafe.v_lotes l
    where l.linea = 'servicio' and l.servicios = array['trilla']::cafe.tipo_proceso[] and l.estado <> 'anulado'
      and l.fecha_recepcion between '2026-03-09' and '2026-03-10'),
  (pg_temp.j('kT', '{recibido,0,kg}') #>> '{}')::numeric,
  'tipo=solo_trilla del Excel (servicios = {trilla}) da los kg recibidos de la línea trilla'
);
select is(
  (select sum(l.peso_recibido_kg) from cafe.v_lotes l
    where l.linea = 'servicio' and l.servicios && array['tostion', 'molienda', 'empaque']::cafe.tipo_proceso[] and l.estado <> 'anulado'
      and l.fecha_recepcion between '2026-03-09' and '2026-03-10'),
  (pg_temp.j('kM', '{recibido,0,kg}') #>> '{}')::numeric,
  'tipo=maquila del Excel (servicios con tostión, molienda o empaque) da los kg recibidos de la línea maquila'
);
select is(
  (select sum(l.peso_actual_kg) from cafe.v_lotes l
    where l.linea = 'servicio' and l.estado not in ('entregado', 'anulado')),
  (pg_temp.j('kA', '{inventario_terceros,kg_en_planta}') #>> '{}')::numeric,
  'el inventario de terceros coincide con la suma de peso_actual_kg de v_lotes no entregados'
);

-- 5. produccion_diaria y ventas_diarias -----------------------------------------------------------------------------------
select is((select count(*) from cafe.produccion_diaria('2026-03-09', '2026-03-10')), 7::bigint,
  'una fila por día, línea y tipo de proceso: 1 el 09/03 y 6 el 10/03');
select is(
  (select row(fecha, linea, tipo, kg_entrada, kg_salida, merma_pct, valor)::text from cafe.produccion_diaria('2026-03-09', '2026-03-10') where fecha = '2026-03-09'),
  '(2026-03-09,maquila,trilla,500.000,405.000,19.000,700000.00)', 'el 09/03: la trilla de L1'
);
select is(
  (select array_agg(linea || ':' || tipo order by ordinality)
     from (select pd.linea, pd.tipo, row_number() over () as ordinality from cafe.produccion_diaria('2026-03-09', '2026-03-10') pd where pd.fecha = '2026-03-10') x),
  array['maquila:tostion', 'maquila:molienda', 'maquila:empaque', 'marca_propia:tostion', 'marca_propia:empaque', 'trilla:trilla'],
  'el 10/03, ordenado por línea y por orden de proceso'
);
select is(
  (select row(kg_entrada, kg_salida, merma_pct, valor)::text from cafe.produccion_diaria('2026-03-10', '2026-03-10') where linea = 'trilla'),
  '(300.000,230.000,23.333,420000.00)', 'la trilla del 10/03: L2 y L3 juntas (el proceso anulado de L4 no está)'
);
select is(
  (select row(kg_entrada, merma_pct, valor)::text from cafe.produccion_diaria('2026-03-10', '2026-03-10') where linea = 'marca_propia' and tipo = 'tostion'),
  '(120.000,18.000,0.00)', 'marca propia no cobra: valor 0'
);
select is(
  (select sum(kg_entrada) from cafe.produccion_diaria('2026-03-09', '2026-03-10') where tipo = 'trilla'),
  (pg_temp.j('kA', '{mermas,0,kg_entrada}') #>> '{}')::numeric, 'sumar la serie diaria da los kg de entrada de kpis_periodo'
);
select is(
  (select sum(valor) from cafe.produccion_diaria('2026-03-09', '2026-03-10') where linea <> 'marca_propia'),
  (pg_temp.j('kA', '{ingreso_servicios,total}') #>> '{}')::numeric, 'y el valor de los servicios'
);
select is((select count(*) from cafe.produccion_diaria('2026-03-09', '2026-03-10', 'marca_propia')), 2::bigint, 'el filtro por línea acota la serie');
select is((select count(*) from cafe.produccion_diaria('2026-03-09', '2026-03-09')), 1::bigint, 'un rango de un día');
select is((select count(*) from cafe.produccion_diaria('2026-03-11', '2026-03-12')), 0::bigint, 'sin procesos en el rango: sin filas');

select is((select count(*) from cafe.ventas_diarias('2026-03-09', '2026-03-10')), 2::bigint, 'ventas diarias: dos días con venta');
select is(
  (select row(fecha, total, n_ventas, unidades_cortesia)::text from cafe.ventas_diarias('2026-03-10', '2026-03-10')),
  '(2026-03-10,98000.00,1,2)', 'el 10/03: $98.000 en una venta (la anulada y la cortesía no suman) y 2 unidades de cortesía'
);
select is((select total from cafe.ventas_diarias('2026-03-09', '2026-03-09')), 23000::numeric, 'el 09/03: $23.000');
select is((select count(*) from cafe.ventas_diarias('2026-03-09', '2026-03-10', 'maquila')), 0::bigint, 'las ventas no existen en las líneas de servicio');

-- 6. Validaciones --------------------------------------------------------------------------------------------------------
select throws_ok($$select cafe.kpis_periodo('2026-03-10', '2026-03-09')$$, 'P0001', 'datos_invalidos', 'un rango invertido se rechaza');
select is(pg_temp.detalle($$select cafe.kpis_periodo('2026-03-10', '2026-03-09')$$), 'La fecha inicial es posterior a la final.',
  'y dice por qué');
select throws_ok($$select cafe.kpis_periodo('2026-03-09', '2026-03-10', 'cafe')$$, 'P0001', 'datos_invalidos', 'una línea desconocida se rechaza');
select throws_ok($$select cafe.kpis_periodo('2020-01-01', '2026-03-10')$$, 'P0001', 'datos_invalidos', 'más de dos años se rechaza');
select throws_ok($$select * from cafe.produccion_diaria('2026-03-10', '2026-03-09')$$, 'P0001', 'datos_invalidos', 'produccion_diaria valida igual');
select is(cafe.kpis_periodo('2026-03-10') ->> 'hasta', '2026-03-10', 'sin fecha final, el periodo es el día de la inicial');
select is(
  cafe.kpis_periodo() ->> 'desde', to_char(cafe.hoy_local(), 'YYYY-MM-DD'), 'sin fechas, el periodo es hoy en la zona del cliente'
);

-- 7. El ejemplo de la tarea: cliente B, hoy --------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('operativo-b@kpis.test');

select pg_temp.recibir('LB', pg_temp.hoy(), 500, 8, array['trilla', 'tostion', 'molienda'], 'medio', 'cb');
select pg_temp.reg('LB_trilla', 'LB', 'trilla', '{"peso_salida_kg": 405}');
select pg_temp.reg('LB_tostion', 'LB', 'tostion', pg_temp.baches_ejemplo());
select pg_temp.reg('LB_molienda', 'LB', 'molienda', '{"peso_salida_kg": 330}');
select pg_temp.reg('LB_empaque', 'LB', 'empaque', '{"peso_salida_kg": 330}');
select pg_temp.vender('VB', 'venta', pg_temp.hoy(), 'cfb', '[["Consumo 500 g", 3, 23000], ["Excelso 500 g", 1, 29000]]');
insert into res select 'kB1', cafe.kpis_periodo();

select is(pg_temp.j('kB1', '{desde}') #>> '{}', pg_temp.hoy(), 'sin fechas, el panel muestra hoy');
select is(pg_temp.j('kB1', '{recibido}'),
  '[{"linea": "marca_propia", "kg": 0, "lotes": 0}, {"linea": "trilla", "kg": 0, "lotes": 0}, {"linea": "maquila", "kg": 500, "lotes": 1}]'::jsonb,
  'recibido 500 kg, todos de servicios (y nada de lo que hay en el cliente A)');
select is(pg_temp.j('kB1', '{mermas,0,merma_pct}'), '19.000'::jsonb, 'merma de la trilla: 19 %');
select is(pg_temp.j('kB1', '{mermas,1,merma_pct}'), '18.025'::jsonb, 'merma de la tostión: 18,025 % (18,02 %)');
select is(pg_temp.j('kB1', '{ingreso_servicios,total}'), '1923000'::jsonb, 'ingreso de servicios: $1.923.000');
select is(pg_temp.j('kB1', '{ingreso_marca_propia}'), '{"total": 98000, "ventas": 1, "cortesias": 0, "unidades_cortesia": 0}'::jsonb,
  'ingreso de marca propia: $98.000');
select is(pg_temp.j('kB1', '{desvios}'), '0'::jsonb, 'sin procesos con desvío');
select is(pg_temp.j('kB1', '{inventario_terceros,kg_en_planta}'), '330'::jsonb, 'en planta quedan los 330 kg del cliente');

-- Una cortesía no cambia el ingreso.
select pg_temp.vender('CB', 'cortesia', pg_temp.hoy(), 'cfb', '[["Excelso 500 g", 2, 0]]');
insert into res select 'kB2', cafe.kpis_periodo();
select is(pg_temp.j('kB2', '{ingreso_marca_propia,total}'), pg_temp.j('kB1', '{ingreso_marca_propia,total}'), 'una cortesía no cambia el ingreso');
select is(pg_temp.j('kB2', '{ingreso_marca_propia}'), '{"total": 98000, "ventas": 1, "cortesias": 1, "unidades_cortesia": 2}'::jsonb,
  'se muestra aparte, en unidades');

-- Marca propia no muestra los servicios, y viceversa.
select is(pg_temp.j('kB2', '{recibido}') #> '{0}', '{"linea": "marca_propia", "kg": 0, "lotes": 0}'::jsonb, 'el cliente B no tiene café propio');
select is(cafe.kpis_periodo(null, null, 'marca_propia') -> 'ingreso_servicios', 'null'::jsonb, 'filtro marca propia: sin ingresos de servicios');
select is(cafe.kpis_periodo(null, null, 'maquila') -> 'ingreso_marca_propia', 'null'::jsonb, 'filtro maquila: sin ingresos de marca propia');
select is(
  jsonb_array_length(cafe.kpis_periodo(null, null, 'marca_propia') -> 'recibido'), 1, 'filtro marca propia: una sola línea en lo recibido'
);
select is(
  (select sum((e ->> 'kg')::numeric) from jsonb_array_elements(cafe.kpis_periodo(null, null, 'marca_propia') -> 'recibido') e), 0::numeric,
  'filtro marca propia: 0 kg recibidos (los 500 kg son de servicios)'
);

-- 8. Roles, módulos y aislamiento ----------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('viewer-a@kpis.test');
select is(
  (select r from res where k = 'kA') - 'hoy', cafe.kpis_periodo('2026-03-09', '2026-03-10') - 'hoy',
  'Gerencia (viewer) ve exactamente las mismas cifras que el administrador'
);
select is((select count(*) from cafe.produccion_diaria('2026-03-09', '2026-03-10')), 7::bigint, 'y la misma serie diaria');

reset role;
select tests.autenticar_como('owner-b@kpis.test');
select is(cafe.kpis_periodo('2026-03-09', '2026-03-10') -> 'recibido' #> '{2,kg}', '0'::jsonb, 'el cliente B no ve los lotes del cliente A');
select is((select count(*) from cafe.produccion_diaria('2026-03-09', '2026-03-10')), 0::bigint, 'ni sus procesos');
select is(cafe.kpis_periodo('2026-03-09', '2026-03-10') #> '{ingreso_marca_propia,total}', '0'::jsonb, 'ni sus ventas');
select is(cafe.kpis_periodo() #> '{inventario_terceros,kg_en_planta}', '330'::jsonb, 'cada cliente ve solo lo suyo en planta');

reset role;
select tests.autenticar_como('owner-c@kpis.test');
select throws_ok($$select cafe.kpis_periodo()$$, '42501', 'no_autorizado', 'sin el módulo cafe.dashboard, kpis_periodo da 42501');
select throws_ok($$select * from cafe.produccion_diaria()$$, '42501', 'no_autorizado', 'y produccion_diaria');
select throws_ok($$select * from cafe.ventas_diarias()$$, '42501', 'no_autorizado', 'y ventas_diarias');

reset role;
select tests.como_anon();
select throws_ok($$select cafe.kpis_periodo()$$, '42501', null, 'un anónimo no ejecuta kpis_periodo');
reset role;

-- 9. «Hoy» es la fecha de la zona del cliente, no la de UTC -------------------------------------------------------------
update public.tenants set zona_horaria = 'Pacific/Kiritimati' where id = (select id from ids where clave = 'a');
select tests.autenticar_como('owner-a@kpis.test');
select is(cafe.hoy_local(), (now() at time zone 'Pacific/Kiritimati')::date, 'hoy_local sigue la zona del cliente (UTC+14)');
select is(cafe.kpis_periodo() ->> 'hoy', to_char((now() at time zone 'Pacific/Kiritimati')::date, 'YYYY-MM-DD'), 'y kpis_periodo la devuelve');
reset role;
update public.tenants set zona_horaria = 'Pacific/Pago_Pago' where id = (select id from ids where clave = 'a');
select tests.autenticar_como('owner-a@kpis.test');
select is(cafe.hoy_local(), (now() at time zone 'Pacific/Pago_Pago')::date, 'hoy_local sigue la zona del cliente (UTC-11)');
select isnt(cafe.hoy_local(), (now() at time zone 'Pacific/Kiritimati')::date, 'y no es la misma fecha que en el otro extremo del mundo');
reset role;

select * from finish();
rollback;
