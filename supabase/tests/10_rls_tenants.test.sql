-- RLS · aislamiento entre clientes (multi-tenancy del lado finca) y matriz de roles de `animales`.
-- Usa los usuarios y tenants de supabase/seed.sql:
--   admin@vb.test / user@vb.test / viewer@vb.test  → Villa Blanca  (tenant ...a1)
--   admin@velero.test                              → El Velero     (tenant ...a2)
--   coop.admin@test / coop.user@test               → cooperativa   (sin tenant)
-- Todo corre en una transacción que se revierte: no deja rastro en la base.
begin;

select plan(46);

-- 0. Guardas de esquema: una tabla nueva con tenant_id sin RLS o con tenant_id nullable es un
--    agujero de aislamiento. Cubren las tablas que aún no existen ("toda tabla nueva lleva
--    tenant_id NOT NULL y RLS activada").
select is_empty(
  $$ select c.relname
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity $$,
  'toda tabla de public con tenant_id tiene RLS activada'
);
select is_empty(
  $$ select table_name
       from information_schema.columns
      where table_schema = 'public' and column_name = 'tenant_id' and is_nullable = 'YES'
        and table_name <> 'roles' $$,
  'tenant_id es NOT NULL en todas las tablas de negocio (roles lo admite NULL para la cooperativa)'
);

-- 1. anon (clave pública sin sesión) ---------------------------------------------------------
select tests.como_anon();

select throws_ok('select public.tenant_actual()', '42501', null, 'anon no puede ejecutar tenant_actual()');
select throws_ok('select public.rol_actual()', '42501', null, 'anon no puede ejecutar rol_actual()');
select is((select count(*)::int from public.animales), 0, 'anon no ve ningún animal');
select throws_ok(
  $$ insert into public.animales (tenant_id, identificador, nombre, sexo)
     values ('00000000-0000-0000-0000-0000000000a1', 'X-1', 'Intrusa', 'hembra') $$,
  '42501', null, 'anon no puede insertar animales'
);

-- 2. Admin de Villa Blanca -------------------------------------------------------------------
reset role;
select tests.autenticar_como('admin@vb.test');

select is(public.tenant_actual(), '00000000-0000-0000-0000-0000000000a1'::uuid, 'admin VB: tenant_actual() es Villa Blanca');
select is(public.rol_actual()::text, 'admin', 'admin VB: rol_actual() es admin');
select is((select count(*)::int from public.animales), 3, 'admin VB ve sus 3 animales');
select is(
  (select array_agg(distinct tenant_id) from public.animales),
  array['00000000-0000-0000-0000-0000000000a1']::uuid[],
  'admin VB: todos los animales visibles son de Villa Blanca'
);
select is(
  (select array_agg(distinct tenant_id) from public.eventos_animal),
  array['00000000-0000-0000-0000-0000000000a1']::uuid[],
  'admin VB: todos los eventos visibles son de Villa Blanca'
);
select is(
  (select array_agg(distinct tenant_id) from public.extracciones_leche),
  array['00000000-0000-0000-0000-0000000000a1']::uuid[],
  'admin VB: todas las extracciones visibles son de Villa Blanca'
);
select is(
  (select array_agg(distinct tenant_id) from public.pajillas),
  array['00000000-0000-0000-0000-0000000000a1']::uuid[],
  'admin VB: todas las pajillas visibles son de Villa Blanca'
);
select is(
  (select count(*)::int from public.animales where id = '00000000-0000-0000-0002-000000000001'),
  0, 'admin VB no ve por id un animal de El Velero'
);
select is(
  tests.filas_afectadas($$ update public.animales set nombre = 'Hackeada' where id = '00000000-0000-0000-0002-000000000001' $$),
  0, 'admin VB no puede actualizar un animal de El Velero'
);
select is(
  tests.filas_afectadas($$ delete from public.animales where id = '00000000-0000-0000-0002-000000000001' $$),
  0, 'admin VB no puede borrar un animal de El Velero'
);
select throws_ok(
  $$ insert into public.animales (tenant_id, identificador, nombre, sexo)
     values ('00000000-0000-0000-0000-0000000000a2', 'VB-X', 'Colada', 'hembra') $$,
  '42501', null, 'admin VB no puede insertar con tenant_id de El Velero (WITH CHECK)'
);
select lives_ok(
  $$ insert into public.animales (identificador, nombre, sexo) values ('VB-N1', 'Nueva', 'hembra') $$,
  'admin VB puede insertar un animal propio'
);
select is(
  (select tenant_id from public.animales where identificador = 'VB-N1'),
  '00000000-0000-0000-0000-0000000000a1'::uuid,
  'el INSERT sin tenant_id queda estampado con el de Villa Blanca (DEFAULT tenant_actual())'
);
select throws_ok(
  $$ update public.animales set tenant_id = '00000000-0000-0000-0000-0000000000a2'
      where id = '00000000-0000-0000-0001-000000000001' $$,
  '42501', null, 'admin VB no puede mover un animal propio a El Velero (WITH CHECK del UPDATE)'
);

-- 3. Admin de El Velero ----------------------------------------------------------------------
reset role;
select tests.autenticar_como('admin@velero.test');

select is(public.tenant_actual(), '00000000-0000-0000-0000-0000000000a2'::uuid, 'admin EV: tenant_actual() es El Velero');
select is((select count(*)::int from public.animales), 3, 'admin EV ve sus 3 animales');
select is(
  (select array_agg(distinct tenant_id) from public.animales),
  array['00000000-0000-0000-0000-0000000000a2']::uuid[],
  'admin EV: todos los animales visibles son de El Velero'
);
select is(
  (select array_agg(distinct tenant_id) from public.eventos_animal),
  array['00000000-0000-0000-0000-0000000000a2']::uuid[],
  'admin EV: todos los eventos visibles son de El Velero'
);
select is(
  (select array_agg(distinct tenant_id) from public.extracciones_leche),
  array['00000000-0000-0000-0000-0000000000a2']::uuid[],
  'admin EV: todas las extracciones visibles son de El Velero'
);
select is(
  (select array_agg(distinct tenant_id) from public.pajillas),
  array['00000000-0000-0000-0000-0000000000a2']::uuid[],
  'admin EV: todas las pajillas visibles son de El Velero'
);
select is(
  (select count(*)::int from public.animales where identificador like 'VB-%'),
  0, 'admin EV no ve ningún animal de Villa Blanca'
);
select throws_ok(
  $$ insert into public.animales (tenant_id, identificador, nombre, sexo)
     values ('00000000-0000-0000-0000-0000000000a1', 'EV-X', 'Intrusa', 'hembra') $$,
  '42501', null, 'admin EV no puede insertar con tenant_id de Villa Blanca (WITH CHECK)'
);
select is(
  tests.filas_afectadas($$ update public.animales set nombre = 'Hackeada' where id = '00000000-0000-0000-0001-000000000001' $$),
  0, 'admin EV no puede actualizar un animal de Villa Blanca'
);
select is(
  tests.filas_afectadas($$ delete from public.animales where id = '00000000-0000-0000-0001-000000000001' $$),
  0, 'admin EV no puede borrar un animal de Villa Blanca'
);

-- 4. Matriz de roles dentro de Villa Blanca ---------------------------------------------------
reset role;
select tests.autenticar_como('user@vb.test');

select is(
  (select count(*)::int from public.animales where identificador in ('VB-001', 'VB-002', 'VB-T01')),
  3, 'user VB ve los animales de su cliente'
);
select lives_ok(
  $$ insert into public.animales (identificador, nombre, sexo) values ('VB-U1', 'DeUser', 'hembra') $$,
  'user VB puede insertar animales'
);
select is(
  tests.filas_afectadas($$ update public.animales set nombre = 'Renombrada' where id = '00000000-0000-0000-0001-000000000001' $$),
  1, 'user VB puede actualizar animales de su cliente'
);

reset role;
select tests.autenticar_como('viewer@vb.test');

select is(public.rol_actual()::text, 'viewer', 'viewer VB: rol_actual() es viewer');
select is(
  (select count(*)::int from public.animales where identificador in ('VB-001', 'VB-002', 'VB-T01')),
  3, 'viewer VB puede leer los animales de su cliente'
);
select throws_ok(
  $$ insert into public.animales (identificador, nombre, sexo) values ('VB-V1', 'DeViewer', 'hembra') $$,
  '42501', null, 'viewer VB no puede insertar en animales'
);
select throws_ok(
  $$ insert into public.animales (tenant_id, identificador, nombre, sexo)
     values ('00000000-0000-0000-0000-0000000000a1', 'VB-V2', 'DeViewer', 'hembra') $$,
  '42501', null, 'viewer VB tampoco con el tenant_id explícito de su cliente'
);
select is(
  tests.filas_afectadas($$ update public.animales set nombre = 'Hackeada' where id = '00000000-0000-0000-0001-000000000001' $$),
  0, 'viewer VB no puede actualizar animales'
);
select is(
  tests.filas_afectadas($$ delete from public.animales where id = '00000000-0000-0000-0001-000000000001' $$),
  0, 'viewer VB no puede borrar animales'
);

-- 5. Roles de cooperativa: no pertenecen a ningún cliente de finca ------------------------------
reset role;
select tests.autenticar_como('coop.user@test');

-- Desde FIN-90 la cooperativa tiene tenant (Toca Lácteos) vía membresías; antes era NULL.
select is(public.tenant_actual(), (select id from public.tenants where slug = 'toca-lacteos'), 'cooperativa_user: tenant_actual() es Toca Lácteos');
select is(public.rol_actual()::text, 'cooperativa_user', 'cooperativa_user: rol_actual() es cooperativa_user');
select is((select count(*)::int from public.animales), 0, 'cooperativa_user no ve animales');
select is((select count(*)::int from public.eventos_animal), 0, 'cooperativa_user no ve eventos de animales');
select throws_ok(
  $$ insert into public.animales (tenant_id, identificador, nombre, sexo)
     values ('00000000-0000-0000-0000-0000000000a1', 'CO-1', 'Intrusa', 'hembra') $$,
  '42501', null, 'cooperativa_user no puede insertar animales en un cliente de finca'
);

reset role;
select tests.autenticar_como('coop.admin@test');

select is((select count(*)::int from public.animales), 0, 'cooperativa_admin no ve animales');
select is((select count(*)::int from public.gastos), 0, 'cooperativa_admin no ve gastos de las fincas');

select * from finish();
rollback;
