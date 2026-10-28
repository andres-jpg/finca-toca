-- Insumos de empaque (FIN-104 · CO-23): los ajustes del kardex son solo de owner/admin (RLS), las compras y
-- consumos siguen siendo de operativo, el mínimo es por artículo, y `nombres_usuarios_tenant()` solo da los
-- emails de los miembros del cliente actual.
-- Todo se crea AQUÍ dentro de la transacción (rollback al final): dos clientes de café (A y B).
--   e1 admin A   e2 operativo A   e3 viewer A   e4 owner B
begin;

select plan(25);

-- 0. Preparación --------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000e1', 'authenticated', 'authenticated', 'admin-a@insumos.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'authenticated', 'authenticated', 'operativo-a@insumos.test'),
  ('00000000-0000-0000-0000-0000000000e3', 'authenticated', 'authenticated', 'viewer-a@insumos.test'),
  ('00000000-0000-0000-0000-0000000000e4', 'authenticated', 'authenticated', 'owner-b@insumos.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Insumos A', 'insumos-a-t', 'cafe');
select platform.crear_tenant('Insumos B', 'insumos-b-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'insumos-a-t'
union all select 'b', id from public.tenants where slug = 'insumos-b-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), m.rol::public.rol_tenant
  from (values
    ('00000000-0000-0000-0000-0000000000e1', 'a', 'admin'),
    ('00000000-0000-0000-0000-0000000000e2', 'a', 'operativo'),
    ('00000000-0000-0000-0000-0000000000e3', 'a', 'viewer'),
    ('00000000-0000-0000-0000-0000000000e4', 'b', 'owner')) as m(user_id, t, rol);

-- Id de un insumo sembrado de un cliente por su nombre (el alta deja «Bolsa 500 g», «Etiqueta 500 g»…).
create or replace function pg_temp.insumo(p_clave text, p_nombre text)
returns uuid
language sql
security definer
as $$
  select a.id from public.articulos a
   where a.tenant_id = (select id from ids where clave = p_clave) and a.nombre = p_nombre and a.tipo = 'insumo'
$$;
grant execute on function pg_temp.insumo(text, text) to authenticated;

-- 1. El alta deja los 4 insumos, sin mínimo --------------------------------------------------------------------
select is(
  (select array_agg(a.nombre order by a.nombre) from public.articulos a
    where a.tenant_id = (select id from ids where clave = 'a') and a.tipo = 'insumo'),
  array['Bolsa 2.500 g', 'Bolsa 500 g', 'Etiqueta 2.500 g', 'Etiqueta 500 g'],
  'el alta de un cliente de café siembra 4 insumos de empaque'
);
select ok(
  (select bool_and(a.stock_minimo is null and a.activo) from public.articulos a
    where a.tenant_id = (select id from ids where clave = 'a') and a.tipo = 'insumo'),
  'sembrados activos y sin mínimo'
);

-- 2. Administrador ---------------------------------------------------------------------------------------------
select tests.autenticar_como('admin-a@insumos.test');

select lives_ok(
  $$ insert into public.articulos (nombre, tipo, unidad, atributos)
     values ('Bolsa 1.000 g', 'insumo', 'unidad', '{"clase":"bolsa","presentacion_g":1000}') $$,
  'el admin crea el insumo «Bolsa 1.000 g»'
);
select is(
  (select array_agg(a.nombre order by a.nombre) from public.articulos a
    where a.tipo = 'producto_terminado' and a.atributos -> 'presentacion_g' = '1000'::jsonb),
  array['Consumo 1.000 g', 'Excelso 1.000 g'],
  'crear «Bolsa 1.000 g» genera «Consumo 1.000 g» y «Excelso 1.000 g»'
);
select throws_ok(
  $$ insert into public.articulos (nombre, tipo, unidad, atributos)
     values ('Otra bolsa de 1.000', 'insumo', 'unidad', '{"clase":"bolsa","presentacion_g":1000}') $$,
  '23505', null, 'la misma clase y presentación no se repite'
);

select lives_ok(
  $$ select public.registrar_movimientos(format('[{"articulo_id":"%s","cantidad":500,"motivo":"compra","costo_unitario":450,"ref_tipo":"core.tercero","ref_id":"%s"}]',
       pg_temp.insumo('a', 'Bolsa 500 g'), gen_random_uuid())::jsonb) $$,
  'el admin registra una compra de 500 bolsas con su proveedor'
);
select is(
  (select stock from public.v_stock where articulo_id = pg_temp.insumo('a', 'Bolsa 500 g')),
  500.000, 'la compra sube el stock en 500'
);
select ok(
  (select k.ref_tipo = 'core.tercero' and k.ref_id is not null and k.created_by = '00000000-0000-0000-0000-0000000000e1'
          and k.motivo = 'compra' and k.costo_unitario = 450
     from public.v_kardex k where k.articulo_id = pg_temp.insumo('a', 'Bolsa 500 g')),
  'el kardex guarda proveedor, usuario, motivo y costo'
);
select lives_ok(
  $$ select public.registrar_movimientos(format('[{"articulo_id":"%s","cantidad":-3,"motivo":"ajuste","observaciones":"Conteo físico"}]',
       pg_temp.insumo('a', 'Bolsa 500 g'))::jsonb) $$,
  'el admin registra un ajuste (con observación)'
);

-- Mínimo por artículo: con mínimo 200 y stock 150 hay alerta, y el de otro insumo no cambia.
select lives_ok(
  $$ update public.articulos set stock_minimo = 200 where id = pg_temp.insumo('a', 'Etiqueta 500 g') $$,
  'el admin fija el mínimo de «Etiqueta 500 g»'
);
select lives_ok(
  $$ select public.registrar_movimientos(format('[{"articulo_id":"%s","cantidad":150,"motivo":"saldo_inicial"}]',
       pg_temp.insumo('a', 'Etiqueta 500 g'))::jsonb) $$,
  'y le da 150 de saldo inicial'
);
select ok(
  (select bajo_minimo from public.v_stock where articulo_id = pg_temp.insumo('a', 'Etiqueta 500 g')),
  'con mínimo 200 y stock 150 está bajo el mínimo'
);
select ok(
  not (select bajo_minimo from public.v_stock where articulo_id = pg_temp.insumo('a', 'Etiqueta 2.500 g'))
  and (select stock_minimo is null from public.v_stock where articulo_id = pg_temp.insumo('a', 'Etiqueta 2.500 g')),
  'el mínimo de «Etiqueta 500 g» no afecta a «Etiqueta 2.500 g»'
);

-- 3. Operativo: compra sí, ajuste no ---------------------------------------------------------------------------
reset role;
select tests.autenticar_como('operativo-a@insumos.test');

select lives_ok(
  $$ select public.registrar_movimientos(format('[{"articulo_id":"%s","cantidad":100,"motivo":"compra"}]',
       pg_temp.insumo('a', 'Bolsa 2.500 g'))::jsonb) $$,
  'el operativo registra una compra'
);
select lives_ok(
  $$ select public.registrar_movimientos(format('[{"articulo_id":"%s","cantidad":-10,"motivo":"consumo"}]',
       pg_temp.insumo('a', 'Bolsa 2.500 g'))::jsonb) $$,
  'y un consumo'
);
select throws_ok(
  $$ select public.registrar_movimientos(format('[{"articulo_id":"%s","cantidad":5,"motivo":"ajuste","observaciones":"x"}]',
       pg_temp.insumo('a', 'Bolsa 2.500 g'))::jsonb) $$,
  '42501', null, 'el operativo NO registra un ajuste (RLS)'
);
select throws_ok(
  $$ insert into public.movimientos_inventario (articulo_id, cantidad, motivo, observaciones)
     values (pg_temp.insumo('a', 'Bolsa 2.500 g'), -5, 'ajuste', 'directo') $$,
  '42501', null, 'ni con un INSERT directo'
);
select is(
  tests.filas_afectadas($$ update public.articulos set stock_minimo = 5 where id = pg_temp.insumo('a', 'Bolsa 2.500 g') $$),
  0, 'el operativo no edita mínimos (RLS: 0 filas)'
);

-- 4. Nombres de usuarios ----------------------------------------------------------------------------------------
select is(
  (select array_agg(n.email order by n.email)
     from public.nombres_usuarios_tenant(array[
       '00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000e4']::uuid[]) n),
  array['admin-a@insumos.test', 'operativo-a@insumos.test'],
  'el operativo ve los emails de los miembros de su cliente, no los de otro'
);
select is(
  (select count(*)::int from public.nombres_usuarios_tenant(null)), 0, 'sin ids devuelve una lista vacía'
);

reset role;
select tests.autenticar_como('viewer-a@insumos.test');
select is(
  (select count(*)::int from public.nombres_usuarios_tenant(array['00000000-0000-0000-0000-0000000000e1']::uuid[])),
  1, 'el viewer (Gerencia) también ve quién hizo cada movimiento'
);
select throws_ok(
  $$ select public.registrar_movimientos(format('[{"articulo_id":"%s","cantidad":10,"motivo":"compra"}]',
       pg_temp.insumo('a', 'Bolsa 500 g'))::jsonb) $$,
  '42501', null, 'el viewer no registra compras'
);

reset role;
select tests.autenticar_como('owner-b@insumos.test');
select is(
  (select count(*)::int from public.nombres_usuarios_tenant(array['00000000-0000-0000-0000-0000000000e1']::uuid[])),
  0, 'otro cliente no obtiene el email de un miembro ajeno'
);
select is(
  (select count(*)::int from public.v_stock where articulo_id = pg_temp.insumo('a', 'Bolsa 500 g')),
  0, 'y tampoco ve el stock de los insumos de A'
);

reset role;
select tests.como_anon();
select throws_ok(
  $$ select * from public.nombres_usuarios_tenant(array['00000000-0000-0000-0000-0000000000e1']::uuid[]) $$,
  '42501', null, 'anon no puede llamar a nombres_usuarios_tenant()'
);

reset role;
select * from finish();
rollback;
