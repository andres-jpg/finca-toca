-- Maestro de terceros (FIN-93 · CO-13): terceros, normalización, RLS por tenant y módulo, consumidor
-- final, buscar_terceros_similares() y auditoría.
-- Usuarios del seed (password123): admin@vb.test, user@vb.test (operativo), viewer@vb.test (Villa Blanca)
-- y admin@velero.test (El Velero). Ningún cliente tiene `core.terceros` de serie: el test se lo activa a
-- Villa Blanca y a El Velero DENTRO de la transacción (rollback al final).
--   v01 Café Pepe S.A.S. (NIT 9001234567, VB)   v02 operativo   v03 viewer-bait   e01 El Velero
begin;

select plan(98);

-- Helper: `detail` con el que falla una sentencia (lo que callRpc entrega como `message`).
create or replace function pg_temp.detalle_de(p_sql text)
returns text
language plpgsql
as $$
declare
  v_detalle text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_detalle = pg_exception_detail;
  return v_detalle;
end $$;
grant execute on function pg_temp.detalle_de(text) to authenticated;

create temp table ids (clave text primary key, id uuid);
grant all on ids to authenticated;
-- `authenticated` no lee auth.users: los ids de los usuarios del seed se guardan antes de cambiar de rol.
create temp table usuarios as select id, email::text from auth.users;
grant select on usuarios to authenticated;

-- 0. Estructura y privilegios -------------------------------------------------------------------------
select has_table('public', 'terceros', 'existe terceros');
select enum_has_labels('public', 'tipo_identificacion', array['NIT', 'CC', 'CE', 'PAS', 'OTRO'],
  'tipo_identificacion tiene sus 5 valores');
select ok((select relrowsecurity from pg_class where oid = 'public.terceros'::regclass), 'terceros tiene RLS activada');
select ok(
  not has_table_privilege('authenticated', 'public.terceros', 'delete')
  and not has_table_privilege('service_role', 'public.terceros', 'delete')
  and not has_table_privilege('authenticated', 'public.terceros', 'truncate'),
  'nadie borra terceros (se desactivan)'
);
select ok(
  not has_table_privilege('anon', 'public.terceros', 'select')
  and not has_table_privilege('anon', 'public.terceros', 'insert'),
  'anon no lee ni escribe terceros'
);
select ok(
  not has_column_privilege('authenticated', 'public.terceros', 'es_consumidor_final', 'update')
  and not has_column_privilege('authenticated', 'public.terceros', 'tenant_id', 'update')
  and has_column_privilege('authenticated', 'public.terceros', 'nombre', 'update'),
  'UPDATE por columnas: tenant_id y es_consumidor_final no se tocan'
);
select is(
  (select array_agg(p.prosecdef order by p.proname) from pg_proc p
    where p.oid in ('public.asegurar_consumidor_final(uuid)'::regprocedure,
                    'public.buscar_terceros_similares(text, text)'::regprocedure)),
  array[false, false], 'asegurar_consumidor_final y buscar_terceros_similares son SECURITY INVOKER'
);
select is(
  (select p.provolatile::text from pg_proc p where p.oid = 'public.buscar_terceros_similares(text, text)'::regprocedure),
  's', 'buscar_terceros_similares es STABLE'
);
select ok(
  not has_function_privilege('anon', 'public.buscar_terceros_similares(text, text)', 'execute')
  and not has_function_privilege('anon', 'public.asegurar_consumidor_final(uuid)', 'execute')
  and has_function_privilege('authenticated', 'public.buscar_terceros_similares(text, text)', 'execute')
  and has_function_privilege('authenticated', 'public.asegurar_consumidor_final(uuid)', 'execute'),
  'anon no ejecuta las funciones; authenticated sí'
);
select ok(
  not has_function_privilege('authenticated', 'public.terceros_normalizar()', 'execute')
  and not has_function_privilege('authenticated', 'public.terceros_proteger_consumidor_final()', 'execute'),
  'las funciones de los triggers no se ejecutan a mano'
);
select ok(
  (select count(*) from pg_indexes where tablename = 'terceros' and indexdef ilike '%gin_trgm_ops%') = 1
  and (select count(*) from pg_indexes where tablename = 'terceros' and indexname = 'terceros_un_consumidor_final') = 1,
  'existen el índice de trigramas y el de un solo consumidor final'
);
select is(
  (select array_agg(tgname::text order by tgname) from pg_trigger
    where tgrelid = 'public.terceros'::regclass and not tgisinternal),
  array['audit_terceros', 'set_updated', 'terceros_normalizar', 'terceros_proteger_consumidor_final'],
  'terceros tiene sus triggers (auditoría, set_updated, normalizar y proteger consumidor final)'
);

-- 1. Normalización (SQL) ----------------------------------------------------------------------------
select is(public.normalizar_identificacion(' 900.123.456-7 '), '9001234567', 'identificación sin puntos, guiones ni espacios');
select is(public.normalizar_identificacion('900 123 456 7'), '9001234567', 'espacios fuera');
select is(public.normalizar_identificacion('ab-12.3'), 'AB123', 'se pasa a mayúsculas (pasaportes)');
select is(public.normalizar_identificacion(null), '', 'null → cadena vacía');
select is(public.normalizar_nombre('  Café    Pepe   S.A.S.  '), 'Café Pepe S.A.S.', 'nombre con trim y espacios colapsados');
select is(public.normalizar_nombre(E'a\t b\n c'), 'a b c', 'tabuladores y saltos de línea también se colapsan');

-- 2. Sin el módulo activo no se ve ni se escribe nada -----------------------------------------------------
-- (Ningún cliente del seed tiene core.terceros.) El dato lo siembra postgres.
select is(
  (select count(*)::int from public.tenant_modulos where modulo_id = 'core.terceros'),
  0, 'de serie, ningún cliente tiene core.terceros'
);
insert into public.terceros (id, tenant_id, tipo_identificacion, identificacion, nombre, direccion, telefono, roles)
values ('90000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000a2', 'NIT', '8001', 'Tostadora El Velero',
        'Calle 1', '3000000', array['proveedor']);

reset role;
select tests.autenticar_como('admin@velero.test');
select is((select count(*)::int from public.terceros), 0, 'sin el módulo, ni el admin del propio cliente lee terceros');
select throws_ok(
  $$ insert into public.terceros (nombre, identificacion, direccion, telefono, roles)
     values ('Sin módulo', '1', 'x', 'y', array['cliente']) $$,
  '42501', null, 'sin el módulo, ni el admin inserta terceros'
);
select is(
  tests.filas_afectadas($$ update public.terceros set nombre = 'Hackeado' where id = '90000000-0000-0000-0000-0000000000e1' $$),
  0, 'sin el módulo, ni el admin actualiza terceros'
);
select is((select count(*)::int from public.buscar_terceros_similares('Tostadora El Velero', '8001')), 0,
  'sin el módulo, buscar_terceros_similares no devuelve nada');

-- A partir de aquí los dos clientes tienen el módulo.
reset role;
insert into public.tenant_modulos (tenant_id, modulo_id)
select id, 'core.terceros' from public.tenants where slug in ('villa-blanca', 'el-velero');

-- 3. Altas y normalización por trigger (admin de Villa Blanca) -----------------------------------------------
reset role;
select tests.autenticar_como('admin@vb.test');

select lives_ok(
  $$ insert into public.terceros (id, tipo_identificacion, identificacion, digito_verificacion, nombre, direccion, telefono, email, roles)
     values ('90000000-0000-0000-0000-0000000000a1', 'NIT', '900.123.456-7', 7, '  Café   Pepe  S.A.S. ',
             '  Calle 10   # 5-20 ', '300 123 4567', '  Pepe@Cafe.CO ', array['proveedor', 'cliente']) $$,
  'el admin crea un tercero con varios roles'
);
select is(
  (select identificacion from public.terceros where id = '90000000-0000-0000-0000-0000000000a1'),
  '9001234567', 'la identificación se guarda normalizada (900.123.456-7 → 9001234567)'
);
select is(
  (select nombre from public.terceros where id = '90000000-0000-0000-0000-0000000000a1'),
  'Café Pepe S.A.S.', 'el nombre se guarda con trim y espacios colapsados'
);
select is(
  (select direccion || '|' || telefono || '|' || email from public.terceros where id = '90000000-0000-0000-0000-0000000000a1'),
  'Calle 10 # 5-20|300 123 4567|pepe@cafe.co', 'dirección y teléfono con trim/colapso; el correo en minúsculas'
);
select is(
  (select tenant_id from public.terceros where id = '90000000-0000-0000-0000-0000000000a1'),
  '00000000-0000-0000-0000-0000000000a1'::uuid, 'tenant_id lo estampa el DEFAULT tenant_actual()'
);
select is(
  (select roles from public.terceros where id = '90000000-0000-0000-0000-0000000000a1'),
  array['proveedor', 'cliente'], 'un tercero combina roles'
);
select is(
  (select created_by from public.terceros where id = '90000000-0000-0000-0000-0000000000a1'),
  (select id from usuarios where email = 'admin@vb.test'), 'created_by lo estampa auth.uid()'
);

-- 4. Unicidad de la identificación (normalizada, por tipo y tenant) ---------------------------------------------
select throws_ok(
  $$ insert into public.terceros (tipo_identificacion, identificacion, nombre, direccion, telefono, roles)
     values ('NIT', '9001234567', 'Otro nombre', 'x', 'y', array['cliente']) $$,
  '23505', null, 'la misma identificación escrita sin formato choca (23505)'
);
select throws_ok(
  $$ insert into public.terceros (tipo_identificacion, identificacion, nombre, direccion, telefono, roles)
     values ('NIT', '900 123 456 7', 'Otro nombre', 'x', 'y', array['cliente']) $$,
  '23505', null, 'con espacios en vez de puntos y guion también choca'
);
select throws_ok(
  $$ insert into public.terceros (tipo_identificacion, identificacion, nombre, direccion, telefono, roles)
     values ('NIT', '900.123.456-7', 'Otro nombre', 'x', 'y', array['cliente']) $$,
  '23505', null, 'con el formato original también choca'
);
select lives_ok(
  $$ insert into public.terceros (tipo_identificacion, identificacion, nombre, direccion, telefono, roles)
     values ('CC', '9001234567', 'Persona con esa cédula', 'x', 'y', array['cliente']) $$,
  'el mismo número con otro tipo de identificación no choca con el índice'
);

-- 5. Restricciones de datos -------------------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.terceros (identificacion, nombre, direccion, telefono, roles)
     values ('11', 'Rol malo', 'x', 'y', array['vendedor']) $$,
  '23514', null, 'un rol fuera del catálogo se rechaza'
);
select throws_ok(
  $$ insert into public.terceros (identificacion, nombre, direccion, telefono, email, roles)
     values ('12', 'Correo malo', 'x', 'y', 'no-es-un-correo', array['cliente']) $$,
  '23514', null, 'un correo mal formado se rechaza'
);
select lives_ok(
  $$ insert into public.terceros (identificacion, nombre, direccion, telefono, email, roles)
     values ('13', 'Sin correo', 'x', 'y', null, array['cliente']) $$,
  'el correo es opcional'
);
select throws_ok(
  $$ insert into public.terceros (identificacion, nombre, direccion, telefono, roles)
     values ('14', 'Sin dirección', '   ', 'y', array['cliente']) $$,
  '23514', null, 'la dirección es obligatoria'
);
select throws_ok(
  $$ insert into public.terceros (identificacion, nombre, direccion, telefono, roles)
     values ('15', 'Sin teléfono', 'x', '', array['cliente']) $$,
  '23514', null, 'el teléfono es obligatorio'
);
select throws_ok(
  $$ insert into public.terceros (identificacion, nombre, direccion, telefono, roles)
     values ('   ', 'Sin identificación', 'x', 'y', array['cliente']) $$,
  '23514', null, 'la identificación no puede quedar vacía tras normalizar'
);
select throws_ok(
  $$ insert into public.terceros (identificacion, nombre, direccion, telefono, roles)
     values ('16', 'A', 'x', 'y', array['cliente']) $$,
  '23514', null, 'el nombre necesita al menos 2 caracteres'
);
select throws_ok(
  $$ insert into public.terceros (identificacion, digito_verificacion, nombre, direccion, telefono, roles)
     values ('17', 10, 'Dígito malo', 'x', 'y', array['cliente']) $$,
  '23514', null, 'el dígito de verificación va de 0 a 9'
);
select lives_ok(
  $$ insert into public.terceros (identificacion, nombre, direccion, telefono) values ('18', 'Sin roles', 'x', 'y') $$,
  'roles puede quedar vacío en la base (la obligatoriedad de al menos uno es del formulario)'
);

-- 6. Edición: set_updated y columnas protegidas -------------------------------------------------------------------
select lives_ok(
  $$ update public.terceros set telefono = '3009998888', roles = array['cliente_servicio'] where id = '90000000-0000-0000-0000-0000000000a1' $$,
  'el admin edita datos maestros y roles'
);
select ok(
  (select updated_at is not null and updated_by = (select id from usuarios where email = 'admin@vb.test')
     from public.terceros where id = '90000000-0000-0000-0000-0000000000a1'),
  'set_updated rellena updated_at y updated_by'
);
select throws_ok(
  $$ update public.terceros set es_consumidor_final = true where id = '90000000-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'es_consumidor_final no se actualiza (sin privilegio de columna)'
);
select throws_ok(
  $$ update public.terceros set tenant_id = '00000000-0000-0000-0000-0000000000a2' where id = '90000000-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'tenant_id no se actualiza'
);
select lives_ok(
  $$ update public.terceros set activo = false where id = '90000000-0000-0000-0000-0000000000a1' $$,
  'desactivar es un UPDATE normal'
);
select is(
  (select activo from public.terceros where id = '90000000-0000-0000-0000-0000000000a1'),
  false, 'el tercero queda inactivo (no se borra)'
);
update public.terceros set activo = true where id = '90000000-0000-0000-0000-0000000000a1';
select throws_ok(
  $$ delete from public.terceros where id = '90000000-0000-0000-0000-0000000000a1' $$,
  '42501', null, 'nadie borra terceros: ni el admin'
);

-- 7. Roles del tenant: operativo inserta, no actualiza; viewer solo lee --------------------------------------------------
reset role;
select tests.autenticar_como('user@vb.test');
select lives_ok(
  $$ insert into public.terceros (id, identificacion, nombre, direccion, telefono, roles)
     values ('90000000-0000-0000-0000-0000000000a2', '700', 'Creado en línea', 'x', 'y', array['proveedor']) $$,
  'el operativo inserta (alta en línea desde una recepción o una venta)'
);
select is(
  tests.filas_afectadas($$ update public.terceros set nombre = 'Cambiado por operativo' where id = '90000000-0000-0000-0000-0000000000a2' $$),
  0, 'el operativo no actualiza ni lo que acaba de crear'
);
select is(
  (select nombre from public.terceros where id = '90000000-0000-0000-0000-0000000000a2'),
  'Creado en línea', 'y el dato sigue igual'
);
select ok((select count(*) from public.terceros) >= 4, 'el operativo lee los terceros del cliente');
select throws_ok(
  $$ delete from public.terceros where id = '90000000-0000-0000-0000-0000000000a2' $$,
  '42501', null, 'el operativo tampoco borra'
);

reset role;
select tests.autenticar_como('viewer@vb.test');
select throws_ok(
  $$ insert into public.terceros (identificacion, nombre, direccion, telefono, roles)
     values ('800', 'Viewer no inserta', 'x', 'y', array['cliente']) $$,
  '42501', null, 'el viewer no inserta'
);
select is(
  tests.filas_afectadas($$ update public.terceros set nombre = 'Cambiado por viewer' where id = '90000000-0000-0000-0000-0000000000a1' $$),
  0, 'el viewer no actualiza'
);
select ok((select count(*) from public.terceros) >= 4, 'el viewer sí lee');
select throws_ok(
  $$ select public.asegurar_consumidor_final() $$,
  '42501', null, 'el viewer no puede crear el consumidor final'
);

-- 8. Aislamiento entre tenants (los dos con el módulo activo) -----------------------------------------------------------------
reset role;
select tests.autenticar_como('admin@velero.test');
select is(
  (select count(*)::int from public.terceros where id in
    ('90000000-0000-0000-0000-0000000000a1', '90000000-0000-0000-0000-0000000000a2')),
  0, 'El Velero no ve los terceros de Villa Blanca'
);
select is((select count(*)::int from public.terceros), 1, 'El Velero ve solo el suyo');
select is(
  tests.filas_afectadas($$ update public.terceros set nombre = 'Robado' where id = '90000000-0000-0000-0000-0000000000a1' $$),
  0, 'El Velero no actualiza terceros de Villa Blanca'
);
select throws_ok(
  $$ insert into public.terceros (tenant_id, identificacion, nombre, direccion, telefono, roles)
     values ('00000000-0000-0000-0000-0000000000a1', '900', 'Colado en VB', 'x', 'y', array['cliente']) $$,
  '42501', null, 'El Velero no inserta con el tenant_id de otro cliente (WITH CHECK)'
);
select lives_ok(
  $$ insert into public.terceros (tipo_identificacion, identificacion, nombre, direccion, telefono, roles)
     values ('NIT', '900.123.456-7', 'Café Pepe en El Velero', 'x', 'y', array['cliente']) $$,
  'la misma identificación puede existir en otro cliente (la unicidad es por tenant)'
);
select is(
  (select count(*)::int from public.buscar_terceros_similares('Café Pepe S.A.S.', '9001234567')), 1,
  'buscar_terceros_similares solo ve el cliente actual (no el de Villa Blanca)'
);

-- 9. Consumidor final ------------------------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('user@vb.test');
insert into ids select 'cf1', public.asegurar_consumidor_final();
insert into ids select 'cf2', public.asegurar_consumidor_final();
select ok((select id from ids where clave = 'cf1') is not null, 'el operativo crea el consumidor final');
select is((select id from ids where clave = 'cf1'), (select id from ids where clave = 'cf2'),
  'asegurar_consumidor_final es idempotente: devuelve el mismo id');
select is(
  (select count(*)::int from public.terceros where es_consumidor_final), 1, 'hay un único consumidor final'
);
select is(
  (select nombre || '|' || tipo_identificacion || '|' || identificacion || '|' || direccion || '|' || telefono || '|' || roles::text
     from public.terceros where es_consumidor_final),
  'Consumidor final|OTRO|222222222222|N/A|N/A|{cliente}', 'con los datos canónicos'
);

reset role;
select tests.autenticar_como('admin@vb.test');
select is(
  pg_temp.detalle_de($$ update public.terceros set nombre = 'Otro nombre' where es_consumidor_final $$),
  'El tercero "Consumidor final" es un registro del sistema: no se edita ni se desactiva.',
  'el consumidor final no se edita (ni el admin)'
);
select throws_ok(
  $$ update public.terceros set activo = false where es_consumidor_final $$,
  'P0001', 'consumidor_final_protegido', 'el consumidor final no se desactiva'
);
select throws_ok(
  $$ update public.terceros set telefono = '1' where es_consumidor_final $$,
  'P0001', 'consumidor_final_protegido', 'ni siquiera un campo suelto'
);
select throws_ok(
  $$ insert into public.terceros (identificacion, nombre, direccion, telefono, roles, es_consumidor_final)
     values ('999', 'Segundo consumidor', 'x', 'y', array['cliente'], true) $$,
  '23505', null, 'no puede haber un segundo consumidor final en el cliente'
);
select is(
  (select count(*)::int from public.terceros where es_consumidor_final), 1, 'sigue habiendo uno solo'
);
select is(public.asegurar_consumidor_final(), (select id from ids where clave = 'cf1'), 'el admin recibe el mismo id');
select throws_ok(
  $$ select public.asegurar_consumidor_final('00000000-0000-0000-0000-0000000000a2') $$,
  '42501', null, 'con sesión no se puede crear el consumidor final de otro cliente'
);

-- Un consumidor final "falso" insertado a mano en otro cliente queda con los datos canónicos.
reset role;
select tests.autenticar_como('admin@velero.test');
select lives_ok(
  $$ insert into public.terceros (identificacion, nombre, direccion, telefono, roles, es_consumidor_final)
     values ('555', 'Falso consumidor', 'Calle falsa', '123', array['proveedor'], true) $$,
  'se puede marcar un alta como consumidor final...'
);
select is(
  (select nombre || '|' || identificacion || '|' || roles::text from public.terceros where es_consumidor_final),
  'Consumidor final|222222222222|{cliente}', '... pero el trigger la deja con los datos canónicos'
);
select is(
  public.asegurar_consumidor_final(), (select id from public.terceros where es_consumidor_final),
  'y asegurar_consumidor_final lo reconoce'
);

-- Como el alta de clientes / el seed: sin sesión y con tenant explícito.
reset role;
insert into public.tenants (id, nombre, slug, vertical)
values ('00000000-0000-0000-0000-0000000000a9', 'Cliente de prueba', 'prueba-terceros', 'ganaderia');
insert into public.tenant_modulos (tenant_id, modulo_id) values ('00000000-0000-0000-0000-0000000000a9', 'core.terceros');
select isnt(
  public.asegurar_consumidor_final('00000000-0000-0000-0000-0000000000a9'), null,
  'el alta de clientes lo crea pasando el tenant (sin sesión)'
);
select is(
  public.asegurar_consumidor_final('00000000-0000-0000-0000-0000000000a9'),
  (select id from public.terceros where tenant_id = '00000000-0000-0000-0000-0000000000a9' and es_consumidor_final),
  'sin sesión también es idempotente'
);
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
select throws_ok(
  $$ select public.asegurar_consumidor_final() $$, '42501', null, 'sin sesión ni tenant no hay a quién crearlo'
);
-- La identificación 222222222222 ocupada por otro tercero: no se pisa.
insert into public.tenants (id, nombre, slug, vertical)
values ('00000000-0000-0000-0000-0000000000a8', 'Cliente con 222', 'prueba-terceros-2', 'ganaderia');
insert into public.terceros (tenant_id, tipo_identificacion, identificacion, nombre, direccion, telefono)
values ('00000000-0000-0000-0000-0000000000a8', 'OTRO', '222222222222', 'Alguien con ese número', 'x', 'y');
select is(
  pg_temp.detalle_de($$ select public.asegurar_consumidor_final('00000000-0000-0000-0000-0000000000a8') $$),
  'La identificación 222222222222 ya pertenece a otro tercero: no se puede crear el Consumidor final.',
  'si otro tercero ocupa 222222222222, falla con consumidor_final_no_disponible'
);

-- 10. buscar_terceros_similares ------------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('admin@vb.test');
reset role;
insert into public.terceros (tenant_id, identificacion, nombre, direccion, telefono, roles) values
  ('00000000-0000-0000-0000-0000000000a1', '1001', 'Distribuidora La Esperanza', 'x', 'y', array['cliente']),
  ('00000000-0000-0000-0000-0000000000a1', '1002', 'Distribuidora Esperanza SAS', 'x', 'y', array['cliente']),
  ('00000000-0000-0000-0000-0000000000a1', '1003', 'Distribuidora La Esperanza Norte', 'x', 'y', array['cliente']),
  ('00000000-0000-0000-0000-0000000000a1', '1004', 'Distribuidora La Esperanza Sur', 'x', 'y', array['cliente']),
  ('00000000-0000-0000-0000-0000000000a1', '1005', 'Distribuidora La Esperanza Este', 'x', 'y', array['cliente']),
  ('00000000-0000-0000-0000-0000000000a1', '1006', 'Distribuidora La Esperanza Oeste', 'x', 'y', array['cliente']);
reset role;
select tests.autenticar_como('admin@vb.test');

select is(
  (select count(*)::int from public.buscar_terceros_similares('Distribuidora La Esperanza', null)),
  5, 'devuelve como máximo 5 resultados'
);
select is(
  (select identificacion from public.buscar_terceros_similares('Nombre que no se parece a nadie', '1.0.0.2')),
  '1002', 'encuentra por identificación normalizada (1.0.0.2 = 1002) aunque el nombre no se parezca'
);
select is(
  (select nombre from public.buscar_terceros_similares('Distribuidora La Esperanza', '1.0.0.6') limit 1),
  'Distribuidora La Esperanza Oeste', 'la coincidencia de identificación va primero'
);
select is(
  (select nombre from public.buscar_terceros_similares('distribuidora   la esperanza', null) limit 1),
  'Distribuidora La Esperanza', 'el nombre idéntico va primero y no distingue mayúsculas ni espacios de más'
);
select is(
  (select count(*)::int from public.buscar_terceros_similares('Panadería Nada Que Ver', null)),
  0, 'un nombre sin parecido y sin identificación no devuelve nada'
);
select is(
  (select count(*)::int from public.buscar_terceros_similares(null, null)), 0, 'sin criterios no devuelve nada'
);
select is(
  (select count(*)::int from public.buscar_terceros_similares('', '   ')), 0, 'criterios en blanco tampoco'
);
select ok(
  exists (select 1 from public.buscar_terceros_similares('Cafe Pepe SAS', null) where identificacion = '9001234567'),
  'sin tildes ni puntos aún lo encuentra (Cafe Pepe SAS ~ Café Pepe S.A.S.), aunque esté inactivo/cambiado de rol'
);

-- 11. Auditoría -------------------------------------------------------------------------------------------------------------------------
reset role;
select ok(
  (select count(*) from audit.log where tabla = 'public.terceros' and registro_id = '90000000-0000-0000-0000-0000000000a1'
      and accion = 'INSERT') = 1,
  'el alta del tercero deja una fila INSERT en audit.log'
);
select ok(
  (select count(*) from audit.log where tabla = 'public.terceros' and registro_id = '90000000-0000-0000-0000-0000000000a1'
      and accion = 'UPDATE') >= 1,
  'las ediciones dejan filas UPDATE'
);
select is(
  (select tenant_id from audit.log where tabla = 'public.terceros' and registro_id = '90000000-0000-0000-0000-0000000000a1'
      and accion = 'INSERT'),
  '00000000-0000-0000-0000-0000000000a1'::uuid, 'el log toma el tenant_id de la fila'
);

-- 12. Desactivar el módulo corta el acceso (sin deploy) ---------------------------------------------------------------------------------------
update public.tenant_modulos set activo = false
 where modulo_id = 'core.terceros' and tenant_id = '00000000-0000-0000-0000-0000000000a1';
reset role;
select tests.autenticar_como('admin@vb.test');
select is((select count(*)::int from public.terceros), 0, 'con el módulo desactivado el cliente deja de ver terceros');
select throws_ok(
  $$ insert into public.terceros (identificacion, nombre, direccion, telefono, roles)
     values ('2000', 'Tras desactivar', 'x', 'y', array['cliente']) $$,
  '42501', null, 'y deja de poder crearlos'
);
reset role;
select tests.autenticar_como('admin@velero.test');
select ok((select count(*) from public.terceros) >= 1, 'El Velero, que lo conserva, sigue viéndolos');

-- 13. Un cliente nunca activado ve la tabla vacía ----------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('coop.admin@test');
select is((select count(*)::int from public.terceros), 0, 'la cooperativa (sin el módulo y sin rol de finca) no ve terceros');

select * from finish();
rollback;
