-- Tenants con vertical/marca y catálogo de módulos (FIN-89 · CO-09).
-- Usa el seed: Villa Blanca (a1: base de ganadería + arriendos), El Velero (a2: solo la base),
-- y Toca Lácteos (cooperativa) que crea la propia migración.
-- Todo corre en una transacción que se revierte: no deja rastro.
begin;

select plan(38);

-- 0. Datos de la migración (como dueño, sin RLS) -----------------------------------------------------
select is(
  (select vertical::text from public.tenants where slug = 'toca-lacteos'),
  'cooperativa', 'existe el tenant toca-lacteos con vertical cooperativa'
);
select is(
  (select array_agg(modulo_id order by modulo_id) from public.tenant_modulos tm
     join public.tenants t on t.id = tm.tenant_id where t.slug = 'toca-lacteos'),
  array['cooperativa.informes', 'cooperativa.pagos', 'cooperativa.recolecciones', 'cooperativa.rutas'],
  'toca-lacteos: módulos base de cooperativa + pagos + informes'
);
select is(
  (select count(*)::int from public.tenants where vertical is null), 0, 'ningún tenant sin vertical'
);
select col_hasnt_default('public', 'tenants', 'vertical', 'tenants.vertical no tiene DEFAULT: un cliente nuevo declara el suyo');
select is(
  (select array_agg(modulo_id order by modulo_id) from public.tenant_modulos
    where tenant_id = '00000000-0000-0000-0000-0000000000a2'),
  array['ganaderia.animales', 'ganaderia.extracciones', 'ganaderia.finanzas', 'ganaderia.inventario'],
  'El Velero: solo la base de ganadería (sin arriendos)'
);
select is(
  (select count(*)::int from public.tenant_modulos
    where modulo_id = 'ganaderia.arriendos' and tenant_id <> '00000000-0000-0000-0000-0000000000a1'),
  0, 'arriendos solo está activo en Villa Blanca'
);

-- 1. Villa Blanca (admin) ------------------------------------------------------------------------------
select tests.autenticar_como('admin@vb.test');

select is(
  (select count(*)::int from public.tenant_modulos), 5, 'admin VB ve los 5 módulos de su cliente'
);
select is(
  (select count(*)::int from public.tenant_modulos where tenant_id <> '00000000-0000-0000-0000-0000000000a1'),
  0, 'admin VB no ve módulos de otros clientes (ni El Velero ni Toca Lácteos)'
);
select ok(public.tenant_tiene_modulo('ganaderia.arriendos'), 'Villa Blanca ve Arriendos');
select ok(not public.tenant_tiene_modulo('cafe.ventas'), 'y no un módulo que no tiene');
select is((select count(*)::int from public.modulos), 19, 'cualquier usuario con sesión lee el catálogo completo');

-- Un admin no puede darse módulos, quitárselos ni tocar el catálogo: ni las políticas ni los
-- privilegios lo permiten.
select throws_ok(
  $$ insert into public.tenant_modulos (tenant_id, modulo_id)
     values ('00000000-0000-0000-0000-0000000000a1', 'ganaderia.control_lechero') $$,
  '42501', null, 'admin no puede insertarse módulos a sí mismo'
);
select throws_ok(
  $$ update public.tenant_modulos set activo = false where modulo_id = 'ganaderia.arriendos' $$,
  '42501', null, 'admin no puede desactivar módulos'
);
select throws_ok(
  $$ delete from public.tenant_modulos $$, '42501', null, 'admin no puede borrar módulos de su cliente'
);
select throws_ok(
  $$ insert into public.modulos (id, nombre) values ('ganaderia.invento', 'Inventado') $$,
  '42501', null, 'admin no puede añadir módulos al catálogo'
);
select throws_ok(
  $$ update public.modulos set base = true $$, '42501', null, 'admin no puede editar el catálogo'
);

-- tenants: solo la marca, solo la propia fila, solo el admin.
select is(
  tests.filas_afectadas($$ update public.tenants set nombre = 'Villa Blanca SAS', color_primario = '#1a2b3c', logo_url = 'https://x.test/l.png'
                          where id = '00000000-0000-0000-0000-0000000000a1' $$),
  1, 'admin VB puede cambiar nombre, color y logo de su cliente'
);
select throws_ok(
  $$ update public.tenants set plan = 'enterprise' where id = '00000000-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'admin VB no puede cambiar el plan'
);
select throws_ok(
  $$ update public.tenants set estado = 'baja' where id = '00000000-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'admin VB no puede cambiar el estado'
);
select throws_ok(
  $$ update public.tenants set vertical = 'cafe' where id = '00000000-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'admin VB no puede cambiar el vertical'
);
select is(
  tests.filas_afectadas($$ update public.tenants set nombre = 'Hackeado' where id = '00000000-0000-0000-0000-0000000000a2' $$),
  0, 'admin VB no puede renombrar a El Velero (RLS: fila invisible)'
);
select throws_ok(
  $$ update public.tenants set color_primario = 'rojo' where id = '00000000-0000-0000-0000-0000000000a1' $$,
  '23514', null, 'el color debe ser #RRGGBB'
);
select throws_ok(
  $$ insert into public.tenants (nombre, slug, vertical) values ('Intruso', 'intruso', 'cafe') $$,
  '42501', null, 'nadie crea clientes desde la API'
);

reset role;
select is(
  (select nombre from public.tenants where id = '00000000-0000-0000-0000-0000000000a1'),
  'Villa Blanca SAS', 'el cambio de marca quedó guardado'
);
select ok(
  (select updated_at is not null from public.tenants where id = '00000000-0000-0000-0000-0000000000a1'),
  'set_updated estampa updated_at en tenants'
);

-- 2. Villa Blanca (user): no es admin, no cambia la marca -----------------------------------------------
select tests.autenticar_como('user@vb.test');
select is(
  tests.filas_afectadas($$ update public.tenants set nombre = 'Por user' where id = '00000000-0000-0000-0000-0000000000a1' $$),
  0, 'un user (no admin) no puede cambiar la marca'
);
select ok(public.tenant_tiene_modulo('ganaderia.arriendos'), 'pero ve los módulos de su cliente');
reset role;

-- 3. El Velero ---------------------------------------------------------------------------------------------
select tests.autenticar_como('admin@velero.test');

select is((select count(*)::int from public.tenant_modulos), 4, 'admin El Velero ve solo sus 4 módulos');
select is(
  (select count(*)::int from public.tenant_modulos where tenant_id = '00000000-0000-0000-0000-0000000000a1'),
  0, 'admin El Velero no lee los módulos de Villa Blanca'
);
select ok(not public.tenant_tiene_modulo('ganaderia.arriendos'), 'El Velero no tiene Arriendos');
reset role;

-- Activar un módulo es una fila (sin deploy): la hace la plataforma (dueño / service_role), no el cliente.
insert into public.tenant_modulos (tenant_id, modulo_id)
values ('00000000-0000-0000-0000-0000000000a2', 'ganaderia.arriendos');

select tests.autenticar_como('admin@velero.test');
select ok(public.tenant_tiene_modulo('ganaderia.arriendos'), 'tras el insert de la plataforma, El Velero tiene Arriendos');
reset role;

update public.tenant_modulos set activo = false
 where tenant_id = '00000000-0000-0000-0000-0000000000a2' and modulo_id = 'ganaderia.arriendos';
select tests.autenticar_como('admin@velero.test');
select ok(not public.tenant_tiene_modulo('ganaderia.arriendos'), 'activo = false lo vuelve a esconder');
reset role;

-- 4. Cooperativa y anon ---------------------------------------------------------------------------------------
select tests.autenticar_como('coop.admin@test');
-- Desde FIN-90 la cooperativa tiene tenant (Toca Lácteos): ve SUS 4 módulos y ninguno de una finca.
select is((select count(*)::int from public.tenant_modulos), 4, 'cooperativa ve los 4 módulos de Toca Lácteos');
select is(
  (select count(*)::int from public.tenant_modulos where modulo_id like 'ganaderia.%'), 0,
  'cooperativa no ve módulos de ganadería'
);
select ok(public.tenant_tiene_modulo('cooperativa.pagos'), 'cooperativa tiene el módulo cooperativa.pagos');
select ok(not public.tenant_tiene_modulo('ganaderia.arriendos'), 'cooperativa no tiene ganaderia.arriendos');
reset role;

select tests.como_anon();
select throws_ok('select count(*) from public.modulos', '42501', null, 'anon no lee el catálogo');
reset role;

-- 5. Auditoría ------------------------------------------------------------------------------------------------------
select ok(
  exists (select 1 from audit.log
           where tabla = 'public.tenant_modulos' and accion = 'INSERT'
             and tenant_id = '00000000-0000-0000-0000-0000000000a2'
             and despues ->> 'modulo_id' = 'ganaderia.arriendos'),
  'activar un módulo queda en audit.log con el tenant_id del cliente'
);

select * from finish();
rollback;
