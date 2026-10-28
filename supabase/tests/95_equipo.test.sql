-- Equipo del cliente (FIN-103 · CO-22): RPC invitar/listar/cambiar rol/cambiar estado y sus reglas.
-- Usuarios del seed: admin@vb.test (Villa Blanca, sin core.equipo). El resto se crea AQUÍ, dentro de la
-- transacción (rollback al final):
--   cliente «Equipo Demo» (café, con core.equipo)         cliente «Equipo Otro» (café, con core.equipo)
--     o1 owner · o2 owner · a1 admin · a2 admin             x1 owner (único) · x2 admin
--     op operativo · vw viewer · inac operativo inactivo    plat platform admin (sin membresías)
--   nv: cuenta sin membresía en Equipo Demo
begin;

select plan(83);

-- 0. Preparación --------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'o1@eq.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'authenticated', 'authenticated', 'o2@eq.test'),
  ('00000000-0000-0000-0000-0000000000d3', 'authenticated', 'authenticated', 'a1@eq.test'),
  ('00000000-0000-0000-0000-0000000000d4', 'authenticated', 'authenticated', 'a2@eq.test'),
  ('00000000-0000-0000-0000-0000000000d5', 'authenticated', 'authenticated', 'op@eq.test'),
  ('00000000-0000-0000-0000-0000000000d6', 'authenticated', 'authenticated', 'vw@eq.test'),
  ('00000000-0000-0000-0000-0000000000d7', 'authenticated', 'authenticated', 'inac@eq.test'),
  ('00000000-0000-0000-0000-0000000000d8', 'authenticated', 'authenticated', 'nv@eq.test'),
  ('00000000-0000-0000-0000-0000000000d9', 'authenticated', 'authenticated', 'x1@eq.test'),
  ('00000000-0000-0000-0000-0000000000da', 'authenticated', 'authenticated', 'x2@eq.test'),
  ('00000000-0000-0000-0000-0000000000db', 'authenticated', 'authenticated', 'plat@eq.test');
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000db');

insert into public.tenants (id, nombre, slug, vertical) values
  ('00000000-0000-0000-0000-0000000000f1', 'Equipo Demo', 'equipo-demo', 'cafe'),
  ('00000000-0000-0000-0000-0000000000f2', 'Equipo Otro', 'equipo-otro', 'cafe');
insert into public.tenant_modulos (tenant_id, modulo_id) values
  ('00000000-0000-0000-0000-0000000000f1', 'core.equipo'),
  ('00000000-0000-0000-0000-0000000000f2', 'core.equipo');

insert into public.tenant_members (user_id, tenant_id, rol, activo) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000f1', 'owner', true),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000f1', 'owner', true),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000f1', 'admin', true),
  ('00000000-0000-0000-0000-0000000000d4', '00000000-0000-0000-0000-0000000000f1', 'admin', true),
  ('00000000-0000-0000-0000-0000000000d5', '00000000-0000-0000-0000-0000000000f1', 'operativo', true),
  ('00000000-0000-0000-0000-0000000000d6', '00000000-0000-0000-0000-0000000000f1', 'viewer', true),
  ('00000000-0000-0000-0000-0000000000d7', '00000000-0000-0000-0000-0000000000f1', 'operativo', false),
  ('00000000-0000-0000-0000-0000000000d9', '00000000-0000-0000-0000-0000000000f2', 'owner', true),
  ('00000000-0000-0000-0000-0000000000da', '00000000-0000-0000-0000-0000000000f2', 'admin', true);

update auth.users set last_sign_in_at = '2026-10-01 10:00:00+00' where email = 'a1@eq.test';

-- 1. Estructura y privilegios ---------------------------------------------------------------------------------
select ok(exists (select 1 from public.modulos where id = 'core.equipo' and vertical is null and not base),
  'core.equipo está en el catálogo como módulo de núcleo, no base');
select ok(
  (select bool_and(not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute'))
     from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
       'invitar_miembro_tenant', 'listar_miembros_tenant', 'cambiar_rol_miembro_tenant', 'cambiar_estado_miembro_tenant')),
  'las 4 RPC: authenticated sí y anon no'
);
select ok(
  not exists (
    select 1
      from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('invitar_miembro_tenant', 'listar_miembros_tenant', 'cambiar_rol_miembro_tenant', 'cambiar_estado_miembro_tenant')
       and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
  'ninguna conserva EXECUTE para PUBLIC'
);
select ok(
  (select bool_and(prosecdef and proconfig = array['search_path=""'])
     from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('invitar_miembro_tenant', 'listar_miembros_tenant')),
  'invitar y listar (leen auth.users) son SECURITY DEFINER con search_path vacío'
);
select ok(
  (select bool_and(not prosecdef and proconfig = array['search_path=""'])
     from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('cambiar_rol_miembro_tenant', 'cambiar_estado_miembro_tenant')),
  'cambiar rol y estado son SECURITY INVOKER (el RLS sigue aplicando) con search_path vacío'
);

-- 2. Alta de clientes: los de café nacen con core.equipo -----------------------------------------------------------
select tests.autenticar_como('plat@eq.test');
select lives_ok($$select public.platform_crear_tenant('Cafe Nuevo', 'cafe-nuevo', 'cafe')$$, 'el platform admin crea un cliente de café');
select lives_ok($$select public.platform_crear_tenant('Granja Nueva', 'granja-nueva', 'ganaderia')$$, 'y uno de ganadería');
reset role;
select ok(
  exists (select 1 from public.tenant_modulos tm join public.tenants t on t.id = tm.tenant_id
           where t.slug = 'cafe-nuevo' and tm.modulo_id = 'core.equipo' and tm.activo),
  'el cliente de café nuevo tiene core.equipo'
);
select ok(
  not exists (select 1 from public.tenant_modulos tm join public.tenants t on t.id = tm.tenant_id
               where t.slug = 'granja-nueva' and tm.modulo_id = 'core.equipo'),
  'el de ganadería no lo recibe'
);
select ok(
  not exists (select 1 from public.tenant_modulos tm join public.tenants t on t.id = tm.tenant_id
               where t.vertical in ('ganaderia', 'cooperativa') and tm.modulo_id = 'core.equipo'),
  'ningún cliente de ganadería ni de cooperativa tiene core.equipo (su acceso sigue en roles)'
);

-- 3. Quién puede ---------------------------------------------------------------------------------------------------
select tests.autenticar_como('op@eq.test');
select throws_ok($$select * from public.listar_miembros_tenant()$$, '42501', 'no_autorizado', 'un operativo no lista el equipo');
select throws_ok($$select public.invitar_miembro_tenant('nv@eq.test', 'operativo')$$, '42501', 'no_autorizado', 'ni invita');
select throws_ok($$select public.cambiar_rol_miembro_tenant('00000000-0000-0000-0000-0000000000d6', 'admin')$$, '42501', 'no_autorizado', 'ni cambia roles');
select throws_ok($$select public.cambiar_estado_miembro_tenant('00000000-0000-0000-0000-0000000000d6', false)$$, '42501', 'no_autorizado', 'ni desactiva');

reset role;
select tests.autenticar_como('vw@eq.test');
select throws_ok($$select * from public.listar_miembros_tenant()$$, '42501', 'no_autorizado', 'un viewer (Gerencia) tampoco lista el equipo');
select throws_ok($$select public.invitar_miembro_tenant('nv@eq.test', 'viewer')$$, '42501', 'no_autorizado', 'ni invita');

reset role;
-- Villa Blanca no tiene el módulo: ni siquiera su admin legacy.
select tests.autenticar_como('admin@vb.test');
select throws_ok($$select * from public.listar_miembros_tenant()$$, '42501', 'no_autorizado', 'sin core.equipo el admin de un cliente no lista el equipo');
select throws_ok($$select public.invitar_miembro_tenant('nv@eq.test', 'operativo')$$, '42501', 'no_autorizado', 'ni invita');
select throws_ok($$select public.cambiar_rol_miembro_tenant('00000000-0000-0000-0000-0000000000d6', 'admin')$$, '42501', 'no_autorizado', 'ni cambia roles');

reset role;
select tests.como_anon();
select throws_ok($$select * from public.listar_miembros_tenant()$$, '42501', null, 'anon no ejecuta listar');
select throws_ok($$select public.invitar_miembro_tenant('nv@eq.test', 'operativo')$$, '42501', null, 'anon no ejecuta invitar');

-- 4. Listar ----------------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('a1@eq.test');
select is((select count(*)::int from public.listar_miembros_tenant()), 7, 'el admin lista los 7 miembros de su cliente (activos e inactivos)');
select is(
  (select array_agg(email order by email) from public.listar_miembros_tenant()),
  array['a1@eq.test', 'a2@eq.test', 'inac@eq.test', 'o1@eq.test', 'o2@eq.test', 'op@eq.test', 'vw@eq.test'],
  'solo emails de miembros de su cliente: ni x1/x2 de otro cliente ni la cuenta sin membresía'
);
select is((select count(*)::int from public.listar_miembros_tenant() where not activo), 1, 'incluye al inactivo, marcado');
select is(
  (select ultimo_acceso from public.listar_miembros_tenant() where email = 'a1@eq.test'),
  '2026-10-01 10:00:00+00'::timestamptz,
  'devuelve el último acceso de Auth'
);
select is((select ultimo_acceso from public.listar_miembros_tenant() where email = 'o1@eq.test'), null, 'null si nunca entró');
select is(
  (select id from public.listar_miembros_tenant() where email = 'op@eq.test'),
  (select m.id from public.tenant_members m where m.user_id = '00000000-0000-0000-0000-0000000000d5'),
  'id es el de la membresía (el registro_id del historial)'
);

reset role;
select tests.autenticar_como('x2@eq.test');
select is((select count(*)::int from public.listar_miembros_tenant()), 2, 'el admin de otro cliente solo ve a su equipo');
select is(
  (select array_agg(email order by email) from public.listar_miembros_tenant()),
  array['x1@eq.test', 'x2@eq.test'], 'y sus emails'
);

-- 5. Invitar -----------------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('a1@eq.test');

select throws_ok($$select public.invitar_miembro_tenant('no-es-un-email', 'operativo')$$, 'P0001', 'email_invalido', 'un email mal formado se rechaza');
select throws_ok($$select public.invitar_miembro_tenant('nv@eq.test', null)$$, 'P0001', 'rol_invalido', 'sin rol se rechaza');
select throws_ok($$select public.invitar_miembro_tenant('nv@eq.test', 'owner')$$, 'P0001', 'solo_owner_gestiona_owner', 'un admin no crea owners');
select throws_ok($$select public.invitar_miembro_tenant('op@eq.test', 'operativo')$$, 'P0001', 'ya_es_miembro', 'quien ya es miembro activo da ya_es_miembro');
select throws_ok($$select public.invitar_miembro_tenant('  OP@eq.TEST ', 'viewer')$$, 'P0001', 'ya_es_miembro', 'también sin importar mayúsculas ni espacios');

select is(
  (select public.invitar_miembro_tenant('desconocido@eq.test', 'operativo')),
  jsonb_build_object('pendiente', true, 'user_id', null, 'reactivado', false),
  'un email sin cuenta devuelve pendiente: true'
);
select is(
  (select count(*)::int from public.tenant_members where tenant_id = '00000000-0000-0000-0000-0000000000f1'),
  7, 'y no escribe nada (el Server Action envía la invitación de Auth y repite la llamada)'
);

select is(
  (select (public.invitar_miembro_tenant(' NV@eq.test ', 'operativo')) ->> 'pendiente'),
  'false', 'un email con cuenta crea la membresía (pendiente: false, sin importar mayúsculas)'
);
select is(
  (select rol::text || ':' || activo::text from public.tenant_members
    where user_id = '00000000-0000-0000-0000-0000000000d8' and tenant_id = '00000000-0000-0000-0000-0000000000f1'),
  'operativo:true', 'queda como operativo activo'
);
select throws_ok($$select public.invitar_miembro_tenant('nv@eq.test', 'viewer')$$, 'P0001', 'ya_es_miembro', 'invitarlo otra vez da ya_es_miembro');

-- Reactivar a un inactivo con otro rol.
select is(
  (select (public.invitar_miembro_tenant('inac@eq.test', 'viewer')) ->> 'reactivado'),
  'true', 'invitar a un miembro inactivo lo reactiva'
);
select is(
  (select rol::text || ':' || activo::text from public.tenant_members where user_id = '00000000-0000-0000-0000-0000000000d7'),
  'viewer:true', 'con el rol nuevo'
);

-- Un owner sí crea owners; un admin no reactiva a un owner desactivado.
reset role;
update public.tenant_members set activo = false where user_id = '00000000-0000-0000-0000-0000000000d2';
select tests.autenticar_como('a1@eq.test');
select throws_ok($$select public.invitar_miembro_tenant('o2@eq.test', 'admin')$$, 'P0001', 'solo_owner_gestiona_owner',
  'un admin no puede reactivar a un owner desactivado cambiándole el rol');
reset role;
select tests.autenticar_como('o1@eq.test');
select lives_ok($$select public.invitar_miembro_tenant('o2@eq.test', 'owner')$$, 'un owner sí reactiva a otro owner');
select is((select activo from public.tenant_members where user_id = '00000000-0000-0000-0000-0000000000d2'), true, 'que vuelve a estar activo');

-- Una cuenta que ya es miembro de OTRO cliente se une a este sin tocar el otro.
select lives_ok($$select public.invitar_miembro_tenant('x2@eq.test', 'viewer')$$, 'una cuenta de otro cliente puede unirse a este');
reset role;
select is(
  (select rol::text from public.tenant_members where user_id = '00000000-0000-0000-0000-0000000000da' and tenant_id = '00000000-0000-0000-0000-0000000000f2'),
  'admin', 'y su membresía en el otro cliente no cambia'
);
select tests.autenticar_como('o1@eq.test');
select is(
  (select count(*)::int from public.listar_miembros_tenant() where email = 'x2@eq.test'), 1,
  'aparece en el equipo de este cliente'
);

-- 6. Cambiar rol -------------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('a1@eq.test');

select throws_ok($$select public.cambiar_rol_miembro_tenant('00000000-0000-0000-0000-0000000000d3', 'viewer')$$, 'P0001',
  'no_puede_modificarse_a_si_mismo', 'nadie se baja el rol a sí mismo');
select throws_ok($$select public.cambiar_rol_miembro_tenant('00000000-0000-0000-0000-0000000000d3', 'owner')$$, 'P0001',
  'no_puede_modificarse_a_si_mismo', 'ni se sube');
select throws_ok($$select public.cambiar_rol_miembro_tenant('00000000-0000-0000-0000-0000000000d1', 'admin')$$, 'P0001',
  'solo_owner_gestiona_owner', 'un admin no modifica a un owner');
select throws_ok($$select public.cambiar_rol_miembro_tenant('00000000-0000-0000-0000-0000000000d5', 'owner')$$, 'P0001',
  'solo_owner_gestiona_owner', 'ni hace owner a nadie');
select throws_ok($$select public.cambiar_rol_miembro_tenant('00000000-0000-0000-0000-0000000000d9', 'viewer')$$, 'P0001',
  'miembro_no_encontrado', 'un miembro de otro cliente no existe para este admin');
select throws_ok($$select public.cambiar_rol_miembro_tenant('00000000-0000-0000-0000-0000000000d3', null)$$, 'P0001',
  'datos_invalidos', 'sin rol nuevo se rechaza');

select lives_ok($$select public.cambiar_rol_miembro_tenant('00000000-0000-0000-0000-0000000000d5', 'viewer')$$, 'un admin baja a un operativo a viewer');
select is((select rol::text from public.tenant_members where user_id = '00000000-0000-0000-0000-0000000000d5'), 'viewer', 'y queda así');
select lives_ok($$select public.cambiar_rol_miembro_tenant('00000000-0000-0000-0000-0000000000d5', 'admin')$$, 'o lo sube a admin');

reset role;
select tests.autenticar_como('o1@eq.test');
select lives_ok($$select public.cambiar_rol_miembro_tenant('00000000-0000-0000-0000-0000000000d5', 'owner')$$, 'un owner sí promueve a owner');
select lives_ok($$select public.cambiar_rol_miembro_tenant('00000000-0000-0000-0000-0000000000d5', 'operativo')$$, 'y lo baja (quedan otros owners activos)');

-- 7. Cambiar estado ------------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('a1@eq.test');
select throws_ok($$select public.cambiar_estado_miembro_tenant('00000000-0000-0000-0000-0000000000d3', false)$$, 'P0001',
  'no_puede_modificarse_a_si_mismo', 'nadie se desactiva a sí mismo');
select throws_ok($$select public.cambiar_estado_miembro_tenant('00000000-0000-0000-0000-0000000000d1', false)$$, 'P0001',
  'solo_owner_gestiona_owner', 'un admin no desactiva a un owner');
select throws_ok($$select public.cambiar_estado_miembro_tenant('00000000-0000-0000-0000-0000000000d9', false)$$, 'P0001',
  'miembro_no_encontrado', 'ni a miembros de otro cliente');
select lives_ok($$select public.cambiar_estado_miembro_tenant('00000000-0000-0000-0000-0000000000d6', false)$$, 'un admin desactiva a un viewer');
select is((select activo from public.tenant_members where user_id = '00000000-0000-0000-0000-0000000000d6'), false, 'que queda inactivo');
select lives_ok($$select public.cambiar_estado_miembro_tenant('00000000-0000-0000-0000-0000000000d6', false)$$, 'repetir el estado no es un error');
select lives_ok($$select public.cambiar_estado_miembro_tenant('00000000-0000-0000-0000-0000000000d6', true)$$, 'y lo reactiva');
select is((select activo from public.tenant_members where user_id = '00000000-0000-0000-0000-0000000000d6'), true, 'que vuelve a estar activo');
select throws_ok($$select public.cambiar_estado_miembro_tenant('00000000-0000-0000-0000-0000000000d6', null)$$, 'P0001', 'datos_invalidos',
  'sin estado se rechaza');

reset role;
select tests.autenticar_como('o1@eq.test');
select lives_ok($$select public.cambiar_estado_miembro_tenant('00000000-0000-0000-0000-0000000000d2', false)$$, 'un owner desactiva a otro owner (queda él)');
select lives_ok($$select public.cambiar_estado_miembro_tenant('00000000-0000-0000-0000-0000000000d2', true)$$, 'y lo reactiva');

-- 8. Siempre queda un owner activo ---------------------------------------------------------------------------------------
-- Con membresías la regla solo se alcanza con un llamante ajeno a la membresía (el platform admin, que actúa
-- como owner): un owner o un admin nunca pueden dejar el cliente sin owner, porque no se tocan a sí mismos.
reset role;
select tests.autenticar_como('plat@eq.test');
select lives_ok($$select public.cambiar_tenant_activo('00000000-0000-0000-0000-0000000000f2')$$, 'el platform admin entra en Equipo Otro');
select throws_ok($$select public.cambiar_rol_miembro_tenant('00000000-0000-0000-0000-0000000000d9', 'admin')$$, 'P0001', 'ultimo_owner',
  'no se baja al último owner');
select throws_ok($$select public.cambiar_estado_miembro_tenant('00000000-0000-0000-0000-0000000000d9', false)$$, 'P0001', 'ultimo_owner',
  'ni se desactiva');
select lives_ok($$select public.cambiar_rol_miembro_tenant('00000000-0000-0000-0000-0000000000d9', 'owner')$$, 'dejarlo como owner no es bajarlo');
select lives_ok($$select public.cambiar_rol_miembro_tenant('00000000-0000-0000-0000-0000000000da', 'owner')$$, 'con un segundo owner...');
select lives_ok($$select public.cambiar_estado_miembro_tenant('00000000-0000-0000-0000-0000000000d9', false)$$, '...ya se puede desactivar al primero');
select throws_ok($$select public.cambiar_estado_miembro_tenant('00000000-0000-0000-0000-0000000000da', false)$$, 'P0001', 'ultimo_owner',
  'y entonces el segundo es el último');
select is(
  (select count(*)::int from public.tenant_members where tenant_id = '00000000-0000-0000-0000-0000000000f2' and rol = 'owner' and activo),
  1, 'Equipo Otro conserva un owner activo'
);

-- 9. Auditoría: cada cambio queda con usuario y fecha ------------------------------------------------------------------------
reset role;
select ok(
  exists (select 1 from audit.log l
           where l.tabla = 'public.tenant_members' and l.accion = 'UPDATE'
             and l.registro_id = (select m.id::text from public.tenant_members m where m.user_id = '00000000-0000-0000-0000-0000000000d5')
             and l.user_id = '00000000-0000-0000-0000-0000000000d3'
             and l.cambios ? 'rol' and l.at is not null),
  'el cambio de rol de op por a1 quedó en audit.log con a1 como autor'
);
select ok(
  exists (select 1 from audit.log l
           where l.tabla = 'public.tenant_members' and l.accion = 'UPDATE'
             and l.registro_id = (select m.id::text from public.tenant_members m where m.user_id = '00000000-0000-0000-0000-0000000000d6')
             and l.user_id = '00000000-0000-0000-0000-0000000000d3'
             and (l.cambios -> 'activo') = 'false'::jsonb),
  'la desactivación de vw por a1 también'
);
select ok(
  exists (select 1 from audit.log l
           where l.tabla = 'public.tenant_members' and l.accion = 'INSERT'
             and l.despues ->> 'user_id' = '00000000-0000-0000-0000-0000000000d8'
             and l.user_id = '00000000-0000-0000-0000-0000000000d3'),
  'y el alta de nv (invitar_miembro_tenant, SECURITY DEFINER) conserva a a1 como autor'
);

select tests.autenticar_como('a1@eq.test');
select ok(
  exists (select 1 from public.historial_cambios('public.tenant_members')
           where email = 'a1@eq.test' and accion = 'UPDATE'),
  'historial_cambios muestra esos cambios al admin, con el email de quien los hizo'
);
select is(
  (select count(*)::int from public.historial_cambios('public.tenant_members', null, 200) h
    where h.registro_id in (select m.id::text from public.tenant_members m where m.tenant_id = '00000000-0000-0000-0000-0000000000f2')),
  0, 'y no aparece nada de otro cliente'
);

reset role;
select tests.autenticar_como('op@eq.test');
select is((select count(*)::int from public.historial_cambios('public.tenant_members')), 0, 'un operativo no ve el historial');

select * from finish();
rollback;
