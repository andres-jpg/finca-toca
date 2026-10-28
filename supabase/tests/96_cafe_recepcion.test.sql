-- Recepción de café de clientes (FIN-107 · CO-26): cafe.registrar_recepcion() y cafe.rango_calidad().
-- Solo trilla, trilla + maquila, nivel de tueste obligatorio con tostión, alertas de calidad como snapshot
-- (con y sin rango configurado), series MP/MQ independientes, tercero que no es cliente de servicios, estimación,
-- permisos por rol, módulo apagado y aislamiento entre clientes.
-- Todo se crea AQUÍ dentro de la transacción (rollback al final): dos clientes de café (A y B).
--   r1 owner A   r2 operativo A   r3 viewer A   r4 owner B
begin;

select plan(64);

-- 0. Preparación --------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'owner-a@recepcion.test'),
  ('00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'operativo-a@recepcion.test'),
  ('00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', 'viewer-a@recepcion.test'),
  ('00000000-0000-0000-0000-0000000000c4', 'authenticated', 'authenticated', 'owner-b@recepcion.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Recepción A', 'recepcion-a-t', 'cafe');
select platform.crear_tenant('Recepción B', 'recepcion-b-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'recepcion-a-t'
union all select 'b', id from public.tenants where slug = 'recepcion-b-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), m.rol::public.rol_tenant
  from (values
    ('00000000-0000-0000-0000-0000000000c1', 'a', 'owner'),
    ('00000000-0000-0000-0000-0000000000c2', 'a', 'operativo'),
    ('00000000-0000-0000-0000-0000000000c3', 'a', 'viewer'),
    ('00000000-0000-0000-0000-0000000000c4', 'b', 'owner')) as m(user_id, t, rol);

-- Terceros: ca (cliente de servicios), cp (solo proveedor), ci (cliente de servicios, inactivo), cb (de B).
with t as (
  insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles, activo)
  select i.id, x.nombre, 'Calle 1', '3000000000', x.identificacion, x.roles, x.activo
    from (values ('a', 'Cliente A',    '7000001', array['cliente_servicio'],            true),
                 ('a', 'Proveedor A',  '7000002', array['proveedor'],                   true),
                 ('a', 'Inactivo A',   '7000003', array['cliente_servicio'],            false),
                 ('b', 'Cliente B',    '7000004', array['cliente_servicio'],            true)) as x(t, nombre, identificacion, roles, activo)
    join ids i on i.clave = x.t
  returning identificacion, id
)
insert into ids select case identificacion when '7000001' then 'ca' when '7000002' then 'cp'
                                           when '7000003' then 'ci' else 'cb' end, id from t;

-- Resultados de las recepciones, para comprobarlos después sin repetir llamadas.
create temp table res (k text primary key, r jsonb);
grant select, insert on res to authenticated;

-- Carga base de una recepción: 500 kg en 8 bultos, solo trilla, fecha de hoy. `extra` la pisa o completa.
create or replace function pg_temp.carga(p_ter text, p_extra jsonb default '{}')
returns jsonb
language sql
as $$
  select jsonb_build_object('tercero_id', (select id from ids where clave = p_ter),
                            'fecha', to_char(current_date, 'YYYY-MM-DD'),
                            'peso_kg', 500, 'num_bultos', 8, 'servicios', jsonb_build_array('trilla')) || p_extra
$$;
grant execute on function pg_temp.carga(text, jsonb) to authenticated;

-- Año del consecutivo de hoy, para no depender de la fecha en que corra el test.
create or replace function pg_temp.anio() returns text language sql as $$ select to_char(current_date, 'YYYY') $$;
grant execute on function pg_temp.anio() to authenticated;

-- 1. Operativo: recepción de solo trilla (sin rangos configurados) -----------------------------------------------
select tests.autenticar_como('operativo-a@recepcion.test');

insert into res
select 'solo_trilla', cafe.registrar_recepcion(pg_temp.carga('ca', jsonb_build_object('humedad_pct', 13.2, 'densidad', 680)));

select is(
  (select r ->> 'codigo' from res where k = 'solo_trilla'),
  'MQ-' || pg_temp.anio() || '-0001',
  'solo trilla de 500 kg: primer código MQ del año'
);
select is(
  (select l.servicios::text from cafe.lotes l where l.id = (select (r ->> 'id')::uuid from res where k = 'solo_trilla')),
  '{trilla}',
  'servicios {trilla}: sin tostión no hay empaque'
);
select is(
  (select r -> 'estimacion' from res where k = 'solo_trilla'),
  '[{"servicio": "trilla", "peso_kg": 500, "tarifa_kg": 1400.00, "valor_estimado": 700000}]'::jsonb,
  'estimación de la trilla: 500 kg × $1.400 = $700.000'
);
select is(
  (select r -> 'alertas_calidad' from res where k = 'solo_trilla'),
  '[]'::jsonb,
  'sin rangos configurados no hay alerta (aunque humedad y densidad vengan)'
);
select ok(
  (select l.rangos_calidad is null and l.alertas_calidad = '{}' and l.humedad_pct = 13.2 and l.densidad = 680
     from cafe.lotes l where l.id = (select (r ->> 'id')::uuid from res where k = 'solo_trilla')),
  'sin rangos: rangos_calidad = null, alertas vacías y la humedad y la densidad quedan guardadas'
);
select is(
  (select (l.linea::text, l.fecha_recepcion, l.peso_recibido_kg, l.num_bultos, l.nivel_tueste is null)::text
     from cafe.lotes l where l.id = (select (r ->> 'id')::uuid from res where k = 'solo_trilla')),
  '(servicio,' || to_char(current_date, 'YYYY-MM-DD') || ',500.000,8,t)',
  'el lote es de línea servicio, con la fecha, el peso y los bultos recibidos'
);
select is(
  (select (count(*), sum(b.peso_kg), min(b.peso_kg), max(b.peso_kg))::text
     from cafe.lote_bultos b where b.lote_id = (select (r ->> 'id')::uuid from res where k = 'solo_trilla')),
  '(8,500.000,62.500,62.500)',
  '8 bultos de 62,5 kg que suman 500 kg'
);

-- 2. Trilla + tostión + molienda: un solo código, empaque incluido, nivel de tueste -----------------------------
insert into res
select 'completa', cafe.registrar_recepcion(pg_temp.carga('ca', jsonb_build_object(
  'servicios', jsonb_build_array('molienda', 'tostion', 'trilla'), 'nivel_tueste', 'medio',
  'observaciones', '  Trae su propia bolsa  ')));

select is(
  (select r ->> 'codigo' from res where k = 'completa'),
  'MQ-' || pg_temp.anio() || '-0002',
  'trilla + tostión + molienda: un solo código (el siguiente de la serie MQ)'
);
select is(
  (select l.servicios::text from cafe.lotes l where l.id = (select (r ->> 'id')::uuid from res where k = 'completa')),
  '{trilla,tostion,molienda,empaque}',
  'servicios ordenados y con empaque incluido: {trilla,tostion,molienda,empaque}'
);
select is(
  (select r -> 'servicios' from res where k = 'completa'),
  '["trilla", "tostion", "molienda", "empaque"]'::jsonb,
  'la respuesta devuelve los servicios con el empaque'
);
select is(
  (select (l.nivel_tueste::text, l.observaciones)::text from cafe.lotes l
    where l.id = (select (r ->> 'id')::uuid from res where k = 'completa')),
  '(medio,"Trae su propia bolsa")',
  'el nivel de tueste y las observaciones (sin espacios sobrantes) quedan guardados'
);
select is(
  (select r -> 'estimacion' from res where k = 'completa'),
  '[{"servicio": "trilla",   "peso_kg": 500,     "tarifa_kg": 1400.00, "valor_estimado": 700000},
    {"servicio": "tostion",  "peso_kg": 405,     "tarifa_kg": 2200.00, "valor_estimado": 891000},
    {"servicio": "molienda", "peso_kg": 332.1,   "tarifa_kg": 1000.00, "valor_estimado": 332100}]'::jsonb,
  'estimación: trilla $700.000; tostión sobre 405 kg (tras la merma del 19 %) $891.000; molienda sobre 332,1 kg $332.100; sin línea de empaque'
);

-- 3. Nivel de tueste obligatorio con tostión (y no se consume el consecutivo) ----------------------------------
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('ca', jsonb_build_object('servicios', jsonb_build_array('trilla', 'tostion')))) $$,
  'P0001', 'falta_nivel_tueste',
  'con tostión y sin nivel de tueste no se guarda'
);
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('ca', jsonb_build_object('servicios', jsonb_build_array('tostion'), 'nivel_tueste', ''))) $$,
  'P0001', 'falta_nivel_tueste',
  'un nivel de tueste vacío es lo mismo que ninguno'
);
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('ca', jsonb_build_object('servicios', jsonb_build_array('tostion'), 'nivel_tueste', 'quemado'))) $$,
  'P0001', 'datos_invalidos',
  'un nivel de tueste desconocido es dato inválido'
);
insert into res
select 'sin_tostion', cafe.registrar_recepcion(pg_temp.carga('ca', jsonb_build_object('nivel_tueste', 'alto')));
select is(
  (select r ->> 'codigo' from res where k = 'sin_tostion'),
  'MQ-' || pg_temp.anio() || '-0003',
  'los intentos fallidos no consumieron números: la siguiente recepción es la 0003'
);
select ok(
  (select l.nivel_tueste is null from cafe.lotes l where l.id = (select (r ->> 'id')::uuid from res where k = 'sin_tostion')),
  'sin tostión el nivel de tueste se ignora (queda nulo)'
);

-- 4. Series independientes: MP y MQ ----------------------------------------------------------------------------
select is(
  public.siguiente_consecutivo('MP'),
  'MP-' || pg_temp.anio() || '-0001',
  'la serie MP arranca en 0001 aunque MQ ya vaya por la 0003'
);
select is(
  (select r ->> 'codigo' from (select cafe.registrar_recepcion(pg_temp.carga('ca')) as r) x),
  'MQ-' || pg_temp.anio() || '-0004',
  'y MQ sigue su propia cuenta (0004) sin que MP la altere'
);

-- 5. Terceros no válidos ---------------------------------------------------------------------------------------------
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('cp')) $$,
  'P0001', 'tercero_no_es_cliente_servicio',
  'un proveedor sin rol de cliente de servicios no puede dejar café'
);
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('ci')) $$,
  'P0001', 'tercero_inactivo',
  'un tercero desactivado no puede dejar café'
);
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('cb')) $$,
  'P0001', 'tercero_no_encontrado',
  'el tercero de otro cliente no existe para este (RLS)'
);
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('ca', jsonb_build_object('tercero_id', gen_random_uuid()))) $$,
  'P0001', 'tercero_no_encontrado',
  'un tercero inexistente → tercero_no_encontrado'
);

-- 6. Servicios inválidos ---------------------------------------------------------------------------------------------
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('ca', jsonb_build_object('servicios', '[]'::jsonb))) $$,
  'P0001', 'sin_servicios',
  'sin servicios no se guarda'
);
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('ca', jsonb_build_object('servicios', jsonb_build_array('molienda')))) $$,
  'P0001', 'servicios_invalidos',
  'molienda sin tostión → servicios_invalidos'
);
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('ca', jsonb_build_object('servicios', jsonb_build_array('empaque')))) $$,
  'P0001', 'servicios_invalidos',
  'empaque solo (sin tostión) → servicios_invalidos'
);
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('ca', jsonb_build_object('servicios', jsonb_build_array('trilla', 'secado')))) $$,
  'P0001', 'servicios_invalidos',
  'un servicio desconocido → servicios_invalidos'
);
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('ca', jsonb_build_object('servicios', '"trilla"'::jsonb))) $$,
  'P0001', 'servicios_invalidos',
  'servicios debe ser un arreglo'
);

-- 7. Datos inválidos y bultos ----------------------------------------------------------------------------------------
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('ca', '{"peso_kg": 0}')) $$,
  'P0001', 'datos_invalidos', 'el peso debe ser mayor que cero'
);
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('ca', '{"peso_kg": "500"}')) $$,
  'P0001', 'datos_invalidos', 'el peso debe ser un número, no un texto'
);
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('ca', '{"num_bultos": 0}')) $$,
  'P0001', 'datos_invalidos', 'al menos un bulto'
);
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('ca', '{"num_bultos": 201}')) $$,
  'P0001', 'datos_invalidos', 'máximo 200 bultos'
);
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('ca', '{"fecha": "2026-13-45"}')) $$,
  'P0001', 'datos_invalidos', 'una fecha imposible'
);
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('ca', '{"humedad_pct": 120}')) $$,
  'P0001', 'datos_invalidos', 'la humedad es un porcentaje: 0–100'
);
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('ca', '{"densidad": 0}')) $$,
  'P0001', 'datos_invalidos', 'la densidad debe ser mayor que cero'
);
select throws_ok(
  $$ select cafe.registrar_recepcion('[]'::jsonb) $$,
  'P0001', 'datos_invalidos', 'la entrada debe ser un objeto'
);
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('ca', jsonb_build_object('pesos_bultos', jsonb_build_array(100, 100, 100)))) $$,
  'P0001', 'bultos_no_cuadran', 'tres pesos para ocho bultos → bultos_no_cuadran'
);
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('ca', jsonb_build_object('num_bultos', 2, 'pesos_bultos', jsonb_build_array(100, 100)))) $$,
  'P0001', 'bultos_no_cuadran', 'los pesos por bulto deben sumar el peso total'
);
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('ca', jsonb_build_object('num_bultos', 2, 'pesos_bultos', jsonb_build_array(500, 0)))) $$,
  'P0001', 'datos_invalidos', 'un bulto de 0 kg no es válido'
);

insert into res
select 'pesos', cafe.registrar_recepcion(pg_temp.carga('ca', jsonb_build_object('num_bultos', 3, 'peso_kg', 100)));
select is(
  (select array_agg(b.peso_kg order by b.numero)::text
     from cafe.lote_bultos b where b.lote_id = (select (r ->> 'id')::uuid from res where k = 'pesos')),
  '{33.333,33.333,33.334}',
  '100 kg en 3 bultos: partes iguales y el último absorbe el resto'
);
insert into res
select 'pesos_custom', cafe.registrar_recepcion(pg_temp.carga('ca', jsonb_build_object(
  'num_bultos', 3, 'peso_kg', 200, 'pesos_bultos', jsonb_build_array(70.5, 60, 69.5))));
select is(
  (select array_agg(b.peso_kg order by b.numero)::text
     from cafe.lote_bultos b where b.lote_id = (select (r ->> 'id')::uuid from res where k = 'pesos_custom')),
  '{70.500,60.000,69.500}',
  'pesos por bulto explícitos: se guardan tal cual'
);

-- 8. Sin tarifa para la fecha: se guarda y la estimación sale vacía -------------------------------------------------
insert into res
select 'antigua', cafe.registrar_recepcion(pg_temp.carga('ca', jsonb_build_object(
  'fecha', to_char(current_date - 30, 'YYYY-MM-DD'))));
select is(
  (select r -> 'estimacion' from res where k = 'antigua'),
  '[{"servicio": "trilla", "peso_kg": 500, "tarifa_kg": null, "valor_estimado": null}]'::jsonb,
  'una fecha anterior a toda tarifa: se guarda igual y la estimación queda sin valor (no se bloquea)'
);

-- 9. Alertas de calidad como snapshot ----------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('owner-a@recepcion.test');
select lives_ok(
  $$ select public.guardar_parametro('cafe.humedad_rango_pct', '{"min": 10, "max": 12}'::jsonb) $$,
  'el owner configura el rango de humedad 10–12 %'
);
select lives_ok(
  $$ select public.guardar_parametro('cafe.densidad_rango', '{"min": 600, "max": 700}'::jsonb) $$,
  'y el de densidad 600–700'
);

reset role;
select tests.autenticar_como('operativo-a@recepcion.test');

insert into res
select 'hum_alta', cafe.registrar_recepcion(pg_temp.carga('ca', jsonb_build_object('humedad_pct', 13.2, 'densidad', 680)));
select is(
  (select r -> 'alertas_calidad' from res where k = 'hum_alta'),
  '["humedad_alta"]'::jsonb,
  'humedad 13,2 % con rango 10–12: guarda el lote y alerta humedad_alta (la densidad 680 está dentro)'
);
select is(
  (select l.alertas_calidad::text from cafe.lotes l where l.id = (select (r ->> 'id')::uuid from res where k = 'hum_alta')),
  '{humedad_alta}',
  'alertas_calidad = {humedad_alta} en el lote'
);
select is(
  (select l.rangos_calidad from cafe.lotes l where l.id = (select (r ->> 'id')::uuid from res where k = 'hum_alta')),
  '{"humedad": {"min": 10, "max": 12}, "densidad": {"min": 600, "max": 700}}'::jsonb,
  'rangos_calidad guarda los rangos usados'
);

insert into res
select 'varias', cafe.registrar_recepcion(pg_temp.carga('ca', jsonb_build_object('humedad_pct', 9.5, 'densidad', 550)));
select is(
  (select r -> 'alertas_calidad' from res where k = 'varias'),
  '["humedad_baja", "densidad_baja"]'::jsonb,
  'humedad y densidad bajas: dos alertas, en ese orden'
);
insert into res
select 'densidad_alta', cafe.registrar_recepcion(pg_temp.carga('ca', jsonb_build_object('humedad_pct', 12, 'densidad', 700.5)));
select is(
  (select r -> 'alertas_calidad' from res where k = 'densidad_alta'),
  '["densidad_alta"]'::jsonb,
  'el límite del rango no alerta (humedad 12 %); 700,5 sobre 700 sí (densidad_alta)'
);
insert into res
select 'sin_medir', cafe.registrar_recepcion(pg_temp.carga('ca'));
select ok(
  (select l.alertas_calidad = '{}' and l.rangos_calidad is null and l.humedad_pct is null and l.densidad is null
     from cafe.lotes l where l.id = (select (r ->> 'id')::uuid from res where k = 'sin_medir')),
  'si no se midió humedad ni densidad no se evalúa nada, aunque haya rangos (rangos_calidad = null)'
);
insert into res
select 'solo_humedad', cafe.registrar_recepcion(pg_temp.carga('ca', jsonb_build_object('humedad_pct', 11)));
select is(
  (select l.rangos_calidad from cafe.lotes l where l.id = (select (r ->> 'id')::uuid from res where k = 'solo_humedad')),
  '{"humedad": {"min": 10, "max": 12}}'::jsonb,
  'solo se guarda el rango de lo que se midió'
);

-- Cambiar el rango después no toca el lote ya guardado.
reset role;
select tests.autenticar_como('owner-a@recepcion.test');
select public.guardar_parametro('cafe.humedad_rango_pct', '{"min": 8, "max": 14}'::jsonb);
select is(
  (select l.alertas_calidad::text || ' ' || (l.rangos_calidad -> 'humedad')::text
     from cafe.lotes l where l.id = (select (r ->> 'id')::uuid from res where k = 'hum_alta')),
  '{humedad_alta} {"max": 12, "min": 10}',
  'cambiar el rango después no altera las alertas ni los rangos de un lote ya guardado'
);
reset role;
select tests.autenticar_como('operativo-a@recepcion.test');
insert into res
select 'nuevo_rango', cafe.registrar_recepcion(pg_temp.carga('ca', jsonb_build_object('humedad_pct', 13.2)));
select is(
  (select r -> 'alertas_calidad' from res where k = 'nuevo_rango'),
  '[]'::jsonb,
  'una recepción nueva usa el rango vigente (8–14): 13,2 % ya no alerta'
);

-- Un parámetro en JSON null ("sin configurar") o con forma rara se trata como no configurado.
reset role;
select tests.autenticar_como('owner-a@recepcion.test');
select public.guardar_parametro('cafe.humedad_rango_pct', 'null'::jsonb);
select public.guardar_parametro('cafe.densidad_rango', '{"min": 700, "max": 600}'::jsonb);
select ok(
  cafe.rango_calidad('cafe.humedad_rango_pct') is null and cafe.rango_calidad('cafe.densidad_rango') is null
  and cafe.rango_calidad('cafe.no_existe') is null,
  'rango_calidad: JSON null, min > max y parámetro inexistente → NULL'
);
select is(
  cafe.rango_calidad('cafe.humedad_rango_pct') is null, true, 'sin rango no hay error'
);
select public.guardar_parametro('cafe.humedad_rango_pct', '{"min": 10, "max": 12}'::jsonb);
select is(
  cafe.rango_calidad('cafe.humedad_rango_pct'), '{"min": 10, "max": 12}'::jsonb,
  'rango_calidad devuelve {min, max} normalizado'
);

-- 10. Permisos: viewer, módulo apagado, aislamiento ----------------------------------------------------------------
reset role;
select tests.autenticar_como('viewer-a@recepcion.test');
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('ca')) $$,
  '42501', 'no_autorizado', 'un viewer no registra recepciones'
);
select is(
  (select count(*) from cafe.lotes), (select count(*) from cafe.lotes where tenant_id = (select id from ids where clave = 'a')),
  'el viewer sí ve los lotes de su cliente (y solo esos)'
);

reset role;
select tests.autenticar_como('owner-b@recepcion.test');
select is((select count(*) from cafe.lotes), 0::bigint, 'el cliente B no ve ningún lote de A');
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('ca')) $$,
  'P0001', 'tercero_no_encontrado', 'B no puede recibir café a nombre de un tercero de A'
);
insert into res
select 'b1', cafe.registrar_recepcion(pg_temp.carga('cb'));
select is(
  (select r ->> 'codigo' from res where k = 'b1'),
  'MQ-' || pg_temp.anio() || '-0001',
  'el consecutivo de B es independiente del de A (MQ-…-0001)'
);

reset role;
update public.tenant_modulos set activo = false
 where tenant_id = (select id from ids where clave = 'a') and modulo_id = 'cafe.recepcion';
select tests.autenticar_como('owner-a@recepcion.test');
select throws_ok(
  $$ select cafe.registrar_recepcion(pg_temp.carga('ca')) $$,
  '42501', 'no_autorizado', 'con el módulo cafe.recepcion apagado nadie registra recepciones'
);

-- 11. Privilegios -----------------------------------------------------------------------------------------------------------
reset role;
select ok(
  not has_function_privilege('anon', 'cafe.registrar_recepcion(jsonb)', 'execute')
  and has_function_privilege('authenticated', 'cafe.registrar_recepcion(jsonb)', 'execute'),
  'registrar_recepcion no la ejecuta anon; sí authenticated'
);
select ok(
  (select not p.prosecdef from pg_proc p where p.oid = 'cafe.registrar_recepcion(jsonb)'::regprocedure),
  'registrar_recepcion es SECURITY INVOKER'
);

select * from finish();
rollback;
