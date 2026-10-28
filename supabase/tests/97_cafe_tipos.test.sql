-- Tipos de café y productos terminados automáticos (FIN-102 · CO-21): cafe.tipos_cafe, RLS por tenant,
-- módulo cafe.recepcion, cafe.asegurar_productos_terminados(), sus triggers y el seed de café.
-- Todo se crea AQUÍ dentro de la transacción (rollback al final): dos clientes de café (A y B) y uno de
-- ganadería (G), sin depender de los usuarios del seed.
--   d1 owner A   d2 admin A   d3 operativo A   d4 viewer A   d5 owner B   d6 owner G (ganadería)
begin;

select plan(72);

-- 0. Preparación --------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'owner-a@cafe.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'authenticated', 'authenticated', 'admin-a@cafe.test'),
  ('00000000-0000-0000-0000-0000000000d3', 'authenticated', 'authenticated', 'operativo-a@cafe.test'),
  ('00000000-0000-0000-0000-0000000000d4', 'authenticated', 'authenticated', 'viewer-a@cafe.test'),
  ('00000000-0000-0000-0000-0000000000d5', 'authenticated', 'authenticated', 'owner-b@cafe.test'),
  ('00000000-0000-0000-0000-0000000000d6', 'authenticated', 'authenticated', 'owner-g@gan.test');

-- El alta de clientes corre como operador (service_role) y siembra café: Consumo, Excelso, los 4 insumos de
-- empaque y los 4 productos terminados.
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Café A', 'cafe-a-t', 'cafe');
select platform.crear_tenant('Café B', 'cafe-b-t', 'cafe');
select platform.crear_tenant('Granja G', 'granja-g-t', 'ganaderia');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'cafe-a-t'
union all select 'b', id from public.tenants where slug = 'cafe-b-t'
union all select 'g', id from public.tenants where slug = 'granja-g-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), m.rol::public.rol_tenant
  from (values
    ('00000000-0000-0000-0000-0000000000d1', 'a', 'owner'),
    ('00000000-0000-0000-0000-0000000000d2', 'a', 'admin'),
    ('00000000-0000-0000-0000-0000000000d3', 'a', 'operativo'),
    ('00000000-0000-0000-0000-0000000000d4', 'a', 'viewer'),
    ('00000000-0000-0000-0000-0000000000d5', 'b', 'owner'),
    ('00000000-0000-0000-0000-0000000000d6', 'g', 'owner')) as m(user_id, t, rol);

-- Ayuda: nombres de los productos terminados de un cliente.
create or replace function pg_temp.productos(p_clave text)
returns text[]
language sql
as $$
  select coalesce(array_agg(a.nombre order by a.nombre), '{}')
    from public.articulos a
   where a.tipo = 'producto_terminado' and a.tenant_id = (select id from ids where clave = p_clave)
$$;
grant execute on function pg_temp.productos(text) to authenticated;

-- 1. Estructura y privilegios -------------------------------------------------------------------------------
select has_table('cafe', 'tipos_cafe', 'existe cafe.tipos_cafe');
select ok((select relrowsecurity from pg_class where oid = 'cafe.tipos_cafe'::regclass), 'tipos_cafe tiene RLS activada');
select ok(
  not has_table_privilege('authenticated', 'cafe.tipos_cafe', 'delete')
  and not has_table_privilege('service_role', 'cafe.tipos_cafe', 'delete')
  and not has_table_privilege('anon', 'cafe.tipos_cafe', 'select'),
  'nadie borra tipos de café (se desactivan) y anon no los lee'
);
select ok(
  not has_column_privilege('authenticated', 'cafe.tipos_cafe', 'tenant_id', 'update')
  and has_column_privilege('authenticated', 'cafe.tipos_cafe', 'nombre', 'update'),
  'UPDATE por columnas: tenant_id no se toca'
);
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'cafe.asegurar_productos_terminados(uuid)'::regprocedure),
  false, 'asegurar_productos_terminados es SECURITY INVOKER'
);
select ok(
  not has_function_privilege('anon', 'cafe.asegurar_productos_terminados(uuid)', 'execute')
  and has_function_privilege('authenticated', 'cafe.asegurar_productos_terminados(uuid)', 'execute'),
  'anon no ejecuta asegurar_productos_terminados; authenticated sí'
);
select ok(
  not has_function_privilege('authenticated', 'cafe.tipos_cafe_sincronizar_productos()', 'execute')
  and not has_function_privilege('authenticated', 'cafe.bolsa_sincronizar_productos()', 'execute'),
  'las funciones de los triggers no se ejecutan a mano'
);
select is(
  (select count(*)::int from pg_trigger t where t.tgrelid = 'cafe.tipos_cafe'::regclass and not t.tgisinternal),
  4, 'tipos_cafe tiene sus 4 triggers (normalizar, set_updated, productos y auditoría)'
);

-- 2. Etiqueta de presentación (mismos casos que productos.test.ts) ----------------------------------------------------
select is(cafe.etiqueta_presentacion(250), '250 g', '250 → 250 g');
select is(cafe.etiqueta_presentacion(500), '500 g', '500 → 500 g');
select is(cafe.etiqueta_presentacion(1000), '1.000 g', '1000 → 1.000 g');
select is(cafe.etiqueta_presentacion(2500), '2.500 g', '2500 → 2.500 g');
select is(cafe.etiqueta_presentacion(12500), '12.500 g', '12500 → 12.500 g');

-- 3. seed_vertical('cafe') ------------------------------------------------------------------------------------------------
select is(
  (select array_agg(t.nombre order by t.orden) from cafe.tipos_cafe t where t.tenant_id = (select id from ids where clave = 'a')),
  array['Consumo', 'Excelso'], 'el alta deja los tipos Consumo y Excelso'
);
select ok(
  (select bool_and(t.activo) from cafe.tipos_cafe t where t.tenant_id = (select id from ids where clave = 'a')),
  'y los deja activos'
);
select is(
  pg_temp.productos('a'),
  array['Consumo 2.500 g', 'Consumo 500 g', 'Excelso 2.500 g', 'Excelso 500 g'],
  'el alta deja 4 productos terminados: tipo × presentación de bolsa'
);
select ok(
  (select bool_and(a.unidad = 'unidad' and a.activo and a.stock_minimo is null)
     from public.articulos a where a.tipo = 'producto_terminado' and a.tenant_id = (select id from ids where clave = 'a')),
  'los productos son por unidad, activos y sin stock mínimo'
);
select is(
  (select count(*)::int
     from public.articulos a
     join cafe.tipos_cafe t on t.id = (a.atributos ->> 'tipo_cafe_id')::uuid and t.tenant_id = a.tenant_id
    where a.tipo = 'producto_terminado' and a.tenant_id = (select id from ids where clave = 'a')
      and a.nombre = t.nombre || ' ' || cafe.etiqueta_presentacion((a.atributos ->> 'presentacion_g')::numeric)),
  4, 'cada producto guarda tipo_cafe_id y presentacion_g coherentes con su nombre'
);

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select platform.seed_vertical((select id from ids where clave = 'a'), 'cafe')$$,
  'seed_vertical se puede ejecutar de nuevo'
);
select is(
  (select ((select count(*) from cafe.tipos_cafe where tenant_id = i.id),
           (select count(*) from public.articulos where tenant_id = i.id and tipo = 'producto_terminado'),
           (select count(*) from public.articulos where tenant_id = i.id and tipo = 'insumo'))::text
     from ids i where i.clave = 'a'),
  '(2,4,4)', 'y no duplica tipos, productos terminados ni insumos'
);

-- seed_vertical no vuelve a sembrar «Consumo» si el cliente ya cambió su catálogo.
update cafe.tipos_cafe set nombre = 'Corriente' where tenant_id = (select id from ids where clave = 'b') and nombre = 'Consumo';
select platform.seed_vertical((select id from ids where clave = 'b'), 'cafe');
select is(
  (select array_agg(t.nombre order by t.orden) from cafe.tipos_cafe t where t.tenant_id = (select id from ids where clave = 'b')),
  array['Corriente', 'Excelso'], 'seed_vertical no repone un tipo que el cliente renombró'
);
select is(
  pg_temp.productos('b'),
  array['Corriente 2.500 g', 'Corriente 500 g', 'Excelso 2.500 g', 'Excelso 500 g'],
  'renombrar un tipo renombra sus productos terminados'
);

select is(pg_temp.productos('g'), '{}'::text[], 'ganadería no recibe productos terminados');
select is(
  (select count(*)::int from cafe.tipos_cafe where tenant_id = (select id from ids where clave = 'g')),
  0, 'ni tipos de café'
);

-- 4. Un owner/admin crea tipos y bolsas; los productos se generan solos ------------------------------------------------
reset role;
select tests.autenticar_como('owner-a@cafe.test');

select lives_ok($$insert into cafe.tipos_cafe (nombre, orden) values ('Premium', 3)$$, 'el owner crea un tipo de café');
select is(
  pg_temp.productos('a'),
  array['Consumo 2.500 g', 'Consumo 500 g', 'Excelso 2.500 g', 'Excelso 500 g', 'Premium 2.500 g', 'Premium 500 g'],
  'crear un tipo genera sus 2 productos terminados (uno por presentación de bolsa)'
);
select is(
  (select t.tenant_id from cafe.tipos_cafe t where t.nombre = 'Premium'),
  (select id from ids where clave = 'a'), 'tenant_id se estampa solo (DEFAULT tenant_actual())'
);
select ok(
  (select t.updated_at is null and t.created_by = '00000000-0000-0000-0000-0000000000d1' from cafe.tipos_cafe t where t.nombre = 'Premium'),
  'created_by lo pone la base'
);

select throws_ok($$insert into cafe.tipos_cafe (nombre) values ('premium')$$, '23505', null,
  'un nombre repetido (sin distinguir mayúsculas) se rechaza');
select throws_ok($$insert into cafe.tipos_cafe (nombre) values ('x')$$, '23514', null, 'un nombre de una letra se rechaza');
select lives_ok($$insert into cafe.tipos_cafe (nombre, orden) values ('  Especial   Tostado ', 4)$$, 'se acepta con espacios sobrantes');
select ok(
  exists (select 1 from cafe.tipos_cafe where nombre = 'Especial Tostado'),
  'y se guarda normalizado (trim y espacios colapsados)'
);

-- Una bolsa nueva de 1.000 g crea los productos de esa presentación para cada tipo activo.
select lives_ok(
  $$insert into public.articulos (nombre, tipo, unidad, atributos)
    values ('Bolsa 1.000 g', 'insumo', 'unidad', '{"clase":"bolsa","presentacion_g":1000}')$$,
  'se da de alta una bolsa de 1.000 g'
);
select is(
  (select array_agg(a.nombre order by a.nombre) from public.articulos a
    where a.tipo = 'producto_terminado' and a.atributos -> 'presentacion_g' = '1000'::jsonb),
  array['Consumo 1.000 g', 'Especial Tostado 1.000 g', 'Excelso 1.000 g', 'Premium 1.000 g'],
  'una bolsa de 1.000 g crea los productos de cada tipo activo'
);
-- Otra bolsa del mismo peso (otra marca): una sola presentación, sin duplicados.
select lives_ok(
  $$insert into public.articulos (nombre, tipo, unidad, atributos)
    values ('Bolsa 1.000 g zipper', 'insumo', 'unidad', '{"clase":"bolsa","presentacion_g":1000,"marca":"zipper"}')$$,
  'otra bolsa de 1.000 g de otra marca'
);
select is(
  (select count(*)::int from public.articulos a
    where a.tipo = 'producto_terminado' and a.atributos -> 'presentacion_g' = '1000'::jsonb),
  4, 'no duplica los productos de la presentación'
);
-- Una etiqueta o un insumo que no es bolsa no genera productos.
select lives_ok(
  $$insert into public.articulos (nombre, tipo, unidad, atributos)
    values ('Etiqueta 1.000 g', 'insumo', 'unidad', '{"clase":"etiqueta","presentacion_g":1000}')$$,
  'se da de alta una etiqueta'
);
select is(
  (select count(*)::int from public.articulos a where a.tipo = 'producto_terminado'
      and a.tenant_id = (select id from ids where clave = 'a')),
  12, 'una etiqueta no crea productos: 4 tipos × 3 presentaciones'
);

-- 5. Desactivar no borra ----------------------------------------------------------------------------------------------------
select lives_ok($$update cafe.tipos_cafe set activo = false where nombre = 'Premium'$$, 'se desactiva un tipo');
select is(
  (select count(*)::int from public.articulos a where a.tipo = 'producto_terminado' and a.nombre like 'Premium %'),
  3, 'desactivar un tipo no borra sus productos terminados'
);
select ok(
  (select bool_and(a.activo) from public.articulos a where a.tipo = 'producto_terminado' and a.nombre like 'Premium %'),
  'ni los desactiva (conservan su stock y su historia)'
);
select lives_ok(
  $$insert into public.articulos (nombre, tipo, unidad, atributos)
    values ('Bolsa 250 g', 'insumo', 'unidad', '{"clase":"bolsa","presentacion_g":250}')$$,
  'una bolsa nueva con un tipo desactivado'
);
select is(
  (select array_agg(a.nombre order by a.nombre) from public.articulos a
    where a.tipo = 'producto_terminado' and a.atributos -> 'presentacion_g' = '250'::jsonb),
  array['Consumo 250 g', 'Especial Tostado 250 g', 'Excelso 250 g'],
  'un tipo inactivo no recibe productos de la presentación nueva'
);
select lives_ok($$update cafe.tipos_cafe set activo = true where nombre = 'Premium'$$, 'se reactiva el tipo');
select is(
  (select array_agg(a.nombre order by a.nombre) from public.articulos a
    where a.tipo = 'producto_terminado' and a.nombre like 'Premium %'),
  array['Premium 1.000 g', 'Premium 2.500 g', 'Premium 250 g', 'Premium 500 g'],
  'reactivarlo crea los productos que le faltaban (la bolsa de 250 g) sin duplicar'
);

-- Renombrar arrastra el nombre de los productos.
select lives_ok($$update cafe.tipos_cafe set nombre = 'Selecto' where nombre = 'Premium'$$, 'se renombra un tipo');
select is(
  (select array_agg(a.nombre order by a.nombre) from public.articulos a
    where a.tipo = 'producto_terminado' and a.atributos ->> 'tipo_cafe_id' = (select id::text from cafe.tipos_cafe where nombre = 'Selecto')),
  array['Selecto 1.000 g', 'Selecto 2.500 g', 'Selecto 250 g', 'Selecto 500 g'],
  'los productos del tipo renombrado siguen su nombre'
);
select ok(
  (select t.updated_at is not null and t.updated_by = '00000000-0000-0000-0000-0000000000d1'
     from cafe.tipos_cafe t where t.nombre = 'Selecto'),
  'set_updated rellena updated_at/updated_by'
);

select throws_ok($$delete from cafe.tipos_cafe where nombre = 'Selecto'$$, '42501', null, 'nadie borra un tipo (sin privilegio DELETE)');

-- 6. Auditoría ---------------------------------------------------------------------------------------------------------------------
reset role;
select ok(
  (select count(*) = 1 from audit.log l
    where l.tabla = 'cafe.tipos_cafe' and l.accion = 'INSERT'
      and l.registro_id = (select id::text from cafe.tipos_cafe where nombre = 'Selecto')
      and l.tenant_id = (select id from ids where clave = 'a')),
  'crear un tipo queda en audit.log con su tenant'
);
select ok(
  (select count(*) >= 2 from audit.log l
    where l.tabla = 'cafe.tipos_cafe' and l.accion = 'UPDATE'
      and l.registro_id = (select id::text from cafe.tipos_cafe where nombre = 'Selecto')
      and l.user_id = '00000000-0000-0000-0000-0000000000d1'),
  'y sus cambios (desactivar, reactivar, renombrar), con el usuario'
);

-- 7. Roles dentro del cliente -------------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('admin-a@cafe.test');
select lives_ok($$insert into cafe.tipos_cafe (nombre, orden) values ('Pergamino seco', 5)$$, 'el admin también crea tipos');

reset role;
select tests.autenticar_como('operativo-a@cafe.test');
select is((select count(*)::int from cafe.tipos_cafe), 5, 'el operativo lee los tipos del cliente');
select throws_ok($$insert into cafe.tipos_cafe (nombre) values ('Intruso')$$, '42501', null, 'el operativo no crea tipos');
select is(
  tests.filas_afectadas($$update cafe.tipos_cafe set nombre = 'Cambiado' where nombre = 'Selecto'$$), 0,
  'ni los edita (el RLS no le deja ver la fila para escribir)'
);
select is(
  tests.filas_afectadas($$update cafe.tipos_cafe set activo = false where nombre = 'Selecto'$$), 0,
  'ni los desactiva'
);

reset role;
select tests.autenticar_como('viewer-a@cafe.test');
select is((select count(*)::int from cafe.tipos_cafe), 5, 'el viewer (gerencia) los consulta');
select throws_ok($$insert into cafe.tipos_cafe (nombre) values ('Intruso')$$, '42501', null, 'pero no crea tipos');

-- 8. Aislamiento entre clientes ---------------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('owner-b@cafe.test');
select is(
  (select array_agg(t.nombre order by t.orden) from cafe.tipos_cafe t), array['Corriente', 'Excelso'],
  'el cliente B solo ve sus tipos'
);
select is(
  tests.filas_afectadas($$update cafe.tipos_cafe set activo = false where nombre in ('Selecto', 'Consumo')$$), 0,
  'y no puede editar los de A'
);
select throws_ok(
  format($$insert into cafe.tipos_cafe (tenant_id, nombre) values (%L, 'Falso')$$, (select id from ids where clave = 'a')),
  '42501', null, 'ni crear tipos a nombre de A (WITH CHECK)'
);
select is(
  (select cafe.asegurar_productos_terminados((select id from ids where clave = 'a'))), 0,
  'asegurar_productos_terminados sobre otro cliente no crea nada (el RLS no deja ver sus tipos)'
);
reset role;
select is(
  (select count(*)::int from public.articulos where tenant_id = (select id from ids where clave = 'a') and tipo = 'producto_terminado'),
  20, 'y los productos de A siguen igual (5 tipos × 4 presentaciones)'
);

-- 9. El módulo cafe.recepcion se exige en la base ----------------------------------------------------------------------------------------
update public.tenant_modulos set activo = false
 where modulo_id = 'cafe.recepcion' and tenant_id = (select id from ids where clave = 'b');
reset role;
select tests.autenticar_como('owner-b@cafe.test');
select is((select count(*)::int from cafe.tipos_cafe), 0, 'sin cafe.recepcion el cliente no ve sus tipos');
select throws_ok($$insert into cafe.tipos_cafe (nombre) values ('Sin módulo')$$, '42501', null, 'ni crea tipos');

-- Un cliente de ganadería no tiene el módulo: no ve ni crea tipos de café.
reset role;
select tests.autenticar_como('owner-g@gan.test');
select is((select count(*)::int from cafe.tipos_cafe), 0, 'ganadería no ve tipos de café');
select throws_ok($$insert into cafe.tipos_cafe (nombre) values ('Ajeno')$$, '42501', null, 'ni los crea');
-- Y una bolsa en ganadería no genera productos terminados (el trigger solo actúa en clientes de café).
select lives_ok(
  $$insert into public.articulos (nombre, tipo, unidad, atributos)
    values ('Bolsa', 'insumo', 'unidad', '{"clase":"bolsa","presentacion_g":500}')$$,
  'ganadería da de alta un insumo «bolsa»'
);
reset role;
select is(pg_temp.productos('g'), '{}'::text[], 'y no se crea ningún producto terminado');

-- 10. Backfill de clientes de café que ya existían --------------------------------------------------------------------------------------------
-- Un cliente sin tipos pero con bolsas (como «Cofradía (demo)» antes de esta migración): se simula con el mismo
-- SQL del backfill de la migración.
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Café legado', 'cafe-legado-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);
delete from public.articulos where tenant_id = (select id from public.tenants where slug = 'cafe-legado-t') and tipo = 'producto_terminado';
delete from cafe.tipos_cafe where tenant_id = (select id from public.tenants where slug = 'cafe-legado-t');
select is(
  (select count(*)::int from public.articulos where tenant_id = (select id from public.tenants where slug = 'cafe-legado-t') and tipo = 'insumo'),
  4, 'el cliente legado tiene sus 4 insumos pero ni tipos ni productos'
);

insert into cafe.tipos_cafe (tenant_id, nombre, orden)
select t.id, s.nombre, s.orden
  from public.tenants t
 cross join (values ('Consumo', 1), ('Excelso', 2)) as s(nombre, orden)
 where t.vertical = 'cafe'
   and not exists (select 1 from cafe.tipos_cafe x where x.tenant_id = t.id);
select cafe.asegurar_productos_terminados(t.id) from public.tenants t where t.vertical = 'cafe';

select is(
  (select array_agg(a.nombre order by a.nombre) from public.articulos a
    where a.tipo = 'producto_terminado' and a.tenant_id = (select id from public.tenants where slug = 'cafe-legado-t')),
  array['Consumo 2.500 g', 'Consumo 500 g', 'Excelso 2.500 g', 'Excelso 500 g'],
  'el backfill siembra los tipos y los 4 productos del cliente legado'
);
select is(
  (select count(*)::int from cafe.tipos_cafe where tenant_id = (select id from ids where clave = 'a')), 5,
  'y no toca a los clientes que ya tenían tipos'
);

select * from finish();
rollback;
