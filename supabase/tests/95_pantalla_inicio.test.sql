-- A-07 (FIN-125): pantalla de inicio por miembro. Usuarios creados dentro del test (rollback al final):
--   cliente «Inicio Demo» (café, core.equipo): ad admin · op operativo · vw viewer
--   cliente «Inicio Otro» (café, core.equipo): xo operativo
begin;

select plan(13);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000a70e1', 'authenticated', 'authenticated', 'ad@ini.test'),
  ('00000000-0000-0000-0000-0000000a70e2', 'authenticated', 'authenticated', 'op@ini.test'),
  ('00000000-0000-0000-0000-0000000a70e3', 'authenticated', 'authenticated', 'vw@ini.test'),
  ('00000000-0000-0000-0000-0000000a70e4', 'authenticated', 'authenticated', 'xo@ini.test');
insert into public.tenants (id, nombre, slug, vertical) values
  ('00000000-0000-0000-0000-0000000a70a1', 'Inicio Demo', 'inicio-demo', 'cafe'),
  ('00000000-0000-0000-0000-0000000a70a2', 'Inicio Otro', 'inicio-otro', 'cafe');
insert into public.tenant_modulos (tenant_id, modulo_id) values
  ('00000000-0000-0000-0000-0000000a70a1', 'core.equipo'),
  ('00000000-0000-0000-0000-0000000a70a2', 'core.equipo');
insert into public.tenant_members (user_id, tenant_id, rol, activo) values
  ('00000000-0000-0000-0000-0000000a70e1', '00000000-0000-0000-0000-0000000a70a1', 'admin', true),
  ('00000000-0000-0000-0000-0000000a70e2', '00000000-0000-0000-0000-0000000a70a1', 'operativo', true),
  ('00000000-0000-0000-0000-0000000a70e3', '00000000-0000-0000-0000-0000000a70a1', 'viewer', true),
  ('00000000-0000-0000-0000-0000000a70e4', '00000000-0000-0000-0000-0000000a70a2', 'operativo', true);

select ok(
  has_function_privilege('authenticated', 'public.cambiar_pantalla_inicio_miembro(uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.cambiar_pantalla_inicio_miembro(uuid, text)', 'execute'),
  'la RPC: authenticated sí y anon no');

-- Un operativo no la cambia (ni la suya).
select tests.autenticar_como('op@ini.test');
select throws_ok($$select public.cambiar_pantalla_inicio_miembro('00000000-0000-0000-0000-0000000a70e2', 'recibir')$$,
  '42501', 'no_autorizado', 'un operativo no configura pantallas de inicio');
reset role;
select tests.autenticar_como('vw@ini.test');
select throws_ok($$select public.cambiar_pantalla_inicio_miembro('00000000-0000-0000-0000-0000000a70e2', 'recibir')$$,
  '42501', 'no_autorizado', 'un viewer tampoco');
reset role;

-- El admin sí.
select tests.autenticar_como('ad@ini.test');
select lives_ok($$select public.cambiar_pantalla_inicio_miembro('00000000-0000-0000-0000-0000000a70e2', 'recibir')$$,
  'el admin fija la pantalla de un operativo');
select is((select pantalla_inicio from public.listar_miembros_tenant() where email = 'op@ini.test'), 'recibir',
  'listar_miembros_tenant() la devuelve');
select throws_ok($$select public.cambiar_pantalla_inicio_miembro('00000000-0000-0000-0000-0000000a70e2', 'panel')$$,
  'P0001', 'datos_invalidos', 'una pantalla fuera de la lista se rechaza');
select throws_ok($$select public.cambiar_pantalla_inicio_miembro('00000000-0000-0000-0000-0000000a70e4', 'planta')$$,
  'P0001', 'miembro_no_encontrado', 'no toca a un miembro de otro cliente');
reset role;
select is((select pantalla_inicio from public.tenant_members where user_id = '00000000-0000-0000-0000-0000000a70e4'), null,
  'el miembro del otro cliente sigue sin pantalla');

-- mi_sesion() la expone solo para el propio usuario.
select tests.autenticar_como('op@ini.test');
select is(public.mi_sesion() ->> 'pantalla_inicio', 'recibir', 'mi_sesion() trae la pantalla de inicio del operativo');
reset role;
select tests.autenticar_como('ad@ini.test');
select is(public.mi_sesion() -> 'pantalla_inicio', 'null'::jsonb, 'sin configurar: null');
select lives_ok($$select public.cambiar_pantalla_inicio_miembro('00000000-0000-0000-0000-0000000a70e2', null)$$, 'null vuelve al valor por defecto');
reset role;

-- Sin UPDATE directo fuera de la RPC para un operativo (RLS).
select tests.autenticar_como('op@ini.test');
update public.tenant_members set pantalla_inicio = 'planta' where user_id = '00000000-0000-0000-0000-0000000a70e2';
reset role;
select is((select pantalla_inicio from public.tenant_members where user_id = '00000000-0000-0000-0000-0000000a70e2'), null,
  'un operativo no se cambia la pantalla por UPDATE directo');

-- Auditoría de la membresía registra el cambio.
select ok(exists (select 1 from audit.log where tabla like '%tenant_members' and cambios ? 'pantalla_inicio'),
  'el cambio de pantalla queda en audit.log');

select * from finish();
rollback;
