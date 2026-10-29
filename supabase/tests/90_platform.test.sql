-- Alta de clientes desde plataforma (FIN-98 · CO-18): schema `platform`, wrappers `public.platform_*`,
-- seeds por vertical, módulos y miembros.
-- Usuarios del seed: admin@vb.test (admin de Villa Blanca, NO platform admin), admin@velero.test (El Velero).
-- Usuarios que crea este test: plat@test (platform admin), nuevo@test y otro@test (cuentas sin rol).
-- Todo se revierte con el rollback; el alta de clientes escribe de verdad, así que se comprueba dentro de la
-- transacción. Tras `reset role` los claims del último usuario autenticado siguen puestos: el dueño (postgres)
-- "actúa como" ese usuario, que es lo que permite probar `platform.*` directamente.
begin;

select plan(111);

-- 0. Preparación --------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'plat@test'),
  ('00000000-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'nuevo@test'),
  ('00000000-0000-0000-0000-0000000000e3', 'authenticated', 'authenticated', 'otro@test');
insert into public.platform_admins (user_id) values ('00000000-0000-0000-0000-0000000000e1');

-- Lo que había ANTES, para demostrar que ningún cliente existente cambia.
create temp table antes as
select t.slug,
       (select array_agg(tm.modulo_id order by tm.modulo_id) from public.tenant_modulos tm where tm.tenant_id = t.id and tm.activo) as modulos,
       (select count(*) from public.conceptos_gasto c where c.tenant_id = t.id) as conceptos,
       (select count(*) from public.tarifas x where x.tenant_id = t.id) as tarifas,
       (select count(*) from public.tenant_members m where m.tenant_id = t.id) as miembros
  from public.tenants t;
grant select on antes to authenticated;

-- 1. Estructura y privilegios -------------------------------------------------------------------------------------
select has_schema('platform', 'existe el esquema platform');
select ok(not has_schema_privilege('anon', 'platform', 'usage'), 'anon no tiene USAGE sobre platform');
select ok(not has_schema_privilege('authenticated', 'platform', 'usage'), 'authenticated no tiene USAGE sobre platform');
select ok(
  not has_function_privilege('authenticated', 'platform.crear_tenant(text,text,public.vertical,text,text,text[])', 'execute')
  and not has_function_privilege('authenticated', 'platform.seed_vertical(uuid,public.vertical)', 'execute')
  and not has_function_privilege('anon', 'platform.crear_tenant(text,text,public.vertical,text,text,text[])', 'execute'),
  'nadie salvo el dueño ejecuta platform.crear_tenant ni platform.seed_vertical'
);
select ok(
  (select bool_and(not has_function_privilege('anon', p.oid, 'execute') and has_function_privilege('authenticated', p.oid, 'execute'))
     from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in (
       'platform_crear_tenant', 'platform_tenants_resumen', 'platform_obtener_tenant', 'platform_actualizar_tenant',
       'platform_set_modulo', 'platform_agregar_miembro', 'platform_quitar_miembro')),
  'los 7 wrappers públicos: authenticated sí y anon no'
);
select ok(
  (select bool_and(prosecdef and proconfig = array['search_path=""'])
     from pg_proc p where p.pronamespace in ('public'::regnamespace, 'platform'::regnamespace)
      and p.proname in ('platform_crear_tenant', 'platform_tenants_resumen', 'platform_obtener_tenant', 'platform_actualizar_tenant',
                        'platform_set_modulo', 'platform_agregar_miembro', 'platform_quitar_miembro',
                        'exigir_operador', 'seed_vertical', 'crear_tenant')),
  'todas son SECURITY DEFINER con search_path vacío'
);

-- 2. Quien no es platform admin no puede nada ------------------------------------------------------------------------
-- admin@vb.test es admin de SU cliente, pero eso no le da poder de plataforma.
select tests.autenticar_como('admin@vb.test');

select throws_ok($$select public.platform_crear_tenant('X Cliente', 'x-cliente', 'cafe')$$, '42501', 'no_autorizado',
  'un admin de cliente no puede crear clientes');
select throws_ok($$select * from public.platform_tenants_resumen()$$, '42501', 'no_autorizado', 'ni listarlos');
select throws_ok($$select public.platform_obtener_tenant('00000000-0000-0000-0000-0000000000a1')$$, '42501', 'no_autorizado',
  'ni ver el detalle de un cliente');
select throws_ok($$select public.platform_actualizar_tenant('00000000-0000-0000-0000-0000000000a1', '{"plan":"gratis"}')$$,
  '42501', 'no_autorizado', 'ni cambiar su plan');
select throws_ok($$select public.platform_set_modulo('00000000-0000-0000-0000-0000000000a1', 'ganaderia.arriendos', true)$$,
  '42501', 'no_autorizado', 'ni darse módulos a sí mismo');
select throws_ok($$select public.platform_agregar_miembro('00000000-0000-0000-0000-0000000000a1', 'nuevo@test', 'owner')$$,
  '42501', 'no_autorizado', 'ni añadir miembros');
select throws_ok($$select public.platform_quitar_miembro('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000e2')$$,
  '42501', 'no_autorizado', 'ni quitarlos');
select throws_ok($$select platform.crear_tenant('X Cliente', 'x-cliente', 'cafe')$$, '42501', null,
  'platform.crear_tenant no es invocable por authenticated (sin USAGE en el esquema)');
select throws_ok($$select platform.seed_vertical('00000000-0000-0000-0000-0000000000a1', 'cafe')$$, '42501', null,
  'platform.seed_vertical tampoco');

-- Ni siquiera con los privilegios del dueño: la guarda está DENTRO de las funciones.
reset role;
select throws_ok($$select platform.crear_tenant('X Cliente', 'x-cliente', 'cafe')$$, '42501', 'no_autorizado',
  'platform.crear_tenant rechaza a un no platform admin aunque lo ejecute el dueño');
select throws_ok($$select platform.seed_vertical('00000000-0000-0000-0000-0000000000a1', 'cafe')$$, '42501', 'no_autorizado',
  'platform.seed_vertical rechaza a un no platform admin');

select tests.como_anon();
select throws_ok($$select public.platform_crear_tenant('X Cliente', 'x-cliente', 'cafe')$$, '42501', null,
  'sin sesión no se puede crear un cliente');
reset role;
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claim.role', '', true);
select throws_ok($$select platform.seed_vertical('00000000-0000-0000-0000-0000000000a1', 'cafe')$$, '42501', 'no_autenticado',
  'sin usuario ni service_role, la guarda responde no_autenticado');

select is((select count(*)::int from public.tenants where slug = 'x-cliente'), 0, 'nada de lo anterior creó un cliente');

-- 3. Un platform admin crea un cliente de café ----------------------------------------------------------------------------
select tests.autenticar_como('plat@test');

select lives_ok(
  $$select public.platform_crear_tenant('Cofradía (demo)', 'cofradia-demo', 'cafe', '900123456-1', 'prueba')$$,
  'el platform admin crea un cliente de café'
);
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000e1', 'role', 'authenticated')::text, true);

select is((select vertical::text from public.tenants where slug = 'cofradia-demo'), 'cafe', 'queda con vertical cafe');
select is((select plan from public.tenants where slug = 'cofradia-demo'), 'prueba', 'con el plan indicado');
select is((select nit from public.tenants where slug = 'cofradia-demo'), '900123456-1', 'con su NIT');
select is((select estado::text from public.tenants where slug = 'cofradia-demo'), 'activo', 'y activo');
select is(
  (select array_agg(tm.modulo_id order by tm.modulo_id)
     from public.tenant_modulos tm join public.tenants t on t.id = tm.tenant_id
    where t.slug = 'cofradia-demo' and tm.activo),
  array['cafe.inventario', 'cafe.procesos', 'cafe.recepcion', 'cafe.remisiones', 'core.auditoria', 'core.equipo', 'core.terceros'],
  'módulos base de café más core.terceros, core.auditoria y core.equipo'
);
select is(
  (select jsonb_object_agg(x.concepto, x.valor)
     from public.tarifas x join public.tenants t on t.id = x.tenant_id
    where t.slug = 'cofradia-demo' and x.concepto not like 'cafe.precio\_%'),
  '{"cafe.trilla": 1400, "cafe.tostion": 2200, "cafe.molienda": 1000}'::jsonb,
  '3 tarifas de proceso: trilla 1400, tostión 2200 y molienda 1000 (sin empaque)'
);
select ok(
  (select bool_and(x.vigente_desde <= now() and x.unidad = 'kg')
     from public.tarifas x join public.tenants t on t.id = x.tenant_id
    where t.slug = 'cofradia-demo' and x.concepto not like 'cafe.precio\_%'),
  'las tarifas rigen desde el alta, por kg'
);
select is(
  (select jsonb_object_agg(a.nombre, x.valor)
     from public.tarifas x
     join public.tenants t on t.id = x.tenant_id
     join public.articulos a on a.tenant_id = t.id and cafe.concepto_precio(a.id) = x.concepto
    where t.slug = 'cofradia-demo' and x.unidad = 'unidad'),
  '{"Consumo 500 g": 23000, "Excelso 500 g": 29000}'::jsonb,
  'lista de precios (CO-31): Consumo 500 g 23.000 y Excelso 500 g 29.000; los de 2.500 g sin precio'
);
select is(
  (select jsonb_object_agg(p.clave, p.valor)
     from public.parametros p join public.tenants t on t.id = p.tenant_id where t.slug = 'cofradia-demo'),
  '{"cafe.capacidad_tostadora_kg": 13.5, "cafe.merma_referencia_trilla_pct": 19, "cafe.merma_referencia_tostion_pct": 18, "cafe.peso_bulto_kg": 62.5}'::jsonb,
  'parámetros: tostadora 13,5 kg, mermas 19/18 y bulto 62,5 kg (humedad y densidad sin configurar)'
);
select is(
  (select array_agg(s.serie order by s.serie)
     from public.series_consecutivo s join public.tenants t on t.id = s.tenant_id where t.slug = 'cofradia-demo' and s.activo and s.reinicia_anual),
  array['MP', 'MQ', 'REM', 'VT'], '4 series de consecutivos (lotes, remisiones y ventas)'
);
select is(
  (select count(*)::int from public.terceros x join public.tenants t on t.id = x.tenant_id
    where t.slug = 'cofradia-demo' and x.es_consumidor_final and x.identificacion = '222222222222'),
  1, 'consumidor final creado'
);
select is(
  (select array_agg(a.nombre order by a.nombre)
     from public.articulos a join public.tenants t on t.id = a.tenant_id
    where t.slug = 'cofradia-demo' and a.tipo = 'insumo' and a.stock_minimo is null),
  array['Bolsa 2.500 g', 'Bolsa 500 g', 'Etiqueta 2.500 g', 'Etiqueta 500 g'], '4 insumos de empaque sin stock mínimo'
);
select is(
  (select count(*)::int from public.tenant_members m join public.tenants t on t.id = m.tenant_id where t.slug = 'cofradia-demo'),
  0, 'el cliente nace sin miembros'
);

-- 3.1 seed_vertical es idempotente y no pisa lo que el cliente cambió -------------------------------------------------------
update public.parametros p set valor = '20'::jsonb
  from public.tenants t where t.id = p.tenant_id and t.slug = 'cofradia-demo' and p.clave = 'cafe.capacidad_tostadora_kg';
select lives_ok(
  $$select platform.seed_vertical((select id from public.tenants where slug = 'cofradia-demo'), 'cafe')$$,
  'seed_vertical se puede ejecutar de nuevo'
);
select lives_ok(
  $$select platform.seed_vertical((select id from public.tenants where slug = 'cofradia-demo'), 'cafe')$$,
  '...y otra vez'
);
select is(
  (select ((select count(*) from public.tarifas where tenant_id = t.id),
           (select count(*) from public.parametros where tenant_id = t.id),
           (select count(*) from public.series_consecutivo where tenant_id = t.id),
           (select count(*) from public.terceros where tenant_id = t.id),
           (select count(*) from public.articulos where tenant_id = t.id))::text
     from public.tenants t where t.slug = 'cofradia-demo'),
  '(5,4,4,1,8)', 'no duplica tarifas (3 de proceso + 2 precios), parámetros, series, consumidor final ni artículos (4 insumos + 4 productos terminados)'
);
select is(
  (select p.valor from public.parametros p join public.tenants t on t.id = p.tenant_id
    where t.slug = 'cofradia-demo' and p.clave = 'cafe.capacidad_tostadora_kg'),
  '20'::jsonb, 'y no pisa un parámetro que el cliente ya cambió'
);
select throws_ok(
  $$select platform.seed_vertical('00000000-0000-0000-0000-00000000ffff', 'cafe')$$, 'P0001', 'tenant_no_encontrado',
  'seed_vertical sobre un cliente inexistente falla'
);

-- 3.2 Auditoría: quién creó el cliente ------------------------------------------------------------------------------------------
select is(
  (select count(*)::int from audit.log l join public.tenants t on t.id::text = l.registro_id
    where t.slug = 'cofradia-demo' and l.tabla = 'public.tenants' and l.accion = 'INSERT' and l.user_id = '00000000-0000-0000-0000-0000000000e1'),
  1, 'el alta del cliente queda en audit.log con el platform admin como autor'
);
select is(
  (select count(*)::int from audit.log l join public.tenants t on t.id = l.tenant_id
    where t.slug = 'cofradia-demo' and l.tabla = 'public.tenant_modulos' and l.accion = 'INSERT'),
  7, 'y la activación de sus 7 módulos'
);

-- 4. Errores y atomicidad --------------------------------------------------------------------------------------------------------
select tests.autenticar_como('plat@test');

select throws_ok($$select public.platform_crear_tenant('Otra Cofradía', 'cofradia-demo', 'cafe')$$, 'P0001', 'slug_duplicado',
  'un slug duplicado falla');
select throws_ok($$select public.platform_crear_tenant('Otra', 'Con_Mayusculas', 'cafe')$$, 'P0001', 'slug_invalido', 'slug con mayúsculas o guion bajo');
select throws_ok($$select public.platform_crear_tenant('Otra', 'ab', 'cafe')$$, 'P0001', 'slug_invalido', 'slug demasiado corto');
select throws_ok($$select public.platform_crear_tenant('Otra', repeat('a', 41), 'cafe')$$, 'P0001', 'slug_invalido', 'slug demasiado largo');
select throws_ok($$select public.platform_crear_tenant('  ', 'otra-cofradia', 'cafe')$$, 'P0001', 'nombre_invalido', 'nombre vacío');
select throws_ok($$select public.platform_crear_tenant('Otra', 'otra-cofradia', null)$$, 'P0001', 'vertical_invalido', 'sin vertical');
select throws_ok($$select public.platform_crear_tenant('Otra', 'otra-cofradia', 'ganaderia', null, null, array['cafe.ventas'])$$,
  'P0001', 'modulo_no_valido', 'un módulo de otro vertical se rechaza');
select throws_ok($$select public.platform_crear_tenant('Otra', 'otra-cofradia', 'cafe', null, null, array['no.existe'])$$,
  'P0001', 'modulo_no_valido', 'un módulo que no existe se rechaza');

reset role;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000e1', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::int from public.tenants where slug in ('otra-cofradia', 'x-cliente')) , 0,
  'ningún intento fallido dejó un cliente a medias'
);

-- 5. Ganadería y cooperativa (y el rol service_role del CLI) ---------------------------------------------------------------------
select tests.autenticar_como('plat@test');
select lives_ok(
  $$select public.platform_crear_tenant('Granja Demo', 'granja-demo', 'ganaderia', null, null, array['ganaderia.arriendos', 'core.terceros'])$$,
  'crea un cliente de ganadería con módulos opcionales'
);
reset role;
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
select lives_ok(
  $$select public.platform_crear_tenant('Coop Demo', 'coop-demo', 'cooperativa')$$,
  'el service_role (CLI) también puede crear clientes'
);
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000e1', 'role', 'authenticated')::text, true);

select is(
  (select array_agg(tm.modulo_id order by tm.modulo_id)
     from public.tenant_modulos tm join public.tenants t on t.id = tm.tenant_id where t.slug = 'granja-demo' and tm.activo),
  array['core.terceros', 'ganaderia.animales', 'ganaderia.arriendos', 'ganaderia.extracciones', 'ganaderia.finanzas', 'ganaderia.inventario'],
  'ganadería: módulos base más los opcionales pedidos, sin núcleo por defecto'
);
select is(
  (select array_agg(tm.modulo_id order by tm.modulo_id)
     from public.tenant_modulos tm join public.tenants t on t.id = tm.tenant_id where t.slug = 'coop-demo' and tm.activo),
  array['cooperativa.recolecciones', 'cooperativa.rutas'], 'cooperativa: solo sus módulos base'
);
select is(
  (select ((select count(*) from public.conceptos_gasto where tenant_id = t.id),
           (select count(*) from public.subconceptos_gasto where tenant_id = t.id),
           (select count(*) from public.conceptos_ingreso where tenant_id = t.id),
           (select count(*) from public.subconceptos_ingreso where tenant_id = t.id))::text
     from public.tenants t where t.slug = 'granja-demo'),
  '(3,7,1,2)', 'ganadería: catálogo de gastos e ingresos'
);
select is(
  (select count(*)::int from public.subconceptos_gasto s join public.tenants t on t.id = s.tenant_id
    where t.slug = 'granja-demo' and s.nombre = 'Leche para crías')
  + (select count(*)::int from public.subconceptos_ingreso s join public.tenants t on t.id = s.tenant_id
    where t.slug = 'granja-demo' and s.nombre ilike '%leche%'),
  2, 'incluye los subconceptos de leche que el código da por hechos'
);
select is(
  (select count(*)::int from public.precios p join public.tenants t on t.id = p.tenant_id where t.slug = 'granja-demo'),
  0, 'el precio del litro queda pendiente'
);
select is(
  (select ((select count(*) from public.tarifas where tenant_id = t.id),
           (select count(*) from public.parametros where tenant_id = t.id),
           (select count(*) from public.series_consecutivo where tenant_id = t.id),
           (select count(*) from public.articulos where tenant_id = t.id))::text
     from public.tenants t where t.slug in ('granja-demo')),
  '(0,0,0,0)', 'ganadería no recibe nada de café'
);
select is(
  (select count(*)::int from public.conceptos_gasto c join public.tenants t on t.id = c.tenant_id where t.slug = 'coop-demo'),
  0, 'cooperativa no recibe seeds todavía'
);
select lives_ok(
  $$select platform.seed_vertical((select id from public.tenants where slug = 'granja-demo'), 'ganaderia')$$,
  'seed_vertical de ganadería se repite sin error'
);
select is(
  (select ((select count(*) from public.conceptos_gasto where tenant_id = t.id),
           (select count(*) from public.subconceptos_gasto where tenant_id = t.id),
           (select count(*) from public.conceptos_ingreso where tenant_id = t.id),
           (select count(*) from public.subconceptos_ingreso where tenant_id = t.id))::text
     from public.tenants t where t.slug = 'granja-demo'),
  '(3,7,1,2)', '...y no duplica el catálogo'
);

-- 6. Listado, detalle y cambios --------------------------------------------------------------------------------------------------
-- Las secciones 6 y 7 actúan como el platform admin SIN cambiar de rol: los wrappers son SECURITY DEFINER y toman
-- la identidad de los claims, y así las comprobaciones leen las tablas sin que el RLS (que no deja al platform
-- admin ver datos legacy) las vacíe. Con rol `authenticated` ya se probaron las secciones 3 a 5.
reset role;
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000e1', 'role', 'authenticated')::text, true);

select is(
  (select (miembros, modulos)::text from public.platform_tenants_resumen() where slug = 'cofradia-demo'),
  '(0,7)', 'el listado trae miembros y módulos activos'
);
select ok(
  (select count(*) >= 6 from public.platform_tenants_resumen()),
  'el listado incluye los clientes existentes y los nuevos'
);
select is(
  (public.platform_obtener_tenant((select id from public.tenants where slug = 'cofradia-demo')) -> 'tenant' ->> 'slug'),
  'cofradia-demo', 'el detalle trae el cliente'
);
select is(
  jsonb_array_length(public.platform_obtener_tenant((select id from public.tenants where slug = 'cofradia-demo')) -> 'modulos'),
  10, 'el detalle ofrece el catálogo aplicable: 7 de café + 3 de núcleo'
);
select is(
  (select count(*)::int
     from jsonb_array_elements(public.platform_obtener_tenant((select id from public.tenants where slug = 'cofradia-demo')) -> 'modulos') m
    where (m ->> 'activo')::boolean),
  7, '...marcando los 7 activos'
);
select throws_ok($$select public.platform_obtener_tenant('00000000-0000-0000-0000-00000000ffff')$$, 'P0001', 'tenant_no_encontrado',
  'detalle de un cliente inexistente');

select lives_ok(
  $$select public.platform_set_modulo((select id from public.tenants where slug = 'cofradia-demo'), 'core.auditoria', false)$$,
  'desactivar un módulo'
);
select is(
  (select tm.activo from public.tenant_modulos tm join public.tenants t on t.id = tm.tenant_id
    where t.slug = 'cofradia-demo' and tm.modulo_id = 'core.auditoria'),
  false, 'queda desactivado (la fila se conserva)'
);
select lives_ok(
  $$select public.platform_set_modulo((select id from public.tenants where slug = 'cofradia-demo'), 'core.auditoria', true)$$,
  'reactivarlo'
);
select lives_ok(
  $$select public.platform_set_modulo((select id from public.tenants where slug = 'cofradia-demo'), 'cafe.ventas', true)$$,
  'activar un módulo opcional del vertical'
);
select lives_ok(
  $$select public.platform_set_modulo((select id from public.tenants where slug = 'cofradia-demo'), 'cafe.ventas', true)$$,
  'es idempotente'
);
select is(
  (select count(*)::int from public.tenant_modulos tm join public.tenants t on t.id = tm.tenant_id
    where t.slug = 'cofradia-demo' and tm.activo),
  8, 'cofradía queda con 8 módulos activos'
);
select throws_ok(
  $$select public.platform_set_modulo((select id from public.tenants where slug = 'cofradia-demo'), 'ganaderia.animales', true)$$,
  'P0001', 'modulo_no_valido', 'no se puede activar un módulo de otro vertical'
);
select throws_ok(
  $$select public.platform_set_modulo('00000000-0000-0000-0000-00000000ffff', 'core.terceros', true)$$,
  'P0001', 'tenant_no_encontrado', 'módulo sobre un cliente inexistente'
);

select lives_ok(
  $$select public.platform_actualizar_tenant((select id from public.tenants where slug = 'cofradia-demo'),
      '{"nombre": "Cofradía SAS", "estado": "activo", "plan": "pro", "color_primario": "#1A7F5A", "logo_url": "https://example.com/logo.png"}')$$,
  'cambiar nombre, plan, estado y marca'
);
select is(
  (select (nombre, plan, color_primario, logo_url, nit)::text from public.tenants where slug = 'cofradia-demo'),
  '("Cofradía SAS",pro,#1A7F5A,https://example.com/logo.png,900123456-1)', 'se aplican y lo no mencionado (nit) se conserva'
);
select lives_ok(
  $$select public.platform_actualizar_tenant((select id from public.tenants where slug = 'cofradia-demo'), '{"nit": null, "logo_url": ""}')$$,
  'un null o vacío explícito limpia el campo'
);
select is(
  (select (nit is null and logo_url is null and color_primario = '#1A7F5A')::text from public.tenants where slug = 'cofradia-demo'),
  'true', 'nit y logo vacíos, color intacto'
);
select throws_ok($$select public.platform_actualizar_tenant((select id from public.tenants where slug = 'cofradia-demo'), '{"color_primario": "rojo"}')$$,
  'P0001', 'color_invalido', 'color no hexadecimal');
select throws_ok($$select public.platform_actualizar_tenant((select id from public.tenants where slug = 'cofradia-demo'), '{"estado": "eliminado"}')$$,
  'P0001', 'estado_invalido', 'estado fuera del enum');
select throws_ok($$select public.platform_actualizar_tenant((select id from public.tenants where slug = 'cofradia-demo'), '{"vertical": "ganaderia"}')$$,
  'P0001', 'cambios_invalidos', 'el vertical no se cambia');
select throws_ok($$select public.platform_actualizar_tenant((select id from public.tenants where slug = 'cofradia-demo'), '{"slug": "otro"}')$$,
  'P0001', 'cambios_invalidos', 'ni el slug');
select throws_ok($$select public.platform_actualizar_tenant((select id from public.tenants where slug = 'cofradia-demo'), '{"nombre": " "}')$$,
  'P0001', 'nombre_invalido', 'nombre vacío al actualizar');

-- 7. Miembros ------------------------------------------------------------------------------------------------------------------------
select is(
  public.platform_agregar_miembro((select id from public.tenants where slug = 'cofradia-demo'), '  NUEVO@Test ', 'owner'),
  '00000000-0000-0000-0000-0000000000e2'::uuid, 'añade a un usuario existente por email (sin importar mayúsculas)'
);
select is(
  (select m.rol::text from public.tenant_members m join public.tenants t on t.id = m.tenant_id
    where t.slug = 'cofradia-demo' and m.user_id = '00000000-0000-0000-0000-0000000000e2' and m.activo),
  'owner', 'queda como owner de café'
);
select is(
  (select count(*)::int from public.roles where user_id = '00000000-0000-0000-0000-0000000000e2'),
  0, 'en café no se escribe en la tabla legacy roles'
);
select throws_ok($$select public.platform_agregar_miembro((select id from public.tenants where slug = 'cofradia-demo'), 'fantasma@test', 'admin')$$,
  'P0001', 'usuario_no_encontrado', 'un email sin cuenta se rechaza');
select throws_ok($$select public.platform_agregar_miembro('00000000-0000-0000-0000-00000000ffff', 'nuevo@test', 'admin')$$,
  'P0001', 'tenant_no_encontrado', 'cliente inexistente');

-- Ganadería: además de la membresía, el rol legacy que gobierna sus tablas.
select lives_ok($$select public.platform_agregar_miembro((select id from public.tenants where slug = 'granja-demo'), 'otro@test', 'operativo')$$,
  'añade a un operativo a un cliente de ganadería');
select is(
  (select (r.rol, r.tenant_id = (select id from public.tenants where slug = 'granja-demo'))::text from public.roles r where r.user_id = '00000000-0000-0000-0000-0000000000e3'),
  '(user,t)', 'rol legacy user ligado al cliente'
);
select is(
  (select m.rol::text from public.tenant_members m join public.tenants t on t.id = m.tenant_id
    where t.slug = 'granja-demo' and m.user_id = '00000000-0000-0000-0000-0000000000e3'),
  'operativo', 'y membresía operativo'
);
select lives_ok($$select public.platform_agregar_miembro((select id from public.tenants where slug = 'granja-demo'), 'otro@test', 'admin')$$,
  'repetirla con otro rol lo actualiza');
select is(
  (select (r.rol, m.rol, m.activo)::text from public.roles r
     join public.tenant_members m on m.user_id = r.user_id
    where r.user_id = '00000000-0000-0000-0000-0000000000e3'),
  '(admin,admin,t)', 'rol legacy y membresía actualizados, sin duplicar filas'
);
select throws_ok($$select public.platform_agregar_miembro((select id from public.tenants where slug = 'el-velero'), 'otro@test', 'viewer')$$,
  'P0001', 'usuario_con_rol_en_otro_cliente', 'un usuario con rol legacy en otro cliente de ganadería se rechaza');
select throws_ok($$select public.platform_agregar_miembro((select id from public.tenants where slug = 'granja-demo'), 'admin@vb.test', 'admin')$$,
  'P0001', 'usuario_con_rol_en_otro_cliente', 'tampoco se le puede quitar a Villa Blanca su admin');

select lives_ok($$select public.platform_quitar_miembro((select id from public.tenants where slug = 'granja-demo'), '00000000-0000-0000-0000-0000000000e3')$$,
  'quitar un miembro');
select is(
  (select (m.activo, (select count(*) from public.roles r where r.user_id = m.user_id))::text from public.tenant_members m
    where m.user_id = '00000000-0000-0000-0000-0000000000e3'),
  '(f,0)', 'membresía desactivada (no borrada) y sin rol legacy'
);
select throws_ok($$select public.platform_quitar_miembro((select id from public.tenants where slug = 'granja-demo'), '00000000-0000-0000-0000-0000000000e3')$$,
  'P0001', 'miembro_no_encontrado', 'quitar a quien ya no es miembro falla');
select is(
  (select (miembros, modulos)::text from public.platform_tenants_resumen() where slug = 'cofradia-demo'),
  '(1,8)', 'el listado cuenta el miembro nuevo'
);

-- 8. Aislamiento: el nuevo cliente es un tenant más ---------------------------------------------------------------------------------
-- nuevo@test (owner de Cofradía) solo ve lo suyo y no tiene poder de plataforma.
reset role;
select tests.autenticar_como('nuevo@test');
select is((select slug from public.tenants), 'cofradia-demo', 'el owner nuevo ve solo su cliente');
select is((select count(*)::int from public.tarifas), 5, 've sus 5 tarifas (3 de proceso y 2 precios de venta)');
select is((select count(*)::int from public.terceros), 1, 'y su consumidor final (core.terceros activo)');
select is((select count(*)::int from public.tenant_modulos), 8, 'y solo los módulos de su cliente');
select is((select count(*)::int from public.gastos) + (select count(*)::int from public.animales), 0,
  'no ve datos de ganadería (sus políticas exigen rol legacy)');
select throws_ok($$select public.platform_crear_tenant('Otro más', 'otro-mas', 'cafe')$$, '42501', 'no_autorizado',
  'un owner de cliente no puede crear clientes');
select throws_ok($$select public.platform_set_modulo((select id from public.tenants where slug = 'cofradia-demo'), 'cafe.exportacion', true)$$,
  '42501', 'no_autorizado', 'ni darse módulos');

-- Villa Blanca no ve nada de Cofradía.
reset role;
select tests.autenticar_como('admin@vb.test');
select is((select count(*)::int from public.tenants), 1, 'un cliente existente sigue viendo solo su fila de tenants');
select is((select count(*)::int from public.tarifas), 0, 'y ninguna tarifa de Cofradía');
select is((select count(*)::int from public.terceros), 0, 'ni sus terceros');

-- 9. Ningún cliente existente cambia -----------------------------------------------------------------------------------------------------
reset role;
select is(
  (select count(*)::int
     from antes a
     join public.tenants t on t.slug = a.slug
    where a.modulos is distinct from (select array_agg(tm.modulo_id order by tm.modulo_id) from public.tenant_modulos tm where tm.tenant_id = t.id and tm.activo)
       or a.conceptos <> (select count(*) from public.conceptos_gasto c where c.tenant_id = t.id)
       or a.tarifas <> (select count(*) from public.tarifas x where x.tenant_id = t.id)
       or a.miembros <> (select count(*) from public.tenant_members m where m.tenant_id = t.id)),
  0, 'villa-blanca, el-velero y toca-lacteos conservan módulos, catálogo, tarifas y miembros'
);

select * from finish();
rollback;
