-- Consecutivos por serie y año (FIN-95 · CO-15): series_consecutivo, consecutivos,
-- formatear_consecutivo() y siguiente_consecutivo().
-- Usuarios del seed (password123): admin@vb.test (admin VB), user@vb.test (operativo VB), viewer@vb.test,
-- admin@velero.test (admin El Velero). Las series y el usuario sin tenant se crean AQUÍ, dentro de la
-- transacción (rollback al final): el seed no trae series (las sembrará el alta de tenants, FIN-98).
--   VB: MP, MQ, RB (rollback), BIG (supera 9999), NR (no reinicia), NA (no reinicia, con {anio}),
--       INACT (inactiva), ZONA (fecha por defecto)
--   EV: MP (misma serie que VB, contador propio), SOLOEV (solo existe en El Velero)
begin;

select plan(77);

-- 0. Preparación ---------------------------------------------------------------------------------------------
insert into public.series_consecutivo (tenant_id, serie, descripcion, formato, reinicia_anual, activo) values
  ('00000000-0000-0000-0000-0000000000a1', 'MP',    'Marca propia',    '{serie}-{anio}-{n:4}', true,  true),
  ('00000000-0000-0000-0000-0000000000a1', 'MQ',    'Maquila',         '{serie}-{anio}-{n:4}', true,  true),
  ('00000000-0000-0000-0000-0000000000a1', 'RB',    'Rollback',        '{serie}-{anio}-{n:4}', true,  true),
  ('00000000-0000-0000-0000-0000000000a1', 'BIG',   'Supera 9999',     '{serie}-{anio}-{n:4}', true,  true),
  ('00000000-0000-0000-0000-0000000000a1', 'NR',    'No reinicia',     '{serie}-{n:6}',        false, true),
  ('00000000-0000-0000-0000-0000000000a1', 'NA',    'No reinicia año', '{serie}{anio}/{n}',    false, true),
  ('00000000-0000-0000-0000-0000000000a1', 'INACT', 'Inactiva',        '{serie}-{anio}-{n:4}', true,  false),
  ('00000000-0000-0000-0000-0000000000a1', 'ZONA',  'Fecha local',     '{serie}-{anio}-{n:4}', true,  true),
  ('00000000-0000-0000-0000-0000000000a2', 'MP',    'Marca propia',    '{serie}-{anio}-{n:4}', true,  true),
  ('00000000-0000-0000-0000-0000000000a2', 'SOLOEV','Solo El Velero',  '{serie}-{anio}-{n:4}', true,  true);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000c7', 'authenticated', 'authenticated', 'sin-tenant@test');

-- Una RPC "de negocio" que pide número y falla después (para probar el rollback). Se crea aquí y el
-- rollback final la retira, como `ping_transaccional` en 30_rpc_transaccional.test.sql. Devuelve el número
-- que alcanzó a recibir en el `detail` del error.
create or replace function public.ping_consecutivo_falla(p_serie text, p_fecha date)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_numero text := public.siguiente_consecutivo(p_serie, p_fecha);
begin
  raise exception using errcode = 'P0001', message = 'fallo_posterior', detail = v_numero;
end $$;
grant execute on function public.ping_consecutivo_falla(text, date) to authenticated;

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

-- 1. Estructura y privilegios ---------------------------------------------------------------------------------------
select has_table('public', 'series_consecutivo', 'existe series_consecutivo');
select has_table('public', 'consecutivos', 'existe consecutivos');
select ok(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.series_consecutivo'::regclass, 'public.consecutivos'::regclass)),
  'las dos tablas tienen RLS activada'
);
select has_function('public', 'siguiente_consecutivo', array['text', 'date'], 'existe siguiente_consecutivo(text, date)');
select is(
  (select p.prosecdef::text || coalesce(array_to_string(p.proconfig, ','), '')
     from pg_proc p where p.oid = 'public.siguiente_consecutivo(text, date)'::regprocedure),
  'true' || 'search_path=""',
  'siguiente_consecutivo() es SECURITY DEFINER con search_path vacío (excepción documentada)'
);
select ok(
  (select prosrc ilike '%zona_horaria%' and prosrc not ilike '%current_date%'
     from pg_proc where oid = 'public.siguiente_consecutivo(text, date)'::regprocedure),
  'la fecha por defecto sale de tenants.zona_horaria, no de current_date'
);
select ok(not has_function_privilege('anon', 'public.siguiente_consecutivo(text, date)', 'execute'), 'anon no ejecuta siguiente_consecutivo()');
select ok(has_function_privilege('authenticated', 'public.siguiente_consecutivo(text, date)', 'execute'), 'authenticated sí ejecuta siguiente_consecutivo()');
select ok(not has_table_privilege('anon', 'public.consecutivos', 'select'), 'anon no lee consecutivos');
select ok(has_table_privilege('authenticated', 'public.consecutivos', 'select'), 'authenticated lee consecutivos');
select ok(
  not has_table_privilege('authenticated', 'public.consecutivos', 'insert')
  and not has_table_privilege('authenticated', 'public.consecutivos', 'update')
  and not has_table_privilege('authenticated', 'public.consecutivos', 'delete'),
  'authenticated no escribe en consecutivos'
);
select ok(
  not has_table_privilege('service_role', 'public.consecutivos', 'insert')
  and not has_table_privilege('service_role', 'public.consecutivos', 'update'),
  'ni service_role escribe en consecutivos'
);
select has_trigger('public', 'series_consecutivo', 'audit_series_consecutivo', 'series_consecutivo está auditada');
select hasnt_trigger('public', 'consecutivos', 'audit_consecutivos', 'consecutivos no se audita (ruido)');

-- 2. Formato: los mismos casos que src/modules/core/consecutivos/formato.test.ts -----------------------------------
select is(public.formatear_consecutivo(c.formato, c.serie, c.anio, c.n), c.esperado, 'formato: ' || c.esperado)
  from (values
    ('{serie}-{anio}-{n:4}', 'MP',  2026,     13, 'MP-2026-0013'),
    ('{serie}-{anio}-{n:4}', 'MP',  2026,  10000, 'MP-2026-10000'),
    ('{serie}-{n}',          'REM', 2026,      7, 'REM-7'),
    ('{anio}/{n:6}-{serie}', 'MQ',  2027,     42, '2027/000042-MQ'),
    ('{n:2}-{n:4}',          'X',   2026,      5, '05-0005'),
    ('{serie}-{n:4}',        'MP',  2026, 123456, 'MP-123456')
  ) as c(formato, serie, anio, n, esperado);

select throws_ok(
  $$ insert into public.series_consecutivo (tenant_id, serie, descripcion, formato)
     values ('00000000-0000-0000-0000-0000000000a1', 'SINN', 'Sin número', '{serie}-{anio}') $$,
  '23514', null, 'un formato sin {n} se rechaza'
);

-- 3. Secuencia, año y series independientes -------------------------------------------------------------------------------
select tests.autenticar_como('admin@vb.test');
select is(public.siguiente_consecutivo('MP', '2026-03-15'), 'MP-2026-0001', 'primera llamada: MP-2026-0001');
select is(public.siguiente_consecutivo('MP', '2026-03-15'), 'MP-2026-0002', 'segunda llamada: MP-2026-0002');
select is(public.siguiente_consecutivo('MP', '2026-03-16'), 'MP-2026-0003', 'tercera llamada (otro día del mismo año): MP-2026-0003');
select is(public.siguiente_consecutivo('MP', '2027-01-01'), 'MP-2027-0001', 'con p_fecha de 2027 vuelve a MP-2027-0001');
select is(public.siguiente_consecutivo('MP', '2026-12-31'), 'MP-2026-0004', 'el año anterior conserva su contador: MP-2026-0004');
select is(public.siguiente_consecutivo('MQ', '2026-03-15'), 'MQ-2026-0001', 'otra serie del mismo tenant tiene su contador (MQ-2026-0001)');
select is(public.siguiente_consecutivo('NR', '2026-05-01'), 'NR-000001', 'serie que no reinicia: NR-000001');
select is(public.siguiente_consecutivo('NR', '2027-05-01'), 'NR-000002', 'serie que no reinicia: sigue en 2027 (NR-000002)');
select is(public.siguiente_consecutivo('NA', '2027-02-02'), 'NA2027/1', 'serie que no reinicia con {anio}: muestra el año de la fecha');

-- 4. Dos tenants con la misma serie, y qué ve cada uno ------------------------------------------------------------------------
reset role;
select tests.autenticar_como('admin@velero.test');
select is(public.siguiente_consecutivo('MP', '2026-03-15'), 'MP-2026-0001', 'El Velero tiene su propio contador de MP (MP-2026-0001)');
select throws_ok(
  $$ select public.siguiente_consecutivo('MQ', '2026-03-15') $$,
  'P0001', 'serie_no_configurada', 'El Velero no tiene la serie MQ de Villa Blanca'
);

reset role;
select tests.autenticar_como('admin@vb.test');
select is(public.siguiente_consecutivo('MP', '2026-03-15'), 'MP-2026-0005', 'Villa Blanca sigue en su contador (MP-2026-0005) tras la llamada de El Velero');
select throws_ok(
  $$ select public.siguiente_consecutivo('SOLOEV', '2026-03-15') $$,
  'P0001', 'serie_no_configurada', 'Villa Blanca no puede usar una serie de El Velero'
);

-- 5. Permisos -----------------------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('user@vb.test');
select is(public.siguiente_consecutivo('MQ', '2026-03-15'), 'MQ-2026-0002', 'un operativo sí pide número');

reset role;
select tests.autenticar_como('viewer@vb.test');
select throws_ok(
  $$ select public.siguiente_consecutivo('MP', '2026-03-15') $$,
  '42501', 'no_autorizado', 'un viewer recibe error'
);

reset role;
select tests.autenticar_como('sin-tenant@test');
select throws_ok(
  $$ select public.siguiente_consecutivo('MP', '2026-03-15') $$,
  '42501', 'no_autorizado', 'un usuario sin tenant recibe error'
);

reset role;
select tests.como_anon();
select throws_ok(
  $$ select public.siguiente_consecutivo('MP', '2026-03-15') $$,
  '42501', null, 'anon no puede ejecutar la función'
);

-- 6. Serie inexistente o inactiva -------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('admin@vb.test');
select throws_ok(
  $$ select public.siguiente_consecutivo('NOEXISTE', '2026-03-15') $$,
  'P0001', 'serie_no_configurada', 'serie inexistente → serie_no_configurada'
);
select throws_ok(
  $$ select public.siguiente_consecutivo('INACT', '2026-03-15') $$,
  'P0001', 'serie_no_configurada', 'serie inactiva → serie_no_configurada'
);
select throws_ok(
  $$ select public.siguiente_consecutivo(null, '2026-03-15') $$,
  'P0001', 'serie_no_configurada', 'serie nula → serie_no_configurada'
);
select is(
  pg_temp.detalle_de($$ select public.siguiente_consecutivo('NOEXISTE', '2026-03-15') $$),
  'La serie NOEXISTE no está configurada o está inactiva para este cliente.',
  'el detail explica qué serie falta'
);
select is(
  (select count(*)::int from public.consecutivos where serie in ('NOEXISTE', 'INACT')), 0,
  'una serie rechazada no crea contador'
);

-- 7. Fecha por defecto: la zona del tenant ----------------------------------------------------------------------------------------
-- No se puede congelar now() dentro de una transacción de prueba, así que se comprueba que el año del
-- contador sale de la zona del tenant: dos zonas extremas (UTC+14 y UTC-12) y cada una contra su propio
-- año local. El caso que distingue UTC de la zona local (31/12 20:00 en Bogotá) solo ocurre un día al año:
-- la comprobación estructural de arriba (usa zona_horaria, no current_date) cubre el resto.
reset role;
update public.tenants set zona_horaria = 'Pacific/Kiritimati' where id = '00000000-0000-0000-0000-0000000000a1';
update public.tenants set zona_horaria = 'Etc/GMT+12' where id = '00000000-0000-0000-0000-0000000000a2';
insert into public.series_consecutivo (tenant_id, serie, descripcion, formato) values
  ('00000000-0000-0000-0000-0000000000a2', 'ZONA', 'Fecha local', '{serie}-{anio}-{n:4}');

select tests.autenticar_como('admin@vb.test');
select is(
  public.siguiente_consecutivo('ZONA'),
  'ZONA-' || extract(year from (now() at time zone 'Pacific/Kiritimati'))::int || '-0001',
  'p_fecha nula: año según la zona del tenant (Pacific/Kiritimati)'
);
reset role;
select tests.autenticar_como('admin@velero.test');
select is(
  public.siguiente_consecutivo('ZONA'),
  'ZONA-' || extract(year from (now() at time zone 'Etc/GMT+12'))::int || '-0001',
  'p_fecha nula: año según la zona del tenant (Etc/GMT+12)'
);

-- 8. Rollback: una RPC que pide número y falla no lo consume ------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('admin@vb.test');
select is(public.siguiente_consecutivo('RB', '2026-06-01'), 'RB-2026-0001', 'RB: primer número confirmado');
select is(
  pg_temp.detalle_de($$ select public.ping_consecutivo_falla('RB', '2026-06-01') $$),
  'RB-2026-0002', 'la RPC recibió RB-2026-0002 antes de fallar'
);
select is(public.siguiente_consecutivo('RB', '2026-06-01'), 'RB-2026-0002', 'tras el fallo el número se reutiliza: el rollback revirtió el contador');
select is(
  pg_temp.detalle_de($$ select public.ping_consecutivo_falla('RB', '2030-01-01') $$),
  'RB-2030-0001', 'una RPC que falla pidiendo el primer número de un año nuevo...'
);
reset role;
select is(
  (select count(*)::int from public.consecutivos where serie = 'RB' and anio = 2030), 0,
  '...no deja ni siquiera la fila del contador'
);

-- 9. Más de 9999 -------------------------------------------------------------------------------------------------------------------------
insert into public.consecutivos (tenant_id, serie, anio, ultimo)
values ('00000000-0000-0000-0000-0000000000a1', 'BIG', 2026, 9998);
select tests.autenticar_como('admin@vb.test');
select is(public.siguiente_consecutivo('BIG', '2026-01-01'), 'BIG-2026-9999', 'BIG: 9999 cabe en 4 cifras');
select is(public.siguiente_consecutivo('BIG', '2026-01-01'), 'BIG-2026-10000', 'BIG: el 10000 crece sin truncar');

-- 10. RLS de series_consecutivo y consecutivos -------------------------------------------------------------------------------------------------------
select is(
  (select count(*)::int from public.series_consecutivo where tenant_id <> '00000000-0000-0000-0000-0000000000a1'), 0,
  'admin VB no ve series de otros clientes'
);
select is((select count(*)::int from public.series_consecutivo), 8, 'admin VB ve las 8 series de Villa Blanca');
select is(
  (select count(*)::int from public.consecutivos where tenant_id <> '00000000-0000-0000-0000-0000000000a1'), 0,
  'admin VB no ve contadores de otros clientes'
);
select ok((select count(*)::int from public.consecutivos) > 0, 'admin VB ve sus contadores');
select lives_ok(
  $$ insert into public.series_consecutivo (serie, descripcion, formato) values ('NUEVA', 'Serie nueva', '{serie}-{n:3}') $$,
  'admin crea una serie (tenant_id sale del DEFAULT tenant_actual())'
);
select is(
  (select tenant_id from public.series_consecutivo where serie = 'NUEVA'),
  '00000000-0000-0000-0000-0000000000a1'::uuid, 'la serie nueva quedó en el tenant del admin'
);
select throws_ok(
  $$ insert into public.series_consecutivo (tenant_id, serie, descripcion)
     values ('00000000-0000-0000-0000-0000000000a2', 'AJENA', 'En otro cliente') $$,
  '42501', null, 'admin no crea series en otro cliente'
);
select is(
  tests.filas_afectadas($$ update public.series_consecutivo set formato = '{serie}/{n:5}' where serie = 'NUEVA' $$),
  1, 'admin edita el formato de su serie'
);
select throws_ok(
  $$ update public.series_consecutivo set serie = 'OTRA' where serie = 'NUEVA' $$,
  '42501', null, 'la clave de la serie no se puede cambiar'
);
select throws_ok(
  $$ insert into public.consecutivos (tenant_id, serie, anio, ultimo)
     values ('00000000-0000-0000-0000-0000000000a1', 'MP', 2099, 500) $$,
  '42501', null, 'admin no inserta contadores a mano'
);
select throws_ok(
  $$ update public.consecutivos set ultimo = 0 where serie = 'MP' $$,
  '42501', null, 'admin no reinicia contadores a mano'
);
select throws_ok(
  $$ delete from public.consecutivos where serie = 'MP' $$,
  '42501', null, 'admin no borra contadores'
);
select throws_ok(
  $$ delete from public.series_consecutivo where serie = 'MP' $$,
  '23503', null, 'una serie con contadores no se puede borrar (on delete restrict)'
);
select lives_ok(
  $$ delete from public.series_consecutivo where serie = 'NUEVA' $$,
  'una serie sin contadores sí se borra'
);

reset role;
select tests.autenticar_como('user@vb.test');
select is((select count(*)::int from public.series_consecutivo), 8, 'un operativo lee las series de su tenant');
select throws_ok(
  $$ insert into public.series_consecutivo (serie, descripcion) values ('OPER', 'No debería') $$,
  '42501', null, 'un operativo no crea series'
);
select is(
  tests.filas_afectadas($$ update public.series_consecutivo set activo = false where serie = 'MP' $$),
  0, 'un operativo no edita series'
);

reset role;
select tests.autenticar_como('viewer@vb.test');
select is((select count(*)::int from public.series_consecutivo), 8, 'un viewer lee las series (para previsualizar)');
select throws_ok(
  $$ insert into public.series_consecutivo (serie, descripcion) values ('VIEW', 'No debería') $$,
  '42501', null, 'un viewer no crea series'
);

reset role;
select tests.como_anon();
select throws_ok('select count(*) from public.series_consecutivo', '42501', null, 'anon no lee series_consecutivo');
select throws_ok('select count(*) from public.consecutivos', '42501', null, 'anon no lee consecutivos');

-- 11. Auditoría --------------------------------------------------------------------------------------------------------------------------------------
reset role;
select ok(
  exists (select 1 from audit.log where tabla = 'public.series_consecutivo' and accion = 'INSERT'
            and tenant_id = '00000000-0000-0000-0000-0000000000a1'),
  'el alta de una serie queda en el historial'
);
select is(
  (select cambios ->> 'formato' from audit.log
    where tabla = 'public.series_consecutivo' and accion = 'UPDATE' and despues ->> 'serie' = 'NUEVA'),
  '{serie}/{n:5}', 'la edición de una serie queda en el historial, con lo que cambió'
);
select ok(
  exists (select 1 from audit.log where tabla = 'public.series_consecutivo' and accion = 'DELETE'
            and antes ->> 'serie' = 'NUEVA'),
  'el borrado de una serie queda en el historial'
);
select is(
  (select count(*)::int from audit.log where tabla = 'public.consecutivos'), 0,
  'los contadores no generan historial'
);

select * from finish();
rollback;
