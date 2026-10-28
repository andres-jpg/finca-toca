-- Compra de café para marca propia (FIN-106 · CO-25): cafe.registrar_compra(), cafe.ultimo_precio_compra() y
-- cafe.repartir_peso(). Cubre el caso feliz (375 kg en 6 bultos a $18.500 → MP-2026-0001 y $6.937.500), el
-- precio sugerido, las validaciones, el rollback sin consumir consecutivo, los permisos por rol y módulo y el
-- aislamiento entre clientes. Todo se crea AQUÍ dentro de la transacción (rollback al final): dos clientes de
-- café (A y B) y uno de ganadería (G), sin depender de los usuarios del seed.
--   c1 owner A   c2 admin A   c3 operativo A   c4 viewer A   c5 owner B   c6 owner G (ganadería)
begin;

select plan(90);

-- 0. Preparación --------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'owner-a@compra.test'),
  ('00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'admin-a@compra.test'),
  ('00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', 'operativo-a@compra.test'),
  ('00000000-0000-0000-0000-0000000000c4', 'authenticated', 'authenticated', 'viewer-a@compra.test'),
  ('00000000-0000-0000-0000-0000000000c5', 'authenticated', 'authenticated', 'owner-b@compra.test'),
  ('00000000-0000-0000-0000-0000000000c6', 'authenticated', 'authenticated', 'owner-g@compra.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Café A', 'compra-a-t', 'cafe');
select platform.crear_tenant('Café B', 'compra-b-t', 'cafe');
select platform.crear_tenant('Granja G', 'compra-g-t', 'ganaderia');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'compra-a-t'
union all select 'b', id from public.tenants where slug = 'compra-b-t'
union all select 'g', id from public.tenants where slug = 'compra-g-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), m.rol::public.rol_tenant
  from (values
    ('00000000-0000-0000-0000-0000000000c1', 'a', 'owner'),
    ('00000000-0000-0000-0000-0000000000c2', 'a', 'admin'),
    ('00000000-0000-0000-0000-0000000000c3', 'a', 'operativo'),
    ('00000000-0000-0000-0000-0000000000c4', 'a', 'viewer'),
    ('00000000-0000-0000-0000-0000000000c5', 'b', 'owner'),
    ('00000000-0000-0000-0000-0000000000c6', 'g', 'owner')) as m(user_id, t, rol);

-- Terceros: ta, ta2 (proveedores de A), tcli (A, solo cliente), tinac (A, proveedor inactivo), tb (proveedor de B).
with t as (
  insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles, activo)
  select i.id, x.nombre, 'Calle 1', '3000000000', x.identificacion, x.roles, x.activo
    from (values
      ('a', 'Proveedor A',   '9000001', array['proveedor'],            true),
      ('a', 'Proveedor A2',  '9000002', array['proveedor', 'cliente'], true),
      ('a', 'Solo cliente',  '9000003', array['cliente'],              true),
      ('a', 'Prov inactivo', '9000004', array['proveedor'],            false),
      ('b', 'Proveedor B',   '9000005', array['proveedor'],            true)) as x(clave, nombre, identificacion, roles, activo)
    join ids i on i.clave = x.clave
  returning nombre, id
)
insert into ids select case t.nombre when 'Proveedor A' then 'ta' when 'Proveedor A2' then 'ta2'
                                     when 'Solo cliente' then 'tcli' when 'Prov inactivo' then 'tinac'
                                     else 'tb' end, t.id from t;

-- Tipos de café: xa/ca (Excelso/Consumo de A), xb (Excelso de B) e xi (un tipo inactivo de A).
insert into cafe.tipos_cafe (tenant_id, nombre, activo, orden)
select id, 'Inactivo', false, 9 from ids where clave = 'a';
insert into ids
select case when t.nombre = 'Excelso' and i.clave = 'a' then 'xa'
            when t.nombre = 'Consumo' and i.clave = 'a' then 'ca'
            when t.nombre = 'Excelso' and i.clave = 'b' then 'xb'
            else 'xi' end, t.id
  from cafe.tipos_cafe t join ids i on i.id = t.tenant_id and i.clave in ('a', 'b')
 where (i.clave = 'a') or (i.clave = 'b' and t.nombre = 'Excelso');

-- Payload base de una compra de A (375 kg en 6 bultos de Excelso a $18.500/kg); `p_over` lo sobrescribe
-- clave a clave (un `null` JSON equivale a «falta»).
create or replace function pg_temp.compra(p_over jsonb default '{}')
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'tercero_id', (select id from ids where clave = 'ta'), 'tipo_cafe_id', (select id from ids where clave = 'xa'),
    'fecha', '2026-11-05', 'peso_kg', 375, 'num_bultos', 6, 'pesos_bultos', null, 'precio_kg', 18500,
    'factura_proveedor', 'FV-1234', 'observaciones', null) || p_over
$$;
grant execute on function pg_temp.compra(jsonb) to authenticated;

-- Último valor del contador MP de A en 2026.
create or replace function pg_temp.ultimo_mp() returns integer
language sql stable as $$
  select ultimo from public.consecutivos where serie = 'MP' and anio = 2026 and tenant_id = (select id from ids where clave = 'a')
$$;
grant execute on function pg_temp.ultimo_mp() to authenticated;

-- 1. Estructura y privilegios -------------------------------------------------------------------------------
select has_function('cafe', 'registrar_compra', array['jsonb'], 'existe cafe.registrar_compra(jsonb)');
select has_function('cafe', 'ultimo_precio_compra', array['uuid', 'uuid'], 'existe cafe.ultimo_precio_compra(uuid, uuid)');
select has_function('cafe', 'repartir_peso', array['numeric', 'integer'], 'existe cafe.repartir_peso(numeric, integer)');
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'cafe.registrar_compra(jsonb)'::regprocedure),
  false, 'registrar_compra es SECURITY INVOKER (RLS aplica con el usuario real)'
);
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'cafe.ultimo_precio_compra(uuid, uuid)'::regprocedure),
  false, 'ultimo_precio_compra es SECURITY INVOKER'
);
select ok(
  not has_function_privilege('anon', 'cafe.registrar_compra(jsonb)', 'execute')
  and not has_function_privilege('anon', 'cafe.ultimo_precio_compra(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'cafe.repartir_peso(numeric, integer)', 'execute')
  and has_function_privilege('authenticated', 'cafe.registrar_compra(jsonb)', 'execute'),
  'anon no ejecuta las funciones; authenticated sí'
);

-- 2. Reparto del peso (misma regla que repartirPeso() de TypeScript) -----------------------------------------
select is(cafe.repartir_peso(375, 6), array[62.5, 62.5, 62.5, 62.5, 62.5, 62.5]::numeric[], '375 kg / 6 → 62,5 ×6');
select is(cafe.repartir_peso(100, 3), array[33.333, 33.333, 33.334]::numeric[], '100 kg / 3 → el último bulto absorbe el resto');
select is(cafe.repartir_peso(62.5, 1), array[62.5]::numeric[], 'un bulto: todo el peso');
select is((select sum(x) from unnest(cafe.repartir_peso(81.001, 7)) x), 81.001, 'el reparto siempre suma el total');
select throws_ok($$select cafe.repartir_peso(10, 0)$$, 'P0001', 'datos_invalidos', 'sin bultos no hay reparto');
select throws_ok($$select cafe.repartir_peso(0, 3)$$, 'P0001', 'datos_invalidos', 'peso cero no se reparte');
select throws_ok($$select cafe.repartir_peso(0.002, 3)$$, 'P0001', 'datos_invalidos', 'ni uno demasiado pequeño para los bultos');

-- 3. Caso feliz: 375 kg en 6 bultos de Excelso a $18.500/kg --------------------------------------------------
select tests.autenticar_como('owner-a@compra.test');

select is(cafe.ultimo_precio_compra((select id from ids where clave = 'ta'), (select id from ids where clave = 'xa')), null,
  'sin compras previas no hay precio sugerido');

create temp table r1 as select cafe.registrar_compra(pg_temp.compra()) as r;
grant select on r1 to authenticated;

select is((select r ->> 'codigo' from r1), 'MP-2026-0001', 'la primera compra del año es MP-2026-0001');
select is((select (r ->> 'valor_compra')::numeric from r1), 6937500::numeric, 'valor total = 375 kg × $18.500 = $6.937.500');
select is((select (r ->> 'id')::uuid from r1), (select id from cafe.lotes where codigo = 'MP-2026-0001'), 'devuelve el id del lote');
select is(
  (select row(l.linea, l.tipo_cafe_id, l.tercero_id, l.fecha_recepcion, l.peso_recibido_kg, l.num_bultos, l.precio_compra_kg,
              l.valor_compra, l.factura_proveedor, l.servicios, l.nivel_tueste, l.anulado_at)::text
     from cafe.lotes l where l.codigo = 'MP-2026-0001'),
  row('marca_propia'::cafe.linea_lote, (select id from ids where clave = 'xa'), (select id from ids where clave = 'ta'),
      '2026-11-05'::date, 375::numeric(10,3), 6::smallint, 18500::numeric(12,2), 6937500::numeric(14,2), 'FV-1234', '{}'::cafe.tipo_proceso[],
      null::cafe.nivel_tueste, null::timestamptz)::text,
  'el lote es de marca propia, con el precio como snapshot y sin servicios'
);
select is((select count(*)::int from cafe.lote_bultos where lote_id = (select (r ->> 'id')::uuid from r1)), 6, 'crea 6 bultos');
select is(
  (select array_agg(b.peso_kg order by b.numero) from cafe.lote_bultos b where b.lote_id = (select (r ->> 'id')::uuid from r1)),
  array[62.5, 62.5, 62.5, 62.5, 62.5, 62.5]::numeric[], 'de 62,5 kg cada uno, numerados del 1 al 6'
);
select is(
  (select array_agg(b.numero order by b.numero) from cafe.lote_bultos b where b.lote_id = (select (r ->> 'id')::uuid from r1)),
  array[1, 2, 3, 4, 5, 6]::smallint[], 'numerados 1..6'
);
select is(pg_temp.ultimo_mp(), 1, 'el contador MP avanzó a 1');

-- 4. Precio sugerido (HU-01 c3) -----------------------------------------------------------------------------
select is(cafe.ultimo_precio_compra((select id from ids where clave = 'ta'), (select id from ids where clave = 'xa')), 18500::numeric,
  'la segunda compra al mismo proveedor y tipo propone $18.500');
select is(cafe.ultimo_precio_compra((select id from ids where clave = 'ta2'), (select id from ids where clave = 'xa')), null,
  'otro proveedor: sin sugerencia');
select is(cafe.ultimo_precio_compra((select id from ids where clave = 'ta'), (select id from ids where clave = 'ca')), null,
  'otro tipo de café: sin sugerencia');

create temp table r2 as select cafe.registrar_compra(pg_temp.compra('{"precio_kg": 19000, "fecha": "2026-11-06"}')) as r;
grant select on r2 to authenticated;

select is((select r ->> 'codigo' from r2), 'MP-2026-0002', 'la segunda compra es MP-2026-0002');
select is((select (r ->> 'valor_compra')::numeric from r2), 7125000::numeric, 'a $19.000/kg: $7.125.000');
select is((select precio_compra_kg from cafe.lotes where codigo = 'MP-2026-0001'), 18500::numeric,
  'cambiar el precio no altera MP-2026-0001 (cada lote guarda el suyo)');
select is((select valor_compra from cafe.lotes where codigo = 'MP-2026-0001'), 6937500::numeric, 'ni su valor');
select is(cafe.ultimo_precio_compra((select id from ids where clave = 'ta'), (select id from ids where clave = 'xa')), 19000::numeric,
  'ahora se sugiere el último: $19.000');

-- Una compra con fecha anterior no desplaza la sugerencia (manda la fecha de la compra, no cuándo se digitó).
select cafe.registrar_compra(pg_temp.compra('{"precio_kg": 17000, "fecha": "2026-10-01"}'));
select is(pg_temp.ultimo_mp(), 3, 'tres compras, contador en 3');
select is(cafe.ultimo_precio_compra((select id from ids where clave = 'ta'), (select id from ids where clave = 'xa')), 19000::numeric,
  'una compra con fecha anterior no cambia la sugerencia');

-- Un lote anulado no cuenta para el precio sugerido.
update cafe.lotes set anulado_at = now(), motivo_anulacion = 'Compra duplicada' where codigo = 'MP-2026-0002';
select is(cafe.ultimo_precio_compra((select id from ids where clave = 'ta'), (select id from ids where clave = 'xa')), 18500::numeric,
  'un lote anulado no cuenta: vuelve el precio anterior');

-- Un lote de servicio (no es compra) tampoco cuenta.
reset role;
insert into cafe.lotes (tenant_id, codigo, linea, tercero_id, fecha_recepcion, peso_recibido_kg, num_bultos, servicios)
values ((select id from ids where clave = 'a'), 'MQ-X-1', 'servicio', (select id from ids where clave = 'ta'), '2026-12-01', 10, 1, array['trilla']::cafe.tipo_proceso[]);
insert into cafe.lote_bultos (tenant_id, lote_id, numero, peso_kg)
select tenant_id, id, 1, 10 from cafe.lotes where codigo = 'MQ-X-1';
reset role;
select tests.autenticar_como('owner-a@compra.test');
select is(cafe.ultimo_precio_compra((select id from ids where clave = 'ta'), (select id from ids where clave = 'xa')), 18500::numeric,
  'un lote de servicio no cuenta para el precio sugerido');

-- 5. Pesos por bulto y redondeo -----------------------------------------------------------------------------
select is(
  (select cafe.registrar_compra(pg_temp.compra(jsonb_build_object(
    'tipo_cafe_id', (select id from ids where clave = 'ca'), 'fecha', '2026-11-07', 'peso_kg', 100, 'num_bultos', 2,
    'pesos_bultos', jsonb_build_array(40.5, 59.5)))) ->> 'codigo'),
  'MP-2026-0004', 'con pesos por bulto explícitos'
);
select is(
  (select array_agg(b.peso_kg order by b.numero) from cafe.lote_bultos b join cafe.lotes l on l.id = b.lote_id where l.codigo = 'MP-2026-0004'),
  array[40.5, 59.5]::numeric[], 'se guardan los pesos enviados'
);

select is(
  (select (cafe.registrar_compra(pg_temp.compra(jsonb_build_object(
    'tercero_id', (select id from ids where clave = 'ta2'), 'tipo_cafe_id', (select id from ids where clave = 'ca'),
    'peso_kg', 33.333, 'num_bultos', 1, 'precio_kg', 1234.5))) ->> 'valor_compra')::numeric),
  41150::numeric, 'el valor se redondea a pesos: 33,333 kg × $1.234,50 = $41.149,59 → $41.150'
);
select is((select valor_compra from cafe.lotes where codigo = 'MP-2026-0005'), 41150::numeric, 'el lote guarda el mismo valor');

select is(
  (select array_agg(b.peso_kg order by b.numero) from cafe.lote_bultos b join cafe.lotes l on l.id = b.lote_id where l.codigo = 'MP-2026-0003'),
  array[62.5, 62.5, 62.5, 62.5, 62.5, 62.5]::numeric[], 'sin pesos explícitos reparte en partes iguales'
);

-- 6. Validaciones: cada una falla sin consumir consecutivo ---------------------------------------------------
select throws_ok($$select cafe.registrar_compra(pg_temp.compra(jsonb_build_object('tipo_cafe_id', (select id from ids where clave = 'xi'))))$$,
  'P0001', 'tipo_cafe_invalido', 'un tipo de café inactivo no se compra');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra(jsonb_build_object('tipo_cafe_id', (select id from ids where clave = 'xb'))))$$,
  'P0001', 'tipo_cafe_invalido', 'ni el tipo de café de otro cliente');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra('{"tipo_cafe_id": "00000000-0000-0000-0000-00000000dead"}'))$$,
  'P0001', 'tipo_cafe_invalido', 'ni uno que no existe');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra(jsonb_build_object('tercero_id', (select id from ids where clave = 'tcli'))))$$,
  'P0001', 'tercero_no_es_proveedor', 'un tercero sin rol proveedor no vende café');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra(jsonb_build_object('tercero_id', (select id from ids where clave = 'tinac'))))$$,
  'P0001', 'tercero_no_es_proveedor', 'ni un proveedor inactivo');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra(jsonb_build_object('tercero_id', (select id from ids where clave = 'tb'))))$$,
  'P0001', 'tercero_no_encontrado', 'ni el proveedor de otro cliente (no lo ve)');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra('{"tercero_id": "00000000-0000-0000-0000-00000000dead"}'))$$,
  'P0001', 'tercero_no_encontrado', 'ni un tercero que no existe');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra('{"tercero_id": "no-es-uuid"}'))$$,
  'P0001', 'datos_invalidos', 'un id que no es uuid no revienta: es dato inválido');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra('{"peso_kg": 0}'))$$, 'P0001', 'datos_invalidos', 'peso cero');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra('{"peso_kg": -5}'))$$, 'P0001', 'datos_invalidos', 'peso negativo');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra('{"peso_kg": null}'))$$, 'P0001', 'datos_invalidos', 'sin peso');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra('{"peso_kg": "375"}'))$$, 'P0001', 'datos_invalidos', 'peso como texto');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra('{"peso_kg": 100.0005}'))$$, 'P0001', 'datos_invalidos', 'más de 3 decimales en el peso');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra('{"num_bultos": 0}'))$$, 'P0001', 'datos_invalidos', 'cero bultos');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra('{"num_bultos": 2.5}'))$$, 'P0001', 'datos_invalidos', 'bultos fraccionarios');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra('{"num_bultos": 201}'))$$, 'P0001', 'datos_invalidos', 'más de 200 bultos');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra('{"precio_kg": -1}'))$$, 'P0001', 'datos_invalidos', 'precio negativo');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra('{"precio_kg": null}'))$$, 'P0001', 'datos_invalidos', 'sin precio');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra('{"fecha": "31/02/2026"}'))$$, 'P0001', 'datos_invalidos', 'fecha inválida');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra('{"fecha": null}'))$$, 'P0001', 'datos_invalidos', 'sin fecha');
select throws_ok($$select cafe.registrar_compra('[]'::jsonb)$$, 'P0001', 'datos_invalidos', 'una entrada que no es objeto');
select throws_ok($$select cafe.registrar_compra(null)$$, 'P0001', 'datos_invalidos', 'ni nula');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra('{"pesos_bultos": [60, 60, 60, 60, 60, 60]}'))$$,
  'P0001', 'bultos_no_cuadran', 'pesos por bulto que no suman el total');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra('{"pesos_bultos": [187.5, 187.5]}'))$$,
  'P0001', 'bultos_no_cuadran', 'ni una lista con otro número de bultos');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra('{"pesos_bultos": [375, 0, 0, 0, 0, 0]}'))$$,
  'P0001', 'datos_invalidos', 'un bulto en cero');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra('{"pesos_bultos": "62.5"}'))$$,
  'P0001', 'datos_invalidos', 'pesos por bulto que no son una lista');
select is(pg_temp.ultimo_mp(), 5, 'ninguna validación consumió consecutivo (siguen 5 compras)');

-- Precio cero es válido (≥ 0): una muestra regalada también se registra. Lo hace un operativo.
reset role;
select tests.autenticar_como('operativo-a@compra.test');
select is(
  (select cafe.registrar_compra(pg_temp.compra('{"precio_kg": 0, "peso_kg": 10, "num_bultos": 1, "fecha": "2026-11-08"}')) ->> 'codigo'),
  'MP-2026-0006', 'un operativo registra compras (precio 0 permitido)'
);
select is((select valor_compra from cafe.lotes where codigo = 'MP-2026-0006'), 0::numeric, 'con valor 0');

-- 7. Rollback: si falla la inserción de bultos no se consume el consecutivo -----------------------------------
reset role;
create function cafe.test_falla_bultos() returns trigger language plpgsql as $$
begin
  raise exception using errcode = 'P0001', message = 'falla_simulada';
end $$;
create trigger zz_falla before insert on cafe.lote_bultos for each row execute function cafe.test_falla_bultos();

reset role;
select tests.autenticar_como('owner-a@compra.test');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra('{"fecha": "2026-11-09"}'))$$, 'P0001', 'falla_simulada',
  'si la inserción de los bultos falla, la compra falla');
select is(pg_temp.ultimo_mp(), 6, 'el consecutivo no se consumió');
select is((select count(*)::int from cafe.lotes where codigo = 'MP-2026-0007'), 0, 'ni quedó el lote a medias');

reset role;
drop trigger zz_falla on cafe.lote_bultos;
drop function cafe.test_falla_bultos();
reset role;
select tests.autenticar_como('owner-a@compra.test');
select is(
  (select cafe.registrar_compra(pg_temp.compra('{"fecha": "2026-11-09"}')) ->> 'codigo'),
  'MP-2026-0007', 'la siguiente compra recibe el número que quedó libre'
);

-- El año del código sale de la fecha de la compra, no de cuándo se digita; cada año arranca en 1.
select is(
  (select cafe.registrar_compra(pg_temp.compra('{"fecha": "2027-01-02"}')) ->> 'codigo'),
  'MP-2027-0001', 'una compra de 2027 es MP-2027-0001'
);

-- 8. Roles y módulo --------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('admin-a@compra.test');
select is(
  (select cafe.registrar_compra(pg_temp.compra('{"fecha": "2026-11-10"}')) ->> 'codigo'),
  'MP-2026-0008', 'un admin también registra compras'
);

reset role;
select tests.autenticar_como('viewer-a@compra.test');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra())$$, '42501', 'no_autorizado', 'un viewer no registra compras');
select is(cafe.ultimo_precio_compra((select id from ids where clave = 'ta'), (select id from ids where clave = 'xa')), 18500::numeric,
  'pero sí consulta el precio sugerido (lectura)');
select is(pg_temp.ultimo_mp(), 8, 'el viewer no consumió consecutivo');

select tests.como_anon();
select throws_ok($$select cafe.registrar_compra('{}'::jsonb)$$, '42501', null, 'sin sesión no se ejecuta');
reset role;

select tests.autenticar_como('owner-g@compra.test');
select throws_ok($$select cafe.registrar_compra('{}'::jsonb)$$, '42501', 'no_autorizado', 'un cliente de ganadería (sin cafe.recepcion) no puede');

-- Sin el módulo cafe.recepcion, ni siquiera el owner de A.
reset role;
update public.tenant_modulos set activo = false
 where tenant_id = (select id from ids where clave = 'a') and modulo_id = 'cafe.recepcion';
reset role;
select tests.autenticar_como('owner-a@compra.test');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra('{"fecha": "2026-11-11"}'))$$, '42501', 'no_autorizado',
  'con el módulo cafe.recepcion apagado, ni el owner');
reset role;
update public.tenant_modulos set activo = true
 where tenant_id = (select id from ids where clave = 'a') and modulo_id = 'cafe.recepcion';

-- 9. Aislamiento entre clientes ---------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('owner-b@compra.test');
select is(cafe.ultimo_precio_compra((select id from ids where clave = 'ta'), (select id from ids where clave = 'xa')), null,
  'B no ve el precio sugerido de las compras de A');
select is((select count(*)::int from cafe.lotes), 0, 'B no ve los lotes de A');

select is(
  (select cafe.registrar_compra(jsonb_build_object(
    'tercero_id', (select id from ids where clave = 'tb'), 'tipo_cafe_id', (select id from ids where clave = 'xb'),
    'fecha', '2026-11-05', 'peso_kg', 125, 'num_bultos', 2, 'precio_kg', 20000)) ->> 'codigo'),
  'MP-2026-0001', 'B tiene su propio contador: su primera compra es MP-2026-0001'
);
select throws_ok($$select cafe.registrar_compra(pg_temp.compra(jsonb_build_object('tipo_cafe_id', (select id from ids where clave = 'xb'))))$$,
  'P0001', 'tercero_no_encontrado', 'B no puede comprar a un proveedor de A');
select throws_ok($$select cafe.registrar_compra(pg_temp.compra())$$, 'P0001', 'tipo_cafe_invalido', 'ni con un tipo de café de A');
select is((select count(*)::int from cafe.lotes), 1, 'B ve solo su lote');
select is(cafe.ultimo_precio_compra((select id from ids where clave = 'tb'), (select id from ids where clave = 'xb')), 20000::numeric,
  'y su propio precio sugerido');

reset role;
select is((select count(*)::int from cafe.lotes where tenant_id = (select id from ids where clave = 'a') and linea = 'marca_propia'), 9,
  'A conserva sus 9 lotes de marca propia (8 de 2026 y 1 de 2027)');
select is(
  (select count(distinct tenant_id)::int from cafe.lote_bultos b where b.lote_id in (select id from cafe.lotes where codigo = 'MP-2026-0001')),
  2, 'MP-2026-0001 existe en los dos clientes, cada uno con sus bultos'
);

-- 10. Auditoría -------------------------------------------------------------------------------------------------
select ok(
  exists (select 1 from audit.log l
           where l.tabla = 'cafe.lotes' and l.accion = 'INSERT'
             and l.tenant_id = (select id from ids where clave = 'a')
             and l.registro_id = (select (r ->> 'id') from r1)),
  'la compra queda en audit.log con su tenant'
);

select * from finish();
rollback;
