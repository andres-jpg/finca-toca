-- Tarifas versionadas y parámetros por cliente (FIN-94 · CO-14): tarifas, tarifa_vigente(),
-- v_tarifas_vigentes, tarifas_historial(), parametros, parametro() y guardar_parametro().
-- Usuarios del seed (password123): admin@vb.test (admin VB), user@vb.test (operativo VB), viewer@vb.test,
-- admin@velero.test (admin de otro cliente). Las tarifas y parámetros se crean AQUÍ, dentro de la
-- transacción (rollback al final): el seed no trae ninguno (los sembrará el alta de tenants, FIN-98).
--   VB: cafe.trilla 1400 desde 2026-10-01 y 1500 desde 2026-12-01 (fechas fijas: lo que pide el criterio);
--       cafe.tostion 2200 desde hace 30 días y 2400 programada a +30 días (relativas a now(), para la vista
--       y los borrados); cafe.molienda sin tarifa hasta que el admin la inserte; cafe.empaque programada a +60 días.
--   EV: cafe.trilla 999 desde 2026-10-01 (misma clave, otro cliente).
begin;

select plan(90);

create or replace function pg_temp.detalle_de(p_sql text)
returns text
language plpgsql
as $$
declare
  v_detalle text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_detalle = pg_exception_detail;
  return v_detalle;
end $$;
grant execute on function pg_temp.detalle_de(text) to authenticated;

-- 0. Estructura y privilegios ---------------------------------------------------------------------------------------
select has_table('public', 'tarifas', 'existe tarifas');
select has_table('public', 'parametros', 'existe parametros');
select has_view('public', 'v_tarifas_vigentes', 'existe v_tarifas_vigentes');
select ok(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.tarifas'::regclass, 'public.parametros'::regclass)),
  'las dos tablas tienen RLS activada'
);
select ok(
  (select coalesce('security_invoker=true' = any (reloptions), false) from pg_class where oid = 'public.v_tarifas_vigentes'::regclass),
  'v_tarifas_vigentes es security_invoker (se lee con el RLS del usuario)'
);
select ok(
  (select provolatile = 's' and not prosecdef from pg_proc where oid = 'public.tarifa_vigente(text, timestamptz)'::regprocedure),
  'tarifa_vigente es STABLE y SECURITY INVOKER'
);
select ok(
  (select provolatile = 's' and not prosecdef from pg_proc where oid = 'public.parametro(text, jsonb)'::regprocedure),
  'parametro es STABLE y SECURITY INVOKER'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.guardar_parametro(text, jsonb)'::regprocedure),
  false, 'guardar_parametro es SECURITY INVOKER (el RLS decide quién escribe)'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.tarifas_historial(text)'::regprocedure),
  true, 'tarifas_historial es SECURITY DEFINER (lee emails de auth.users) y se protege por dentro'
);
select ok(
  not has_function_privilege('anon', 'public.tarifa_vigente(text, timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.parametro(text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.guardar_parametro(text, jsonb)', 'execute')
  and not has_function_privilege('anon', 'public.tarifas_historial(text)', 'execute'),
  'anon no ejecuta ninguna de las funciones'
);
select ok(
  has_function_privilege('authenticated', 'public.tarifa_vigente(text, timestamptz)', 'execute')
  and has_function_privilege('authenticated', 'public.parametro(text, jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.guardar_parametro(text, jsonb)', 'execute')
  and has_function_privilege('authenticated', 'public.tarifas_historial(text)', 'execute'),
  'authenticated ejecuta las cuatro'
);
select ok(
  not has_table_privilege('authenticated', 'public.tarifas', 'update')
  and not has_table_privilege('anon', 'public.tarifas', 'update')
  and not has_table_privilege('service_role', 'public.tarifas', 'update')
  and not has_table_privilege('authenticated', 'public.tarifas', 'truncate'),
  'nadie tiene UPDATE ni TRUNCATE sobre tarifas (append-only), ni siquiera service_role'
);
select ok(
  not has_table_privilege('service_role', 'public.tarifas', 'delete')
  and not has_table_privilege('anon', 'public.tarifas', 'select'),
  'service_role no borra tarifas y anon no las lee'
);
select ok(
  not has_table_privilege('authenticated', 'public.parametros', 'delete')
  and not has_column_privilege('authenticated', 'public.parametros', 'clave', 'update')
  and has_column_privilege('authenticated', 'public.parametros', 'valor', 'update'),
  'parametros: nadie borra y solo se actualiza el valor (no la clave)'
);

-- 1. Preparación (como postgres) --------------------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.tarifas (tenant_id, concepto, valor, vigente_desde) values
       ('00000000-0000-0000-0000-0000000000a1', 'cafe.trilla',  1400, '2026-10-01'),
       ('00000000-0000-0000-0000-0000000000a1', 'cafe.trilla',  1500, '2026-12-01'),
       ('00000000-0000-0000-0000-0000000000a1', 'cafe.tostion', 2200, now() - interval '30 days'),
       ('00000000-0000-0000-0000-0000000000a1', 'cafe.tostion', 2400, now() + interval '30 days'),
       ('00000000-0000-0000-0000-0000000000a1', 'cafe.empaque', 100,  now() + interval '60 days'),
       ('00000000-0000-0000-0000-0000000000a2', 'cafe.trilla',  999,  '2026-10-01') $$,
  'se preparan las tarifas de los dos clientes'
);

-- 2. tarifa_vigente ----------------------------------------------------------------------------------------------------
select tests.autenticar_como('admin@vb.test');

select is(public.tarifa_vigente('cafe.trilla', '2026-11-01'), 1400::numeric,
  'trilla el 2026-11-01 = 1400 (rige la tarifa desde 2026-10-01)');
select is(public.tarifa_vigente('cafe.trilla', '2026-12-02'), 1500::numeric,
  'trilla el 2026-12-02 = 1500 (ya rige la nueva)');
select is(public.tarifa_vigente('cafe.trilla', '2026-12-01'), 1500::numeric,
  'el mismo instante de vigente_desde ya cuenta como vigente');
select is(public.tarifa_vigente('cafe.trilla', '2026-10-01'), 1400::numeric,
  'la primera tarifa rige desde su instante exacto');
select throws_ok(
  $$ select public.tarifa_vigente('cafe.trilla', '2026-09-30') $$,
  'P0001', 'tarifa_no_definida', 'antes de la primera tarifa: tarifa_no_definida'
);
select ok(
  coalesce(pg_temp.detalle_de($$ select public.tarifa_vigente('cafe.trilla', '2026-09-30') $$), '') like '%cafe.trilla%',
  'el detail nombra el concepto sin tarifa'
);
select throws_ok(
  $$ select public.tarifa_vigente('cafe.molienda') $$,
  'P0001', 'tarifa_no_definida', 'un concepto sin ninguna tarifa: tarifa_no_definida'
);
select is(public.tarifa_vigente('cafe.tostion'), 2200::numeric,
  'sin fecha rige la de ahora; la programada a futuro no cuenta todavía');

-- Aislamiento entre clientes
reset role;
select tests.autenticar_como('admin@velero.test');
select is(public.tarifa_vigente('cafe.trilla', '2026-11-01'), 999::numeric,
  'El Velero ve SU tarifa de cafe.trilla, no la de Villa Blanca');
select is(public.tarifa_vigente('cafe.trilla', '2026-12-02'), 999::numeric,
  'y no le afecta la subida de Villa Blanca');
select throws_ok(
  $$ select public.tarifa_vigente('cafe.tostion') $$,
  'P0001', 'tarifa_no_definida', 'El Velero no ve las tarifas de Villa Blanca'
);
select is((select count(*)::int from public.tarifas where tenant_id <> '00000000-0000-0000-0000-0000000000a2'), 0,
  'El Velero no lee filas de tarifas de otro cliente');
reset role;

-- 3. v_tarifas_vigentes -------------------------------------------------------------------------------------------------
select tests.autenticar_como('admin@vb.test');
select is((select valor from public.v_tarifas_vigentes where concepto = 'cafe.tostion'), 2200::numeric,
  'la vista muestra la tarifa que rige ahora');
select is((select count(*)::int from public.v_tarifas_vigentes where concepto = 'cafe.tostion'), 1,
  'una sola fila por concepto');
select is((select count(*)::int from public.v_tarifas_vigentes where valor = 2400 or concepto = 'cafe.empaque'), 0,
  'las tarifas programadas no aparecen hasta su fecha');
select is((select count(*)::int from public.v_tarifas_vigentes where tenant_id <> '00000000-0000-0000-0000-0000000000a1'), 0,
  'la vista no mezcla clientes');

-- 4. Altas: solo owner/admin ----------------------------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.tarifas (concepto, valor, observaciones) values ('cafe.molienda', 1000, 'Tarifa inicial') $$,
  'el admin crea una tarifa'
);
select is(
  (select tenant_id from public.tarifas where concepto = 'cafe.molienda'),
  '00000000-0000-0000-0000-0000000000a1'::uuid, 'tenant_id se estampa solo (DEFAULT tenant_actual())'
);
select is(public.tarifa_vigente('cafe.molienda'), 1000::numeric, 'y rige desde ahora');
select throws_ok(
  $$ insert into public.tarifas (concepto, valor, vigente_desde) values ('cafe.trilla', 1, '2026-10-01') $$,
  '23505', null, 'no se repite (cliente, concepto, vigente_desde)'
);
select throws_ok(
  $$ insert into public.tarifas (concepto, valor) values ('cafe.neg', -1) $$,
  '23514', null, 'el valor no puede ser negativo'
);
select throws_ok(
  $$ insert into public.tarifas (concepto, valor) values ('Cafe Trilla', 1) $$,
  '23514', null, 'el concepto debe ser <modulo>.<nombre> en minúsculas'
);
select throws_ok(
  $$ insert into public.tarifas (concepto, valor, unidad) values ('cafe.uni', 1, 'docena') $$,
  '23514', null, 'la unidad solo admite kg|g|unidad|litro'
);
select throws_ok(
  $$ insert into public.tarifas (tenant_id, concepto, valor) values ('00000000-0000-0000-0000-0000000000a2', 'cafe.cuelo', 1) $$,
  '42501', null, 'el admin no puede crear tarifas en otro cliente'
);
reset role;

select tests.autenticar_como('user@vb.test');
select throws_ok(
  $$ insert into public.tarifas (concepto, valor) values ('cafe.operativo', 1) $$,
  '42501', null, 'un operativo no inserta tarifas'
);
select cmp_ok((select count(*)::int from public.tarifas), '>', 0, 'pero sí las lee');
reset role;

select tests.autenticar_como('viewer@vb.test');
select throws_ok(
  $$ insert into public.tarifas (concepto, valor) values ('cafe.viewer', 1) $$,
  '42501', null, 'un viewer no inserta tarifas'
);
reset role;

-- 5. Append-only: sin UPDATE; DELETE solo de las programadas ----------------------------------------------------------
select tests.autenticar_como('admin@vb.test');
select throws_ok(
  $$ update public.tarifas set valor = 1 where concepto = 'cafe.trilla' $$,
  '42501', null, 'UPDATE en tarifas falla para el admin'
);
reset role;
select tests.autenticar_como('user@vb.test');
select throws_ok(
  $$ update public.tarifas set valor = 1 where concepto = 'cafe.trilla' $$,
  '42501', null, 'UPDATE en tarifas falla para el operativo'
);
reset role;
select tests.autenticar_como('viewer@vb.test');
select throws_ok(
  $$ update public.tarifas set valor = 1 where concepto = 'cafe.trilla' $$,
  '42501', null, 'UPDATE en tarifas falla para el viewer'
);
reset role;

select tests.autenticar_como('admin@vb.test');
select is(
  tests.filas_afectadas($$ delete from public.tarifas where concepto = 'cafe.trilla' and valor = 1400 $$),
  0, 'DELETE de una tarifa ya vigente no borra nada'
);
select is(
  tests.filas_afectadas($$ delete from public.tarifas where concepto = 'cafe.tostion' and valor = 2200 $$),
  0, 'tampoco la que rige ahora'
);
reset role;
select is(
  (select count(*)::int from public.tarifas where concepto in ('cafe.trilla', 'cafe.tostion') and tenant_id = '00000000-0000-0000-0000-0000000000a1'),
  4, 'las tarifas vigentes siguen en su sitio'
);

select tests.autenticar_como('user@vb.test');
select is(
  tests.filas_afectadas($$ delete from public.tarifas where concepto = 'cafe.empaque' $$),
  0, 'un operativo no borra ni una tarifa programada'
);
reset role;
select tests.autenticar_como('viewer@vb.test');
select is(
  tests.filas_afectadas($$ delete from public.tarifas where concepto = 'cafe.empaque' $$),
  0, 'un viewer tampoco'
);
reset role;

select tests.autenticar_como('admin@vb.test');
select is(
  tests.filas_afectadas($$ delete from public.tarifas where concepto = 'cafe.tostion' and valor = 2400 $$),
  1, 'el admin sí borra una tarifa programada (aún no vigente)'
);
reset role;

-- Permiso fino `tarifas.editar` para un operativo
update public.tenant_members set permisos = array['tarifas.editar']
 where user_id = (select id from auth.users where email = 'user@vb.test')
   and tenant_id = '00000000-0000-0000-0000-0000000000a1';
select tests.autenticar_como('user@vb.test');
select lives_ok(
  $$ insert into public.tarifas (concepto, valor) values ('cafe.permiso_fino', 5) $$,
  'un operativo con el permiso tarifas.editar sí inserta'
);
select is(
  tests.filas_afectadas($$ delete from public.tarifas where concepto = 'cafe.empaque' $$),
  1, 'y borra una programada'
);
reset role;

-- 6. tarifas_historial -----------------------------------------------------------------------------------------------------
select tests.autenticar_como('admin@vb.test');
select cmp_ok((select count(*)::int from public.tarifas_historial()), '>=', 4, 'el admin lee el historial completo');
select is(
  (select email from public.tarifas_historial('cafe.molienda')),
  'admin@vb.test', 'el historial trae el email de quien creó la tarifa'
);
select is(
  (select count(*)::int from public.tarifas_historial('cafe.trilla') where concepto <> 'cafe.trilla'), 0,
  'el filtro por concepto solo trae ese concepto'
);
select ok(
  (select bool_and(email is null) from public.tarifas_historial('cafe.trilla')),
  'una tarifa creada sin sesión (seed, SQL editor) sale con email NULL'
);
reset role;
select tests.autenticar_como('user@vb.test');
select is((select count(*)::int from public.tarifas_historial()), 0, 'un operativo no lee el historial (con emails)');
reset role;
select tests.autenticar_como('admin@velero.test');
select is(
  (select count(*)::int from public.tarifas_historial() where valor <> 999), 0,
  'El Velero no ve el historial de Villa Blanca'
);
reset role;

-- 7. parametros --------------------------------------------------------------------------------------------------------------
select tests.autenticar_como('admin@vb.test');
select is(public.parametro('cafe.capacidad_tostadora_kg', '13.5'::jsonb), '13.5'::jsonb,
  'sin valor guardado, parametro() devuelve el defecto');
select is(public.parametro('cafe.capacidad_tostadora_kg'), null::jsonb, 'y NULL si tampoco hay defecto');
select lives_ok(
  $$ select public.guardar_parametro('cafe.capacidad_tostadora_kg', '12'::jsonb) $$,
  'el admin guarda un parámetro'
);
select is(public.parametro('cafe.capacidad_tostadora_kg', '13.5'::jsonb), '12'::jsonb,
  'parametro() devuelve el valor guardado');
select lives_ok(
  $$ select public.guardar_parametro('cafe.capacidad_tostadora_kg', '14'::jsonb) $$,
  'guardar de nuevo actualiza'
);
select is(public.parametro('cafe.capacidad_tostadora_kg'), '14'::jsonb, 'queda el último valor');
select is((select count(*)::int from public.parametros where clave = 'cafe.capacidad_tostadora_kg'), 1,
  'sigue habiendo una sola fila por clave');
select is(
  (select tenant_id from public.parametros where clave = 'cafe.capacidad_tostadora_kg'),
  '00000000-0000-0000-0000-0000000000a1'::uuid, 'tenant_id se estampa solo'
);
select lives_ok(
  $$ select public.guardar_parametro('cafe.humedad_rango_pct', '{"min":10,"max":12}'::jsonb) $$,
  'se guarda un valor compuesto (rango)'
);
select is((public.parametro('cafe.humedad_rango_pct') ->> 'max')::int, 12, 'y se lee igual');
select lives_ok(
  $$ select public.guardar_parametro('cafe.densidad_rango', 'null'::jsonb) $$,
  'se guarda un valor "sin configurar" (JSON null)'
);
select is(public.parametro('cafe.densidad_rango', '5'::jsonb), 'null'::jsonb,
  'un JSON null guardado no se confunde con "sin valor": no cae al defecto');
select throws_ok(
  $$ select public.guardar_parametro('Clave Mala', '1'::jsonb) $$,
  'P0001', 'datos_invalidos', 'una clave inválida falla con datos_invalidos'
);
select throws_ok(
  $$ select public.guardar_parametro('cafe.peso_bulto_kg', null) $$,
  'P0001', 'datos_invalidos', 'un valor NULL falla con datos_invalidos'
);
select throws_ok(
  $$ update public.parametros set clave = 'cafe.otra' where clave = 'cafe.densidad_rango' $$,
  '42501', null, 'la clave no se edita (UPDATE solo de valor)'
);
select throws_ok(
  $$ delete from public.parametros where clave = 'cafe.densidad_rango' $$,
  '42501', null, 'nadie borra parámetros'
);
reset role;

select tests.autenticar_como('user@vb.test');
select throws_ok(
  $$ select public.guardar_parametro('cafe.capacidad_tostadora_kg', '99'::jsonb) $$,
  '42501', null, 'un operativo no guarda parámetros'
);
select is(public.parametro('cafe.capacidad_tostadora_kg'), '14'::jsonb, 'pero sí los lee');
reset role;
select tests.autenticar_como('viewer@vb.test');
select throws_ok(
  $$ select public.guardar_parametro('cafe.capacidad_tostadora_kg', '99'::jsonb) $$,
  '42501', null, 'un viewer tampoco'
);
reset role;

select tests.autenticar_como('admin@velero.test');
select is(public.parametro('cafe.capacidad_tostadora_kg', '1'::jsonb), '1'::jsonb,
  'El Velero no ve los parámetros de Villa Blanca (cae en su defecto)');
select is((select count(*)::int from public.parametros), 0, 'ni sus filas');
select lives_ok(
  $$ select public.guardar_parametro('cafe.capacidad_tostadora_kg', '20'::jsonb) $$,
  'El Velero guarda el suyo con la misma clave'
);
reset role;
select is(
  (select valor from public.parametros
    where clave = 'cafe.capacidad_tostadora_kg' and tenant_id = '00000000-0000-0000-0000-0000000000a1'),
  '14'::jsonb, 'y el de Villa Blanca no cambió'
);

-- 8. Sin sesión -------------------------------------------------------------------------------------------------------------------
select tests.como_anon();
select throws_ok($$ select public.tarifa_vigente('cafe.trilla') $$, '42501', null, 'anon no ejecuta tarifa_vigente');
select throws_ok($$ select count(*) from public.tarifas $$, '42501', null, 'anon no lee tarifas');
select throws_ok($$ select count(*) from public.parametros $$, '42501', null, 'anon no lee parametros');
select throws_ok($$ select public.guardar_parametro('cafe.x', '1'::jsonb) $$, '42501', null, 'anon no ejecuta guardar_parametro');
reset role;

-- 9. Auditoría --------------------------------------------------------------------------------------------------------------------
select ok(
  exists (select 1 from audit.log where tabla = 'public.tarifas' and accion = 'INSERT'
            and despues ->> 'concepto' = 'cafe.molienda' and tenant_id = '00000000-0000-0000-0000-0000000000a1'),
  'el alta de una tarifa queda en el historial'
);
select ok(
  exists (select 1 from audit.log where tabla = 'public.tarifas' and accion = 'DELETE'
            and antes ->> 'concepto' = 'cafe.tostion'),
  'el borrado de una tarifa programada queda en el historial'
);
select ok(
  exists (select 1 from audit.log where tabla = 'public.parametros' and accion = 'INSERT'
            and despues ->> 'clave' = 'cafe.capacidad_tostadora_kg' and tenant_id = '00000000-0000-0000-0000-0000000000a1'),
  'el alta de un parámetro queda en el historial'
);
select is(
  (select cambios ->> 'valor' from audit.log
    where tabla = 'public.parametros' and accion = 'UPDATE' and despues ->> 'clave' = 'cafe.capacidad_tostadora_kg'
      and tenant_id = '00000000-0000-0000-0000-0000000000a1'),
  '14', 'el cambio de un parámetro queda en el historial, con el valor nuevo'
);

select * from finish();
rollback;
