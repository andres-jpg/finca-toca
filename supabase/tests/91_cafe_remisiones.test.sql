-- Remisiones de entrega del vertical café (FIN-113 · CO-32): cafe.remisiones, cafe.generar_remision(),
-- cafe.anular_remision() y el estado `entregado` de cafe.v_lotes.
-- Cubre el ejemplo del informe (500 kg → entregado 330 kg, merma 170 kg = 34 %, servicios $1.923.000), la numeración
-- REM sin huecos, una sola remisión vigente por lote, servicios pendientes (y forzar solo owner/admin con
-- observación), el bloqueo de procesos tras entregar, la anulación, los roles y el aislamiento entre clientes.
-- Todo se crea AQUÍ dentro de la transacción (rollback al final): dos clientes de café (A y B), sin depender del seed.
--   r1 owner A   r2 admin A   r3 operativo A   r4 viewer A   r5 owner B
-- Los lotes se crean con las RPC reales (registrar_recepcion / registrar_compra / registrar_proceso).
begin;

select plan(96);

-- 0. Preparación --------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000091a1', 'authenticated', 'authenticated', 'owner-a@remisiones.test'),
  ('00000000-0000-0000-0000-0000000091a2', 'authenticated', 'authenticated', 'admin-a@remisiones.test'),
  ('00000000-0000-0000-0000-0000000091a3', 'authenticated', 'authenticated', 'operativo-a@remisiones.test'),
  ('00000000-0000-0000-0000-0000000091a4', 'authenticated', 'authenticated', 'viewer-a@remisiones.test'),
  ('00000000-0000-0000-0000-0000000091a5', 'authenticated', 'authenticated', 'owner-b@remisiones.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Remisiones A', 'remisiones-a-t', 'cafe');
select platform.crear_tenant('Remisiones B', 'remisiones-b-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'remisiones-a-t'
union all select 'b', id from public.tenants where slug = 'remisiones-b-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), m.rol::public.rol_tenant
  from (values
    ('00000000-0000-0000-0000-0000000091a1', 'a', 'owner'),
    ('00000000-0000-0000-0000-0000000091a2', 'a', 'admin'),
    ('00000000-0000-0000-0000-0000000091a3', 'a', 'operativo'),
    ('00000000-0000-0000-0000-0000000091a4', 'a', 'viewer'),
    ('00000000-0000-0000-0000-0000000091a5', 'b', 'owner')) as m(user_id, t, rol);

-- Terceros: ca (cliente de servicios de A), pa (proveedor de A), cb (cliente de servicios de B). Excelso de A.
with t as (
  insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles)
  select i.id, x.nombre, 'Calle 1', '3000000000', x.identificacion, x.roles
    from (values ('a', 'Juan Pérez',  '9100001', array['cliente_servicio']),
                 ('a', 'Proveedor A', '9100002', array['proveedor']),
                 ('b', 'Cliente B',   '9100003', array['cliente_servicio'])) as x(t, nombre, identificacion, roles)
    join ids i on i.clave = x.t
  returning identificacion, id
)
insert into ids select case identificacion when '9100001' then 'ca' when '9100002' then 'pa' else 'cb' end, id from t;
insert into ids select 'xa', t.id from cafe.tipos_cafe t join ids i on i.id = t.tenant_id and i.clave = 'a' where t.nombre = 'Excelso';

-- Resultados de las RPC por clave, para comprobarlos sin repetir llamadas.
create temp table res (k text primary key, r jsonb);
grant select, insert on res to authenticated;

create or replace function pg_temp.hoy() returns text language sql as $$ select to_char(current_date, 'YYYY-MM-DD') $$;
grant execute on function pg_temp.hoy() to authenticated;

-- Número REM esperado: REM-<año de hoy>-000n.
create or replace function pg_temp.rem(n integer) returns text language sql as $$
  select 'REM-' || to_char(current_date, 'YYYY') || '-' || lpad(n::text, 4, '0')
$$;
grant execute on function pg_temp.rem(integer) to authenticated;

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

create or replace function pg_temp.barr(p_k text, p_nums integer[]) returns uuid[] language sql as $$
  select array_agg(b.id order by b.numero) from cafe.lote_bultos b where b.lote_id = pg_temp.lid(p_k) and b.numero = any(p_nums)
$$;
grant execute on function pg_temp.barr(text, integer[]) to authenticated;

-- Entrada de registrar_proceso: lote `p_k`, tipo, fecha de hoy, todos los bultos y `p_extra`.
create or replace function pg_temp.p(p_k text, p_tipo text, p_extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('lote_id', pg_temp.lid(p_k), 'tipo', p_tipo, 'fecha', pg_temp.hoy(),
         'bultos', to_jsonb(pg_temp.barr(p_k, array(select generate_series(1, 200))))) || p_extra
$$;
grant execute on function pg_temp.p(text, text, jsonb) to authenticated;

create or replace function pg_temp.reg(p_k text, p_tipo text, p_extra jsonb default '{}')
returns void language plpgsql as $$
begin
  perform cafe.registrar_proceso(pg_temp.p(p_k, p_tipo, p_extra));
end $$;
grant execute on function pg_temp.reg(text, text, jsonb) to authenticated;

-- Baches de 13,5 kg (n) que dejan salir `p_salida` kg cada uno.
create or replace function pg_temp.baches(p_n integer, p_salida numeric) returns jsonb language sql as $$
  select jsonb_build_object('baches', (
    select jsonb_agg(jsonb_build_object('peso_entrada_kg', 13.5, 'peso_salida_kg', p_salida) order by g)
      from generate_series(1, p_n) g))
$$;
grant execute on function pg_temp.baches(integer, numeric) to authenticated;

-- Los 30 baches del ejemplo del informe: 405 kg de entrada y 332 kg de salida (26 × 11 + 4 × 11,5).
create or replace function pg_temp.baches_ejemplo() returns jsonb language sql as $$
  select jsonb_build_object('baches', (
    select jsonb_agg(jsonb_build_object('peso_entrada_kg', 13.5, 'peso_salida_kg', case when g <= 26 then 11 else 11.5 end) order by g)
      from generate_series(1, 30) g))
$$;
grant execute on function pg_temp.baches_ejemplo() to authenticated;

-- Genera la remisión del lote `p_k` (fecha de hoy) y guarda el resultado bajo `p_res`.
create or replace function pg_temp.gen(p_res text, p_k text, p_extra jsonb default '{}')
returns void language plpgsql as $$
begin
  insert into res select p_res, cafe.generar_remision(
    jsonb_build_object('lote_id', pg_temp.lid(p_k), 'fecha', pg_temp.hoy()) || p_extra);
end $$;
grant execute on function pg_temp.gen(text, text, jsonb) to authenticated;

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
select has_table('cafe', 'remisiones', 'existe cafe.remisiones');
select ok((select relrowsecurity from pg_class where oid = 'cafe.remisiones'::regclass), 'cafe.remisiones tiene RLS activada');
select has_index('cafe', 'remisiones', 'remisiones_un_lote', 'una remisión vigente por lote (índice único parcial)');
select ok(
  not has_table_privilege('authenticated', 'cafe.remisiones', 'delete')
  and not has_table_privilege('service_role', 'cafe.remisiones', 'delete'),
  'nadie borra remisiones'
);
select ok(not has_table_privilege('anon', 'cafe.remisiones', 'select'), 'anon no lee remisiones');
select ok(
  not has_column_privilege('authenticated', 'cafe.remisiones', 'merma_total_kg', 'insert')
  and not has_column_privilege('authenticated', 'cafe.remisiones', 'merma_total_pct', 'insert')
  and not has_column_privilege('authenticated', 'cafe.remisiones', 'anulada_at', 'insert')
  and not has_column_privilege('authenticated', 'cafe.remisiones', 'peso_entregado_kg', 'update')
  and not has_column_privilege('authenticated', 'cafe.remisiones', 'detalle', 'update')
  and has_column_privilege('authenticated', 'cafe.remisiones', 'anulada_at', 'update'),
  'lo calculado y la anulación no se insertan; de una remisión solo se anula o se anotan observaciones'
);
select is(
  (select array_agg(p.prosecdef order by p.proname)
     from pg_proc p
    where p.oid in ('cafe.generar_remision(jsonb)'::regprocedure, 'cafe.anular_remision(uuid,text)'::regprocedure)),
  array[false, false], 'generar_remision y anular_remision son SECURITY INVOKER'
);
select ok(
  not has_function_privilege('anon', 'cafe.generar_remision(jsonb)', 'execute')
  and not has_function_privilege('anon', 'cafe.anular_remision(uuid,text)', 'execute')
  and not has_function_privilege('authenticated', 'cafe.remisiones_proteger()', 'execute')
  and not has_function_privilege('authenticated', 'cafe.procesos_lote_entregado()', 'execute')
  and has_function_privilege('authenticated', 'cafe.generar_remision(jsonb)', 'execute'),
  'anon no ejecuta las RPC y las funciones de los triggers no se llaman a mano'
);
select ok(
  (select coalesce(c.reloptions, '{}') @> array['security_invoker=true'] from pg_class c where c.oid = 'cafe.v_lotes'::regclass)
  and has_table_privilege('authenticated', 'cafe.v_lotes', 'select')
  and not has_table_privilege('anon', 'cafe.v_lotes', 'select'),
  'v_lotes sigue siendo security_invoker y conserva sus privilegios tras redefinirla'
);
select is(
  (select count(*)::int from pg_attribute a
    where a.attrelid = 'cafe.v_lotes'::regclass and a.attnum > 0 and not a.attisdropped
      and a.attname in ('id', 'codigo', 'linea', 'tercero_nombre', 'servicios_requeridos', 'servicios_completados',
                        'avance_texto', 'estado', 'peso_actual_kg', 'merma_total_kg', 'merma_total_pct',
                        'valor_servicios', 'tiene_desvio')),
  13, 'v_lotes conserva las columnas que lee la app'
);

-- 2. Antes de entregar: lo que NO se puede remitir ---------------------------------------------------------------------
select tests.autenticar_como('operativo-a@remisiones.test');

select pg_temp.recibir('L1', 500, 8, array['trilla', 'tostion', 'molienda'], 'medio');
select pg_temp.recibir('L2', 100, 2, array['trilla', 'tostion'], 'bajo');
select pg_temp.recibir('L3', 50, 1, array['trilla']);
select pg_temp.recibir('L4', 60, 1, array['trilla']);
select pg_temp.comprar('M1', 125, 2);

select throws_ok($$select cafe.generar_remision('{}'::jsonb)$$, 'P0001', 'datos_invalidos', 'sin lote ni fecha: datos_invalidos');
select throws_ok($$select cafe.generar_remision('[]'::jsonb)$$, 'P0001', 'datos_invalidos', 'ni como arreglo: datos_invalidos');
select throws_ok(
  $$select cafe.generar_remision(jsonb_build_object('lote_id', 'no-es-uuid', 'fecha', pg_temp.hoy()))$$,
  'P0001', 'datos_invalidos', 'un lote_id que no es uuid: datos_invalidos'
);
select throws_ok(
  $$select cafe.generar_remision(jsonb_build_object('lote_id', gen_random_uuid(), 'fecha', pg_temp.hoy()))$$,
  'P0001', 'lote_no_encontrado', 'un lote que no existe: lote_no_encontrado'
);
select throws_ok(
  $$select pg_temp.gen('x', 'M1')$$,
  'P0001', 'remision_solo_servicios', 'un lote de marca propia no lleva remisión (HU-13 es solo para terceros)'
);
select throws_ok(
  $$select pg_temp.gen('x', 'L4', jsonb_build_object('fecha', to_char(current_date - 1, 'YYYY-MM-DD')))$$,
  'P0001', 'datos_invalidos', 'la entrega no puede ser anterior a la recepción'
);
select is(
  pg_temp.detalle($$select pg_temp.gen('x', 'L4', jsonb_build_object('fecha', to_char(current_date - 1, 'YYYY-MM-DD')))$$),
  'La fecha de entrega no puede ser anterior a la recepción del lote.', 'y el mensaje lo dice'
);
select throws_ok(
  $$select pg_temp.gen('x', 'L4')$$,
  'P0001', 'remision_sin_procesos', 'un lote recién recibido (sin procesos) no se puede entregar'
);

-- Sin consumir número: lo anterior falló y la serie REM no se tocó.
select is((select count(*)::int from public.consecutivos where serie = 'REM'), 0, 'los intentos fallidos no consumen número REM');

-- Servicios pendientes: solo la trilla de L1.
select pg_temp.reg('L1', 'trilla', '{"peso_salida_kg": 405}');
select throws_ok($$select pg_temp.gen('x', 'L1')$$, 'P0001', 'servicios_incompletos', 'con servicios pendientes: servicios_incompletos');
select is(
  pg_temp.detalle($$select pg_temp.gen('x', 'L1')$$),
  'Faltan servicios por completar: tostión, molienda, empaque.', 'el mensaje dice cuáles faltan, en el orden de la planta'
);
select throws_ok(
  $$select pg_temp.gen('x', 'L1', '{"forzar": true, "observaciones": "El cliente lo recoge hoy"}')$$,
  'P0001', 'remision_forzar_no_permitido', 'un operativo no puede forzar'
);
select is(
  (select count(*)::int from cafe.remisiones), 0, 'y no se escribió nada'
);

-- 3. El ejemplo del informe: 500 kg, 8 bultos, trilla + tostión + molienda ----------------------------------------------------------
select pg_temp.reg('L1', 'tostion', pg_temp.baches_ejemplo());
select is(
  (select v.estado from cafe.v_lotes v where v.id = pg_temp.lid('L1')), 'en_proceso', 'a medias: el lote está en proceso'
);
select pg_temp.reg('L1', 'molienda', '{"peso_salida_kg": 330}');
select throws_ok($$select pg_temp.gen('x', 'L1')$$, 'P0001', 'servicios_incompletos', 'sin el empaque (incluido en la tostión) el lote no está listo');
select pg_temp.reg('L1', 'empaque', '{"peso_salida_kg": 330}');
select is((select v.estado from cafe.v_lotes v where v.id = pg_temp.lid('L1')), 'listo', 'con los 4 pasos completos el lote está listo');

select pg_temp.gen('R1', 'L1', '{"recibido_por": "  Pedro Gómez ", "observaciones": "Entrega en bodega"}');
select is(
  (select r ->> 'numero' from res where k = 'R1'), pg_temp.rem(1), 'la primera remisión es REM-<año>-0001'
);
select is((select (r ->> 'forzada')::boolean from res where k = 'R1'), false, 'un lote listo no es una entrega forzada');
select is(
  (select row(x.cliente_nombre, x.cliente_identificacion, x.peso_recibido_kg, x.peso_entregado_kg, x.merma_total_kg,
              x.merma_total_pct, x.valor_servicios, x.recibido_por, x.fecha, x.forzada, x.anulada_at)::text
     from cafe.remisiones x where x.id = pg_temp.lid('R1')),
  row('Juan Pérez', '9100001', 500.000::numeric, 330.000::numeric, 170.000::numeric, 34.000::numeric,
      1923000.00::numeric, 'Pedro Gómez', current_date, false, null::timestamptz)::text,
  'recibido 500, entregado 330, merma 170 kg (34,0 %), valor $1.923.000, el cliente congelado y quién recoge sin espacios'
);
select is(
  (select row(x.lote_codigo, x.tercero_id)::text from cafe.remisiones x where x.id = pg_temp.lid('R1')),
  (select row(v.codigo, v.tercero_id)::text from cafe.v_lotes v where v.id = pg_temp.lid('L1')),
  'la remisión guarda el código del lote y el tercero (para el listado y su filtro por cliente)'
);
select is(
  (select x.valor_servicios from cafe.remisiones x where x.id = pg_temp.lid('R1')),
  (select sum(p.valor) from cafe.procesos p where p.lote_id = pg_temp.lid('L1') and p.anulado_at is null),
  'el valor de los servicios coincide con la suma de procesos.valor del lote'
);
select is(
  (select jsonb_agg(jsonb_build_array(d ->> 'servicio', (d ->> 'kg_entrada')::numeric, (d ->> 'kg_salida')::numeric,
                                      (d ->> 'tarifa_kg')::numeric, (d ->> 'valor')::numeric) order by o)
     from cafe.remisiones x, jsonb_array_elements(x.detalle) with ordinality as e(d, o) where x.id = pg_temp.lid('R1')),
  '[["trilla", 500, 405, 1400, 700000], ["tostion", 405, 332, 2200, 891000],
    ["molienda", 332, 330, 1000, 332000], ["empaque", 330, 330, 0, 0]]'::jsonb,
  'el detalle trae los cuatro pasos en orden, con kilos, tarifa efectiva y valor de cada uno'
);
select is(
  (select array_agg(d ->> 'nivel_tueste' order by o) from cafe.remisiones x, jsonb_array_elements(x.detalle) with ordinality as e(d, o)
    where x.id = pg_temp.lid('R1')),
  array[null, 'medio', null, null], 'el nivel de tueste solo aparece en la tostión'
);
select is(
  (select array_agg((d ->> 'incluido')::boolean order by o) from cafe.remisiones x, jsonb_array_elements(x.detalle) with ordinality as e(d, o)
    where x.id = pg_temp.lid('R1')),
  array[false, false, false, true], 'el empaque se marca como incluido (sin coste)'
);
select is((select v.estado from cafe.v_lotes v where v.id = pg_temp.lid('L1')), 'entregado', 'el lote pasa a Entregado');
select is(
  (select v.avance_texto from cafe.v_lotes v where v.id = pg_temp.lid('L1')), '4 de 4', 'y conserva su avance'
);

-- Una sola remisión vigente por lote.
select throws_ok($$select pg_temp.gen('x', 'L1')$$, 'P0001', 'remision_duplicada', 'una segunda remisión del mismo lote: remision_duplicada');
select throws_ok(
  format($$insert into cafe.remisiones (numero, lote_id, lote_codigo, fecha, tercero_id, cliente_nombre, peso_recibido_kg, peso_entregado_kg, detalle, valor_servicios)
           values ('REM-OTRA', %L, 'MQ-X', current_date, %L, 'X', 500, 330, '[]', 0)$$, pg_temp.lid('L1'), (select id from ids where clave = 'ca')),
  '23505', null, 'ni insertando directo: el índice único parcial lo impide'
);

-- 4. Forzar con servicios pendientes (solo owner/admin) ---------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('admin-a@remisiones.test');

select pg_temp.reg('L2', 'trilla', '{"peso_salida_kg": 81}');
select throws_ok(
  $$select pg_temp.gen('x', 'L2', '{"forzar": true}')$$,
  'P0001', 'datos_invalidos', 'forzar exige la observación'
);
select is(
  pg_temp.detalle($$select pg_temp.gen('x', 'L2', '{"forzar": true, "observaciones": "   "}')$$),
  'Para entregar con servicios pendientes escribe la observación (por qué se entrega así).',
  'una observación en blanco tampoco vale, y el mensaje explica por qué'
);
select pg_temp.gen('R2', 'L2', '{"forzar": true, "observaciones": "El cliente recoge hoy; la tostión queda para otra visita"}');
select is((select r ->> 'numero' from res where k = 'R2'), pg_temp.rem(2), 'la numeración sigue sin huecos: REM-<año>-0002');
select is((select (r ->> 'forzada')::boolean from res where k = 'R2'), true, 'la entrega con pendientes queda marcada como forzada');
select is(
  (select row(x.peso_recibido_kg, x.peso_entregado_kg, x.merma_total_kg, x.merma_total_pct, x.valor_servicios, x.forzada)::text
     from cafe.remisiones x where x.id = pg_temp.lid('R2')),
  row(100.000::numeric, 81.000::numeric, 19.000::numeric, 19.000::numeric, 140000.00::numeric, true)::text,
  'lo entregado es lo que había (81 kg tras la trilla) y solo se cobra lo hecho'
);
select is(
  (select jsonb_agg(jsonb_build_array(d ->> 'servicio', coalesce((d ->> 'pendiente')::boolean, false), d -> 'kg_entrada') order by o)
     from cafe.remisiones x, jsonb_array_elements(x.detalle) with ordinality as e(d, o) where x.id = pg_temp.lid('R2')),
  '[["trilla", false, 100], ["tostion", true, null], ["empaque", true, null]]'::jsonb,
  'los servicios no hechos van como pendientes y sin cifras'
);
select is((select v.estado from cafe.v_lotes v where v.id = pg_temp.lid('L2')), 'entregado', 'el lote forzado también pasa a Entregado');

-- Un lote entregado no admite procesos nuevos ni anular los vigentes.
select throws_ok(
  format($$select cafe.anular_proceso(%L, 'Intento')$$, (select p.id from cafe.procesos p where p.lote_id = pg_temp.lid('L1') and p.tipo = 'empaque')),
  'P0001', 'lote_entregado', 'el empaque de L1 (ya entregado en R1) no se anula sin anular antes la remisión'
);
select throws_ok(
  $$select pg_temp.reg('L2', 'tostion', pg_temp.baches(6, 11))$$,
  'P0001', 'lote_entregado', 'no se registra la tostión de un lote ya entregado'
);
select throws_ok(
  format($$select cafe.anular_proceso(%L, 'Me equivoqué')$$, (select p.id from cafe.procesos p where p.lote_id = pg_temp.lid('L2') and p.tipo = 'trilla')),
  'P0001', 'lote_entregado', 'ni se anula la trilla de un lote ya entregado'
);
select is(
  (select count(*)::int from cafe.procesos p where p.lote_id = pg_temp.lid('L2') and p.anulado_at is null), 1,
  'el proceso sigue vigente'
);

-- Corregir las notas de un proceso sí se puede (no es un cambio de lo entregado).
select is(
  tests.filas_afectadas(format($$update cafe.procesos set observaciones = 'Revisado' where id = %L$$,
    (select p.id from cafe.procesos p where p.lote_id = pg_temp.lid('L2') and p.tipo = 'trilla'))),
  1, 'las observaciones de un proceso de un lote entregado se pueden corregir'
);

-- 5. Anular la remisión ----------------------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('operativo-a@remisiones.test');
select throws_ok(
  format($$select cafe.anular_remision(%L, 'Error de digitación')$$, pg_temp.lid('R2')),
  '42501', null, 'un operativo no anula remisiones'
);
reset role;
select tests.autenticar_como('admin-a@remisiones.test');
select throws_ok(
  format($$select cafe.anular_remision(%L, '  ')$$, pg_temp.lid('R2')),
  'P0001', 'datos_invalidos', 'anular exige el motivo'
);
select throws_ok(
  $$select cafe.anular_remision(gen_random_uuid(), 'Motivo')$$,
  'P0001', 'remision_no_encontrada', 'una remisión que no existe: remision_no_encontrada'
);
select is(
  (select cafe.anular_remision(pg_temp.lid('R2'), 'El cliente aún no recoge')),
  jsonb_build_object('id', pg_temp.lid('R2'), 'numero', pg_temp.rem(2), 'lote_id', pg_temp.lid('L2'), 'lote_estado', 'en_proceso'),
  'anular devuelve la remisión y el estado en que queda el lote (en proceso: la tostión sigue pendiente)'
);
select is(
  (select row(x.anulada_por = '00000000-0000-0000-0000-0000000091a2', x.anulada_at is not null, x.motivo_anulacion)::text
     from cafe.remisiones x where x.id = pg_temp.lid('R2')),
  row(true, true, 'El cliente aún no recoge')::text, 'la base fija quién y cuándo anuló'
);
select throws_ok(
  format($$select cafe.anular_remision(%L, 'Otra vez')$$, pg_temp.lid('R2')),
  'P0001', 'remision_anulada', 'una remisión anulada no se anula dos veces'
);
select throws_ok(
  format($$update cafe.remisiones set observaciones = 'Cambio' where id = %L$$, pg_temp.lid('R2')),
  'P0001', 'remision_anulada', 'una remisión anulada es definitiva'
);
select pg_temp.reg('L2', 'tostion', pg_temp.baches(6, 11));
select is(
  (select row(v.estado, v.avance_texto)::text from cafe.v_lotes v where v.id = pg_temp.lid('L2')),
  row('en_proceso', '2 de 3')::text, 'anulada la remisión, el lote vuelve a admitir procesos y a su estado derivado'
);
select pg_temp.reg('L2', 'empaque', '{"peso_salida_kg": 66}');
select pg_temp.gen('R3', 'L2');
select is(
  (select r ->> 'numero' from res where k = 'R3'), pg_temp.rem(3),
  'tras anular, se genera otra con número nuevo: el de la anulada no se reutiliza'
);
select is(
  (select count(*)::int from cafe.remisiones where lote_id = pg_temp.lid('L2')), 2, 'el lote conserva las dos: la anulada y la vigente'
);
select is(
  (select count(*)::int from cafe.remisiones where lote_id = pg_temp.lid('L2') and anulada_at is null), 1, 'pero solo una vigente'
);
select is(
  (select x.peso_entregado_kg from cafe.remisiones x where x.id = pg_temp.lid('R3')), 66.000,
  'la nueva remisión refleja lo que se hizo después (66 kg)'
);
select is((select (r ->> 'forzada')::boolean from res where k = 'R3'), false, 'y ya no es forzada: el lote está completo');

-- Las notas de una remisión vigente las corrige owner/admin.
select is(
  tests.filas_afectadas(format($$update cafe.remisiones set recibido_por = 'Ana Ruiz' where id = %L$$, pg_temp.lid('R3'))),
  1, 'el admin corrige quién recibió'
);
select throws_ok(
  format($$update cafe.remisiones set peso_entregado_kg = 1 where id = %L$$, pg_temp.lid('R3')),
  '42501', null, 'pero no lo entregado (no hay privilegio de UPDATE sobre esa columna)'
);
select throws_ok($$delete from cafe.remisiones$$, '42501', null, 'y nadie borra remisiones');

-- 6. Un lote anulado no se remite ---------------------------------------------------------------------------------------------------------
select is(
  (select (cafe.anular_remision(pg_temp.lid('R1'), 'Se entregó a otro cliente') ->> 'lote_estado')), 'listo',
  'anular la remisión de un lote completo lo deja en listo'
);
select pg_temp.gen('R4', 'L1');
select is((select r ->> 'numero' from res where k = 'R4'), pg_temp.rem(4), 'y la siguiente remisión es la 0004');
select is(
  (select array_agg(r.email order by r.email) from cafe.responsables_lote(pg_temp.lid('L1')) r),
  array['admin-a@remisiones.test', 'operativo-a@remisiones.test'],
  'responsables_lote incluye a quien generó y anuló las remisiones (L1: procesos del operativo, remisiones del admin y el operativo)'
);

update cafe.lotes set anulado_at = now(), motivo_anulacion = 'Duplicado' where id = pg_temp.lid('L3');
select throws_ok($$select pg_temp.gen('x', 'L3')$$, 'P0001', 'lote_anulado', 'un lote anulado no se remite');

-- 7. Numeración REM independiente de MP/MQ ----------------------------------------------------------------------------------------------------
select is(
  (select c.ultimo from public.consecutivos c where c.serie = 'REM'), 4, 'la serie REM va por la 4: solo cuentan las remisiones generadas'
);
select is(
  (select array_agg(c.serie order by c.serie) from public.consecutivos c), array['MP', 'MQ', 'REM'],
  'MP, MQ y REM son contadores independientes'
);
select is(
  (select array_agg(x.numero order by x.numero) from cafe.remisiones x),
  array[pg_temp.rem(1), pg_temp.rem(2), pg_temp.rem(3), pg_temp.rem(4)], 'los cuatro números, sin huecos'
);

-- 8. Roles ------------------------------------------------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('viewer-a@remisiones.test');
select is((select count(*)::int from cafe.remisiones), 4, 'Gerencia (viewer) lee las remisiones');
select is((select v.estado from cafe.v_lotes v where v.id = pg_temp.lid('L1')), 'entregado', 'y ve el estado entregado en el lote');
select throws_ok($$select pg_temp.gen('x', 'L4')$$, '42501', null, 'pero no genera remisiones');
select throws_ok(
  format($$select cafe.anular_remision(%L, 'Motivo')$$, pg_temp.lid('R4')),
  '42501', null, 'ni las anula'
);
select throws_ok(
  format($$insert into cafe.remisiones (numero, lote_id, lote_codigo, fecha, tercero_id, cliente_nombre, peso_recibido_kg, peso_entregado_kg, detalle, valor_servicios)
           values ('REM-DIRECTO', %L, 'MQ-X', current_date, %L, 'X', 60, 50, '[]', 0)$$, pg_temp.lid('L4'), (select id from ids where clave = 'ca')),
  '42501', null, 'ni inserta directo (RLS)'
);
select is(
  tests.filas_afectadas(format($$update cafe.remisiones set observaciones = 'x' where id = %L$$, pg_temp.lid('R4'))),
  0, 'ni corrige notas'
);

reset role;
select tests.autenticar_como('operativo-a@remisiones.test');
select is(
  tests.filas_afectadas(format($$update cafe.remisiones set observaciones = 'x' where id = %L$$, pg_temp.lid('R4'))),
  0, 'un operativo genera remisiones pero no las corrige'
);
reset role;

-- 9. Auditoría ---------------------------------------------------------------------------------------------------------------------------------------
select is(
  (select array_agg(l.accion order by l.id) from audit.log l where l.tabla = 'cafe.remisiones' and l.registro_id = pg_temp.lid('R2')::text),
  array['INSERT', 'UPDATE'], 'la remisión deja su INSERT y la anulación un UPDATE en audit.log'
);
select ok(
  (select l.cambios ? 'anulada_at' and l.cambios ? 'motivo_anulacion' and not (l.cambios ? 'detalle')
     from audit.log l
    where l.tabla = 'cafe.remisiones' and l.accion = 'UPDATE' and l.registro_id = pg_temp.lid('R2')::text
    order by l.id limit 1),
  'el UPDATE registra solo lo que cambió (la anulación y su motivo)'
);
select is(
  (select l.tenant_id from audit.log l where l.tabla = 'cafe.remisiones' and l.accion = 'INSERT' and l.registro_id = pg_temp.lid('R1')::text),
  (select id from ids where clave = 'a'), 'el log queda en el cliente de la remisión'
);

-- 10. Aislamiento entre clientes y módulo apagado ---------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('owner-b@remisiones.test');
select pg_temp.recibir('LB', 70, 1, array['trilla'], null, 'cb');
select is((select count(*)::int from cafe.remisiones where tenant_id <> (select id from ids where clave = 'b')), 0, 'el cliente B no ve las remisiones de A');
select is((select count(*)::int from cafe.remisiones), 0, 'ni ninguna: B no ha generado');
select is((select count(*)::int from cafe.v_lotes where estado = 'entregado'), 0, 'ni lotes entregados de A en v_lotes');
select throws_ok($$select pg_temp.gen('x', 'L1')$$, 'P0001', 'lote_no_encontrado', 'B no genera la remisión de un lote de A');
select throws_ok(
  format($$select cafe.anular_remision(%L, 'Intruso')$$, pg_temp.lid('R4')),
  'P0001', 'remision_no_encontrada', 'ni anula remisiones de A'
);
select throws_ok(
  format($$insert into cafe.remisiones (tenant_id, numero, lote_id, lote_codigo, fecha, tercero_id, cliente_nombre, peso_recibido_kg, peso_entregado_kg, detalle, valor_servicios)
           values (%L, 'REM-X', %L, 'MQ-X', current_date, %L, 'X', 10, 8, '[]', 0)$$, (select id from ids where clave = 'a'), pg_temp.lid('LB'), (select id from ids where clave = 'ca')),
  '42501', null, 'ni inserta con el tenant_id de A (RLS)'
);
select throws_ok(
  format($$insert into cafe.remisiones (tenant_id, numero, lote_id, lote_codigo, fecha, tercero_id, cliente_nombre, peso_recibido_kg, peso_entregado_kg, detalle, valor_servicios)
           values (%L, 'REM-X', %L, 'MQ-X', current_date, %L, 'X', 10, 8, '[]', 0)$$, (select id from ids where clave = 'b'), pg_temp.lid('L1'), (select id from ids where clave = 'cb')),
  '23503', null, 'ni cuelga una remisión suya de un lote de A (FK compuesta con el tenant)'
);

-- Un proceso del cliente B en su lote y su remisión: el REM de B arranca en 1 (contador por cliente).
select pg_temp.reg('LB', 'trilla', '{"peso_salida_kg": 56}');
select pg_temp.gen('RB', 'LB');
select is((select r ->> 'numero' from res where k = 'RB'), pg_temp.rem(1), 'el contador REM es por cliente: B arranca en 0001');
select is((select count(*)::int from cafe.remisiones), 1, 'B ve solo la suya');

-- Módulo apagado: sin `cafe.remisiones` el cliente no ve ni genera nada, aunque llame a la API.
reset role;
update public.tenant_modulos set activo = false
 where tenant_id = (select id from ids where clave = 'b') and modulo_id = 'cafe.remisiones';
select tests.autenticar_como('owner-b@remisiones.test');
select is((select count(*)::int from cafe.remisiones), 0, 'sin el módulo cafe.remisiones no se lee ninguna remisión');
select throws_ok(
  $$select pg_temp.gen('x2', 'LB')$$, '42501', null, 'ni se genera una'
);
select throws_ok(
  format($$select cafe.anular_remision(%L, 'Motivo')$$, pg_temp.lid('RB')), '42501', null, 'ni se anula'
);
select is(
  (select v.estado from cafe.v_lotes v where v.id = pg_temp.lid('LB')), 'listo',
  'el lote se muestra como listo (no entregado) mientras el módulo está apagado'
);

select * from finish();
rollback;
