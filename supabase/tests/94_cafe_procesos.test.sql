-- Procesos del vertical café (FIN-108 · CO-27): cafe.procesos, cafe.proceso_bultos, cafe.baches, las funciones
-- pasos_del_lote / paso_previo / peso_disponible / sugerir_baches / registrar_proceso / anular_proceso y las vistas
-- v_lote_etapas / v_lotes / v_bultos_estado.
-- Cubre el ejemplo del informe (500 kg → trilla 405 → tostión 332 → molienda 330), el orden de los pasos, el proceso
-- parcial por bultos (Excelso de 6 bultos), el desvío, la congelación de tarifas, los baches, la anulación, los roles
-- y el aislamiento entre clientes.
-- Todo se crea AQUÍ dentro de la transacción (rollback al final): dos clientes de café (A y B), sin depender del seed.
--   p1 owner A   p2 admin A   p3 operativo A   p4 viewer A   p5 owner B
-- Los lotes se crean con las RPC reales (registrar_recepcion / registrar_compra), como operativo.
begin;

select plan(186);

-- 0. Preparación --------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000094a1', 'authenticated', 'authenticated', 'owner-a@procesos.test'),
  ('00000000-0000-0000-0000-0000000094a2', 'authenticated', 'authenticated', 'admin-a@procesos.test'),
  ('00000000-0000-0000-0000-0000000094a3', 'authenticated', 'authenticated', 'operativo-a@procesos.test'),
  ('00000000-0000-0000-0000-0000000094a4', 'authenticated', 'authenticated', 'viewer-a@procesos.test'),
  ('00000000-0000-0000-0000-0000000094a5', 'authenticated', 'authenticated', 'owner-b@procesos.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Procesos A', 'procesos-a-t', 'cafe');
select platform.crear_tenant('Procesos B', 'procesos-b-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'procesos-a-t'
union all select 'b', id from public.tenants where slug = 'procesos-b-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), m.rol::public.rol_tenant
  from (values
    ('00000000-0000-0000-0000-0000000094a1', 'a', 'owner'),
    ('00000000-0000-0000-0000-0000000094a2', 'a', 'admin'),
    ('00000000-0000-0000-0000-0000000094a3', 'a', 'operativo'),
    ('00000000-0000-0000-0000-0000000094a4', 'a', 'viewer'),
    ('00000000-0000-0000-0000-0000000094a5', 'b', 'owner')) as m(user_id, t, rol);

-- Terceros: ca (cliente de servicios de A), pa (proveedor de A), cb (cliente de servicios de B). Excelso de A.
with t as (
  insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles)
  select i.id, x.nombre, 'Calle 1', '3000000000', x.identificacion, x.roles
    from (values ('a', 'Cliente A',   '9400001', array['cliente_servicio']),
                 ('a', 'Proveedor A', '9400002', array['proveedor']),
                 ('b', 'Cliente B',   '9400003', array['cliente_servicio'])) as x(t, nombre, identificacion, roles)
    join ids i on i.clave = x.t
  returning identificacion, id
)
insert into ids select case identificacion when '9400001' then 'ca' when '9400002' then 'pa' else 'cb' end, id from t;
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

-- Ids de los bultos del lote `p_k` con esos números.
create or replace function pg_temp.barr(p_k text, p_nums integer[]) returns uuid[] language sql as $$
  select array_agg(b.id order by b.numero) from cafe.lote_bultos b where b.lote_id = pg_temp.lid(p_k) and b.numero = any(p_nums)
$$;
grant execute on function pg_temp.barr(text, integer[]) to authenticated;

-- Entrada de registrar_proceso: lote `p_k`, tipo, fecha de hoy, los bultos de `p_nums` (todos si es null) y `p_extra`.
create or replace function pg_temp.p(p_k text, p_tipo text, p_nums integer[] default null, p_extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('lote_id', pg_temp.lid(p_k), 'tipo', p_tipo, 'fecha', pg_temp.hoy(),
         'bultos', to_jsonb(pg_temp.barr(p_k, coalesce(p_nums, array(select generate_series(1, 200)))))) || p_extra
$$;
grant execute on function pg_temp.p(text, text, integer[], jsonb) to authenticated;

-- Registra un proceso y guarda el resultado bajo `p_res`.
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
select has_table('cafe', 'procesos', 'existe cafe.procesos');
select has_table('cafe', 'proceso_bultos', 'existe cafe.proceso_bultos');
select has_table('cafe', 'baches', 'existe cafe.baches');
select has_view('cafe', 'v_lotes', 'existe cafe.v_lotes');
select has_view('cafe', 'v_lote_etapas', 'existe cafe.v_lote_etapas');
select ok(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('cafe.procesos'::regclass, 'cafe.proceso_bultos'::regclass, 'cafe.baches'::regclass)),
  'las tres tablas tienen RLS activada'
);
select ok(
  (select bool_and(coalesce(c.reloptions, '{}') @> array['security_invoker=true'])
     from pg_class c
    where c.oid in ('cafe.v_lotes'::regclass, 'cafe.v_lote_etapas'::regclass, 'cafe.v_bultos_estado'::regclass,
                    'cafe.v_proceso_bultos_peso'::regclass)),
  'las vistas son security_invoker'
);
select ok(
  not has_table_privilege('authenticated', 'cafe.procesos', 'delete')
  and not has_table_privilege('service_role', 'cafe.procesos', 'delete')
  and not has_table_privilege('authenticated', 'cafe.baches', 'delete')
  and not has_table_privilege('authenticated', 'cafe.baches', 'update')
  and not has_table_privilege('authenticated', 'cafe.proceso_bultos', 'update'),
  'nadie borra procesos ni baches, los baches no se editan y los bultos de un proceso tampoco'
);
select ok(
  not has_table_privilege('anon', 'cafe.procesos', 'select') and not has_table_privilege('anon', 'cafe.v_lotes', 'select'),
  'anon no lee procesos ni vistas'
);
select ok(
  not has_column_privilege('authenticated', 'cafe.procesos', 'merma_kg', 'insert')
  and not has_column_privilege('authenticated', 'cafe.procesos', 'valor', 'insert')
  and not has_column_privilege('authenticated', 'cafe.procesos', 'desvio', 'insert')
  and not has_column_privilege('authenticated', 'cafe.procesos', 'anulado_at', 'insert')
  and not has_column_privilege('authenticated', 'cafe.procesos', 'peso_entrada_kg', 'update')
  and has_column_privilege('authenticated', 'cafe.procesos', 'anulado_at', 'update'),
  'lo calculado y la anulación no se insertan; de un proceso solo se anula o se anotan observaciones'
);
select is(
  (select array_agg(p.prosecdef order by p.proname)
     from pg_proc p
    where p.oid in ('cafe.registrar_proceso(jsonb)'::regprocedure, 'cafe.anular_proceso(uuid,text)'::regprocedure,
                    'cafe.peso_disponible(uuid,cafe.tipo_proceso,uuid[])'::regprocedure)),
  array[false, false, false], 'registrar_proceso, anular_proceso y peso_disponible son SECURITY INVOKER'
);
select ok(
  not has_function_privilege('anon', 'cafe.registrar_proceso(jsonb)', 'execute')
  and not has_function_privilege('anon', 'cafe.peso_disponible(uuid,cafe.tipo_proceso,uuid[])', 'execute')
  and not has_function_privilege('authenticated', 'cafe.procesos_proteger()', 'execute')
  and not has_function_privilege('authenticated', 'cafe.procesos_verificar_baches()', 'execute')
  and has_function_privilege('authenticated', 'cafe.registrar_proceso(jsonb)', 'execute'),
  'anon no ejecuta las funciones de procesos y las de los triggers no se llaman a mano'
);
select has_index('cafe', 'proceso_bultos', 'proceso_bultos_unico', 'un bulto pasa una vez por cada tipo de proceso');

-- 2. Baches sugeridos (misma regla que sugerirBaches() de TypeScript) ------------------------------------------------
select tests.autenticar_como('operativo-a@procesos.test');

select is(cafe.sugerir_baches(81), '{"capacidad_kg": 13.5, "num_baches": 6, "baches": [13.5, 13.5, 13.5, 13.5, 13.5, 13.5]}'::jsonb,
  '81 kg con capacidad 13,5 → 6 baches de 13,5');
select is(cafe.sugerir_baches(100) -> 'baches', '[12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5]'::jsonb,
  '100 kg → 8 baches de 12,5');
select is((cafe.sugerir_baches(405) ->> 'num_baches')::int, 30, '405 kg → 30 baches');
select is(cafe.sugerir_baches(13.5) -> 'baches', '[13.5]'::jsonb, 'justo la capacidad: un bache');
select is(cafe.sugerir_baches(14) -> 'baches', '[7, 7]'::jsonb, '14 kg → 2 baches de 7 (reparto igual)');
select is(cafe.sugerir_baches(0.5) -> 'baches', '[0.5]'::jsonb, 'menos que la capacidad: un bache con todo');
select is(
  (select sum(x::numeric) from jsonb_array_elements_text(cafe.sugerir_baches(100.001) -> 'baches') x), 100.001,
  'el reparto siempre suma el peso (el último bache absorbe el resto)'
);
select throws_ok($$select cafe.sugerir_baches(0)$$, 'P0001', 'datos_invalidos', 'peso cero: no se sugiere nada');
select throws_ok($$select cafe.sugerir_baches(null)$$, 'P0001', 'datos_invalidos', 'ni sin peso');

-- 3. El ejemplo del informe: 500 kg, 8 bultos, trilla + tostión + molienda ----------------------------------------------
select pg_temp.recibir('L1', 500, 8, array['trilla', 'tostion', 'molienda'], 'medio');
select pg_temp.recibir('L2', 100, 2, array['trilla', 'tostion'], 'bajo');

select is(cafe.pasos_del_lote(pg_temp.lid('L1')), array['trilla', 'tostion', 'molienda', 'empaque']::cafe.tipo_proceso[],
  'pasos del lote de servicio: los contratados (la tostión añade el empaque)');
select is(
  (select array_agg(cafe.paso_previo(pg_temp.lid('L1'), t) order by cafe.orden_proceso(t))
     from unnest(enum_range(null::cafe.tipo_proceso)) t),
  array[null, 'trilla', 'tostion', 'molienda']::cafe.tipo_proceso[],
  'paso previo de un servicio completo: nada, trilla, tostión, molienda'
);
select is(cafe.paso_previo(pg_temp.lid('L2'), 'empaque'), 'tostion'::cafe.tipo_proceso,
  'sin molienda contratada, el empaque sigue a la tostión');
select is(cafe.paso_previo(pg_temp.lid('L2'), 'molienda'), 'tostion'::cafe.tipo_proceso, 'paso_previo no valida si el paso existe');

select is(
  (select row(estado, avance_texto, peso_actual_kg, merma_total_kg, valor_servicios, tiene_desvio)::text
     from cafe.v_lotes where id = pg_temp.lid('L1')),
  row('recibido', '0 de 4', 500.000::numeric, 0.000::numeric, 0.00::numeric, false)::text,
  'un lote recién recibido: recibido, 0 de 4, 500 kg en planta'
);
select is(
  (select row(tercero_nombre, tipo_cafe_nombre, linea, num_bultos, servicios_requeridos)::text from cafe.v_lotes where id = pg_temp.lid('L1')),
  row('Cliente A', null, 'servicio'::cafe.linea_lote, 8::smallint, array['trilla', 'tostion', 'molienda', 'empaque']::cafe.tipo_proceso[])::text,
  'v_lotes trae el tercero y los pasos requeridos'
);

-- Orden y servicios.
select throws_ok(
  format($$select cafe.registrar_proceso(pg_temp.p('L1', 'tostion', null, pg_temp.baches(500, 0.8)))$$),
  'P0001', 'orden_proceso_invalido', 'tostión antes de la trilla contratada: orden_proceso_invalido'
);
select is(
  pg_temp.detalle($$select cafe.registrar_proceso(pg_temp.p('L1', 'tostion', null, pg_temp.baches(500, 0.8)))$$),
  'Primero registra la trilla de estos bultos (1, 2, 3, 4, 5, 6, 7, 8).',
  'el mensaje dice qué falta y en qué bultos'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('L2', 'molienda', null, '{"peso_salida_kg": 50}'))$$,
  'P0001', 'servicio_no_contratado', 'molienda no contratada: servicio_no_contratado'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('L1', 'trilla', null, '{"peso_entrada_kg": 600, "peso_salida_kg": 405}'))$$,
  'P0001', 'peso_supera_disponible', 'una entrada que supera en más de 0,5 % el peso disponible: peso_supera_disponible'
);
select is(cafe.peso_disponible(pg_temp.lid('L1'), 'trilla', pg_temp.barr('L1', array[1, 2, 3, 4, 5, 6, 7, 8])), 500.000,
  'sin paso previo el peso disponible es el de los bultos');
select is(cafe.peso_disponible(pg_temp.lid('L1'), 'tostion', pg_temp.barr('L1', array[1, 2, 3, 4, 5, 6, 7, 8])), null::numeric,
  'sin la trilla hecha, la tostión no tiene peso disponible');

-- Trilla de los 8 bultos: entrada = 500 (sin enviarla), salida 405.
select pg_temp.reg('L1_trilla', 'L1', 'trilla', null, '{"peso_salida_kg": 405}');
select is(
  (select row(r ->> 'merma_kg', r ->> 'merma_pct', r ->> 'valor', r ->> 'desvio', r ->> 'lote_estado', r ->> 'avance_texto', r ->> 'peso_entrada_kg')::text
     from res where k = 'L1_trilla'),
  row('95.000', '19.000', '700000.00', 'false', 'en_proceso', '1 de 4', '500.000')::text,
  'trilla 500 → 405 kg: merma 95 kg (19 %), valor $700.000, sin desvío, lote en proceso 1 de 4'
);
select is(
  (select row(p.tarifa_kg, p.merma_referencia_pct, p.tolerancia_pts, p.nivel_tueste, p.fecha)::text
     from cafe.procesos p where p.id = (select (r ->> 'id')::uuid from res where k = 'L1_trilla')),
  row(1400.00::numeric, 19.000::numeric, 3.000::numeric, null::cafe.nivel_tueste, current_date)::text,
  'se guardan la tarifa vigente (1.400), la merma de referencia (19) y la tolerancia (3) como snapshot'
);
select is(cafe.peso_disponible(pg_temp.lid('L1'), 'tostion', pg_temp.barr('L1', array[1, 2, 3, 4, 5, 6, 7, 8])), 405.000,
  'el peso final de la trilla (405) pasa como peso inicial de la tostión');
select is(
  (select row(estado, avance_texto, peso_actual_kg, merma_total_kg, merma_total_pct, valor_servicios)::text from cafe.v_lotes where id = pg_temp.lid('L1')),
  row('en_proceso', '1 de 4', 405.000::numeric, 95.000::numeric, 19.000::numeric, 700000.00::numeric)::text,
  'v_lotes tras la trilla: quedan 405 kg, merma total 19 %'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('L1', 'trilla', null, '{"peso_salida_kg": 400}'))$$,
  'P0001', 'bulto_ya_procesado', 'los 8 bultos ya pasaron por la trilla: bulto_ya_procesado'
);

-- Tostión: entrada null → 405 automáticamente; 30 baches de 13,5 que sacan 332 kg.
select pg_temp.reg('L1_tostion', 'L1', 'tostion', null, jsonb_build_object('baches', (
  select jsonb_agg(jsonb_build_object('peso_entrada_kg', 13.5, 'peso_salida_kg', case when g <= 26 then 11 else 11.5 end,
                                      'temperatura_c', case when g = 1 then 210 end, 'observaciones', case when g = 1 then 'Primer bache' end)
                   order by g)
    from generate_series(1, 30) g)));
select is(
  (select row(r ->> 'peso_entrada_kg', r ->> 'merma_kg', r ->> 'merma_pct', r ->> 'valor', r ->> 'desvio', r ->> 'tarifa_kg', r ->> 'lote_estado', r ->> 'avance_texto')::text
     from res where k = 'L1_tostion'),
  row('405.000', '73.000', '18.025', '891000.00', 'false', '2200.00', 'en_proceso', '2 de 4')::text,
  'tostión: entrada 405 (la salida de la trilla), 30 baches → 332 kg: merma 18,025 %, valor $891.000, sin desvío'
);
select is(
  (select round(p.merma_kg / p.peso_entrada_kg * 100, 2)
     from cafe.procesos p where p.id = (select (r ->> 'id')::uuid from res where k = 'L1_tostion')),
  18.02, 'la merma de la tostión es 18,02 % a dos decimales'
);
select is(
  (select row(p.nivel_tueste, p.peso_salida_kg, p.merma_referencia_pct, p.tolerancia_pts)::text
     from cafe.procesos p where p.id = (select (r ->> 'id')::uuid from res where k = 'L1_tostion')),
  row('medio'::cafe.nivel_tueste, 332.000::numeric, 18.000::numeric, 3.000::numeric)::text,
  'la tostión toma el nivel de tueste del lote (medio) y la referencia de 18 %'
);
select is(
  (select row(count(*), sum(b.peso_entrada_kg), sum(b.peso_salida_kg), min(b.numero), max(b.numero), count(*) filter (where b.temperatura_c = 210))::text
     from cafe.baches b where b.proceso_id = (select (r ->> 'id')::uuid from res where k = 'L1_tostion')),
  row(30, 405.000::numeric, 332.000::numeric, 1::smallint, 30::smallint, 1)::text,
  '30 baches numerados 1..30, que suman 405 y 332 kg, con la temperatura del primero'
);
select is(
  (select b.merma_pct from cafe.baches b where b.proceso_id = (select (r ->> 'id')::uuid from res where k = 'L1_tostion') and b.numero = 1),
  18.519, 'cada bache calcula su merma (13,5 → 11: 18,519 %)'
);

-- Molienda: toma los 332 kg de la tostión.
select pg_temp.reg('L1_molienda', 'L1', 'molienda', null, '{"peso_salida_kg": 330}');
select is(
  (select row(r ->> 'peso_entrada_kg', r ->> 'merma_pct', r ->> 'valor', r ->> 'desvio', r ->> 'lote_estado', r ->> 'avance_texto')::text
     from res where k = 'L1_molienda'),
  row('332.000', '0.602', '332000.00', 'false', 'en_proceso', '3 de 4')::text,
  'molienda 332 → 330 kg: valor $332.000 (a $1.000/kg), 3 de 4'
);
select is(
  (select p.merma_referencia_pct from cafe.procesos p where p.id = (select (r ->> 'id')::uuid from res where k = 'L1_molienda')),
  null::numeric, 'la molienda no tiene merma de referencia (decisión 3 de CO-20)'
);

-- Empaque de maquila (sin insumos): cierra el servicio.
select pg_temp.reg('L1_empaque', 'L1', 'empaque', null, '{"peso_salida_kg": 330}');
select is(
  (select row(r ->> 'peso_entrada_kg', r ->> 'valor', r ->> 'tarifa_kg', r ->> 'lote_estado', r ->> 'avance_texto')::text from res where k = 'L1_empaque'),
  row('330.000', '0.00', '0.00', 'listo', '4 de 4')::text,
  'empaque de maquila: sin tarifa, y el lote queda listo (4 de 4)'
);
select is(
  (select row(estado, avance_texto, peso_actual_kg, merma_total_kg, merma_total_pct, valor_servicios, tiene_desvio)::text
     from cafe.v_lotes where id = pg_temp.lid('L1')),
  row('listo', '4 de 4', 330.000::numeric, 170.000::numeric, 34.000::numeric, 1923000.00::numeric, false)::text,
  'v_lotes del ejemplo: 330 kg en planta, merma total 34 %, servicios $1.923.000'
);
select is(
  (select jsonb_object_agg(e.tipo, jsonb_build_array(e.peso_entrada, e.peso_salida, e.merma_pct, e.valor, e.completo))
     from cafe.v_lote_etapas e where e.lote_id = pg_temp.lid('L1')),
  '{"trilla": [500.000, 405.000, 19.000, 700000.00, true], "tostion": [405.000, 332.000, 18.025, 891000.00, true],
    "molienda": [332.000, 330.000, 0.602, 332000.00, true], "empaque": [330.000, 330.000, 0.000, 0.00, true]}'::jsonb,
  'v_lote_etapas: 500 → 405 → 332 → 330 kg con sus mermas y valores'
);
select is(
  (select row(bultos_total, bultos_procesados, completo, parcial, num_procesos, desvios, ultima_fecha)::text
     from cafe.v_lote_etapas where lote_id = pg_temp.lid('L1') and tipo = 'tostion'),
  row(8, 8, true, false, 1, 0, current_date)::text, 'etapa de tostión completa: 8/8 bultos'
);
select is(
  (select array_agg(row(numero, peso_actual_kg, ultimo_tipo)::text order by numero) from cafe.v_bultos_estado where lote_id = pg_temp.lid('L1') and numero <= 2),
  array[row(1::smallint, 41.250::numeric, 'empaque'::cafe.tipo_proceso)::text, row(2::smallint, 41.250::numeric, 'empaque'::cafe.tipo_proceso)::text],
  'v_bultos_estado: cada bulto conserva su parte (330 × 62,5 / 500 = 41,25 kg) y su último paso'
);
select is(
  (select pasos from cafe.v_bultos_estado where lote_id = pg_temp.lid('L1') and numero = 1),
  array['trilla', 'tostion', 'molienda', 'empaque']::cafe.tipo_proceso[], 'y por qué pasos pasó'
);

-- 4. Trilla + tostión (L2): nivel de tueste del lote, o el que se indique --------------------------------------------------
select pg_temp.reg('L2_trilla', 'L2', 'trilla', null, '{"peso_salida_kg": 80}');
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('L2', 'tostion', null, '{"baches": []}'))$$,
  'P0001', 'baches_no_cuadran', 'la tostión sin baches: baches_no_cuadran'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('L2', 'tostion', null, '{"baches": null}'))$$,
  'P0001', 'baches_no_cuadran', 'ni con baches null'
);
select pg_temp.reg('L2_tostion', 'L2', 'tostion', array[1], pg_temp.baches(40, 0.82));
select is(
  (select p.nivel_tueste from cafe.procesos p where p.id = (select (r ->> 'id')::uuid from res where k = 'L2_tostion')),
  'bajo'::cafe.nivel_tueste, 'sin nivel de tueste en la entrada se usa el del lote (bajo)'
);
select is(
  (select row(r ->> 'peso_entrada_kg', r ->> 'peso_salida_kg', r ->> 'lote_estado', r ->> 'avance_texto')::text from res where k = 'L2_tostion'),
  row('40.000', '32.800', 'parcial', '1 de 3')::text,
  'tostión del bulto 1 de 2 (40 kg → 32,8): lote parcial, trilla completa (1 de 3)'
);
select is(
  pg_temp.detalle($$select cafe.registrar_proceso(pg_temp.p('L2', 'tostion', array[1]))$$) is not null, true,
  'repetir un bulto da error'
);

-- 5. Marca propia: Excelso de 6 bultos tostado por partes -----------------------------------------------------------------
select pg_temp.comprar('M1', 375, 6);
select pg_temp.comprar('M2', 375, 6);

select is(cafe.pasos_del_lote(pg_temp.lid('M1')), array['tostion', 'molienda', 'empaque']::cafe.tipo_proceso[],
  'marca propia: tostión, molienda (opcional) y empaque');
select is(
  (select row(estado, avance_texto, servicios_requeridos, tipo_cafe_nombre, tercero_nombre)::text from cafe.v_lotes where id = pg_temp.lid('M1')),
  row('recibido', '0 de 2', array['tostion', 'empaque']::cafe.tipo_proceso[], 'Excelso', 'Proveedor A')::text,
  'v_lotes de marca propia: requeridos tostión + empaque (0 de 2)'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('M1', 'trilla', null, '{"peso_salida_kg": 300}'))$$,
  'P0001', 'marca_propia_sin_trilla', 'trilla en marca propia: marca_propia_sin_trilla'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('M1', 'empaque', null, '{"peso_salida_kg": 300}'))$$,
  'P0001', 'usar_registrar_empaque', 'el empaque de marca propia no se registra aquí: usar_registrar_empaque'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('M1', 'molienda', array[1, 2], '{"peso_salida_kg": 100}'))$$,
  'P0001', 'orden_proceso_invalido', 'molienda antes de la tostión: orden_proceso_invalido'
);
select is(
  pg_temp.detalle($$select cafe.registrar_proceso(pg_temp.p('M1', 'molienda', array[1, 2], '{"peso_salida_kg": 100}'))$$),
  'Primero registra la tostión de estos bultos (1, 2).', 'con el mensaje de qué paso falta'
);
select throws_ok(
  format($$select cafe.registrar_proceso(pg_temp.p('M1', 'tostion', array[1, 2], pg_temp.baches(125, 0.8)))$$),
  'P0001', 'falta_nivel_tueste', 'la tostión de marca propia exige nivel de tueste'
);

-- Tostión de 2 de los 6 bultos.
select pg_temp.reg('M1_t12', 'M1', 'tostion', array[1, 2], pg_temp.baches(125, 0.8) || '{"nivel_tueste": "medio"}');
select is(
  (select row(r ->> 'peso_entrada_kg', r ->> 'peso_salida_kg', r ->> 'merma_pct', r ->> 'desvio', r ->> 'valor', r ->> 'tarifa_kg', r ->> 'lote_estado', r ->> 'avance_texto')::text
     from res where k = 'M1_t12'),
  row('125.000', '100.000', '20.000', 'false', '0.00', '0.00', 'parcial', '0 de 2')::text,
  'tostión de 2 bultos (125 → 100 kg): merma 20 %, sin tarifa (marca propia), lote parcial'
);
select is(
  (select jsonb_build_array(bultos_total, bultos_procesados, completo, parcial)
     from cafe.v_lote_etapas where lote_id = pg_temp.lid('M1') and tipo = 'tostion'),
  '[6, 2, false, true]'::jsonb, 'v_lote_etapas: tostión 2/6, parcial'
);
select is((select estado from cafe.v_lotes where id = pg_temp.lid('M1')), 'parcial', 'v_lotes.estado = parcial');
select is(
  (select row(peso_actual_kg, merma_total_kg)::text from cafe.v_lotes where id = pg_temp.lid('M1')),
  row(350.000::numeric, 25.000::numeric)::text, 'en planta: 250 kg sin procesar + 100 kg tostados = 350; merma total 25 kg'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('M1', 'tostion', array[1], pg_temp.baches(62.5, 0.8) || '{"nivel_tueste": "medio"}'))$$,
  'P0001', 'bulto_ya_procesado', 'repetir un bulto ya tostado: bulto_ya_procesado'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('M1', 'tostion', array[2, 3], pg_temp.baches(125, 0.8) || '{"nivel_tueste": "medio"}'))$$,
  'P0001', 'bulto_ya_procesado', 'ni uno solo de ellos dentro de otra selección'
);
select is(
  pg_temp.detalle($$select cafe.registrar_proceso(pg_temp.p('M1', 'tostion', array[2, 3], pg_temp.baches(125, 0.8) || '{"nivel_tueste": "medio"}'))$$),
  'Los bultos 2 ya pasaron por este proceso.', 'con el número del bulto repetido'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('M1', 'tostion', array[]::integer[], pg_temp.baches(62.5, 0.8) || '{"nivel_tueste": "medio"}'))$$,
  'P0001', 'bulto_invalido', 'sin elegir bultos en un lote de varios: bulto_invalido'
);
select throws_ok(
  $$select cafe.registrar_proceso(jsonb_build_object('lote_id', pg_temp.lid('M1'), 'tipo', 'tostion', 'fecha', pg_temp.hoy(),
      'bultos', to_jsonb(pg_temp.barr('L1', array[1])), 'nivel_tueste', 'medio') || pg_temp.baches(62.5, 0.8))$$,
  'P0001', 'bulto_invalido', 'un bulto de otro lote: bulto_invalido'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('M1', 'tostion', array[3, 4, 5, 6], jsonb_build_object('peso_entrada_kg', 252, 'nivel_tueste', 'medio') || pg_temp.baches(252, 0.8)))$$,
  'P0001', 'peso_supera_disponible', 'entrada 252 con 250 disponibles (> 0,5 %): peso_supera_disponible'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('M1', 'molienda', array[3], '{"peso_salida_kg": 50}'))$$,
  'P0001', 'orden_proceso_invalido', 'moler un bulto que no se ha tostado: orden_proceso_invalido'
);

-- Proceso parcial de la molienda: parte proporcional de la salida de la tostión en que estuvo el bulto.
select is(cafe.peso_disponible(pg_temp.lid('M1'), 'molienda', pg_temp.barr('M1', array[1])), 50.000,
  'peso disponible para moler el bulto 1: 100 kg × 62,5 / 125 = 50 kg');
select is(cafe.peso_disponible(pg_temp.lid('M1'), 'molienda', pg_temp.barr('M1', array[1, 2])), 100.000,
  'los dos bultos tostados: los 100 kg');
select is(cafe.peso_disponible(pg_temp.lid('M1'), 'molienda', pg_temp.barr('M1', array[1, 3])), null::numeric,
  'con un bulto sin tostar no se puede calcular (NULL)');
select pg_temp.reg('M1_m1', 'M1', 'molienda', array[1], '{"peso_salida_kg": 49}');
select is(
  (select row(r ->> 'peso_entrada_kg', r ->> 'merma_pct', r ->> 'valor', r ->> 'lote_estado', r ->> 'avance_texto')::text from res where k = 'M1_m1'),
  row('50.000', '2.000', '0.00', 'parcial', '0 de 3')::text,
  'molienda del bulto 1: entra 50 kg; la molienda hecha pasa a ser un paso requerido (0 de 3)'
);
select is(
  (select servicios_requeridos from cafe.v_lotes where id = pg_temp.lid('M1')),
  array['tostion', 'molienda', 'empaque']::cafe.tipo_proceso[], 'con una molienda hecha, la marca propia exige tostión + molienda + empaque'
);

-- Resto de la tostión: 4 bultos en otro día.
select pg_temp.reg('M1_t3456', 'M1', 'tostion', array[3, 4, 5, 6], pg_temp.baches(250, 0.8) || '{"nivel_tueste": "alto"}');
select is(
  (select row(r ->> 'peso_entrada_kg', r ->> 'lote_estado', r ->> 'avance_texto')::text from res where k = 'M1_t3456'),
  row('250.000', 'parcial', '1 de 3')::text,
  'los 4 bultos restantes entran con su parte de peso (250 kg): la etapa de tostión queda completa (1 de 3) y el lote sigue parcial por la molienda'
);
select is(
  (select jsonb_build_array(bultos_total, bultos_procesados, completo, parcial, num_procesos, peso_entrada)
     from cafe.v_lote_etapas where lote_id = pg_temp.lid('M1') and tipo = 'tostion'),
  '[6, 6, true, false, 2, 375.000]'::jsonb, 'v_lote_etapas: tostión 6/6, completa, de 2 procesos (375 kg de entrada)'
);
select is(
  (select e.merma_pct from cafe.v_lote_etapas e where e.lote_id = pg_temp.lid('M1') and e.tipo = 'tostion'),
  (select round(sum(p.merma_kg) / sum(p.peso_entrada_kg) * 100, 3) from cafe.procesos p
    where p.lote_id = pg_temp.lid('M1') and p.tipo = 'tostion' and p.anulado_at is null),
  'la merma de la etapa es la ponderada: sum(merma) / sum(entrada), no el promedio de los porcentajes'
);
select is(cafe.paso_previo(pg_temp.lid('M1'), 'empaque', (pg_temp.barr('M1', array[1]))[1]), 'molienda'::cafe.tipo_proceso,
  'marca propia: el empaque de un bulto molido sigue a la molienda');
select is(cafe.paso_previo(pg_temp.lid('M1'), 'empaque', (pg_temp.barr('M1', array[2]))[1]), 'tostion'::cafe.tipo_proceso,
  'y el de un bulto sin moler, a la tostión');

-- M2: tostión en dos partes y empaque (por la función común) → listo.
select pg_temp.reg('M2_a', 'M2', 'tostion', array[1, 2, 3], pg_temp.baches(187.5, 0.8) || '{"nivel_tueste": "medio"}');
select is((select estado from cafe.v_lotes where id = pg_temp.lid('M2')), 'parcial', 'M2 tras 3 de 6 bultos: parcial');
select pg_temp.reg('M2_b', 'M2', 'tostion', array[4, 5, 6], pg_temp.baches(187.5, 0.8) || '{"nivel_tueste": "medio"}');
select is(
  (select row(estado, avance_texto)::text from cafe.v_lotes where id = pg_temp.lid('M2')),
  row('en_proceso', '1 de 2')::text, 'tostada toda la tanda: en proceso, 1 de 2 (falta el empaque)'
);
select lives_ok(
  $$select cafe._insertar_proceso(pg_temp.lid('M2'), 'empaque', current_date, pg_temp.barr('M2', array[1, 2, 3, 4, 5, 6]),
        null, cafe.peso_disponible(pg_temp.lid('M2'), 'empaque', pg_temp.barr('M2', array[1, 2, 3, 4, 5, 6])) - 1, null, null, null)$$,
  'la función común registra el empaque de marca propia (la usará registrar_empaque, CO-30)'
);
select is(
  (select row(estado, avance_texto, valor_servicios)::text from cafe.v_lotes where id = pg_temp.lid('M2')),
  row('listo', '2 de 2', 0.00::numeric)::text,
  'tostión + empaque completos: el lote de marca propia queda listo (2 de 2), sin valor de servicios'
);
select is(
  (select peso_actual_kg from cafe.v_lotes where id = pg_temp.lid('M2')),
  (select p.peso_salida_kg::numeric(12,3) from cafe.procesos p where p.lote_id = pg_temp.lid('M2') and p.tipo = 'empaque'),
  'lo que queda en planta es la salida del último paso (el empaque)'
);

-- 6. Desvío: marca, no bloquea ----------------------------------------------------------------------------------------------
select pg_temp.recibir('L3', 100, 2, array['trilla']);
select pg_temp.reg('L3_b1', 'L3', 'trilla', array[1], '{"peso_salida_kg": 39}');
select is(
  (select row(r ->> 'merma_pct', r ->> 'desvio')::text from res where k = 'L3_b1'),
  row('22.000', 'false')::text, 'merma de 22 % con referencia 19 y tolerancia 3: justo en el límite, sin desvío'
);
select lives_ok($$select pg_temp.reg('L3_b2', 'L3', 'trilla', array[2], '{"peso_salida_kg": 37.5}')$$, 'una merma desviada se guarda igual');
select is(
  (select row(r ->> 'merma_pct', r ->> 'desvio', r ->> 'valor')::text from res where k = 'L3_b2'),
  row('25.000', 'true', '70000.00')::text, 'merma de 25 % (referencia 19 ± 3): desvio = true, valor $70.000'
);
select is(
  (select desvio from cafe.procesos where id = (select (r ->> 'id')::uuid from res where k = 'L3_b2')), true,
  'y el proceso queda marcado en la tabla'
);
select is(
  (select row(desvios, num_procesos, bultos_procesados, completo, merma_pct)::text from cafe.v_lote_etapas where lote_id = pg_temp.lid('L3') and tipo = 'trilla'),
  row(1, 2, 2, true, 23.500::numeric)::text, 'v_lote_etapas cuenta 1 desvío en la trilla (2 procesos, merma ponderada 23,5 %)'
);
select is(
  (select row(estado, tiene_desvio)::text from cafe.v_lotes where id = pg_temp.lid('L3')),
  row('listo', true)::text, 'v_lotes: la trilla es lo único contratado, así que el lote está listo, con aviso de desvío'
);

-- Tolerancia del cliente: se congela en cada proceso.
reset role;
insert into public.parametros (tenant_id, clave, valor)
select id, 'cafe.merma_tolerancia_pts', to_jsonb(1::numeric) from ids where clave = 'a';
select tests.autenticar_como('operativo-a@procesos.test');
select pg_temp.recibir('L4', 40, 1, array['trilla']);
select pg_temp.reg('L4_t', 'L4', 'trilla', null, '{"peso_salida_kg": 31.6}');
select is(
  (select row(r ->> 'merma_pct', r ->> 'desvio')::text from res where k = 'L4_t'),
  row('21.000', 'true')::text, 'con tolerancia 1 del cliente, una merma de 21 % (referencia 19) es desvío'
);
select is(
  (select p.tolerancia_pts from cafe.procesos p where p.id = (select (r ->> 'id')::uuid from res where k = 'L4_t')),
  1.000, 'y la tolerancia usada queda guardada en el proceso'
);
reset role;
delete from public.parametros where tenant_id = (select id from ids where clave = 'a') and clave = 'cafe.merma_tolerancia_pts';

-- La capacidad de la tostadora es un parámetro del cliente.
update public.parametros set valor = to_jsonb(10::numeric)
 where tenant_id = (select id from ids where clave = 'a') and clave = 'cafe.capacidad_tostadora_kg';
select tests.autenticar_como('operativo-a@procesos.test');
select is(
  (select jsonb_build_array(r -> 'capacidad_kg', r -> 'num_baches', r -> 'baches' -> 0) from (select cafe.sugerir_baches(81) as r) x),
  '[10, 9, 9]'::jsonb, 'con capacidad 10 kg, 81 kg → 9 baches de 9'
);
reset role;
update public.parametros set valor = to_jsonb(13.5::numeric)
 where tenant_id = (select id from ids where clave = 'a') and clave = 'cafe.capacidad_tostadora_kg';
select tests.autenticar_como('operativo-a@procesos.test');

-- 7. Congelación de tarifas -------------------------------------------------------------------------------------------------------
select pg_temp.recibir('L5', 100, 2, array['trilla']);
select pg_temp.reg('L5_antes', 'L5', 'trilla', array[1], '{"peso_salida_kg": 40.5}');
reset role;
insert into public.tarifas (tenant_id, concepto, valor, unidad, vigente_desde)
select id, 'cafe.trilla', 1500, 'kg', now() + interval '1 day' from ids where clave = 'a';
select tests.autenticar_como('operativo-a@procesos.test');
select pg_temp.reg('L5_despues', 'L5', 'trilla', array[2], jsonb_build_object('peso_salida_kg', 40.5, 'fecha', to_char(current_date + 2, 'YYYY-MM-DD')));
select is(
  (select row(r ->> 'tarifa_kg', r ->> 'valor')::text from res where k = 'L5_antes'),
  row('1400.00', '70000.00')::text, 'proceso anterior al cambio de tarifa: $1.400 × 50 kg = $70.000'
);
select is(
  (select row(r ->> 'tarifa_kg', r ->> 'valor')::text from res where k = 'L5_despues'),
  row('1500.00', '75000.00')::text, 'un proceso con fecha posterior al cambio usa la tarifa nueva: $1.500 × 50 kg'
);
select is(
  (select p.valor from cafe.procesos p where p.id = (select (r ->> 'id')::uuid from res where k = 'L5_antes')), 70000.00,
  'el proceso ya registrado no cambió de valor cuando cambió la tarifa'
);
select is(
  (select p.valor from cafe.procesos p where p.id = (select (r ->> 'id')::uuid from res where k = 'L1_tostion')), 891000.00,
  'ni el de la tostión del ejemplo'
);
select is(
  (select valor_servicios from cafe.v_lotes where id = pg_temp.lid('L5')), 145000.00, 'v_lotes suma los valores congelados'
);

-- Sin tarifa vigente: error del núcleo y no queda nada escrito (cliente B).
reset role;
select tests.autenticar_como('owner-b@procesos.test');
select pg_temp.recibir('LB', 100, 2, array['trilla'], null, 'cb');
reset role;
delete from public.tarifas where tenant_id = (select id from ids where clave = 'b') and concepto = 'cafe.trilla';
select tests.autenticar_como('owner-b@procesos.test');
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('LB', 'trilla', null, '{"peso_salida_kg": 80}'))$$,
  'P0001', 'tarifa_no_definida', 'sin tarifa de trilla vigente: tarifa_no_definida'
);
select is(
  (select (select count(*) from cafe.procesos) + (select count(*) from cafe.proceso_bultos) + (select count(*) from cafe.baches))::int, 0,
  'y no queda ningún proceso, bulto ni bache escrito'
);
reset role;
select tests.autenticar_como('operativo-a@procesos.test');

-- 8. Baches ---------------------------------------------------------------------------------------------------------------------------
select pg_temp.recibir('L6', 81, 3, array['tostion'], 'alto');
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('L6', 'tostion', null, pg_temp.baches(54, 0.8)))$$,
  'P0001', 'baches_no_cuadran', 'baches que no suman la entrada (54 de 81): baches_no_cuadran'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('L6', 'tostion', null, pg_temp.baches(81, 0.8) || '{"peso_salida_kg": 70}'))$$,
  'P0001', 'baches_no_cuadran', 'baches que no suman la salida enviada: baches_no_cuadran'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('L6', 'tostion', null, pg_temp.baches(81, 0.8) || '{"peso_salida_kg": 90}'))$$,
  'P0001', 'salida_supera_entrada', 'salida mayor que la entrada: salida_supera_entrada'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('L6', 'tostion', null,
      '{"baches": [{"peso_entrada_kg": 81, "peso_salida_kg": 82}]}'))$$,
  'P0001', 'salida_supera_entrada', 'un bache con salida mayor que su entrada: salida_supera_entrada'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('L6', 'tostion', null,
      '{"baches": [{"peso_entrada_kg": 81}]}'))$$,
  'P0001', 'datos_invalidos', 'un bache sin peso de salida: datos_invalidos'
);
select pg_temp.recibir('L9', 50, 1, array['trilla']);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('L9', 'trilla', null, '{"peso_salida_kg": 60}'))$$,
  'P0001', 'salida_supera_entrada', 'salida mayor que la entrada en trilla: salida_supera_entrada'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('L9', 'trilla', null, '{"baches": [{"peso_entrada_kg": 50, "peso_salida_kg": 40}], "peso_salida_kg": 40}'))$$,
  'P0001', 'datos_invalidos', 'solo la tostión lleva baches'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('L9', 'trilla', null, '{}'))$$,
  'P0001', 'datos_invalidos', 'trilla sin peso de salida: datos_invalidos'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('L9', 'trilla', null, '{"peso_salida_kg": 40.0005}'))$$,
  'P0001', 'datos_invalidos', 'más de 3 decimales: datos_invalidos'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('L9', 'trilla', null, '{"peso_salida_kg": "40"}'))$$,
  'P0001', 'datos_invalidos', 'un peso que no es número: datos_invalidos (no un error inesperado)'
);
select throws_ok($$select cafe.registrar_proceso('[]')$$, 'P0001', 'datos_invalidos', 'una entrada que no es objeto: datos_invalidos');
select throws_ok(
  $$select cafe.registrar_proceso(jsonb_build_object('lote_id', gen_random_uuid(), 'tipo', 'trilla', 'fecha', pg_temp.hoy(), 'peso_salida_kg', 1))$$,
  'P0001', 'lote_no_encontrado', 'un lote que no existe: lote_no_encontrado'
);
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('L9', 'secado'))$$, 'P0001', 'datos_invalidos', 'un tipo de proceso desconocido: datos_invalidos'
);

-- Tostión válida de todo el lote L6, con la temperatura y el nivel indicado (pisa el del lote).
select pg_temp.reg('L6_t', 'L6', 'tostion', null, pg_temp.baches(81, 0.82) || '{"nivel_tueste": "bajo"}');
select is(
  (select row(p.nivel_tueste, p.peso_salida_kg, p.merma_pct)::text
     from cafe.procesos p where p.id = (select (r ->> 'id')::uuid from res where k = 'L6_t')),
  row('bajo'::cafe.nivel_tueste, 66.420::numeric, 18.000::numeric)::text,
  'sin peso de salida en el proceso, es la suma de los baches (6 × 11,07 = 66,42); el nivel enviado pisa el del lote'
);
select is(
  (select row(estado, avance_texto)::text from cafe.v_lotes where id = pg_temp.lid('L6')),
  row('en_proceso', '1 de 2')::text, 'tostión hecha (1 de 2): el empaque incluido en el servicio aún no se registra'
);

-- 9. Constraint trigger y CHECK directos (como postgres) ----------------------------------------------------------------------------
reset role;
select throws_ok(
  $$do $x$ begin
      insert into cafe.procesos (tenant_id, lote_id, tipo, fecha, peso_entrada_kg, peso_salida_kg, nivel_tueste)
      select tenant_id, id, 'tostion', current_date, 10, 8, 'medio' from cafe.lotes where id = pg_temp.lid('L9');
      set constraints all immediate;
    end $x$ $$,
  'P0001', 'baches_no_cuadran', 'una tostión escrita sin baches no cuadra (constraint trigger diferido)'
);
select throws_ok(
  $$do $x$ begin
      with p as (
        insert into cafe.procesos (tenant_id, lote_id, tipo, fecha, peso_entrada_kg, peso_salida_kg, nivel_tueste)
        select tenant_id, id, 'tostion', current_date, 10, 8, 'medio' from cafe.lotes where id = pg_temp.lid('L9') returning id, tenant_id)
      insert into cafe.baches (tenant_id, proceso_id, numero, peso_entrada_kg, peso_salida_kg)
      select tenant_id, id, 1, 5, 4 from p;
      set constraints all immediate;
    end $x$ $$,
  'P0001', 'baches_no_cuadran', 'baches que suman 5/4 en una tostión de 10/8: baches_no_cuadran'
);
select throws_ok(
  $$do $x$ begin
      with p as (
        insert into cafe.procesos (tenant_id, lote_id, tipo, fecha, peso_entrada_kg, peso_salida_kg)
        select tenant_id, id, 'molienda', current_date, 10, 8 from cafe.lotes where id = pg_temp.lid('L9') returning id, tenant_id)
      insert into cafe.baches (tenant_id, proceso_id, numero, peso_entrada_kg, peso_salida_kg)
      select tenant_id, id, 1, 10, 8 from p;
      set constraints all immediate;
    end $x$ $$,
  'P0001', 'baches_no_cuadran', 'una molienda no lleva baches'
);
select lives_ok(
  $$do $x$ begin
      with p as (
        insert into cafe.procesos (tenant_id, lote_id, tipo, fecha, peso_entrada_kg, peso_salida_kg, nivel_tueste)
        select tenant_id, id, 'tostion', current_date, 10, 8, 'medio' from cafe.lotes where id = pg_temp.lid('L9') returning id, tenant_id)
      insert into cafe.baches (tenant_id, proceso_id, numero, peso_entrada_kg, peso_salida_kg)
      select tenant_id, id, g, 5, 4 from p, generate_series(1, 2) g;
      set constraints all immediate;
      set constraints all deferred;
    end $x$ $$,
  'baches que suman exactamente (2 × 5 / 2 × 4) sí cuadran'
);
select throws_ok(
  $$insert into cafe.procesos (tenant_id, lote_id, tipo, fecha, peso_entrada_kg, peso_salida_kg, nivel_tueste)
    select tenant_id, id, 'tostion', current_date, 10, 11, 'medio' from cafe.lotes where id = pg_temp.lid('L9')$$,
  '23514', null, 'salida mayor que entrada: el CHECK de la tabla también lo impide'
);
select throws_ok(
  $$insert into cafe.procesos (tenant_id, lote_id, tipo, fecha, peso_entrada_kg, peso_salida_kg)
    select tenant_id, id, 'tostion', current_date, 10, 8 from cafe.lotes where id = pg_temp.lid('L9')$$,
  '23514', null, 'una tostión sin nivel de tueste: CHECK'
);
select throws_ok(
  $$insert into cafe.procesos (tenant_id, lote_id, tipo, fecha, peso_entrada_kg, peso_salida_kg, nivel_tueste)
    select tenant_id, id, 'trilla', current_date, 10, 8, 'medio' from cafe.lotes where id = pg_temp.lid('L9')$$,
  '23514', null, 'y un nivel de tueste en una trilla también'
);
select throws_ok(
  $$insert into cafe.proceso_bultos (tenant_id, proceso_id, bulto_id, tipo, lote_id)
    select b.tenant_id, p.id, b.id, p.tipo, p.lote_id
      from cafe.procesos p, cafe.lote_bultos b
     where p.id = (select (r ->> 'id')::uuid from res where k = 'L1_trilla') and b.lote_id = pg_temp.lid('L9')$$,
  '23503', null, 'un bulto de otro lote no cuelga de un proceso (FK compuesta)'
);
select throws_ok(
  $$insert into cafe.proceso_bultos (tenant_id, proceso_id, bulto_id, tipo, lote_id)
    select b.tenant_id, p.id, b.id, 'molienda', p.lote_id
      from cafe.procesos p, cafe.lote_bultos b
     where p.id = (select (r ->> 'id')::uuid from res where k = 'L2_tostion') and b.id = (pg_temp.barr('L2', array[2]))[1]$$,
  '23503', null, 'ni con un tipo distinto al del proceso'
);
select tests.autenticar_como('operativo-a@procesos.test');

-- 10. Anulación -----------------------------------------------------------------------------------------------------------------------------
select pg_temp.recibir('L7', 100, 2, array['trilla', 'tostion'], 'medio');
select pg_temp.reg('L7_t1', 'L7', 'trilla', array[1], '{"peso_salida_kg": 40}');
select pg_temp.reg('L7_t2', 'L7', 'trilla', array[2], '{"peso_salida_kg": 41}');
select pg_temp.reg('L7_o2', 'L7', 'tostion', array[2], pg_temp.baches(41, 0.8));

select throws_ok(
  format($$select cafe.anular_proceso(%L, 'Error de pesaje')$$, (select r ->> 'id' from res where k = 'L7_t2')),
  '42501', null, 'el operativo no anula (solo owner/admin)'
);
reset role;
select tests.autenticar_como('admin-a@procesos.test');
select throws_ok(
  format($$select cafe.anular_proceso(%L, 'Error de pesaje')$$, (select r ->> 'id' from res where k = 'L7_t2')),
  'P0001', 'proceso_con_dependientes', 'anular una trilla cuyo bulto ya se tostó: proceso_con_dependientes'
);
select throws_ok(
  format($$select cafe.anular_proceso(%L, '   ')$$, (select r ->> 'id' from res where k = 'L7_o2')),
  'P0001', 'datos_invalidos', 'la anulación exige motivo'
);
select throws_ok(
  $$select cafe.anular_proceso(gen_random_uuid(), 'Motivo')$$, 'P0001', 'proceso_no_encontrado', 'un proceso que no existe: proceso_no_encontrado'
);
select throws_ok(
  format($$update cafe.procesos set peso_salida_kg = 1 where id = %L$$, (select r ->> 'id' from res where k = 'L7_t1')),
  '42501', null, 'a mano no se puede cambiar el peso (privilegio de columna)'
);
select throws_ok(
  format($$delete from cafe.proceso_bultos where proceso_id = %L$$, (select r ->> 'id' from res where k = 'L7_t1')),
  'P0001', 'proceso_vigente', 'los bultos de un proceso vigente no se sueltan a mano'
);
-- La trilla del bulto 1 no tiene dependientes (la tostión es del bulto 2): se puede anular.
select is(
  (select r ->> 'lote_estado' from (select cafe.anular_proceso((select (r ->> 'id')::uuid from res where k = 'L7_t1'), 'Peso mal digitado') as r) x),
  'parcial', 'anular la trilla del bulto 1 (sin dependientes) funciona; el lote sigue parcial por el bulto 2'
);
select is(
  (select row(anulado_at is not null, motivo_anulacion, anulado_por)::text from cafe.procesos where id = (select (r ->> 'id')::uuid from res where k = 'L7_t1')),
  row(true, 'Peso mal digitado', '00000000-0000-0000-0000-0000000094a2'::uuid)::text,
  'el proceso se conserva, con motivo y quién anuló'
);
select is(
  (select count(*)::int from cafe.proceso_bultos where proceso_id = (select (r ->> 'id')::uuid from res where k = 'L7_t1')), 0,
  'y sus bultos quedan libres'
);
select is(cafe.peso_disponible(pg_temp.lid('L7'), 'trilla', pg_temp.barr('L7', array[1])), 50.000, 'el bulto 1 vuelve a tener su peso original disponible');
select is(
  (select jsonb_build_array(bultos_total, bultos_procesados, parcial) from cafe.v_lote_etapas where lote_id = pg_temp.lid('L7') and tipo = 'trilla'),
  '[2, 1, true]'::jsonb, 'un proceso anulado no cuenta en v_lote_etapas (trilla 1/2)'
);
select throws_ok(
  format($$select cafe.anular_proceso(%L, 'Otra vez')$$, (select r ->> 'id' from res where k = 'L7_t1')),
  'P0001', 'proceso_anulado', 'anular dos veces: proceso_anulado'
);
select throws_ok(
  format($$update cafe.procesos set observaciones = 'x' where id = %L$$, (select r ->> 'id' from res where k = 'L7_t1')),
  'P0001', 'proceso_anulado', 'un proceso anulado no se modifica'
);
select lives_ok($$select pg_temp.reg('L7_t1b', 'L7', 'trilla', array[1], '{"peso_salida_kg": 41}')$$, 'el bulto liberado puede volver a trillarse');

-- Se anula la tostión y luego la trilla del bulto 2: el lote vuelve al principio.
select is((select (cafe.anular_proceso((select (r ->> 'id')::uuid from res where k = 'L7_o2'), 'Se repite'))::jsonb ->> 'bultos_liberados'), '1', 'anular la tostión libera su bulto');
select is(
  (select (cafe.anular_proceso((select (r ->> 'id')::uuid from res where k = 'L7_t2'), 'Se repite'))::jsonb ->> 'bultos_liberados'), '1',
  'ahora la trilla del bulto 2 ya no tiene dependientes'
);
select is(
  (select row(estado, avance_texto)::text from cafe.v_lotes where id = pg_temp.lid('L7')),
  row('parcial', '0 de 3')::text, 'con solo la trilla del bulto 1 repetida, el lote queda parcial (trilla 1/2, 0 de 3)'
);
select is(
  (select count(*)::int from cafe.baches where proceso_id = (select (r ->> 'id')::uuid from res where k = 'L7_o2')), 4,
  'los baches de la tostión anulada se conservan'
);

-- Un lote anulado no admite procesos.
select pg_temp.recibir('L8', 50, 1, array['trilla']);
select lives_ok($$update cafe.lotes set anulado_at = now(), motivo_anulacion = 'Duplicado' where id = pg_temp.lid('L8')$$, 'el admin anula un lote sin procesos');
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('L8', 'trilla', null, '{"peso_salida_kg": 40}'))$$,
  'P0001', 'lote_anulado', 'registrar en un lote anulado: lote_anulado'
);
select is((select estado from cafe.v_lotes where id = pg_temp.lid('L8')), 'anulado', 'v_lotes: estado anulado');

-- Con todos sus procesos anulados, el lote sí se puede anular.
select pg_temp.recibir('L10', 50, 1, array['trilla']);
select pg_temp.reg('L10_t', 'L10', 'trilla', null, '{"peso_salida_kg": 40}');
select throws_ok(
  $$update cafe.lotes set anulado_at = now(), motivo_anulacion = 'Prueba' where id = pg_temp.lid('L10')$$,
  'P0001', 'lote_con_procesos', 'un lote con un proceso vigente no se anula'
);
select lives_ok(
  $$select cafe.anular_proceso((select (r ->> 'id')::uuid from res where k = 'L10_t'), 'Prueba');
    update cafe.lotes set anulado_at = now(), motivo_anulacion = 'Prueba' where id = pg_temp.lid('L10')$$,
  'anulado el proceso, el lote ya se puede anular'
);
reset role;
select tests.autenticar_como('operativo-a@procesos.test');

-- 11. Roles ----------------------------------------------------------------------------------------------------------------------------------------
select is(tests.filas_afectadas($$update cafe.procesos set observaciones = 'Cambiado'$$), 0, 'el operativo no corrige procesos');
select throws_ok($$delete from cafe.procesos$$, '42501', null, 'ni los borra');
select throws_ok($$delete from cafe.baches$$, '42501', null, 'ni borra baches');
select is(tests.filas_afectadas($$delete from cafe.proceso_bultos$$), 0, 'ni libera bultos a mano');
select ok((select count(*) from cafe.procesos) >= 10, 'el operativo lee los procesos del cliente');

reset role;
select tests.autenticar_como('viewer-a@procesos.test');
select ok((select count(*) from cafe.procesos) >= 10, 'el viewer (gerencia) consulta los procesos');
select ok((select count(*) from cafe.baches) >= 30 and (select count(*) from cafe.proceso_bultos) >= 10, 'y los baches y los bultos');
select ok((select count(*) from cafe.v_lotes) >= 10 and (select count(*) from cafe.v_lote_etapas) >= 10, 'y las vistas de avance');
select throws_ok($$select pg_temp.reg('V1', 'L9', 'trilla', null, '{"peso_salida_kg": 40}')$$, '42501', null, 'pero no registra procesos');
select throws_ok(
  format($$select cafe.anular_proceso(%L, 'Motivo')$$, (select r ->> 'id' from res where k = 'L3_b1')), '42501', null, 'ni anula'
);
select throws_ok(
  $$insert into cafe.procesos (lote_id, tipo, fecha, peso_entrada_kg, peso_salida_kg)
    values (pg_temp.lid('L9'), 'trilla', current_date, 10, 8)$$,
  '42501', null, 'ni inserta directo en la tabla'
);

reset role;
select tests.autenticar_como('owner-a@procesos.test');
select lives_ok(
  format($$select cafe.anular_proceso(%L, 'Corrección del owner')$$, (select r ->> 'id' from res where k = 'L3_b2')),
  'el owner también anula'
);
select is((select count(*)::int from cafe.v_lotes where id = pg_temp.lid('L3')), 1, 'y ve el lote');

-- 12. Auditoría ----------------------------------------------------------------------------------------------------------------------------------------------
select is(
  (select array_agg(l.accion order by l.id) from audit.log l
    where l.tabla = 'cafe.procesos' and l.registro_id = (select r ->> 'id' from res where k = 'L3_b2')),
  array['INSERT', 'UPDATE'], 'cada proceso deja su INSERT en audit.log y la anulación un UPDATE'
);
select ok(
  (select l.cambios ? 'anulado_at' and l.cambios ? 'motivo_anulacion' and not (l.cambios ? 'peso_salida_kg')
     from audit.log l
    where l.tabla = 'cafe.procesos' and l.accion = 'UPDATE' and l.registro_id = (select r ->> 'id' from res where k = 'L3_b2')),
  'el UPDATE registra solo lo que cambió (la anulación y su motivo)'
);
select ok(
  (select count(*) = 30 from audit.log l
    where l.tabla = 'cafe.baches' and l.accion = 'INSERT'
      and l.despues ->> 'proceso_id' = (select r ->> 'id' from res where k = 'L1_tostion')),
  'los 30 baches de la tostión quedan auditados'
);
select ok(
  (select count(*) = 1 from audit.log l
    where l.tabla = 'cafe.proceso_bultos' and l.accion = 'DELETE'
      and l.antes ->> 'proceso_id' = (select r ->> 'id' from res where k = 'L3_b2')
      and l.antes ->> 'bulto_id' = (pg_temp.barr('L3', array[2]))[1]::text),
  'liberar un bulto al anular queda auditado'
);

-- 13. Aislamiento entre clientes y módulo apagado ------------------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('owner-b@procesos.test');
select is((select count(*)::int from cafe.procesos where tenant_id <> (select id from ids where clave = 'b')), 0, 'el cliente B no ve los procesos de A');
select is((select count(*)::int from cafe.proceso_bultos), 0, 'ni sus bultos');
select is((select count(*)::int from cafe.baches), 0, 'ni sus baches');
select is((select count(*)::int from cafe.v_lotes where tenant_id <> (select id from ids where clave = 'b')), 0, 'ni sus lotes en v_lotes');
select is((select count(*)::int from cafe.v_lote_etapas), 0, 'ni sus etapas');
select is((select count(*)::int from cafe.v_bultos_estado where tenant_id <> (select id from ids where clave = 'b')), 0, 'ni el estado de sus bultos');
select is(cafe.peso_disponible(pg_temp.lid('L1'), 'tostion', pg_temp.barr('L1', array[1])), null::numeric, 'peso_disponible de un lote ajeno: NULL');
select is(cafe.pasos_del_lote(pg_temp.lid('L1')), null::cafe.tipo_proceso[], 'pasos_del_lote de un lote ajeno: NULL');
select throws_ok(
  $$select cafe.registrar_proceso(pg_temp.p('L9', 'trilla', null, '{"peso_salida_kg": 40}'))$$,
  'P0001', 'lote_no_encontrado', 'B no registra procesos en un lote de A'
);
select throws_ok(
  format($$select cafe.anular_proceso(%L, 'Intruso')$$, (select r ->> 'id' from res where k = 'L1_trilla')),
  'P0001', 'proceso_no_encontrado', 'ni anula procesos de A'
);
select throws_ok(
  format($$insert into cafe.procesos (tenant_id, lote_id, tipo, fecha, peso_entrada_kg, peso_salida_kg)
           values (%L, %L, 'trilla', current_date, 10, 8)$$, (select id from ids where clave = 'a'), pg_temp.lid('L9')),
  '42501', null, 'ni inserta con el tenant_id de A (RLS)'
);
select throws_ok(
  format($$insert into cafe.procesos (tenant_id, lote_id, tipo, fecha, peso_entrada_kg, peso_salida_kg)
           values (%L, %L, 'trilla', current_date, 10, 8)$$, (select id from ids where clave = 'b'), pg_temp.lid('L9')),
  '23503', null, 'ni cuelga un proceso suyo de un lote de A (FK compuesta con el tenant)'
);
-- Módulo apagado: sin `cafe.procesos` el cliente no ve ni registra nada, aunque llame a la API.
reset role;
insert into public.tarifas (tenant_id, concepto, valor, unidad, vigente_desde)
select id, 'cafe.trilla', 1400, 'kg', now() from ids where clave = 'b';
select tests.autenticar_como('owner-b@procesos.test');
select pg_temp.reg('LB_t', 'LB', 'trilla', null, '{"peso_salida_kg": 70}');
reset role;
update public.tenant_modulos set activo = false
 where tenant_id = (select id from ids where clave = 'b') and modulo_id = 'cafe.procesos';
select tests.autenticar_como('owner-b@procesos.test');
select is((select count(*)::int from cafe.procesos), 0, 'sin el módulo cafe.procesos no se lee ningún proceso');
select throws_ok(
  $$select cafe.registrar_proceso(jsonb_build_object('lote_id', pg_temp.lid('LB'), 'tipo', 'trilla', 'fecha', pg_temp.hoy(), 'peso_salida_kg', 1))$$,
  '42501', null, 'ni se registra uno'
);
select throws_ok(
  format($$select cafe.anular_proceso(%L, 'Motivo')$$, (select r ->> 'id' from res where k = 'LB_t')),
  '42501', null, 'ni se anula'
);
select is(
  (select estado from cafe.v_lotes where id = pg_temp.lid('LB')), 'recibido', 'el lote se muestra sin avance mientras el módulo está apagado'
);

select * from finish();
rollback;
