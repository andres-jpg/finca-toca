-- Lotes y bultos del vertical café (FIN-105 · CO-24): cafe.lotes, cafe.lote_bultos, sus CHECK, triggers
-- (servicios, bultos que cuadran, bloqueo tras el primer proceso, anulación), RLS por tenant y módulo.
-- Todo se crea AQUÍ dentro de la transacción (rollback al final): dos clientes de café (A y B) y uno de
-- ganadería (G), sin depender de los usuarios del seed.
--   e1 owner A   e2 admin A   e3 operativo A   e4 viewer A   e5 owner B   e6 owner G (ganadería)
-- `cafe.procesos` (CO-27) aún no existe: en la sección 6 se crea una tabla mínima, solo dentro de este
-- test, para comprobar que los bloqueos ya la esperan.
begin;

select plan(112);

-- 0. Preparación --------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'owner-a@lotes.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'admin-a@lotes.test'),
  ('00000000-0000-0000-0000-0000000000e3', 'authenticated', 'authenticated', 'operativo-a@lotes.test'),
  ('00000000-0000-0000-0000-0000000000e4', 'authenticated', 'authenticated', 'viewer-a@lotes.test'),
  ('00000000-0000-0000-0000-0000000000e5', 'authenticated', 'authenticated', 'owner-b@lotes.test'),
  ('00000000-0000-0000-0000-0000000000e6', 'authenticated', 'authenticated', 'owner-g@lotes.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Café A', 'lotes-a-t', 'cafe');
select platform.crear_tenant('Café B', 'lotes-b-t', 'cafe');
select platform.crear_tenant('Granja G', 'lotes-g-t', 'ganaderia');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'lotes-a-t'
union all select 'b', id from public.tenants where slug = 'lotes-b-t'
union all select 'g', id from public.tenants where slug = 'lotes-g-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), m.rol::public.rol_tenant
  from (values
    ('00000000-0000-0000-0000-0000000000e1', 'a', 'owner'),
    ('00000000-0000-0000-0000-0000000000e2', 'a', 'admin'),
    ('00000000-0000-0000-0000-0000000000e3', 'a', 'operativo'),
    ('00000000-0000-0000-0000-0000000000e4', 'a', 'viewer'),
    ('00000000-0000-0000-0000-0000000000e5', 'b', 'owner'),
    ('00000000-0000-0000-0000-0000000000e6', 'g', 'owner')) as m(user_id, t, rol);

-- Terceros (ta, ta2, tb, tg) y tipos de café (xa = Excelso de A, xb = Excelso de B). Los terceros se
-- insertan como postgres, con tenant_id explícito.
with t as (
  insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles)
  select i.id, x.nombre, 'Calle 1', '3000000000', x.identificacion, array['proveedor', 'cliente_servicio']
    from (values ('a', 'Proveedor A', '9000001'), ('a', 'Proveedor A2', '9000002'),
                 ('b', 'Proveedor B', '9000003'), ('g', 'Proveedor G', '9000004')) as x(clave, nombre, identificacion)
    join ids i on i.clave = x.clave
  returning tenant_id, nombre, id
)
insert into ids select case t.nombre when 'Proveedor A' then 'ta' when 'Proveedor A2' then 'ta2'
                                     when 'Proveedor B' then 'tb' else 'tg' end, t.id from t;
insert into ids
select case when i.clave = 'a' then 'xa' else 'xb' end, t.id
  from cafe.tipos_cafe t join ids i on i.id = t.tenant_id and i.clave in ('a', 'b')
 where t.nombre = 'Excelso';

-- Crea un lote (y, con p_bultos, sus bultos repartidos en partes iguales a gramos: el último absorbe el
-- resto, como `repartirPeso()` de TypeScript). Va como el usuario que la llame (SECURITY INVOKER).
create or replace function pg_temp.ins_lote(
  p_codigo text, p_linea cafe.linea_lote,
  p_tipo text default null, p_precio numeric default null,
  p_servicios cafe.tipo_proceso[] default '{}', p_nivel cafe.nivel_tueste default null,
  p_peso numeric default 100, p_n smallint default 1, p_bultos boolean default false,
  p_ter text default 'ta')
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into cafe.lotes (codigo, linea, tercero_id, tipo_cafe_id, fecha_recepcion, peso_recibido_kg, num_bultos,
                          servicios, nivel_tueste, precio_compra_kg)
  values (p_codigo, p_linea, (select id from ids where clave = p_ter), (select id from ids where clave = p_tipo),
          current_date, p_peso, p_n, p_servicios, p_nivel, p_precio)
  returning id into v_id;

  if p_bultos then
    insert into cafe.lote_bultos (lote_id, numero, peso_kg)
    select v_id, g, case when g < p_n then trunc(p_peso / p_n, 3) else p_peso - trunc(p_peso / p_n, 3) * (p_n - 1) end
      from generate_series(1, p_n) g;
  end if;
  return v_id;
end $$;
grant execute on function pg_temp.ins_lote(text, cafe.linea_lote, text, numeric, cafe.tipo_proceso[], cafe.nivel_tueste,
                                           numeric, smallint, boolean, text) to authenticated;

-- 1. Estructura y privilegios -------------------------------------------------------------------------------
select has_table('cafe', 'lotes', 'existe cafe.lotes');
select has_table('cafe', 'lote_bultos', 'existe cafe.lote_bultos');
select ok(
  (select bool_and(relrowsecurity) from pg_class where oid in ('cafe.lotes'::regclass, 'cafe.lote_bultos'::regclass)),
  'ambas tablas tienen RLS activada'
);
select ok(
  not has_table_privilege('authenticated', 'cafe.lotes', 'delete')
  and not has_table_privilege('service_role', 'cafe.lotes', 'delete')
  and not has_table_privilege('authenticated', 'cafe.lote_bultos', 'delete')
  and not has_table_privilege('service_role', 'cafe.lote_bultos', 'delete'),
  'nadie borra lotes ni bultos'
);
select ok(
  not has_table_privilege('anon', 'cafe.lotes', 'select') and not has_table_privilege('anon', 'cafe.lote_bultos', 'select'),
  'anon no lee lotes ni bultos'
);
select ok(
  not has_column_privilege('authenticated', 'cafe.lotes', 'tenant_id', 'update')
  and not has_column_privilege('authenticated', 'cafe.lotes', 'codigo', 'update')
  and not has_column_privilege('authenticated', 'cafe.lotes', 'linea', 'update')
  and has_column_privilege('authenticated', 'cafe.lotes', 'peso_recibido_kg', 'update'),
  'UPDATE por columnas: tenant_id, codigo y linea no se tocan'
);
select ok(
  not has_column_privilege('authenticated', 'cafe.lotes', 'anulado_por', 'insert')
  and not has_column_privilege('authenticated', 'cafe.lotes', 'anulado_at', 'insert'),
  'un lote no nace anulado (INSERT por columnas)'
);
select ok(
  has_column_privilege('authenticated', 'cafe.lote_bultos', 'peso_kg', 'update')
  and not has_column_privilege('authenticated', 'cafe.lote_bultos', 'lote_id', 'update'),
  'de un bulto solo se corrige el peso'
);
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'cafe.servicios_requeridos(cafe.lotes)'::regprocedure),
  false, 'servicios_requeridos es SECURITY INVOKER'
);
select ok(
  not has_function_privilege('anon', 'cafe.servicios_requeridos(cafe.lotes)', 'execute')
  and not has_function_privilege('anon', 'cafe.orden_proceso(cafe.tipo_proceso)', 'execute')
  and not has_function_privilege('authenticated', 'cafe.lotes_proteger()', 'execute')
  and not has_function_privilege('authenticated', 'cafe.lotes_verificar_bultos()', 'execute'),
  'anon no ejecuta las funciones del modelo y las de los triggers no se llaman a mano'
);
select is(
  (select array_agg(e.enumlabel::text order by e.enumsortorder) from pg_enum e where e.enumtypid = 'cafe.tipo_proceso'::regtype),
  array['trilla', 'tostion', 'molienda', 'empaque'], 'tipo_proceso: trilla, tostion, molienda, empaque'
);
select is(
  (select array_agg(e.enumlabel::text order by e.enumsortorder) from pg_enum e where e.enumtypid = 'cafe.nivel_tueste'::regtype),
  array['bajo', 'medio', 'alto'], 'nivel_tueste: bajo, medio, alto'
);
select is(
  (select array_agg(e.enumlabel::text order by e.enumsortorder) from pg_enum e where e.enumtypid = 'cafe.linea_lote'::regtype),
  array['marca_propia', 'servicio'], 'linea_lote: marca_propia, servicio'
);

-- 2. orden_proceso (mismos valores que ORDEN_PROCESO en servicios.test.ts) ------------------------------------------
select is(
  (select array_agg(cafe.orden_proceso(t) order by cafe.orden_proceso(t))
     from unnest(enum_range(null::cafe.tipo_proceso)) t),
  array[1, 2, 3, 4]::smallint[], 'orden_proceso: trilla 1, tostión 2, molienda 3, empaque 4'
);
select is(cafe.orden_proceso('molienda'), 3::smallint, 'molienda es el tercer paso');

-- 3. Reglas de cada línea (owner A) -----------------------------------------------------------------------------------
select tests.autenticar_como('owner-a@lotes.test');

-- Marca propia: 375 kg de Excelso en 6 bultos a $18.500/kg.
select lives_ok(
  $$select pg_temp.ins_lote('MP-2026-0001', 'marca_propia', 'xa', 18500, p_peso => 375, p_n => 6::smallint, p_bultos => true)$$,
  'una compra de marca propia con bultos'
);
select is(
  (select l.valor_compra from cafe.lotes l where l.codigo = 'MP-2026-0001'), 6937500.00::numeric,
  'valor_compra = peso × precio redondeado a pesos: 375 kg × 18.500 = 6.937.500'
);
select is(
  (select array_agg(b.peso_kg order by b.numero) from cafe.lote_bultos b
    where b.lote_id = (select id from cafe.lotes where codigo = 'MP-2026-0001')),
  array[62.5, 62.5, 62.5, 62.5, 62.5, 62.5]::numeric[], '6 bultos de 62,5 kg'
);
select is(
  (select l.tenant_id from cafe.lotes l where l.codigo = 'MP-2026-0001'), (select id from ids where clave = 'a'),
  'tenant_id se estampa solo (DEFAULT tenant_actual())'
);
select ok(
  (select l.created_by = '00000000-0000-0000-0000-0000000000e1' and l.updated_at is null and l.anulado_at is null
     from cafe.lotes l where l.codigo = 'MP-2026-0001'),
  'created_by lo pone la base; el lote nace sin anular'
);
select lives_ok(
  $$select pg_temp.ins_lote('MP-2026-0002', 'marca_propia', 'xa', 0, p_peso => 10, p_bultos => true)$$,
  'un precio 0 es válido'
);
select is((select l.valor_compra from cafe.lotes l where l.codigo = 'MP-2026-0002'), 0.00::numeric, 'y su valor es 0');

select throws_ok($$select pg_temp.ins_lote('X-1', 'marca_propia', null, 18500)$$, '23514', null, 'marca propia sin tipo de café falla');
select throws_ok($$select pg_temp.ins_lote('X-2', 'marca_propia', 'xa', null)$$, '23514', null, 'marca propia sin precio falla');
select throws_ok(
  $$select pg_temp.ins_lote('X-3', 'marca_propia', 'xa', 18500, p_servicios => '{trilla}')$$, '23514', null,
  'marca propia con servicios falla'
);
select throws_ok(
  $$select pg_temp.ins_lote('X-4', 'marca_propia', 'xa', 18500, p_nivel => 'medio')$$, '23514', null,
  'marca propia con nivel de tueste falla'
);
select throws_ok($$select pg_temp.ins_lote('X-5', 'marca_propia', 'xa', -1)$$, '23514', null, 'un precio negativo falla');

-- Servicio.
select throws_ok($$select pg_temp.ins_lote('X-6', 'servicio')$$, '23514', null, 'servicio sin servicios falla');
select throws_ok(
  $$select pg_temp.ins_lote('X-7', 'servicio', p_servicios => '{tostion}')$$, '23514', null,
  'servicio con tostión sin nivel de tueste falla'
);
select throws_ok(
  $$select pg_temp.ins_lote('X-8', 'servicio', p_servicios => '{trilla}', p_nivel => 'bajo')$$, '23514', null,
  'nivel de tueste sin tostión falla'
);
select throws_ok(
  $$select pg_temp.ins_lote('X-9', 'servicio', 'xa', 1000, p_servicios => '{trilla}')$$, '23514', null,
  'servicio con precio de compra falla'
);
select throws_ok(
  $$select pg_temp.ins_lote('X-10', 'servicio', p_servicios => '{molienda}', p_nivel => 'medio')$$, 'P0001', 'servicios_invalidos',
  'molienda sin tostión: servicios_invalidos'
);
select throws_ok(
  $$select pg_temp.ins_lote('X-11', 'servicio', p_servicios => '{molienda,trilla}')$$, 'P0001', 'servicios_invalidos',
  'molienda sin tostión aunque haya trilla'
);

select lives_ok(
  $$select pg_temp.ins_lote('MQ-2026-0001', 'servicio', p_servicios => '{tostion}', p_nivel => 'medio', p_peso => 500, p_n => 8::smallint, p_bultos => true)$$,
  'un servicio de tostión'
);
select is(
  (select l.servicios from cafe.lotes l where l.codigo = 'MQ-2026-0001'),
  array['tostion', 'empaque']::cafe.tipo_proceso[], 'tostión añade empaque automáticamente'
);
select lives_ok(
  $$select pg_temp.ins_lote('MQ-2026-0002', 'servicio', p_servicios => '{molienda,tostion,trilla,trilla}', p_nivel => 'alto', p_peso => 500, p_n => 8::smallint, p_bultos => true)$$,
  'trilla + tostión + molienda en un solo lote'
);
select is(
  (select l.servicios from cafe.lotes l where l.codigo = 'MQ-2026-0002'),
  array['trilla', 'tostion', 'molienda', 'empaque']::cafe.tipo_proceso[],
  'los servicios se guardan sin duplicados, ordenados y con empaque'
);
select lives_ok(
  $$select pg_temp.ins_lote('MQ-2026-0003', 'servicio', p_servicios => '{trilla}', p_peso => 500, p_n => 8::smallint, p_bultos => true)$$,
  'solo trilla'
);
select is(
  (select l.servicios from cafe.lotes l where l.codigo = 'MQ-2026-0003'),
  array['trilla']::cafe.tipo_proceso[], 'solo trilla no añade empaque'
);
select is(
  (select l.valor_compra from cafe.lotes l where l.codigo = 'MQ-2026-0003'), null::numeric, 'un servicio no tiene valor de compra'
);

select is(
  (select cafe.servicios_requeridos(l) from cafe.lotes l where l.codigo = 'MQ-2026-0002'),
  array['trilla', 'tostion', 'molienda', 'empaque']::cafe.tipo_proceso[], 'servicios_requeridos de un servicio: los contratados'
);
select is(
  (select cafe.servicios_requeridos(l) from cafe.lotes l where l.codigo = 'MP-2026-0001'),
  array['tostion', 'empaque']::cafe.tipo_proceso[], 'servicios_requeridos de marca propia: tostión + empaque (molienda es opcional)'
);

-- Dominios de las columnas.
select throws_ok(
  $$insert into cafe.lotes (codigo, linea, tercero_id, fecha_recepcion, peso_recibido_kg, num_bultos, servicios)
    values ('X-12', 'servicio', (select id from ids where clave = 'ta'), current_date, 0, 1, '{trilla}')$$,
  '23514', null, 'peso 0 falla'
);
select throws_ok(
  $$insert into cafe.lotes (codigo, linea, tercero_id, fecha_recepcion, peso_recibido_kg, num_bultos, servicios)
    values ('X-13', 'servicio', (select id from ids where clave = 'ta'), current_date, 10, 0, '{trilla}')$$,
  '23514', null, '0 bultos falla'
);
select throws_ok(
  $$insert into cafe.lotes (codigo, linea, tercero_id, fecha_recepcion, peso_recibido_kg, num_bultos, servicios)
    values ('X-14', 'servicio', (select id from ids where clave = 'ta'), current_date, 10, 201, '{trilla}')$$,
  '23514', null, 'más de 200 bultos falla'
);
select throws_ok(
  $$insert into cafe.lotes (codigo, linea, tercero_id, fecha_recepcion, peso_recibido_kg, num_bultos, servicios, humedad_pct)
    values ('X-15', 'servicio', (select id from ids where clave = 'ta'), current_date, 10, 1, '{trilla}', 100.5)$$,
  '23514', null, 'humedad fuera de 0–100 falla'
);
select throws_ok(
  $$insert into cafe.lotes (codigo, linea, tercero_id, fecha_recepcion, peso_recibido_kg, num_bultos, servicios, densidad)
    values ('X-16', 'servicio', (select id from ids where clave = 'ta'), current_date, 10, 1, '{trilla}', 0)$$,
  '23514', null, 'densidad 0 falla'
);
select throws_ok(
  $$insert into cafe.lotes (codigo, linea, tercero_id, fecha_recepcion, peso_recibido_kg, num_bultos, servicios)
    values ('  ', 'servicio', (select id from ids where clave = 'ta'), current_date, 10, 1, '{trilla}')$$,
  '23514', null, 'el código no puede estar en blanco'
);

-- Código único por cliente.
select throws_ok(
  $$select pg_temp.ins_lote('MP-2026-0001', 'marca_propia', 'xa', 1000, p_bultos => true)$$, '23505', null,
  'código duplicado en el mismo cliente: 23505'
);

-- 4. Los bultos suman el peso del lote (constraint trigger diferido) -------------------------------------------------------
-- Cada caso va en un DO que fuerza la comprobación (`set constraints all immediate`) para no esperar al COMMIT.
select throws_ok(
  $$do $x$ begin
      perform pg_temp.ins_lote('B-1', 'servicio', p_servicios => '{trilla}', p_peso => 100, p_n => 3::smallint);
      insert into cafe.lote_bultos (lote_id, numero, peso_kg)
      select id, g, 33 from cafe.lotes, generate_series(1, 3) g where codigo = 'B-1';
      set constraints all immediate;
    end $x$ $$,
  'P0001', 'bultos_no_cuadran', '3 bultos de 33 kg en un lote de 100 kg: bultos_no_cuadran'
);
select lives_ok(
  $$do $x$ begin
      perform pg_temp.ins_lote('B-2', 'servicio', p_servicios => '{trilla}', p_peso => 100, p_n => 3::smallint, p_bultos => true);
      set constraints all immediate;
      set constraints all deferred;
    end $x$ $$,
  '100 kg repartidos en 33,333 + 33,333 + 33,334 cuadran'
);
select is(
  (select array_agg(b.peso_kg order by b.numero) from cafe.lote_bultos b where b.lote_id = (select id from cafe.lotes where codigo = 'B-2')),
  array[33.333, 33.333, 33.334]::numeric[], 'el último bulto absorbe el resto'
);
select lives_ok(
  $$do $x$ begin
      perform pg_temp.ins_lote('B-3', 'servicio', p_servicios => '{trilla}', p_peso => 100, p_n => 3::smallint);
      insert into cafe.lote_bultos (lote_id, numero, peso_kg)
      select id, g, 33.333 from cafe.lotes, generate_series(1, 3) g where codigo = 'B-3';
      set constraints all immediate;
      set constraints all deferred;
    end $x$ $$,
  'un gramo de diferencia se tolera (99,999 kg en un lote de 100)'
);
select throws_ok(
  $$do $x$ begin
      perform pg_temp.ins_lote('B-4', 'servicio', p_servicios => '{trilla}', p_peso => 100, p_n => 3::smallint);
      insert into cafe.lote_bultos (lote_id, numero, peso_kg)
      select id, g, 50 from cafe.lotes, generate_series(1, 2) g where codigo = 'B-4';
      set constraints all immediate;
    end $x$ $$,
  'P0001', 'bultos_no_cuadran', 'dos bultos que suman bien pero el lote declara tres: bultos_no_cuadran'
);
select throws_ok(
  $$do $x$ begin
      perform pg_temp.ins_lote('B-5', 'servicio', p_servicios => '{trilla}', p_peso => 90, p_n => 3::smallint);
      insert into cafe.lote_bultos (lote_id, numero, peso_kg)
      select id, g, 30 from cafe.lotes, unnest(array[1, 2, 4]) g where codigo = 'B-5';
      set constraints all immediate;
    end $x$ $$,
  'P0001', 'bultos_no_cuadran', 'bultos numerados 1, 2, 4 (con hueco): bultos_no_cuadran'
);
select throws_ok(
  $$do $x$ begin
      perform pg_temp.ins_lote('B-6', 'servicio', p_servicios => '{trilla}', p_peso => 90, p_n => 3::smallint);
      set constraints all immediate;
    end $x$ $$,
  'P0001', 'bultos_no_cuadran', 'un lote sin bultos no cuadra'
);
select throws_ok(
  $$do $x$ begin
      update cafe.lote_bultos set peso_kg = peso_kg + 1 where lote_id = (select id from cafe.lotes where codigo = 'B-2') and numero = 1;
      set constraints all immediate;
    end $x$ $$,
  'P0001', 'bultos_no_cuadran', 'corregir el peso de un bulto sin corregir el lote no cuadra'
);
select throws_ok(
  $$do $x$ begin
      update cafe.lotes set peso_recibido_kg = 120 where codigo = 'B-2';
      set constraints all immediate;
    end $x$ $$,
  'P0001', 'bultos_no_cuadran', 'corregir el peso del lote sin corregir sus bultos no cuadra'
);
select lives_ok(
  $$do $x$ begin
      update cafe.lotes set peso_recibido_kg = 120 where codigo = 'B-2';
      update cafe.lote_bultos set peso_kg = peso_kg + 20 where lote_id = (select id from cafe.lotes where codigo = 'B-2') and numero = 3;
      set constraints all immediate;
      set constraints all deferred;
    end $x$ $$,
  'corregir el lote y sus bultos a la vez cuadra'
);

-- La comprobación es diferida: el INSERT del lote solo no falla, falla al final de la transacción.
savepoint sp_diferido;
select lives_ok(
  $$select pg_temp.ins_lote('B-7', 'servicio', p_servicios => '{trilla}', p_peso => 90, p_n => 3::smallint)$$,
  'insertar el lote antes que sus bultos no falla en el momento'
);
rollback to savepoint sp_diferido;

-- 5. Anulación ------------------------------------------------------------------------------------------------------------------
select lives_ok(
  $$update cafe.lotes set anulado_at = '2000-01-01', motivo_anulacion = 'Pesaje equivocado' where codigo = 'B-3'$$,
  'el owner anula un lote'
);
select ok(
  (select l.anulado_at > now() - interval '1 minute' and l.anulado_por = '00000000-0000-0000-0000-0000000000e1'
     from cafe.lotes l where l.codigo = 'B-3'),
  'cuándo y quién anula lo fija la base, no el cliente'
);
select throws_ok(
  $$update cafe.lotes set observaciones = 'x' where codigo = 'B-3'$$, 'P0001', 'lote_anulado', 'un lote anulado no se modifica'
);
select throws_ok(
  $$update cafe.lote_bultos set peso_kg = 34 where lote_id = (select id from cafe.lotes where codigo = 'B-3') and numero = 1$$,
  'P0001', 'lote_anulado', 'ni sus bultos'
);
select throws_ok($$update cafe.lotes set anulado_at = now() where codigo = 'B-2'$$, '23514', null, 'anular exige motivo');
select throws_ok(
  $$update cafe.lotes set anulado_at = now(), motivo_anulacion = '   ' where codigo = 'B-2'$$, '23514', null,
  'y el motivo no puede estar en blanco'
);
select throws_ok(
  $$update cafe.lotes set motivo_anulacion = 'sin fecha' where codigo = 'B-2'$$, '23514', null, 'motivo sin anular tampoco'
);

-- 6. Bloqueos tras el primer proceso (con una cafe.procesos mínima, solo de este test) --------------------------------------
reset role;
create table cafe.procesos (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null,
  tipo cafe.tipo_proceso not null,
  anulado_at timestamptz
);
grant select on cafe.procesos to authenticated;

insert into cafe.procesos (lote_id, tipo)
select id, 'trilla' from cafe.lotes where codigo in ('MQ-2026-0002', 'MQ-2026-0003');
insert into cafe.procesos (lote_id, tipo)
select id, 'tostion' from cafe.lotes where codigo = 'MQ-2026-0001';
-- Un proceso anulado no cuenta.
insert into cafe.procesos (lote_id, tipo, anulado_at)
select id, 'trilla', now() from cafe.lotes where codigo = 'B-2';

select tests.autenticar_como('owner-a@lotes.test');

select is(
  (select cafe.orden_ultimo_proceso(id) from cafe.lotes where codigo = 'MQ-2026-0001'), 2::smallint,
  'orden_ultimo_proceso: tostión = 2'
);
select is(
  (select cafe.orden_ultimo_proceso(id) from cafe.lotes where codigo = 'B-2'), null::smallint,
  'un proceso anulado no cuenta; un lote sin procesos da NULL'
);

select throws_ok(
  $$update cafe.lotes set peso_recibido_kg = 400 where codigo = 'MQ-2026-0002'$$, 'P0001', 'lote_bloqueado',
  'con procesos no se cambia el peso'
);
select throws_ok(
  $$update cafe.lotes set num_bultos = 9 where codigo = 'MQ-2026-0002'$$, 'P0001', 'lote_bloqueado',
  'ni el número de bultos'
);
select throws_ok(
  $$update cafe.lotes set tercero_id = (select id from ids where clave = 'ta2') where codigo = 'MQ-2026-0002'$$, 'P0001', 'lote_bloqueado',
  'ni el tercero'
);
select throws_ok(
  $$update cafe.lotes set servicios = '{trilla,tostion}' where codigo = 'MQ-2026-0002'$$, 'P0001', 'lote_bloqueado',
  'ni se quitan servicios'
);
select throws_ok(
  $$update cafe.lote_bultos set peso_kg = 61 where lote_id = (select id from cafe.lotes where codigo = 'MQ-2026-0002') and numero = 1$$,
  'P0001', 'lote_bloqueado', 'ni se corrige el peso de sus bultos'
);
select lives_ok(
  $$update cafe.lotes set observaciones = 'Nota posterior', humedad_pct = 11.5 where codigo = 'MQ-2026-0002'$$,
  'pero sí las observaciones y la calidad'
);
select lives_ok(
  $$update cafe.lotes set servicios = '{trilla,tostion}', nivel_tueste = 'medio' where codigo = 'MQ-2026-0003'$$,
  'se puede añadir un servicio posterior al último proceso (tostión tras la trilla)'
);
select is(
  (select l.servicios from cafe.lotes l where l.codigo = 'MQ-2026-0003'),
  array['trilla', 'tostion', 'empaque']::cafe.tipo_proceso[], 'y queda ordenado, con empaque'
);
select throws_ok(
  $$update cafe.lotes set servicios = '{trilla,tostion}', nivel_tueste = 'bajo' where codigo = 'MQ-2026-0001'$$, 'P0001', 'lote_bloqueado',
  'no se añade un servicio anterior al último proceso (trilla tras la tostión)'
);
select lives_ok(
  $$update cafe.lotes set tercero_id = (select id from ids where clave = 'ta2') where codigo = 'B-2'$$,
  'con solo un proceso anulado el lote no está bloqueado'
);
select throws_ok(
  $$update cafe.lotes set anulado_at = now(), motivo_anulacion = 'x' where codigo = 'MQ-2026-0002'$$, 'P0001', 'lote_con_procesos',
  'un lote con procesos no se anula'
);
select lives_ok(
  $$update cafe.lotes set anulado_at = now(), motivo_anulacion = 'Duplicado' where codigo = 'B-2'$$,
  'con el proceso anulado sí se puede anular'
);

-- servicios_requeridos de marca propia cuenta la molienda solo si se hizo.
reset role;
insert into cafe.procesos (lote_id, tipo) select id, 'molienda' from cafe.lotes where codigo = 'MP-2026-0001';
select tests.autenticar_como('owner-a@lotes.test');
select is(
  (select cafe.servicios_requeridos(l) from cafe.lotes l where l.codigo = 'MP-2026-0001'),
  array['tostion', 'molienda', 'empaque']::cafe.tipo_proceso[], 'marca propia con molienda hecha: tostión + molienda + empaque'
);

-- 7. Roles dentro del cliente ---------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('admin-a@lotes.test');
select is(tests.filas_afectadas($$update cafe.lotes set observaciones = 'Revisado' where codigo = 'MP-2026-0001'$$), 1, 'el admin corrige un lote');
select ok(
  (select l.updated_by = '00000000-0000-0000-0000-0000000000e2' and l.updated_at is not null
     from cafe.lotes l where l.codigo = 'MP-2026-0001'),
  'set_updated rellena updated_at/updated_by'
);
select throws_ok($$delete from cafe.lotes where codigo = 'MP-2026-0001'$$, '42501', null, 'el admin no borra lotes');
select throws_ok($$delete from cafe.lote_bultos$$, '42501', null, 'ni bultos');

reset role;
select tests.autenticar_como('operativo-a@lotes.test');
select ok((select count(*) from cafe.lotes) >= 6, 'el operativo lee los lotes del cliente');
select lives_ok(
  $$select pg_temp.ins_lote('MQ-2026-0010', 'servicio', p_servicios => '{trilla}', p_peso => 125, p_n => 2::smallint, p_bultos => true)$$,
  'el operativo registra un lote con sus bultos'
);
select is(
  tests.filas_afectadas($$update cafe.lotes set observaciones = 'Cambiado' where codigo = 'MQ-2026-0010'$$), 0,
  'el operativo no corrige lotes (ni anula)'
);
select is(
  tests.filas_afectadas($$update cafe.lote_bultos set peso_kg = 60 where lote_id = (select id from cafe.lotes where codigo = 'MQ-2026-0010')$$), 0,
  'ni bultos'
);
select throws_ok($$delete from cafe.lotes where codigo = 'MQ-2026-0010'$$, '42501', null, 'ni borra');

reset role;
select tests.autenticar_como('viewer-a@lotes.test');
select ok((select count(*) from cafe.lotes) >= 6, 'el viewer (gerencia) consulta los lotes');
select ok((select count(*) from cafe.lote_bultos) >= 6, 'y los bultos');
select throws_ok(
  $$select pg_temp.ins_lote('MQ-2026-0011', 'servicio', p_servicios => '{trilla}', p_bultos => true)$$, '42501', null,
  'pero no registra lotes'
);

-- 8. Aislamiento entre clientes ---------------------------------------------------------------------------------------------------
reset role;
insert into ids select 'lote_a', id from cafe.lotes where codigo = 'MQ-2026-0010';
select tests.autenticar_como('owner-b@lotes.test');
select is((select count(*)::int from cafe.lotes), 0, 'el cliente B no ve los lotes de A');
select is((select count(*)::int from cafe.lote_bultos), 0, 'ni sus bultos');
select lives_ok(
  $$select pg_temp.ins_lote('MP-2026-0001', 'marca_propia', 'xb', 20000, p_ter => 'tb', p_bultos => true)$$,
  'el mismo código en otro cliente es válido'
);
select is((select count(*)::int from cafe.lotes), 1, 'B solo ve el suyo');
select is(
  tests.filas_afectadas($$update cafe.lotes set observaciones = 'Intruso' where codigo = 'MQ-2026-0001'$$), 0,
  'B no edita lotes de A'
);
select throws_ok(
  format($$insert into cafe.lotes (tenant_id, codigo, linea, tercero_id, fecha_recepcion, peso_recibido_kg, num_bultos, servicios)
           values (%L, 'X-20', 'servicio', (select id from ids where clave = 'tb'), current_date, 10, 1, '{trilla}')$$,
         (select id from ids where clave = 'a')),
  '42501', null, 'ni crea lotes a nombre de A (WITH CHECK)'
);
select throws_ok(
  $$select pg_temp.ins_lote('X-21', 'servicio', p_servicios => '{trilla}', p_ter => 'ta')$$, '23503', null,
  'B no puede colgar un lote de un tercero de A (FK compuesta)'
);
select throws_ok(
  $$select pg_temp.ins_lote('X-22', 'marca_propia', 'xa', 1000, p_ter => 'tb')$$, '23503', null,
  'ni de un tipo de café de A'
);
select throws_ok(
  $$insert into cafe.lote_bultos (lote_id, numero, peso_kg) values ((select id from ids where clave = 'lote_a'), 9, 1)$$,
  '23503', null, 'ni añadir bultos a un lote de A'
);
select throws_ok(
  format($$insert into cafe.lote_bultos (tenant_id, lote_id, numero, peso_kg) values (%L, (select id from ids where clave = 'lote_a'), 9, 1)$$,
         (select id from ids where clave = 'a')),
  '42501', null, 'ni con tenant_id de A (WITH CHECK)'
);

-- 9. El módulo cafe.recepcion se exige en la base ---------------------------------------------------------------------------------------
reset role;
update public.tenant_modulos set activo = false
 where modulo_id = 'cafe.recepcion' and tenant_id = (select id from ids where clave = 'b');
select tests.autenticar_como('owner-b@lotes.test');
select is((select count(*)::int from cafe.lotes), 0, 'sin cafe.recepcion el cliente no ve sus lotes');
select is((select count(*)::int from cafe.lote_bultos), 0, 'ni sus bultos');
select throws_ok(
  $$select pg_temp.ins_lote('X-23', 'servicio', p_servicios => '{trilla}', p_ter => 'tb')$$, '42501', null,
  'ni registra lotes'
);

reset role;
select tests.autenticar_como('owner-g@lotes.test');
select is((select count(*)::int from cafe.lotes), 0, 'ganadería no ve lotes');
select throws_ok(
  $$select pg_temp.ins_lote('X-24', 'servicio', p_servicios => '{trilla}', p_ter => 'tg')$$, '42501', null,
  'ni los crea'
);

-- 10. Auditoría ------------------------------------------------------------------------------------------------------------------------------
reset role;
select ok(
  (select count(*) = 1 from audit.log l
    where l.tabla = 'cafe.lotes' and l.accion = 'INSERT'
      and l.registro_id = (select id::text from cafe.lotes where codigo = 'MP-2026-0001' and tenant_id = (select id from ids where clave = 'a'))
      and l.tenant_id = (select id from ids where clave = 'a')),
  'crear un lote queda en audit.log con su tenant'
);
select is(
  (select count(*)::int from audit.log l
    where l.tabla = 'cafe.lote_bultos' and l.accion = 'INSERT'
      and l.tenant_id = (select id from ids where clave = 'a')
      and l.registro_id in (select id::text from cafe.lote_bultos where lote_id = (select id from cafe.lotes where codigo = 'MP-2026-0001' and tenant_id = (select id from ids where clave = 'a')))),
  6, 'y cada bulto'
);
select ok(
  (select count(*) = 1 from audit.log l
    where l.tabla = 'cafe.lotes' and l.accion = 'UPDATE' and l.cambios ? 'motivo_anulacion'
      and l.registro_id = (select id::text from cafe.lotes where codigo = 'B-3')
      and l.user_id = '00000000-0000-0000-0000-0000000000e1'),
  'la anulación queda en el log con el usuario'
);

select * from finish();
rollback;
