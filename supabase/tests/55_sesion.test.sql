-- Sesión unificada: mi_sesion() y platform_listar_tenants() (FIN-91 · CO-11).
-- Usuarios del seed (password123): admin@vb.test, user@vb.test, viewer@vb.test, admin@velero.test,
-- coop.admin@test, coop.user@test. Los usuarios extra se crean AQUÍ, dentro de la transacción:
--   d1 platform admin sin membresía ni rol
--   d2 miembro de dos clientes (Villa Blanca por `roles` + El Velero por membresía)
begin;

select plan(50);

-- 0. Preparación ----------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'platform-sesion@test'),
  ('00000000-0000-0000-0000-0000000000d2', 'authenticated', 'authenticated', 'multi-sesion@test');
-- Un cliente al que ningún usuario de prueba pertenece (ni siquiera es visible para ellos por RLS).
insert into public.tenants (id, nombre, slug, vertical)
values ('00000000-0000-0000-0000-0000000000e1', 'Cliente ajeno (test)', 'ajeno-sesion', 'ganaderia');

-- 1. Estructura y privilegios -----------------------------------------------------------------------------------
select has_function('public', 'mi_sesion', 'existe mi_sesion()');
select has_function('public', 'platform_listar_tenants', 'existe platform_listar_tenants()');
select is(
  (select p.provolatile::text || p.prosecdef::text || coalesce(array_to_string(p.proconfig, ','), '')
     from pg_proc p where p.oid = 'public.mi_sesion()'::regprocedure),
  's' || 'true' || 'search_path=""',
  'mi_sesion() es STABLE SECURITY DEFINER con search_path vacío'
);
select is(pg_get_function_result('public.mi_sesion()'::regprocedure), 'jsonb', 'mi_sesion() devuelve jsonb');
select ok(
  (select p.prosecdef and coalesce(array_to_string(p.proconfig, ','), '') = 'search_path=""'
     from pg_proc p where p.oid = 'public.platform_listar_tenants()'::regprocedure),
  'platform_listar_tenants() es SECURITY DEFINER con search_path vacío'
);
select ok(not has_function_privilege('anon', 'public.mi_sesion()', 'execute'), 'anon no ejecuta mi_sesion()');
select ok(not has_function_privilege('anon', 'public.platform_listar_tenants()', 'execute'), 'anon no ejecuta platform_listar_tenants()');
select ok(has_function_privilege('authenticated', 'public.mi_sesion()', 'execute'), 'authenticated sí ejecuta mi_sesion()');
select ok(has_function_privilege('authenticated', 'public.platform_listar_tenants()', 'execute'), 'authenticated sí ejecuta platform_listar_tenants()');

select tests.como_anon();
select throws_ok('select public.mi_sesion()', '42501', null, 'anon no puede llamar mi_sesion()');
select throws_ok('select * from public.platform_listar_tenants()', '42501', null, 'anon no puede llamar platform_listar_tenants()');
reset role;

-- 2. mi_sesion() para los 6 usuarios del seed ---------------------------------------------------------------------
-- Formato: slug:rol_tenant:rol_legacy:es_platform_admin:n_membresías
select tests.autenticar_como('admin@vb.test');
select is(
  (select s->'tenant'->>'slug' || ':' || (s->>'rol_tenant') || ':' || (s->>'rol_legacy') || ':' ||
          (s->>'es_platform_admin') || ':' || jsonb_array_length(s->'membresias')
     from (select public.mi_sesion() as s) x),
  'villa-blanca:admin:admin:false:1',
  'admin VB: Villa Blanca, admin/admin, no es platform admin, 1 membresía'
);
select ok(
  (select s->'tenant'->'modulos' ? 'ganaderia.arriendos' and s->'tenant'->'modulos' ? 'ganaderia.animales'
     from (select public.mi_sesion() as s) x),
  'admin VB: sus módulos incluyen Arriendos y los base de ganadería'
);
select is(
  (select jsonb_array_length(public.mi_sesion()->'tenant'->'modulos')),
  (select count(*)::int from public.tenant_modulos where activo),
  'admin VB: mi_sesion() trae exactamente los módulos activos que ve por RLS'
);
select is(
  (select public.mi_sesion()->'tenant'->>'vertical'),
  'ganaderia',
  'admin VB: el tenant trae su vertical'
);
select ok(
  (select s->'tenant' ?& array['id', 'nombre', 'slug', 'vertical', 'plan', 'estado', 'logo_url', 'color_primario', 'zona_horaria', 'moneda', 'modulos']
     from (select public.mi_sesion() as s) x),
  'admin VB: el tenant trae todas las claves que lee getSesion()'
);
select is(
  (select public.mi_sesion()->'membresias'->0->>'tenant_id'),
  '00000000-0000-0000-0000-0000000000a1',
  'admin VB: su membresía apunta a Villa Blanca'
);

reset role;
select tests.autenticar_como('user@vb.test');
select is(
  (select s->'tenant'->>'slug' || ':' || (s->>'rol_tenant') || ':' || (s->>'rol_legacy') || ':' ||
          (s->>'es_platform_admin') || ':' || jsonb_array_length(s->'membresias')
     from (select public.mi_sesion() as s) x),
  'villa-blanca:operativo:user:false:1',
  'user VB: operativo/user'
);

reset role;
select tests.autenticar_como('viewer@vb.test');
select is(
  (select s->'tenant'->>'slug' || ':' || (s->>'rol_tenant') || ':' || (s->>'rol_legacy') || ':' ||
          (s->>'es_platform_admin') || ':' || jsonb_array_length(s->'membresias')
     from (select public.mi_sesion() as s) x),
  'villa-blanca:viewer:viewer:false:1',
  'viewer VB: viewer/viewer'
);

reset role;
select tests.autenticar_como('admin@velero.test');
select is(
  (select s->'tenant'->>'slug' || ':' || (s->>'rol_tenant') || ':' || (s->>'rol_legacy') || ':' ||
          (s->>'es_platform_admin') || ':' || jsonb_array_length(s->'membresias')
     from (select public.mi_sesion() as s) x),
  'el-velero:admin:admin:false:1',
  'admin Velero: El Velero, admin/admin'
);
select ok(
  not (select public.mi_sesion()->'tenant'->'modulos' ? 'ganaderia.arriendos'),
  'admin Velero: no tiene el módulo Arriendos (es solo de Villa Blanca)'
);

reset role;
select tests.autenticar_como('coop.admin@test');
select is(
  (select s->'tenant'->>'slug' || ':' || (s->>'rol_tenant') || ':' || (s->>'rol_legacy') || ':' ||
          (s->>'es_platform_admin') || ':' || jsonb_array_length(s->'membresias')
     from (select public.mi_sesion() as s) x),
  'toca-lacteos:admin:cooperativa_admin:false:1',
  'cooperativa_admin: Toca Lácteos, admin/cooperativa_admin'
);
select is(
  (select public.mi_sesion()->'tenant'->>'vertical'),
  'cooperativa',
  'cooperativa_admin: el vertical del tenant es cooperativa'
);

reset role;
select tests.autenticar_como('coop.user@test');
select is(
  (select s->'tenant'->>'slug' || ':' || (s->>'rol_tenant') || ':' || (s->>'rol_legacy') || ':' ||
          (s->>'es_platform_admin') || ':' || jsonb_array_length(s->'membresias')
     from (select public.mi_sesion() as s) x),
  'toca-lacteos:operativo:cooperativa_user:false:1',
  'cooperativa_user: Toca Lácteos, operativo/cooperativa_user'
);

-- 3. Un usuario normal no puede forzar un tenant ajeno ni listar clientes -----------------------------------------
reset role;
select tests.autenticar_como('admin@vb.test');
select throws_ok(
  $$ select public.cambiar_tenant_activo('00000000-0000-0000-0000-0000000000a2') $$,
  'P0001', 'tenant_no_permitido', 'admin VB no puede saltar a El Velero'
);
select is(
  (select public.mi_sesion()->'tenant'->>'slug'), 'villa-blanca',
  'el intento fallido no cambió su tenant activo'
);
select throws_ok(
  'select * from public.platform_listar_tenants()',
  '42501', 'no_autorizado', 'un usuario normal no puede listar todos los clientes'
);
select is(
  (select count(*)::int from public.tenants), 1,
  'un usuario normal solo ve su propio cliente en tenants'
);

-- 4. Platform admin ---------------------------------------------------------------------------------------------
reset role;
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000d1');
select tests.autenticar_como('platform-sesion@test');

select is(
  (select (s->>'es_platform_admin') || ':' || coalesce(s->>'rol_tenant', 'null') || ':' ||
          (s->'tenant')::text || ':' || jsonb_array_length(s->'membresias')
     from (select public.mi_sesion() as s) x),
  'true:owner:null:0',
  'platform admin recién creado: sin tenant activo ni membresías (tenant null; rol_en_tenant() lo trata como owner)'
);
select ok(
  (select count(*)::int from public.platform_listar_tenants()) >= 3,
  'platform_listar_tenants() devuelve todos los clientes (al menos Villa Blanca, El Velero y Toca Lácteos)'
);
select is(
  (select count(*)::int from public.platform_listar_tenants()),
  (select count(*)::int from public.tenants),
  'platform_listar_tenants() devuelve los mismos clientes que ve por RLS'
);
select ok(
  (select array_agg(slug order by slug) @> array['el-velero', 'toca-lacteos', 'villa-blanca'] from public.platform_listar_tenants()),
  'platform_listar_tenants() incluye los tres clientes del seed'
);

select lives_ok(
  $$ select public.cambiar_tenant_activo('00000000-0000-0000-0000-0000000000a2') $$,
  'el platform admin salta a El Velero sin tener membresía'
);
select is(
  (select s->'tenant'->>'slug' || ':' || (s->>'rol_tenant') || ':' || coalesce(s->>'rol_legacy', 'null')
     from (select public.mi_sesion() as s) x),
  'el-velero:owner:null',
  'platform admin en El Velero: actúa como owner y no tiene rol legacy'
);
select is(
  (select count(*)::int from public.animales), 0,
  'platform admin sin fila en roles no ve animales legacy (rol_actual() es NULL): la UI muestra el aviso de soporte limitada'
);
select lives_ok(
  $$ select public.cambiar_tenant_activo('00000000-0000-0000-0000-0000000000a1') $$,
  'y salta a Villa Blanca'
);
select is(
  (select public.mi_sesion()->'tenant'->>'slug'), 'villa-blanca',
  'platform admin: ahora el tenant activo es Villa Blanca'
);
select is(
  (select jsonb_array_length(public.mi_sesion()->'membresias')), 0,
  'saltar de tenant no crea membresías'
);

-- 5. Usuario con membresía en dos clientes -----------------------------------------------------------------------
reset role;
insert into public.roles (user_id, rol, tenant_id)
values ('00000000-0000-0000-0000-0000000000d2', 'admin', '00000000-0000-0000-0000-0000000000a1');  -- el trigger crea la membresía de Villa Blanca
insert into public.tenant_members (user_id, tenant_id, rol)
values ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000a2', 'admin');
select tests.autenticar_como('multi-sesion@test');

select is(
  (select jsonb_array_length(public.mi_sesion()->'membresias')), 2,
  'multi-cliente: mi_sesion() lista sus dos membresías'
);
select is(
  (select array_agg(m->>'slug' order by m->>'slug') from jsonb_array_elements(public.mi_sesion()->'membresias') m),
  array['el-velero', 'villa-blanca'],
  'multi-cliente: las membresías son Villa Blanca y El Velero (con nombre y slug)'
);
select is(
  (select public.mi_sesion()->'tenant'->>'slug'), 'villa-blanca',
  'multi-cliente sin elección previa: arranca en el de su fila de roles'
);
select is(
  (select count(*) filter (where identificador like 'EV-%')::int || ':' || count(*) filter (where identificador not like 'EV-%')::int
     from public.animales),
  '0:3',
  'multi-cliente en Villa Blanca: ve 3 animales de Villa Blanca y ninguno de El Velero'
);

select lives_ok(
  $$ select public.cambiar_tenant_activo('00000000-0000-0000-0000-0000000000a2') $$,
  'multi-cliente cambia a El Velero'
);
select is(
  (select public.mi_sesion()->'tenant'->>'slug'), 'el-velero',
  'multi-cliente: mi_sesion() ya devuelve El Velero, sin cerrar sesión'
);
select is(
  (select count(*) filter (where identificador like 'EV-%')::int || ':' || count(*) filter (where identificador not like 'EV-%')::int
     from public.animales),
  '3:0',
  'multi-cliente en El Velero: los datos cambiaron (3 de El Velero, ninguno de Villa Blanca)'
);
select ok(
  not (select public.mi_sesion()->'tenant'->'modulos' ? 'ganaderia.arriendos'),
  'multi-cliente en El Velero: los módulos son los de El Velero (sin Arriendos)'
);
select is(
  (select jsonb_array_length(public.mi_sesion()->'membresias')), 2,
  'cambiar de cliente no altera la lista de membresías'
);

select lives_ok(
  $$ select public.cambiar_tenant_activo('00000000-0000-0000-0000-0000000000a1') $$,
  'y vuelve a Villa Blanca'
);
select is(
  (select public.mi_sesion()->'tenant'->>'slug'), 'villa-blanca',
  'multi-cliente: de vuelta en Villa Blanca'
);
select throws_ok(
  $$ select public.cambiar_tenant_activo('00000000-0000-0000-0000-0000000000e1') $$,
  'P0001', 'tenant_no_permitido', 'multi-cliente no puede saltar a un cliente donde no es miembro'
);

select * from finish();
rollback;
