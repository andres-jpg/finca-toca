-- Auditoría automática (FIN-88): triggers de audit.log, set_updated(), RLS del log y su RPC de lectura.
-- Usuarios del seed: admin@vb.test / user@vb.test / viewer@vb.test (Villa Blanca, tenant ...a1),
-- admin@velero.test (El Velero, tenant ...a2), coop.admin@test (cooperativa, sin tenant).
-- El seed ya deja filas en audit.log (user_id NULL): cada comprobación filtra por un registro
-- propio de este test (ids 9000xx), nunca cuenta el log entero salvo para "no veo nada".
-- Todo se revierte con el rollback.
begin;

select plan(43);

-- 0. Estructura --------------------------------------------------------------------------------
select has_table('audit', 'log', 'existe audit.log');
select ok(
  (select relrowsecurity from pg_class where oid = 'audit.log'::regclass),
  'audit.log tiene RLS activada'
);
select is(
  (select array_agg(c.relname::text order by c.relname)
     from pg_trigger t
     join pg_class c on c.oid = t.tgrelid
    where t.tgfoid = 'audit.registrar_cambio'::regproc and not t.tgisinternal),
  array['animales', 'arriendos', 'arriendos_abonos', 'articulos', 'eventos_animal', 'fincas_cooperativa', 'gastos',
        'ingresos', 'pagos_finca', 'pajillas', 'parametros', 'precios', 'roles', 'series_consecutivo', 'tarifas', 'tenant_members',
        'tenant_modulos', 'tenants', 'terceros'],
  'auditoría activa exactamente en las 12 tablas del ticket más articulos, series_consecutivo, tarifas, parametros, tenant_modulos, tenant_members y terceros (no en recolecciones ni extracciones_leche)'
);
select ok(
  not has_function_privilege('anon', 'public.historial_cambios(text,text,integer)', 'execute'),
  'anon no puede ejecutar historial_cambios()'
);
select ok(
  has_function_privilege('authenticated', 'public.historial_cambios(text,text,integer)', 'execute'),
  'authenticated sí puede ejecutar historial_cambios()'
);
select ok(
  not has_function_privilege('authenticated', 'audit.registrar_cambio()', 'execute')
  and not has_function_privilege('authenticated', 'audit.activar(regclass,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.set_updated()', 'execute'),
  'authenticated no puede ejecutar a mano las funciones internas de auditoría'
);

-- Tabla auxiliar que cumple la convención de tablas nuevas (updated_at/updated_by + set_updated + activar).
create table public.zz_auditoria_prueba (
  id         integer primary key,
  tenant_id  uuid not null default public.tenant_actual(),
  valor      integer not null,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz,
  updated_by uuid
);
alter table public.zz_auditoria_prueba enable row level security;
create policy zz_todo on public.zz_auditoria_prueba for all to authenticated
  using (tenant_id = public.tenant_actual()) with check (tenant_id = public.tenant_actual());
grant all on public.zz_auditoria_prueba to authenticated;
create trigger set_updated before update on public.zz_auditoria_prueba
  for each row execute function public.set_updated();
select audit.activar('public.zz_auditoria_prueba');

-- 1. Admin de Villa Blanca: INSERT / UPDATE / UPDATE sin cambios / DELETE -------------------------
select tests.autenticar_como('admin@vb.test');

insert into public.precios (id, valor, tipo) values (900001, 3000, 'audit_test');
update public.precios set valor = 3100 where id = 900001;

select is(
  (select count(*)::int from audit.log where tabla = 'public.precios' and registro_id = '900001'),
  2, 'INSERT + UPDATE generan 2 filas de log'
);

update public.precios set valor = 3100 where id = 900001;   -- mismo valor: sin cambios reales
select is(
  (select count(*)::int from audit.log where tabla = 'public.precios' and registro_id = '900001'),
  2, 'un UPDATE sin cambios no genera fila'
);

delete from public.precios where id = 900001;
select is(
  (select array_agg(accion order by id) from audit.log where tabla = 'public.precios' and registro_id = '900001'),
  array['INSERT', 'UPDATE', 'DELETE'],
  'INSERT, UPDATE y DELETE dejan 3 filas, en ese orden'
);
select is(
  (select count(*)::int from audit.log
    where tabla = 'public.precios' and registro_id = '900001'
      and user_id = auth.uid() and user_id is not null),
  3, 'las 3 filas llevan el user_id del admin que escribió'
);
select is(
  (select array_agg(distinct tenant_id) from audit.log where tabla = 'public.precios' and registro_id = '900001'),
  array['00000000-0000-0000-0000-0000000000a1']::uuid[],
  'las filas llevan el tenant_id de Villa Blanca'
);
select is(
  (select cambios from audit.log where tabla = 'public.precios' and registro_id = '900001' and accion = 'UPDATE'),
  '{"valor": 3100}'::jsonb,
  'cambios del UPDATE contiene solo la clave modificada'
);
select is(
  (select (antes ->> 'valor')::int || '>' || (despues ->> 'valor')::int
     from audit.log where tabla = 'public.precios' and registro_id = '900001' and accion = 'UPDATE'),
  '3000>3100', 'el UPDATE guarda antes y después'
);
select ok(
  (select antes is null and despues ->> 'tipo' = 'audit_test'
     from audit.log where tabla = 'public.precios' and registro_id = '900001' and accion = 'INSERT')
  and
  (select despues is null and antes ->> 'tipo' = 'audit_test' and cambios is null
     from audit.log where tabla = 'public.precios' and registro_id = '900001' and accion = 'DELETE'),
  'INSERT sólo trae despues; DELETE sólo trae antes'
);

-- Un gasto que se queda (para las comprobaciones de aislamiento) y su actualización
insert into public.gastos (id, fecha, valor, observaciones) values (900001, current_date, 5000, 'audit_test');
select is(
  (select count(*)::int from audit.log where tabla = 'public.gastos' and registro_id = '900001' and accion = 'INSERT'),
  1, 'un gasto nuevo deja su fila de INSERT'
);

-- 2. updated_at / updated_by se rellenan solos ----------------------------------------------------
insert into public.zz_auditoria_prueba (id, valor) values (900001, 1);
select ok(
  (select updated_at is null and updated_by is null and created_by = auth.uid()
     from public.zz_auditoria_prueba where id = 900001),
  'tras el INSERT: created_by = usuario; updated_at/updated_by aún vacíos'
);

update public.zz_auditoria_prueba set valor = 2 where id = 900001;
select ok(
  (select updated_at is not null and updated_by = auth.uid()
     from public.zz_auditoria_prueba where id = 900001),
  'tras el UPDATE, set_updated() rellena updated_at y updated_by con el usuario'
);
select is(
  (select cambios from audit.log where tabla = 'public.zz_auditoria_prueba' and registro_id = '900001' and accion = 'UPDATE'),
  '{"valor": 2}'::jsonb,
  'cambios no incluye updated_at/updated_by'
);
update public.zz_auditoria_prueba set valor = 2 where id = 900001;   -- set_updated cambia updated_at, nada más
select is(
  (select count(*)::int from audit.log where tabla = 'public.zz_auditoria_prueba' and registro_id = '900001'),
  2, 'si solo cambian updated_at/updated_by no se registra nada'
);

-- 3. Un estado sin sesión (cron, seed): user_id NULL ------------------------------------------------
reset role;
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
insert into public.gastos (id, fecha, valor, observaciones, tenant_id)
values (900002, current_date, 1000, 'audit_test sin sesion', '00000000-0000-0000-0000-0000000000a1');
select is(
  (select user_id from audit.log where tabla = 'public.gastos' and registro_id = '900002'),
  null::uuid, 'una escritura sin sesión (cron/seed) deja user_id NULL'
);

-- Tablas sin tenant_id (cooperativa): el log registra tenant_id NULL
insert into public.fincas_cooperativa (nombre, precio_litro) values ('Finca audit_test', 2000);
select is(
  (select tenant_id from audit.log
    where tabla = 'public.fincas_cooperativa' and despues ->> 'nombre' = 'Finca audit_test'),
  null::uuid, 'una tabla sin tenant_id audita con tenant_id NULL'
);

-- tenants: la fila es el cliente (se pasa la columna `id` a audit.activar)
update public.tenants set nombre = nombre || '!' where id = '00000000-0000-0000-0000-0000000000a2';
select is(
  (select tenant_id from audit.log
    where tabla = 'public.tenants' and accion = 'UPDATE' and registro_id = '00000000-0000-0000-0000-0000000000a2'),
  '00000000-0000-0000-0000-0000000000a2'::uuid,
  'el log de tenants usa su propio id como tenant_id'
);

-- 4. Admin de Villa Blanca ve su log; vía RPC con email -------------------------------------------------
select tests.autenticar_como('admin@vb.test');

select is(
  (select count(*)::int from audit.log where tabla = 'public.gastos' and registro_id in ('900001', '900002')),
  2, 'admin VB ve el log de sus gastos'
);
select is(
  (select array_agg(distinct tenant_id) from audit.log where tenant_id is not null),
  array['00000000-0000-0000-0000-0000000000a1']::uuid[],
  'admin VB: todo el log visible es de Villa Blanca'
);
select is(
  (select count(*)::int from audit.log where tenant_id is null),
  0, 'admin VB no ve filas de log sin tenant (cooperativa)'
);
select is(
  (select email from public.historial_cambios('public.gastos', '900001')),
  'admin@vb.test', 'historial_cambios devuelve el email de quien hizo el cambio'
);
select is(
  (select email from public.historial_cambios('public.gastos', '900002')),
  null::text, 'sin sesión (user_id NULL) el email sale NULL'
);
select is(
  (select accion || ':' || (cambios ->> 'valor') from public.historial_cambios('public.gastos', '900001')),
  'INSERT:5000', 'historial_cambios devuelve el contenido del INSERT (despues)'
);
select is(
  (select count(*)::int from public.historial_cambios('public.gastos', null, 1)),
  1, 'p_limite acota el resultado'
);

-- 5. Admin de El Velero: no ve nada de Villa Blanca -----------------------------------------------------
reset role;
select tests.autenticar_como('admin@velero.test');

select is(
  (select count(*)::int from audit.log where tabla = 'public.gastos' and registro_id in ('900001', '900002')),
  0, 'admin EV no ve el log de Villa Blanca'
);
select is(
  (select array_agg(distinct tenant_id) from audit.log),
  array['00000000-0000-0000-0000-0000000000a2']::uuid[],
  'admin EV: todo el log visible es de El Velero'
);
select is(
  (select count(*)::int from public.historial_cambios('public.gastos', '900001')),
  0, 'admin EV no ve el historial de Villa Blanca por la RPC'
);
select is(
  (select count(*)::int from public.historial_cambios('public.tenants', '00000000-0000-0000-0000-0000000000a2') where accion = 'UPDATE'),
  1, 'admin EV sí ve el historial de su propio cliente'
);

-- 6. user / viewer / cooperativa: sin acceso al log -------------------------------------------------
reset role;
select tests.autenticar_como('user@vb.test');
select is((select count(*)::int from audit.log), 0, 'user VB no ve el log');
select is((select count(*)::int from public.historial_cambios('public.gastos', '900001')), 0, 'user VB no ve el historial por la RPC');

reset role;
select tests.autenticar_como('viewer@vb.test');
select is((select count(*)::int from audit.log), 0, 'viewer VB no ve el log');
select is((select count(*)::int from public.historial_cambios('public.gastos', '900001')), 0, 'viewer VB no ve el historial por la RPC');

reset role;
select tests.autenticar_como('coop.admin@test');
-- Desde FIN-90 es admin de Toca Lácteos: ve el log de SU cliente (membresías y módulos), nunca el de una finca.
select is(
  (select count(*)::int from audit.log where tenant_id is distinct from (select id from public.tenants where slug = 'toca-lacteos')),
  0, 'cooperativa_admin no ve el log de ningún cliente de finca'
);

-- 7. Nadie escribe en el log ----------------------------------------------------------------------------
reset role;
select tests.autenticar_como('admin@vb.test');
select throws_ok(
  $$ insert into audit.log (tabla, registro_id, accion) values ('public.gastos', '1', 'INSERT') $$,
  '42501', null, 'un admin no puede insertar a mano en audit.log'
);
select throws_ok(
  $$ delete from audit.log $$, '42501', null, 'un admin no puede borrar del log'
);
select throws_ok(
  $$ update audit.log set accion = 'DELETE' $$, '42501', null, 'un admin no puede editar el log'
);

-- 8. anon -----------------------------------------------------------------------------------------------
reset role;
select tests.como_anon();
select throws_ok('select count(*) from audit.log', '42501', null, 'anon no puede leer audit.log');
select throws_ok(
  $$ select * from public.historial_cambios('public.gastos') $$,
  '42501', null, 'anon no puede ejecutar historial_cambios()'
);

select * from finish();
rollback;
