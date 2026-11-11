-- ADR 0002 (FIN-142 · T-01): saldo por kilos sin bultos (B-01), tostión por tandas sin salida (B-05), empaque con báscula y merma
-- por tanda (B-08) y sobrante a «Tostado sin empacar» (B-09). Todo se crea AQUÍ dentro de la transacción (rollback al final):
-- dos clientes de café (A y B). u1 owner A, u2 admin A, u3 operativo A, u4 viewer A, u5 owner B.
-- Casos compartidos con Vitest (`saldo.test.ts`): tolerancia, 320 kg con 118 kg tostados → 202 kg por tostar, y el ejemplo
-- MP-2026-0007 (tanda 1: 64,0 → 52,4; tanda 2: 54,0 → 44,3; acumulado 118,0 → 96,7 = 18,1 %).
begin;

select plan(66);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000086a1', 'authenticated', 'authenticated', 'owner-a@saldo.test'),
  ('00000000-0000-0000-0000-0000000086a2', 'authenticated', 'authenticated', 'admin-a@saldo.test'),
  ('00000000-0000-0000-0000-0000000086a3', 'authenticated', 'authenticated', 'operativo-a@saldo.test'),
  ('00000000-0000-0000-0000-0000000086a4', 'authenticated', 'authenticated', 'viewer-a@saldo.test'),
  ('00000000-0000-0000-0000-0000000086a5', 'authenticated', 'authenticated', 'owner-b@saldo.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Saldo A', 'saldo-a-t', 'cafe');
select platform.crear_tenant('Saldo B', 'saldo-b-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'saldo-a-t'
union all select 'b', id from public.tenants where slug = 'saldo-b-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), m.rol::public.rol_tenant
  from (values
    ('00000000-0000-0000-0000-0000000086a1', 'a', 'owner'),
    ('00000000-0000-0000-0000-0000000086a2', 'a', 'admin'),
    ('00000000-0000-0000-0000-0000000086a3', 'a', 'operativo'),
    ('00000000-0000-0000-0000-0000000086a4', 'a', 'viewer'),
    ('00000000-0000-0000-0000-0000000086a5', 'b', 'owner')) as m(user_id, t, rol);

with t as (
  insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles)
  select i.id, x.nombre, 'Calle 1', '3000000000', x.identificacion, x.roles
    from (values ('a', 'Proveedor A', '8600001', array['proveedor']),
                 ('a', 'Cliente A', '8600002', array['cliente_servicio']),
                 ('b', 'Proveedor B', '8600003', array['proveedor'])) as x(t, nombre, identificacion, roles)
    join ids i on i.clave = x.t
  returning identificacion, id
)
insert into ids select case identificacion when '8600001' then 'pa' when '8600002' then 'ca' else 'pb' end, id from t;
insert into ids select 'xa', t.id from cafe.tipos_cafe t join ids i on i.id = t.tenant_id and i.clave = 'a' where t.nombre = 'Excelso';
insert into ids select 'xb', t.id from cafe.tipos_cafe t join ids i on i.id = t.tenant_id and i.clave = 'b' where t.nombre = 'Excelso';

create temp table res (k text primary key, r jsonb);
grant select, insert on res to authenticated;

create or replace function pg_temp.hoy() returns text language sql as $$ select to_char(current_date, 'YYYY-MM-DD') $$;
grant execute on function pg_temp.hoy() to authenticated;
create or replace function pg_temp.lid(p_k text) returns uuid language sql as $$ select (r ->> 'id')::uuid from res where k = p_k $$;
grant execute on function pg_temp.lid(text) to authenticated;
create or replace function pg_temp.rid(p_k text) returns uuid language sql as $$ select coalesce((r ->> 'id')::uuid, (r ->> 'proceso_id')::uuid) from res where k = p_k $$;
grant execute on function pg_temp.rid(text) to authenticated;

-- Compra de marca propia (Excelso de A) y recepción de servicio.
create or replace function pg_temp.comprar(p_k text, p_peso numeric) returns void language plpgsql as $$
begin
  insert into res select p_k, cafe.registrar_compra(jsonb_build_object(
    'tercero_id', (select id from ids where clave = 'pa'), 'tipo_cafe_id', (select id from ids where clave = 'xa'),
    'fecha', pg_temp.hoy(), 'peso_kg', p_peso, 'precio_kg', 20000));
end $$;
grant execute on function pg_temp.comprar(text, numeric) to authenticated;

create or replace function pg_temp.comprar_b() returns void language plpgsql as $$
begin
  insert into res select 'MPB', cafe.registrar_compra(jsonb_build_object(
    'tercero_id', (select id from ids where clave = 'pb'), 'tipo_cafe_id', (select id from ids where clave = 'xb'),
    'fecha', pg_temp.hoy(), 'peso_kg', 50, 'precio_kg', 20000));
end $$;
grant execute on function pg_temp.comprar_b() to authenticated;

create or replace function pg_temp.recibir(p_k text, p_peso numeric, p_servicios text[]) returns void language plpgsql as $$
begin
  insert into res select p_k, cafe.registrar_recepcion(jsonb_build_object(
    'tercero_id', (select id from ids where clave = 'ca'), 'fecha', pg_temp.hoy(), 'peso_kg', p_peso,
    'servicios', to_jsonb(p_servicios), 'nivel_tueste', 'medio'));
end $$;
grant execute on function pg_temp.recibir(text, numeric, text[]) to authenticated;

-- Baches de `p_kg` según `cafe.sugerir_baches` (solo entrada: la tostión no tiene salida).
create or replace function pg_temp.baches(p_kg numeric) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('peso_entrada_kg', e.v::numeric, 'temperatura_c', 216, 'tiempo_min', 17) order by e.n)
    from jsonb_array_elements_text(cafe.sugerir_baches(p_kg) -> 'baches') with ordinality as e(v, n)
$$;
grant execute on function pg_temp.baches(numeric) to authenticated;

-- Registra un proceso del lote `p_lote` y guarda el resultado bajo `p_res`.
create or replace function pg_temp.reg(p_res text, p_lote text, p_tipo text, p_extra jsonb default '{}') returns void language plpgsql as $$
begin
  insert into res select p_res, cafe.registrar_proceso(
    jsonb_build_object('lote_id', pg_temp.lid(p_lote), 'tipo', p_tipo, 'fecha', pg_temp.hoy()) || p_extra);
end $$;
grant execute on function pg_temp.reg(text, text, text, jsonb) to authenticated;

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

-- 1. Estructura y privilegios ------------------------------------------------------------------------------------
select has_column('cafe', 'procesos', 'origen_proceso_id', 'procesos enlaza al proceso previo');
select has_column('cafe', 'procesos', 'origen_tipo', 'y guarda su tipo para la FK compuesta');
select has_view('cafe', 'v_origenes_disponibles', 'existe la fuente única del saldo');
select has_view('cafe', 'v_tostion_tandas', 'existe la vista de tandas');
select has_view('cafe', 'v_inventario_tostado', 'existe el saldo de tostado sin empacar');
select has_table('cafe', 'tostado_movimientos', 'existe el libro de tostado sin empacar');
select ok(
  (select bool_and(c.relrowsecurity) from pg_class c where c.oid = 'cafe.tostado_movimientos'::regclass)
  and (select bool_and(coalesce(c.reloptions, '{}') @> array['security_invoker=true'])
         from pg_class c where c.oid in ('cafe.v_origenes_disponibles'::regclass, 'cafe.v_tostion_tandas'::regclass, 'cafe.v_inventario_tostado'::regclass, 'cafe.v_lote_pesos'::regclass)),
  'el libro de tostado tiene RLS y las vistas son security_invoker'
);
select ok(
  not has_table_privilege('authenticated', 'cafe.tostado_movimientos', 'update')
  and not has_table_privilege('authenticated', 'cafe.tostado_movimientos', 'delete')
  and not has_table_privilege('authenticated', 'cafe.lote_bultos', 'insert')
  and not has_table_privilege('authenticated', 'cafe.proceso_bultos', 'insert')
  and not has_table_privilege('authenticated', 'cafe.lote_bultos', 'delete'),
  'el tostado es de solo inserción y los bultos quedan como historia de solo lectura'
);
select ok(
  not has_function_privilege('anon', 'cafe._asignar_salida_tostion(uuid)', 'execute')
  and (select prosecdef from pg_proc where oid = 'cafe._asignar_salida_tostion(uuid)'::regprocedure)
  and not (select prosecdef from pg_proc where oid = 'cafe.registrar_empaque(jsonb)'::regprocedure),
  'solo _asignar_salida_tostion es SECURITY DEFINER (excepción documentada); registrar_empaque es invoker'
);
select is(cafe.saldo_tolerancia_kg(10), 0.05::numeric, 'tolerancia: 0,05 kg mínimo');
select is(cafe.saldo_tolerancia_kg(320), 1.6::numeric, 'tolerancia: 0,5 % de 320 kg');

-- 2. Compra sin bultos, saldo de la raíz y tostión por tandas (B-01, B-05) --------------------------------------------
select tests.autenticar_como('operativo-a@saldo.test');
select pg_temp.comprar('MP1', 320);
select is((select count(*)::int from cafe.lote_bultos), 0, 'la compra ya no crea bultos');
select is((select num_bultos from cafe.lotes where id = pg_temp.lid('MP1')), null, 'y num_bultos queda sin valor');
select is(cafe.paso_origen(pg_temp.lid('MP1'), 'tostion'), null::cafe.tipo_proceso, 'marca propia: la tostión sale de la raíz');
select is(cafe.paso_origen(pg_temp.lid('MP1'), 'empaque'), 'tostion'::cafe.tipo_proceso, 'el empaque cuelga de la tostión');
select is(cafe.peso_disponible(pg_temp.lid('MP1'), 'tostion'), 320.000, 'sin procesos, el disponible es lo recibido');

select pg_temp.reg('T1', 'MP1', 'tostion', jsonb_build_object('nivel_tueste', 'medio', 'peso_entrada_kg', 118, 'baches', pg_temp.baches(118)));
select is((select r ->> 'peso_salida_kg' from res where k = 'T1'), null, 'la tostión se registra sin ningún peso de salida');
select is(cafe.peso_disponible(pg_temp.lid('MP1'), 'tostion'), 202.000, '320,0 kg con 118,0 kg tostados dejan 202,0 kg por tostar');
select is(
  (select row(kg_base, kg_procesados, kg_pendientes, completo, parcial)::text from cafe.v_lote_etapas where lote_id = pg_temp.lid('MP1') and tipo = 'tostion'),
  row(320.000, 118.000, 202.000, false, true)::text,
  'v_lote_etapas por kg: 118,0 de 320,0'
);
select is((select estado from cafe.v_lotes where id = pg_temp.lid('MP1')), 'parcial', 'el lote queda parcial');
select is(
  (select count(*)::int from cafe.baches where proceso_id = pg_temp.rid('T1') and peso_salida_kg is null and grupo_pesaje is null),
  (select jsonb_array_length(pg_temp.baches(118))), 'los baches no llevan salida ni grupo de pesaje'
);
select throws_ok(
  $$select cafe.registrar_proceso(jsonb_build_object('lote_id', pg_temp.lid('MP1'), 'tipo', 'tostion', 'fecha', pg_temp.hoy(), 'nivel_tueste', 'medio', 'peso_entrada_kg', 250, 'baches', pg_temp.baches(250)))$$,
  'P0001', 'peso_supera_disponible', 'no se tuesta más de lo que queda'
);
select throws_ok(
  $$select cafe.registrar_proceso(jsonb_build_object('lote_id', pg_temp.lid('MP1'), 'tipo', 'tostion', 'fecha', pg_temp.hoy(), 'nivel_tueste', 'medio', 'peso_entrada_kg', 20, 'baches', pg_temp.baches(10)))$$,
  'P0001', 'baches_no_cuadran', 'los baches deben sumar los kilos a tostar'
);
select throws_ok(
  $$select cafe.registrar_proceso(jsonb_build_object('lote_id', pg_temp.lid('MP1'), 'tipo', 'tostion', 'fecha', pg_temp.hoy(), 'nivel_tueste', 'medio', 'peso_entrada_kg', 10, 'origen_proceso_id', pg_temp.rid('T1'), 'baches', pg_temp.baches(10)))$$,
  'P0001', 'origen_invalido', 'la tostión parte de la raíz: no admite origen'
);

-- 3. Empaque: báscula, sobrante y merma de la tanda (B-08) ---------------------------------------------------------------
select pg_temp.reg('T2', 'MP1', 'tostion', jsonb_build_object('nivel_tueste', 'medio', 'peso_entrada_kg', 54, 'baches', pg_temp.baches(54)));
select throws_ok(
  $$select cafe.registrar_empaque(jsonb_build_object('lote_id', pg_temp.lid('MP1'), 'fecha', pg_temp.hoy(), 'peso_bascula_kg', 50, 'lineas', '[{"presentacion_g":500,"unidades":10}]'::jsonb))$$,
  'P0001', 'origen_requerido', 'con dos tandas abiertas hay que elegir de cuál sale el empaque'
);
select throws_ok(
  format($$select cafe.registrar_empaque(jsonb_build_object('lote_id', %L, 'fecha', pg_temp.hoy(), 'origen_proceso_id', %L, 'peso_bascula_kg', 130, 'lineas', '[{"presentacion_g":500,"unidades":10}]'::jsonb))$$, pg_temp.lid('MP1'), pg_temp.rid('T1')),
  'P0001', 'bascula_supera_entrada', 'la báscula no supera lo que entró a tostión'
);
select throws_ok(
  format($$select cafe.registrar_empaque(jsonb_build_object('lote_id', %L, 'fecha', pg_temp.hoy(), 'origen_proceso_id', %L, 'peso_bascula_kg', 50, 'lineas', '[{"presentacion_g":500,"unidades":200}]'::jsonb))$$, pg_temp.lid('MP1'), pg_temp.rid('T1')),
  'P0001', 'empaque_supera_peso', 'las bolsas no suman más que la báscula'
);
select is(
  pg_temp.detalle(format($$select cafe.registrar_empaque(jsonb_build_object('lote_id', %L, 'fecha', pg_temp.hoy(), 'origen_proceso_id', %L, 'peso_bascula_kg', 50, 'lineas', '[{"presentacion_g":500,"unidades":200}]'::jsonb))$$, pg_temp.lid('MP1'), pg_temp.rid('T1'))),
  'Las bolsas suman más que el peso en báscula. Revisar cantidades.', 'el mensaje dice qué pasó y cómo resolverlo'
);
-- Tanda 1: 118 kg a tostión no, ejemplo del ticket: 64,0 → 52,4. Se usa la tostión T1 (118) con báscula 96,7 para cuadrar el acumulado.
select pg_temp.reg('T3', 'MP1', 'tostion', jsonb_build_object('nivel_tueste', 'medio', 'peso_entrada_kg', 64, 'baches', pg_temp.baches(64)));
insert into res select 'E3', cafe.registrar_empaque(jsonb_build_object('lote_id', pg_temp.lid('MP1'), 'fecha', pg_temp.hoy(), 'origen_proceso_id', pg_temp.rid('T3'),
  'peso_bascula_kg', 52.4, 'lineas', '[{"presentacion_g":500,"unidades":104}]'::jsonb));
select is((select r ->> 'sobrante_kg' from res where k = 'E3'), '0.400', 'tanda 1: báscula 52,4 − bolsas 52,0 = sobrante 0,4');
select is(
  (select row(peso_entrada_kg, peso_salida_kg, merma_kg, merma_pct)::text from cafe.procesos where id = pg_temp.rid('T3')),
  row(64.000, 52.400, 11.600, 18.125)::text, 'la merma se asigna a la tostión de la tanda: 64,0 → 52,4 kg'
);
select is(
  (select row(peso_entrada_kg, peso_salida_kg, diferencia_kg, diferencia_destino)::text from cafe.procesos where id = pg_temp.rid('E3')),
  row(52.400, 52.000, 0.400, 'granel')::text, 'el empaque guarda báscula (entrada), bolsas (salida) y sobrante (diferencia)'
);
select is((select origen_tipo::text from cafe.procesos where id = pg_temp.rid('E3')), 'tostion', 'el empaque enlaza a su tostión');
select throws_ok(
  format($$select cafe.registrar_empaque(jsonb_build_object('lote_id', %L, 'fecha', pg_temp.hoy(), 'origen_proceso_id', %L, 'peso_bascula_kg', 50, 'lineas', '[{"presentacion_g":500,"unidades":10}]'::jsonb))$$, pg_temp.lid('MP1'), pg_temp.rid('T3')),
  'P0001', 'tanda_con_empaque', 'una tanda ya cerrada no admite otro empaque'
);
select throws_ok(
  format($$select cafe.anular_proceso(%L, 'prueba')$$, pg_temp.rid('T3')), '42501', 'no_autorizado', 'el operativo no anula'
);

-- Tanda 2 del ejemplo: 54,0 kg; 500 g: 48 grano + 20 molido; 2.500 g: 4 grano = 44,0 kg; sobrante 0,3; báscula 44,3.
select pg_temp.reg('M2', 'MP1', 'molienda', jsonb_build_object('origen_proceso_id', pg_temp.rid('T2'), 'peso_entrada_kg', 10));
select is((select peso_salida_kg from cafe.procesos where id = pg_temp.rid('M2')), null::numeric, 'la molienda no lleva peso de salida');
select is((select origen_tipo::text from cafe.procesos where id = pg_temp.rid('M2')), 'tostion', 'la molienda cuelga de la tostión y no consume saldo');
select is(cafe.saldo_proceso(pg_temp.rid('T2')), 54.000, 'la molienda no gasta el saldo de la tostión');
insert into res select 'E2', cafe.registrar_empaque(jsonb_build_object('lote_id', pg_temp.lid('MP1'), 'fecha', pg_temp.hoy(), 'origen_proceso_id', pg_temp.rid('T2'),
  'peso_bascula_kg', 44.3, 'lineas', '[{"presentacion_g":500,"unidades":48},{"presentacion_g":500,"unidades":20,"forma":"molido"},{"presentacion_g":2500,"unidades":4}]'::jsonb));
select is((select r ->> 'sobrante_kg' from res where k = 'E2'), '0.300', 'tanda 2: sobrante 0,3');
select is((select r -> 'merma_tostion' ->> 'merma_pct' from res where k = 'E2'), '17.963', 'merma de la tanda 2: (54,0 − 44,3) / 54,0 = 18,0 % (17,963)');
select is((select r -> 'acumulado' ->> 'bascula_kg' from res where k = 'E2'), '96.700', 'acumulado del lote: 118,0 → 96,7 kg');
select is((select r -> 'acumulado' ->> 'merma_pct' from res where k = 'E2'), '18.051', '… 18,1 %');
select is(
  (select desvio_sentido from cafe.procesos where id = pg_temp.rid('T2')), null::text, 'en rango (18 % ± 2): sin desvío'
);
select is(
  (select row(entrada_kg, bascula_kg, cerrada)::text from cafe.v_tostion_tandas where proceso_id = pg_temp.rid('T2')),
  row(54.000, 44.300, true)::text, 'v_tostion_tandas: tanda cerrada con su báscula'
);
select is(
  (select row(completo, parcial)::text from cafe.v_lote_etapas where lote_id = pg_temp.lid('MP1') and tipo = 'empaque'),
  row(false, true)::text, 'con una tanda sin empacar (la de 118,0 kg) el empaque queda parcial'
);

-- 4. Tostado sin empacar (B-09) -----------------------------------------------------------------------------------------
select is((select kg from cafe.v_inventario_tostado where lote_id = pg_temp.lid('MP1') and forma = 'grano'), 0.700, 'Inventario › Tostado sin empacar: Excelso · grano 0,7 kg (0,4 + 0,3)');
select throws_ok(
  format($$select cafe.registrar_empaque(jsonb_build_object('lote_id', %L, 'fecha', pg_temp.hoy(), 'origen_proceso_id', %L, 'peso_bascula_kg', 10, 'lineas', '[{"presentacion_g":500,"unidades":20}]'::jsonb,
         'incluir_tostado', jsonb_build_array(jsonb_build_object('lote_origen_id', %L, 'forma', 'grano', 'kg', 5))))$$,
         pg_temp.lid('MP1'), pg_temp.rid('T1'), pg_temp.lid('MP1')),
  'P0001', null, 'incluir más tostado del que hay no es posible (saldo nunca negativo)'
);
select pg_temp.reg('T4', 'MP1', 'tostion', jsonb_build_object('nivel_tueste', 'medio', 'peso_entrada_kg', 20, 'baches', pg_temp.baches(20)));
insert into res select 'E4', cafe.registrar_empaque(jsonb_build_object('lote_id', pg_temp.lid('MP1'), 'fecha', pg_temp.hoy(), 'origen_proceso_id', pg_temp.rid('T4'),
  'peso_bascula_kg', 16.4, 'lineas', '[{"presentacion_g":500,"unidades":34}]'::jsonb,
  'incluir_tostado', jsonb_build_array(jsonb_build_object('lote_origen_id', pg_temp.lid('MP1'), 'forma', 'grano', 'kg', 0.7))));
select is((select kg from cafe.v_inventario_tostado where lote_id = pg_temp.lid('MP1') and forma = 'grano'), 0.100, 'incluirlo lo descuenta del bloque; queda el sobrante nuevo (16,4 + 0,7 − 17,0 = 0,1)');
select is(
  (select row(peso_entrada_kg, peso_salida_kg, tostado_incluido_kg)::text from cafe.procesos where id = pg_temp.rid('E4')),
  row(16.400, 16.300, 0.700)::text, 'lo incluido no es báscula de la tanda: salida = bolsas − incluido'
);
select is((select merma_pct from cafe.procesos where id = pg_temp.rid('T4')), 18.000, 'y no altera la merma de la tanda: (20 − 16,4) / 20 = 18,0 %');

-- 5. Anulación de atrás hacia delante, terceros y aislamiento entre clientes ---------------------------------------------
reset role;
select tests.autenticar_como('admin-a@saldo.test');
select throws_ok(format($$select cafe.anular_proceso(%L, 'prueba')$$, pg_temp.rid('T2')), 'P0001', 'proceso_con_dependientes', 'una tostión con empaque no se anula (de atrás hacia delante)');
select throws_ok(format($$select cafe.anular_proceso(%L, 'prueba')$$, pg_temp.rid('E2')), 'P0001', 'empaque_no_anulable', 'el empaque de marca propia movió inventario: no se anula');
select is((cafe.anular_proceso(pg_temp.rid('M2'), 'Se registró por error') ->> 'kg_liberados')::numeric, 10.000, 'anular libera kilos (kg_liberados) sin borrar filas');

-- Servicio a terceros: el empaque de la tanda fija la salida de su tostión y anularlo la reabre.
select pg_temp.recibir('S1', 100, array['tostion']);
select pg_temp.reg('ST', 'S1', 'tostion', jsonb_build_object('peso_entrada_kg', 100, 'baches', pg_temp.baches(100)));
insert into res select 'SE', cafe.registrar_empaque(jsonb_build_object('lote_id', pg_temp.lid('S1'), 'fecha', pg_temp.hoy(), 'origen_proceso_id', pg_temp.rid('ST'),
  'peso_bascula_kg', 82, 'lineas', '[{"presentacion_g":10000,"unidades":8,"bolsa_cliente":true}]'::jsonb));
select is((select peso_salida_kg from cafe.procesos where id = pg_temp.rid('ST')), 82.000, 'terceros: la báscula del empaque es la salida de la tostión');
select is((select r ->> 'sobrante_kg' from res where k = 'SE'), '2.000', 'terceros: sobrante 2,0 kg (se entrega a granel)');
select is((select diferencia_destino from cafe.procesos where id = pg_temp.rid('SE')), 'suelto', 'y queda marcado como entregado suelto');
select is((select count(*)::int from cafe.v_inventario_tostado where lote_id = pg_temp.lid('S1')), 0, 'el sobrante de terceros no entra a nuestro tostado');
select cafe.anular_proceso(pg_temp.rid('SE'), 'Error de conteo');
select is((select peso_salida_kg from cafe.procesos where id = pg_temp.rid('ST')), null::numeric, 'anular el empaque de terceros reabre la tanda: la tostión vuelve a no tener salida');

-- Otro cliente no ve ni usa nada del cliente A.
reset role;
select tests.autenticar_como('owner-b@saldo.test');
select is((select count(*)::int from cafe.v_origenes_disponibles), 0, 'B no ve los orígenes de A');
select is((select count(*)::int from cafe.v_inventario_tostado), 0, 'B no ve el tostado de A');
select is((select count(*)::int from cafe.tostado_movimientos), 0, 'B no ve los movimientos de tostado de A');
select throws_ok(
  format($$select cafe.registrar_proceso(jsonb_build_object('lote_id', %L, 'tipo', 'tostion', 'fecha', pg_temp.hoy(), 'nivel_tueste', 'medio', 'peso_entrada_kg', 10, 'baches', pg_temp.baches(10)))$$, pg_temp.lid('MP1')),
  'P0001', 'lote_no_encontrado', 'B no registra procesos sobre un lote de A'
);
select throws_ok(
  format($$select cafe._asignar_salida_tostion(%L)$$, pg_temp.rid('E2')), 'P0001', 'proceso_no_encontrado', 'B no asigna la salida de una tostión de A (definer acotado al cliente)'
);
select is(tests.filas_afectadas(format($$update cafe.procesos set peso_salida_kg = 1 where id = %L$$, pg_temp.rid('T2'))), 0, 'B no actualiza procesos de A');

-- La FK compuesta impide enlazar un proceso de B con un origen de A (la comprobación de una FK salta el RLS).
select pg_temp.comprar_b();
reset role;
select throws_ok(
  format($$insert into cafe.procesos (tenant_id, lote_id, tipo, fecha, peso_entrada_kg, origen_proceso_id, origen_tipo)
           values (%L, %L, 'empaque', current_date, 5, %L, 'tostion')$$,
         (select id from ids where clave = 'b'), pg_temp.lid('MPB'), pg_temp.rid('T1')),
  '23503', null, 'la FK compuesta (cliente, origen, tipo, lote) rechaza un origen de otro cliente'
);

-- Otro rol: el viewer no escribe.
reset role;
select tests.autenticar_como('viewer-a@saldo.test');
select throws_ok(
  format($$select cafe.registrar_proceso(jsonb_build_object('lote_id', %L, 'tipo', 'tostion', 'fecha', pg_temp.hoy(), 'nivel_tueste', 'medio', 'peso_entrada_kg', 10, 'baches', pg_temp.baches(10)))$$, pg_temp.lid('MP1')),
  '42501', 'no_autorizado', 'el viewer no registra procesos'
);
select is((select count(*)::int from cafe.v_origenes_disponibles where lote_id = pg_temp.lid('MP1')) > 0, true, 'pero sí ve el saldo');

select * from finish();
rollback;
