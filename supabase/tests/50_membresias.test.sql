-- Membresías usuario–tenant, platform admin y funciones de sesión (FIN-90 · CO-10).
-- Usuarios del seed (password123): admin@vb.test (admin VB), user@vb.test (user VB), viewer@vb.test,
-- admin@velero.test, coop.admin@test, coop.user@test. Los usuarios y membresías extra se crean AQUÍ,
-- dentro de la transacción (rollback al final).
--   c1 platform admin sin membresía ni rol       c5 usuario con rol 'user' creado en el test (trigger)
--   c2 miembro operativo de VB (lo crea el admin)  c6 cooperativa_admin creado en el test (trigger)
--   c3 destinatario de intentos de owner           c7 usuario sin rol (huérfano)
--   c4 owner de VB (sin roles)
begin;

select plan(110);

-- 0. Preparación --------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated', 'platform@test'),
  ('00000000-0000-0000-0000-0000000000c2', 'authenticated', 'authenticated', 'c2@test'),
  ('00000000-0000-0000-0000-0000000000c3', 'authenticated', 'authenticated', 'c3@test'),
  ('00000000-0000-0000-0000-0000000000c4', 'authenticated', 'authenticated', 'owner@test'),
  ('00000000-0000-0000-0000-0000000000c5', 'authenticated', 'authenticated', 'c5@test'),
  ('00000000-0000-0000-0000-0000000000c6', 'authenticated', 'authenticated', 'c6@test'),
  ('00000000-0000-0000-0000-0000000000c7', 'authenticated', 'authenticated', 'c7@test');

-- 1. Estructura y privilegios ---------------------------------------------------------------------------------
select has_type('public', 'rol_tenant', 'existe el enum rol_tenant');
select enum_has_labels('public', 'rol_tenant', array['owner', 'admin', 'operativo', 'viewer'], 'rol_tenant tiene los 4 roles');
select has_table('public', 'tenant_members', 'existe tenant_members');
select has_table('public', 'platform_admins', 'existe platform_admins');
select has_table('public', 'user_tenant_activo', 'existe user_tenant_activo');
select ok(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.tenant_members'::regclass, 'public.platform_admins'::regclass, 'public.user_tenant_activo'::regclass)),
  'las tres tablas nuevas tienen RLS activada'
);

select is(
  (select p.provolatile::text || p.prosecdef::text || coalesce(array_to_string(p.proconfig, ','), '')
     from pg_proc p where p.oid = 'public.tenant_actual()'::regprocedure),
  's' || 'true' || 'search_path=""',
  'tenant_actual() sigue siendo STABLE SECURITY DEFINER con search_path vacío'
);
select is(pg_get_function_result('public.tenant_actual()'::regprocedure), 'uuid', 'tenant_actual() sigue devolviendo uuid');
select is(pg_get_function_result('public.rol_actual()'::regprocedure), 'rol', 'rol_actual() sigue devolviendo el enum legacy');
select ok(
  (select prosrc ilike '%public.roles%' and prosrc not ilike '%tenant_members%' from pg_proc where oid = 'public.rol_actual()'::regprocedure),
  'rol_actual() sigue leyendo solo de roles (sin cambios)'
);

select ok(not has_function_privilege('anon', 'public.tenant_actual()', 'execute'), 'anon no ejecuta tenant_actual()');
select ok(not has_function_privilege('anon', 'public.rol_en_tenant()', 'execute'), 'anon no ejecuta rol_en_tenant()');
select ok(not has_function_privilege('anon', 'public.es_platform_admin()', 'execute'), 'anon no ejecuta es_platform_admin()');
select ok(not has_function_privilege('anon', 'public.tiene_permiso(text)', 'execute'), 'anon no ejecuta tiene_permiso()');
select ok(not has_function_privilege('anon', 'public.cambiar_tenant_activo(uuid)', 'execute'), 'anon no ejecuta cambiar_tenant_activo()');
select ok(has_function_privilege('authenticated', 'public.cambiar_tenant_activo(uuid)', 'execute'), 'authenticated sí ejecuta cambiar_tenant_activo()');
select ok(has_function_privilege('authenticated', 'public.rol_en_tenant()', 'execute'), 'authenticated sí ejecuta rol_en_tenant()');
select ok(
  not has_function_privilege('authenticated', 'public.sincronizar_membresia_desde_roles()', 'execute')
  and not has_function_privilege('anon', 'public.sincronizar_membresia_desde_roles()', 'execute'),
  'nadie ejecuta a mano la función del trigger de roles'
);
select ok(not has_table_privilege('authenticated', 'public.platform_admins', 'select'), 'authenticated no lee platform_admins');
select ok(not has_table_privilege('anon', 'public.tenant_members', 'select'), 'anon no lee tenant_members');
select ok(not has_table_privilege('authenticated', 'public.tenant_members', 'delete'), 'nadie borra tenant_members desde la API');
select ok(not has_table_privilege('authenticated', 'public.user_tenant_activo', 'insert'), 'user_tenant_activo no se escribe desde la API');

-- 2. Backfill desde roles ---------------------------------------------------------------------------------------
select is((select count(*)::int from public.roles), 6, 'el seed tiene 6 filas de roles');
select is(
  (select count(*)::int from public.roles r
    where not exists (select 1 from public.tenant_members m where m.user_id = r.user_id and m.activo)),
  0, 'cada fila de roles tiene su membresía activa'
);
select is(
  (select array_agg(u.email || ':' || t.slug || ':' || m.rol::text order by u.email)
     from public.tenant_members m
     join auth.users u on u.id = m.user_id
     join public.tenants t on t.id = m.tenant_id
    where u.email in ('admin@vb.test', 'user@vb.test', 'viewer@vb.test', 'admin@velero.test', 'coop.admin@test', 'coop.user@test')),
  array[
    'admin@vb.test:villa-blanca:admin',
    'admin@velero.test:el-velero:admin',
    'coop.admin@test:toca-lacteos:admin',
    'coop.user@test:toca-lacteos:operativo',
    'user@vb.test:villa-blanca:operativo',
    'viewer@vb.test:villa-blanca:viewer'
  ],
  'el backfill sigue el mapeo admin→admin, user→operativo, viewer→viewer y cooperativa→toca-lacteos'
);

-- 3. Compatibilidad: cada usuario del seed ve lo mismo que antes ----------------------------------------------------
select tests.autenticar_como('admin@vb.test');
select is(public.tenant_actual(), '00000000-0000-0000-0000-0000000000a1'::uuid, 'admin VB: tenant_actual() = Villa Blanca');
select is(public.rol_en_tenant()::text, 'admin', 'admin VB: rol_en_tenant() = admin');
select is((select count(*)::int from public.animales), 3, 'admin VB ve sus 3 animales');
select ok(not public.es_platform_admin(), 'admin VB no es platform admin');

reset role;
select tests.autenticar_como('user@vb.test');
select is(public.rol_en_tenant()::text, 'operativo', 'user VB: rol_en_tenant() = operativo');
select is(public.rol_actual()::text, 'user', 'user VB: rol_actual() sigue siendo user');

reset role;
select tests.autenticar_como('viewer@vb.test');
select is(public.rol_en_tenant()::text, 'viewer', 'viewer VB: rol_en_tenant() = viewer');

reset role;
select tests.autenticar_como('admin@velero.test');
select is(public.tenant_actual(), '00000000-0000-0000-0000-0000000000a2'::uuid, 'admin EV: tenant_actual() = El Velero');

reset role;
select tests.autenticar_como('coop.user@test');
select is(public.tenant_actual(), (select id from public.tenants where slug = 'toca-lacteos'), 'cooperativa_user: tenant_actual() = Toca Lácteos');
select is(public.rol_en_tenant()::text, 'operativo', 'cooperativa_user: rol_en_tenant() = operativo');
select is((select count(*)::int from public.animales), 0, 'cooperativa_user sigue sin ver animales (rol_actual() manda en las políticas de finca)');
select is((select count(*)::int from public.gastos), 0, 'cooperativa_user sigue sin ver gastos');

reset role;
select tests.autenticar_como('coop.admin@test');
select is(public.rol_en_tenant()::text, 'admin', 'cooperativa_admin: rol_en_tenant() = admin');
select is((select count(*)::int from public.animales), 0, 'cooperativa_admin sigue sin ver animales');
select throws_ok(
  $$ insert into public.animales (tenant_id, identificador, nombre, sexo)
     values ((select public.tenant_actual()), 'CO-9', 'Intrusa', 'hembra') $$,
  '42501', null, 'cooperativa_admin no puede insertar animales ni en su propio tenant (Toca Lácteos)'
);

reset role;
select tests.como_anon();
select throws_ok('select public.rol_en_tenant()', '42501', null, 'anon no puede llamar rol_en_tenant()');
select throws_ok('select count(*) from public.tenant_members', '42501', null, 'anon no lee tenant_members');

-- 4. RLS de tenant_members ------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('admin@vb.test');
select is((select count(*)::int from public.tenant_members), 3, 'admin VB ve las 3 membresías de Villa Blanca');
select is(
  (select count(*)::int from public.tenant_members where tenant_id <> '00000000-0000-0000-0000-0000000000a1'),
  0, 'admin VB no ve membresías de otros clientes'
);
select lives_ok(
  $$ insert into public.tenant_members (user_id, tenant_id, rol)
     values ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000a1', 'operativo') $$,
  'admin crea un operativo'
);
select throws_ok(
  $$ insert into public.tenant_members (user_id, tenant_id, rol)
     values ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a1', 'owner') $$,
  '42501', null, 'un admin no puede crear un owner'
);
select throws_ok(
  $$ insert into public.tenant_members (user_id, tenant_id, rol)
     values ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a2', 'viewer') $$,
  '42501', null, 'un admin no puede crear membresías en otro cliente'
);
select is(
  tests.filas_afectadas($$ update public.tenant_members set rol = 'admin' where user_id = '00000000-0000-0000-0000-0000000000c2' $$),
  1, 'admin asciende a otro miembro a admin'
);
select throws_ok(
  $$ update public.tenant_members set rol = 'owner' where user_id = '00000000-0000-0000-0000-0000000000c2' $$,
  '42501', null, 'un admin no puede ascender a nadie a owner'
);
select throws_ok(
  $$ update public.tenant_members set tenant_id = '00000000-0000-0000-0000-0000000000a2' where user_id = '00000000-0000-0000-0000-0000000000c2' $$,
  '42501', null, 'tenant_id de una membresía no se puede cambiar'
);
select is(
  tests.filas_afectadas($$ update public.tenant_members set activo = false where user_id = '00000000-0000-0000-0000-0000000000c2' $$),
  1, 'admin desactiva a un miembro (así se da de baja)'
);
select throws_ok(
  $$ delete from public.tenant_members where user_id = '00000000-0000-0000-0000-0000000000c2' $$,
  '42501', null, 'nadie borra membresías'
);

reset role;
select tests.autenticar_como('user@vb.test');
select is((select count(*)::int from public.tenant_members), 1, 'un operativo solo ve su propia membresía');
select throws_ok(
  $$ insert into public.tenant_members (user_id, tenant_id, rol)
     values ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a1', 'viewer') $$,
  '42501', null, 'un operativo no puede insertar en tenant_members'
);
select is(
  tests.filas_afectadas($$ update public.tenant_members set rol = 'admin' where user_id = (select auth.uid()) $$),
  0, 'un operativo no puede ascenderse a sí mismo'
);

reset role;
select tests.autenticar_como('viewer@vb.test');
select is((select count(*)::int from public.tenant_members), 1, 'un viewer solo ve su propia membresía');
select throws_ok(
  $$ insert into public.tenant_members (user_id, tenant_id, rol)
     values ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a1', 'viewer') $$,
  '42501', null, 'un viewer no puede insertar en tenant_members'
);

reset role;
select tests.autenticar_como('coop.admin@test');
select is(
  (select array_agg(distinct tenant_id) from public.tenant_members),
  array[(select id from public.tenants where slug = 'toca-lacteos')],
  'cooperativa_admin solo ve las membresías de Toca Lácteos'
);

-- Owner: puede crear y tocar owners (membresía c4 sin fila en roles).
reset role;
insert into public.tenant_members (user_id, tenant_id, rol)
values ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000a1', 'owner');
select tests.autenticar_como('owner@test');
select is(public.tenant_actual(), '00000000-0000-0000-0000-0000000000a1'::uuid, 'owner: su única membresía fija tenant_actual()');
select is(public.rol_en_tenant()::text, 'owner', 'owner: rol_en_tenant() = owner');
select lives_ok(
  $$ insert into public.tenant_members (user_id, tenant_id, rol)
     values ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000a1', 'owner') $$,
  'un owner sí puede crear otro owner'
);
select is(
  (select count(*)::int from public.animales), 0,
  'una membresía sin fila en roles no abre las tablas legacy (siguen gobernadas por rol_actual())'
);

reset role;
select tests.autenticar_como('admin@vb.test');
select is(
  tests.filas_afectadas($$ update public.tenant_members set activo = false where user_id = '00000000-0000-0000-0000-0000000000c4' $$),
  0, 'un admin no puede desactivar a un owner'
);

-- 5. tiene_permiso -----------------------------------------------------------------------------------------------
reset role;
update public.tenant_members set permisos = array['cafe.tarifas.editar']
 where user_id = '00000000-0000-0000-0000-0000000000b2';
select tests.autenticar_como('user@vb.test');
select ok(public.tiene_permiso('cafe.tarifas.editar'), 'un operativo con el permiso lo tiene');
select ok(not public.tiene_permiso('cafe.otro'), 'un operativo no tiene permisos que no figuran');
reset role;
select tests.autenticar_como('viewer@vb.test');
select ok(not public.tiene_permiso('cafe.tarifas.editar'), 'un viewer sin el permiso no lo tiene');
reset role;
select tests.autenticar_como('admin@vb.test');
select ok(public.tiene_permiso('cafe.cualquier.cosa'), 'un admin tiene todos los permisos');

-- 6. Trigger roles → tenant_members -------------------------------------------------------------------------------
reset role;
insert into public.roles (user_id, rol, tenant_id)
values ('00000000-0000-0000-0000-0000000000c5', 'user', '00000000-0000-0000-0000-0000000000a1');
select is(
  (select m.rol::text || ':' || m.activo::text from public.tenant_members m
    where m.user_id = '00000000-0000-0000-0000-0000000000c5' and m.tenant_id = '00000000-0000-0000-0000-0000000000a1'),
  'operativo:true', 'insertar en roles (user) crea la membresía operativo'
);

update public.roles set rol = 'viewer' where user_id = '00000000-0000-0000-0000-0000000000c5';
select is(
  (select m.rol::text from public.tenant_members m where m.user_id = '00000000-0000-0000-0000-0000000000c5'),
  'viewer', 'cambiar el rol en roles actualiza la membresía'
);

update public.roles set tenant_id = '00000000-0000-0000-0000-0000000000a2' where user_id = '00000000-0000-0000-0000-0000000000c5';
select is(
  (select array_agg(m.tenant_id::text || ':' || m.activo::text order by m.tenant_id)
     from public.tenant_members m where m.user_id = '00000000-0000-0000-0000-0000000000c5'),
  array['00000000-0000-0000-0000-0000000000a1:false', '00000000-0000-0000-0000-0000000000a2:true'],
  'mover el rol a otro cliente desactiva la membresía anterior y crea la nueva'
);

delete from public.roles where user_id = '00000000-0000-0000-0000-0000000000c5';
select is(
  (select count(*)::int from public.tenant_members m where m.user_id = '00000000-0000-0000-0000-0000000000c5' and m.activo),
  0, 'borrar la fila de roles desactiva la membresía'
);

insert into public.roles (user_id, rol, tenant_id) values ('00000000-0000-0000-0000-0000000000c6', 'cooperativa_admin', null);
select is(
  (select m.tenant_id from public.tenant_members m where m.user_id = '00000000-0000-0000-0000-0000000000c6'),
  (select id from public.tenants where slug = 'toca-lacteos'),
  'un cooperativa_admin nuevo queda en Toca Lácteos'
);

insert into public.roles (user_id, rol, tenant_id) values ('00000000-0000-0000-0000-0000000000c7', 'admin', null);
select is(
  (select count(*)::int from public.tenant_members m where m.user_id = '00000000-0000-0000-0000-0000000000c7'),
  0, 'un rol de finca sin tenant_id (huérfano) no genera membresía ni aborta'
);

-- 7. cambiar_tenant_activo con dos membresías ------------------------------------------------------------------------
-- admin@vb pasa a ser también operativo de El Velero.
insert into public.tenant_members (user_id, tenant_id, rol)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2', 'operativo');

select tests.autenticar_como('admin@vb.test');
select is(public.tenant_actual(), '00000000-0000-0000-0000-0000000000a1'::uuid, 'con 2 membresías y sin elegir, manda roles.tenant_id (compatibilidad)');
select is(public.cambiar_tenant_activo('00000000-0000-0000-0000-0000000000a2'), '00000000-0000-0000-0000-0000000000a2'::uuid, 'cambiar_tenant_activo devuelve el tenant elegido');
select is(public.tenant_actual(), '00000000-0000-0000-0000-0000000000a2'::uuid, 'tenant_actual() sigue al tenant elegido');
select is(public.rol_en_tenant()::text, 'operativo', 'rol_en_tenant() es el de la membresía del tenant elegido');
select is(
  (select array_agg(distinct tenant_id) from public.animales),
  array['00000000-0000-0000-0000-0000000000a2'::uuid],
  'tras cambiar de tenant, animales muestra los del nuevo cliente'
);
select is((select count(*)::int from public.animales), 3, 'y son los 3 de El Velero');
select is((select tenant_id from public.user_tenant_activo), '00000000-0000-0000-0000-0000000000a2'::uuid, 'el usuario ve su fila de user_tenant_activo');
select is(public.cambiar_tenant_activo('00000000-0000-0000-0000-0000000000a1'), '00000000-0000-0000-0000-0000000000a1'::uuid, 'y vuelve a Villa Blanca');
select is(public.tenant_actual(), '00000000-0000-0000-0000-0000000000a1'::uuid, 'tenant_actual() vuelve a Villa Blanca');
select throws_ok(
  $$ insert into public.user_tenant_activo (user_id, tenant_id) values ((select auth.uid()), '00000000-0000-0000-0000-0000000000a2') $$,
  '42501', null, 'user_tenant_activo no se escribe directamente'
);

reset role;
select tests.autenticar_como('user@vb.test');
select throws_ok(
  $$ select public.cambiar_tenant_activo('00000000-0000-0000-0000-0000000000a2') $$,
  'P0001', 'tenant_no_permitido', 'cambiar a un tenant sin membresía lanza tenant_no_permitido'
);
select throws_ok(
  $$ select public.cambiar_tenant_activo('00000000-0000-0000-0000-00000000dead') $$,
  'P0001', 'tenant_no_encontrado', 'cambiar a un tenant inexistente lanza tenant_no_encontrado'
);
select is((select count(*)::int from public.user_tenant_activo), 0, 'un cambio rechazado no deja rastro');

-- Membresía desactivada: el tenant elegido deja de valer y se vuelve al legacy.
reset role;
update public.tenant_members set activo = false
 where user_id = '00000000-0000-0000-0000-0000000000b1' and tenant_id = '00000000-0000-0000-0000-0000000000a2';
insert into public.user_tenant_activo (user_id, tenant_id)
values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000a2')
on conflict (user_id) do update set tenant_id = excluded.tenant_id;
select tests.autenticar_como('admin@vb.test');
select is(public.tenant_actual(), '00000000-0000-0000-0000-0000000000a1'::uuid, 'un tenant elegido cuya membresía se desactivó ya no vale');
select throws_ok(
  $$ select public.cambiar_tenant_activo('00000000-0000-0000-0000-0000000000a2') $$,
  'P0001', 'tenant_no_permitido', 'no se puede elegir un tenant con la membresía desactivada'
);

-- 8. Platform admin -----------------------------------------------------------------------------------------------------
reset role;
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000c1');
select tests.autenticar_como('platform@test');
select ok(public.es_platform_admin(), 'es_platform_admin() es true');
select is(public.tenant_actual(), null::uuid, 'platform admin sin membresía ni elección: tenant_actual() es NULL');
select is((select count(*)::int from public.tenants), 3, 'platform admin ve los 3 clientes en tenants');
select lives_ok(
  $$ select public.cambiar_tenant_activo('00000000-0000-0000-0000-0000000000a2') $$,
  'platform admin entra a cualquier tenant sin membresía'
);
select is(public.tenant_actual(), '00000000-0000-0000-0000-0000000000a2'::uuid, 'y tenant_actual() lo refleja');
select is(public.rol_en_tenant()::text, 'owner', 'platform admin sin membresía actúa como owner');
select ok(public.tiene_permiso('lo.que.sea'), 'platform admin tiene todos los permisos');
select is(
  (select count(*)::int from public.tenant_members), 3,
  'platform admin ve las membresías del tenant al que entró (El Velero: 3 filas, activas o no)'
);
select lives_ok(
  $$ select public.cambiar_tenant_activo((select id from public.tenants where slug = 'toca-lacteos')) $$,
  'platform admin entra también a Toca Lácteos'
);
select is(
  (select count(*)::int from public.animales), 0,
  'sin fila en roles el platform admin no lee tablas legacy (hasta la Fase 2 rol_actual() sigue mandando)'
);
select throws_ok(
  $$ select public.cambiar_tenant_activo('00000000-0000-0000-0000-00000000dead') $$,
  'P0001', 'tenant_no_encontrado', 'el platform admin tampoco puede entrar a un tenant inexistente'
);
select throws_ok('select count(*) from public.platform_admins', '42501', null, 'platform_admins no se lee desde la API ni siendo platform admin');

reset role;
select tests.autenticar_como('admin@vb.test');
select is((select count(*)::int from public.tenants), 1, 'un usuario normal sigue viendo solo su tenant');
reset role;
select tests.autenticar_como('coop.admin@test');
select is((select count(*)::int from public.tenants), 1, 'cooperativa_admin ve solo Toca Lácteos en tenants');

-- 9. Auditoría -------------------------------------------------------------------------------------------------------------
reset role;
select is(
  (select count(*)::int from audit.log
    where tabla = 'public.tenant_members' and accion = 'INSERT'
      and despues ->> 'user_id' = '00000000-0000-0000-0000-0000000000c4'),
  1, 'insertar una membresía deja fila en audit.log'
);
select is(
  (select tenant_id from audit.log
    where tabla = 'public.tenant_members' and despues ->> 'user_id' = '00000000-0000-0000-0000-0000000000c4'),
  '00000000-0000-0000-0000-0000000000a1'::uuid, 'y con el tenant de la membresía'
);
select tests.autenticar_como('admin@vb.test');
select cmp_ok(
  (select count(*)::int from audit.log where tabla = 'public.tenant_members'), '>', 0,
  'el admin de Villa Blanca ve el log de membresías de su cliente'
);
select is(
  (select count(*)::int from audit.log where tenant_id <> '00000000-0000-0000-0000-0000000000a1'),
  0, 'y ningún log de otro cliente'
);
select cmp_ok(
  (select count(*)::int from public.historial_cambios('public.tenant_members')), '>', 0,
  'historial_cambios() sirve el log de membresías al admin'
);
select ok(
  exists (select 1 from public.historial_cambios('public.tenant_members') h where h.email = 'owner@test'),
  'historial_cambios() resuelve emails desde las membresías del mismo cliente'
);
reset role;
select tests.autenticar_como('user@vb.test');
select is((select count(*)::int from audit.log), 0, 'un operativo no ve el log');
select is((select count(*)::int from public.historial_cambios('public.tenant_members')), 0, 'ni el historial por la RPC');

select * from finish();
rollback;
