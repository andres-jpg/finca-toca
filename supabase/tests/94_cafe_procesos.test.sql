-- Procesos del vertical café (FIN-108 · CO-27, reescrito para ADR 0002): cafe.procesos, cafe.baches, pasos_del_lote / paso_previo /
-- paso_origen / peso_disponible / sugerir_baches / registrar_proceso / anular_proceso y v_lote_etapas / v_lotes. Cubre el ejemplo
-- del informe (500 kg → trilla 405 → tostión → molienda → empaque), el orden y el origen de cada paso, el saldo por kilos, el desvío
-- de la trilla, la congelación de tarifas, los baches sin salida, la anulación de atrás hacia delante, los roles y el aislamiento
-- entre clientes. La tostión por tandas y el empaque con báscula están en 86_cafe_saldo_kg.test.sql.
--   p1 owner A   p2 admin A   p3 operativo A   p4 viewer A   p5 owner B
begin;

select plan(44);

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
select has_table('cafe', 'baches', 'existe cafe.baches');
select has_view('cafe', 'v_lotes', 'existe cafe.v_lotes');
select has_view('cafe', 'v_lote_etapas', 'existe cafe.v_lote_etapas');
select ok((select bool_and(relrowsecurity) from pg_class where oid in ('cafe.procesos'::regclass, 'cafe.baches'::regclass)), 'procesos y baches tienen RLS');
select ok(
  (select bool_and(coalesce(c.reloptions, '{}') @> array['security_invoker=true']) from pg_class c
    where c.oid in ('cafe.v_lotes'::regclass, 'cafe.v_lote_etapas'::regclass, 'cafe.v_origenes_disponibles'::regclass)),
  'las vistas son security_invoker'
);
select ok(
  not has_table_privilege('authenticated', 'cafe.procesos', 'delete') and not has_table_privilege('authenticated', 'cafe.baches', 'delete')
  and not has_table_privilege('authenticated', 'cafe.baches', 'update'),
  'nadie borra procesos ni baches y los baches no se editan'
);
select ok(not has_table_privilege('anon', 'cafe.procesos', 'select') and not has_table_privilege('anon', 'cafe.v_lotes', 'select'), 'anon no lee procesos ni vistas');
select ok(
  not has_function_privilege('anon', 'cafe.registrar_proceso(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'cafe.procesos_proteger()', 'execute')
  and has_function_privilege('authenticated', 'cafe.registrar_proceso(jsonb)', 'execute'),
  'anon no ejecuta las funciones de procesos y las de los triggers no se llaman a mano'
);

-- 2. Baches sugeridos (misma regla que sugerirBaches() de TypeScript) ------------------------------------------------
select tests.autenticar_como('operativo-a@procesos.test');
select is(cafe.sugerir_baches(81), '{"capacidad_kg": 13.5, "num_baches": 6, "baches": [13.5, 13.5, 13.5, 13.5, 13.5, 13.5]}'::jsonb, '81 kg → 6 baches de 13,5');
select is(cafe.sugerir_baches(54) -> 'baches', '[13.5, 13.5, 13.5, 13.5]'::jsonb, '54,0 kg → 4 baches de 13,5 kg');
select is(cafe.sugerir_baches(100) -> 'baches', '[12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5, 12.5]'::jsonb, '100 kg → 8 baches de 12,5');
select is((select sum(x::numeric) from jsonb_array_elements_text(cafe.sugerir_baches(100.001) -> 'baches') x), 100.001, 'el reparto siempre suma el peso');
select throws_ok($$select cafe.sugerir_baches(0)$$, 'P0001', 'datos_invalidos', 'peso cero: no se sugiere nada');

-- 3. El ejemplo del informe: 500 kg, trilla + tostión + molienda (+ empaque) -----------------------------------------------
select pg_temp.recibir('L1', 500, 8, array['trilla', 'tostion', 'molienda'], 'medio');
select pg_temp.recibir('L2', 100, 2, array['trilla', 'tostion'], 'bajo');
select is(cafe.pasos_del_lote(pg_temp.lid('L1')), array['trilla', 'tostion', 'molienda', 'empaque']::cafe.tipo_proceso[], 'pasos del lote de servicio: los contratados (la tostión añade el empaque)');
select is(
  (select array_agg(cafe.paso_previo(pg_temp.lid('L1'), t) order by cafe.orden_proceso(t)) from unnest(enum_range(null::cafe.tipo_proceso)) t),
  array[null, 'trilla', 'tostion', 'molienda']::cafe.tipo_proceso[], 'paso previo (orden de los pasos): nada, trilla, tostión, molienda'
);
select is(
  (select array_agg(cafe.paso_origen(pg_temp.lid('L1'), t) order by cafe.orden_proceso(t)) from unnest(enum_range(null::cafe.tipo_proceso)) t),
  array[null, 'trilla', 'tostion', 'tostion']::cafe.tipo_proceso[], 'paso de origen (cadena de kilos): se salta la molienda'
);
select is(
  (select row(estado, avance_texto, peso_actual_kg, merma_total_kg)::text from cafe.v_lotes where id = pg_temp.lid('L1')),
  row('recibido', '0 de 4', 500.000::numeric, 0.000::numeric)::text, 'un lote recién recibido: recibido, 0 de 4, 500 kg'
);
select throws_ok(
  $$select cafe.registrar_proceso(jsonb_build_object('lote_id', pg_temp.lid('L1'), 'tipo', 'tostion', 'fecha', pg_temp.hoy(), 'nivel_tueste', 'medio', 'peso_entrada_kg', 100, 'baches', pg_temp.baches(100, 0.8)->'baches'))$$,
  'P0001', 'orden_proceso_invalido', 'tostión antes de la trilla contratada: orden_proceso_invalido'
);
select is(
  pg_temp.detalle($$select cafe.registrar_proceso(jsonb_build_object('lote_id', pg_temp.lid('L1'), 'tipo', 'tostion', 'fecha', pg_temp.hoy(), 'nivel_tueste', 'medio', 'peso_entrada_kg', 100, 'baches', pg_temp.baches(100, 0.8)->'baches'))$$),
  'Primero registra la trilla de este lote.', 'el mensaje dice qué falta'
);
select throws_ok(
  $$select cafe.registrar_proceso(jsonb_build_object('lote_id', pg_temp.lid('L2'), 'tipo', 'molienda', 'fecha', pg_temp.hoy()))$$,
  'P0001', 'servicio_no_contratado', 'molienda no contratada: servicio_no_contratado'
);
select throws_ok(
  $$select cafe.registrar_proceso(jsonb_build_object('lote_id', pg_temp.lid('L1'), 'tipo', 'trilla', 'fecha', pg_temp.hoy(), 'peso_entrada_kg', 600, 'peso_salida_kg', 405))$$,
  'P0001', 'peso_supera_disponible', 'una entrada que supera lo recibido: peso_supera_disponible'
);
select is(cafe.peso_disponible(pg_temp.lid('L1'), 'trilla'), 500.000, 'sin paso previo el disponible es lo recibido');
select is(cafe.peso_disponible(pg_temp.lid('L1'), 'tostion'), null::numeric, 'sin la trilla hecha, la tostión no tiene disponible');

-- Trilla: entrada por defecto = todo el saldo; desvío contra 19 ± 2.
select pg_temp.reg('L1_trilla', 'L1', 'trilla', null, '{"peso_salida_kg": 405}');
select is(
  (select row(r ->> 'merma_kg', r ->> 'merma_pct', r ->> 'valor', r ->> 'desvio', r ->> 'lote_estado', r ->> 'avance_texto', r ->> 'peso_entrada_kg')::text from res where k = 'L1_trilla'),
  row('95.000', '19.000', '700000.00', 'false', 'en_proceso', '1 de 4', '500.000')::text, 'trilla 500 → 405: merma 19 %, valor $700.000, sin desvío'
);
select is(cafe.peso_disponible(pg_temp.lid('L1'), 'tostion'), 405.000, 'la salida de la trilla es el disponible de la tostión');
select is((select origen_tipo::text from cafe.procesos where id = (select (r ->> 'id')::uuid from res where k = 'L1_trilla')), null, 'la trilla parte del café recibido (sin origen)');

-- Tostión de 405 kg en 30 baches: sin salida, enlazada a la trilla.
select pg_temp.reg('L1_t', 'L1', 'tostion', null, jsonb_build_object('nivel_tueste', 'medio', 'baches', (select jsonb_agg(b - 'peso_salida_kg') from jsonb_array_elements(pg_temp.baches(405, 0.82) -> 'baches') b)));
select is(
  (select row(peso_entrada_kg, peso_salida_kg, origen_tipo::text, (select count(*) from cafe.baches b where b.proceso_id = p.id))::text from cafe.procesos p where p.id = (select (r ->> 'id')::uuid from res where k = 'L1_t')),
  row(405.000, null::numeric, 'trilla', 30)::text, 'tostión: 405 kg a tostar, sin salida, enlazada a la trilla, 30 baches'
);
select is(cafe.saldo_proceso((select (r ->> 'id')::uuid from res where k = 'L1_trilla')), 0.000, 'la trilla queda sin saldo');
select is(
  (select row(kg_base, kg_procesados, completo)::text from cafe.v_lote_etapas where lote_id = pg_temp.lid('L1') and tipo = 'tostion'),
  row(405.000, 405.000, true)::text, 'la tostión completa su base (la salida de la trilla)'
);

-- Molienda: sin salida; empaque de terceros desde la tostión (la báscula la fija).
select pg_temp.reg('L1_m', 'L1', 'molienda', null, '{"peso_entrada_kg": 330}');
select is((select peso_salida_kg from cafe.procesos where id = (select (r ->> 'id')::uuid from res where k = 'L1_m')), null::numeric, 'la molienda no lleva salida');
select throws_ok(
  $$select cafe.registrar_proceso(jsonb_build_object('lote_id', pg_temp.lid('L1'), 'tipo', 'empaque', 'fecha', pg_temp.hoy(), 'peso_salida_kg', 330))$$,
  'P0001', 'usar_registrar_empaque', 'el empaque de una tanda va por registrar_empaque (báscula y bolsas)'
);
insert into res select 'L1_e', cafe.registrar_empaque(jsonb_build_object('lote_id', pg_temp.lid('L1'), 'fecha', pg_temp.hoy(), 'peso_bascula_kg', 332,
  'lineas', '[{"presentacion_g":10000,"unidades":33,"bolsa_cliente":true}]'::jsonb));
select is((select peso_salida_kg from cafe.procesos where id = (select (r ->> 'id')::uuid from res where k = 'L1_t')), 332.000, 'la báscula del empaque es la salida de la tostión');
select is((select estado from cafe.v_lotes where id = pg_temp.lid('L1')), 'listo', 'trilla + tostión + molienda + empaque completos: el lote queda listo');

-- Desvío de la trilla (30 % contra 19 ± 2) y tarifa congelada.
select pg_temp.recibir('L3', 100, 2, array['trilla']);
select pg_temp.reg('L3_trilla', 'L3', 'trilla', null, '{"peso_salida_kg": 70}');
select is((select r ->> 'desvio_sentido' from res where k = 'L3_trilla'), 'alta', 'trilla con 30 % de merma: desvío por encima de la banda');
select is((select r ->> 'tarifa_kg' from res where k = 'L3_trilla'), '1400.00', 'la tarifa vigente queda congelada en el proceso');

-- 4. Anulación de atrás hacia delante, permisos y aislamiento ------------------------------------------------------------
select throws_ok(format($$select cafe.anular_proceso(%L, 'prueba')$$, (select (r ->> 'id')::uuid from res where k = 'L1_trilla')), '42501', 'no_autorizado', 'el operativo no anula');
reset role;
select tests.autenticar_como('admin-a@procesos.test');
select throws_ok(format($$select cafe.anular_proceso(%L, 'prueba')$$, (select (r ->> 'id')::uuid from res where k = 'L1_trilla')), 'P0001', 'proceso_con_dependientes', 'la trilla con tostión no se anula: se anula de atrás hacia delante');
select is((cafe.anular_proceso((select (r ->> 'proceso_id')::uuid from res where k = 'L1_e'), 'Error de conteo') ->> 'kg_liberados')::numeric, 332.000, 'anular el empaque libera sus kilos');
select is((select estado from cafe.v_lotes where id = pg_temp.lid('L1')), 'en_proceso', 'y el lote vuelve a quedar en proceso (el empaque quedó pendiente)');

reset role;
select tests.autenticar_como('viewer-a@procesos.test');
select throws_ok($$select cafe.registrar_proceso(jsonb_build_object('lote_id', pg_temp.lid('L3'), 'tipo', 'molienda', 'fecha', pg_temp.hoy()))$$, '42501', 'no_autorizado', 'el viewer no registra procesos');
select ok((select count(*) from cafe.procesos) > 0, 'pero sí los lee');
reset role;
select tests.autenticar_como('owner-b@procesos.test');
select is((select count(*)::int from cafe.procesos), 0, 'otro cliente no ve los procesos de A');
select throws_ok(
  format($$select cafe.registrar_proceso(jsonb_build_object('lote_id', %L, 'tipo', 'trilla', 'fecha', pg_temp.hoy(), 'peso_salida_kg', 1))$$, pg_temp.lid('L3')),
  'P0001', 'lote_no_encontrado', 'otro cliente no registra sobre un lote de A'
);

select * from finish();
rollback;
