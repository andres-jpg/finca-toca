-- B-15 · Ajustar inventario y carga inicial (FIN-157): cafe.inventario_ajustes, cafe.ajustar_inventario y
-- cafe.carga_inicial. Cubre el ajuste por cantidad nueva y por diferencia con motivo, el −3 que se corrige, que nada
-- queda negativo, la huella en el kardex y en auditoría, la carga inicial una sola vez por producto y por tipo de
-- café, los roles (solo owner/admin; el operativo recibe 42501) y el aislamiento entre clientes.
-- Todo se crea AQUÍ dentro de la transacción (rollback al final): dos clientes de café (A y B).
--   a1 owner A   a2 admin A   a3 operativo A   a4 viewer A   a5 owner B
begin;

select plan(41);

-- 0. Preparación --------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000098b1', 'authenticated', 'authenticated', 'owner-a@ajustes.test'),
  ('00000000-0000-0000-0000-0000000098b2', 'authenticated', 'authenticated', 'admin-a@ajustes.test'),
  ('00000000-0000-0000-0000-0000000098b3', 'authenticated', 'authenticated', 'operativo-a@ajustes.test'),
  ('00000000-0000-0000-0000-0000000098b4', 'authenticated', 'authenticated', 'viewer-a@ajustes.test'),
  ('00000000-0000-0000-0000-0000000098b5', 'authenticated', 'authenticated', 'owner-b@ajustes.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Ajustes A', 'ajustes-a-t', 'cafe');
select platform.crear_tenant('Ajustes B', 'ajustes-b-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'ajustes-a-t'
union all select 'b', id from public.tenants where slug = 'ajustes-b-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), m.rol::public.rol_tenant
  from (values
    ('00000000-0000-0000-0000-0000000098b1', 'a', 'owner'),
    ('00000000-0000-0000-0000-0000000098b2', 'a', 'admin'),
    ('00000000-0000-0000-0000-0000000098b3', 'a', 'operativo'),
    ('00000000-0000-0000-0000-0000000098b4', 'a', 'viewer'),
    ('00000000-0000-0000-0000-0000000098b5', 'b', 'owner')) as m(user_id, t, rol);

-- Stock inicial: A tiene Excelso 2.500 g = −3 (el dato de la prueba, que ya existía) y Consumo 500 g = 10;
-- B tiene Consumo 500 g = 4. El negativo se fabrica con una venta directa (el bloqueo es de la RPC de ventas).
insert into public.movimientos_inventario (tenant_id, articulo_id, cantidad, motivo, ref_tipo)
select a.tenant_id, a.id, s.cantidad, 'saldo_inicial', 'cafe.arranque'
  from public.articulos a
  join (values ('Consumo 500 g', 10)) as s(nombre, cantidad) on s.nombre = a.nombre
 where a.tenant_id = (select id from ids where clave = 'a') and a.tipo = 'producto_terminado';
insert into public.movimientos_inventario (tenant_id, articulo_id, cantidad, motivo)
select a.tenant_id, a.id, -3, 'venta'
  from public.articulos a
 where a.tenant_id = (select id from ids where clave = 'a') and a.nombre = 'Excelso 2.500 g';
insert into public.movimientos_inventario (tenant_id, articulo_id, cantidad, motivo, ref_tipo)
select a.tenant_id, a.id, 4, 'saldo_inicial', 'cafe.arranque'
  from public.articulos a
 where a.tenant_id = (select id from ids where clave = 'b') and a.nombre = 'Consumo 500 g';

insert into ids select 'ka', t.id from cafe.tipos_cafe t join ids i on i.id = t.tenant_id and i.clave = 'a' where t.nombre = 'Consumo';
insert into ids select 'xa', t.id from cafe.tipos_cafe t join ids i on i.id = t.tenant_id and i.clave = 'a' where t.nombre = 'Excelso';
insert into ids select 'art_a', a.id from public.articulos a join ids i on i.id = a.tenant_id and i.clave = 'a' where a.nombre = 'Consumo 500 g';
insert into ids select 'kb', t.id from cafe.tipos_cafe t join ids i on i.id = t.tenant_id and i.clave = 'b' where t.nombre = 'Consumo';

create or replace function pg_temp.stock(p_nombre text) returns numeric language sql as $$
  select stock from public.v_stock where nombre = p_nombre
$$;
grant execute on function pg_temp.stock(text) to authenticated;
create or replace function pg_temp.aid(p_nombre text) returns uuid language sql as $$
  select articulo_id from public.v_stock where nombre = p_nombre
$$;
grant execute on function pg_temp.aid(text) to authenticated;
create or replace function pg_temp.tid(p_clave text) returns uuid language sql as $$ select id from ids where clave = p_clave $$;
grant execute on function pg_temp.tid(text) to authenticated;

create or replace function pg_temp.detalle(p_sql text) returns text language plpgsql as $$
declare d text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics d = pg_exception_detail;
  return d;
end $$;
grant execute on function pg_temp.detalle(text) to authenticated;

-- Ajuste: `p_modo` nueva|diferencia; `p_extra` se mezcla encima.
create or replace function pg_temp.aj(p_nombre text, p_modo text, p_cant numeric, p_motivo text, p_extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('articulo_id', pg_temp.aid(p_nombre), 'modo', p_modo, 'cantidad', p_cant, 'motivo', p_motivo) || p_extra
$$;
grant execute on function pg_temp.aj(text, text, numeric, text, jsonb) to authenticated;

-- 1. Estructura y privilegios -------------------------------------------------------------------------------
select has_table('cafe', 'inventario_ajustes', 'existe cafe.inventario_ajustes');
select ok((select relrowsecurity from pg_class where oid = 'cafe.inventario_ajustes'::regclass), 'tiene RLS activada');
select ok(
  not has_table_privilege('authenticated', 'cafe.inventario_ajustes', 'update')
  and not has_table_privilege('authenticated', 'cafe.inventario_ajustes', 'delete')
  and not has_table_privilege('service_role', 'cafe.inventario_ajustes', 'update')
  and not has_table_privilege('service_role', 'cafe.inventario_ajustes', 'delete')
  and not has_table_privilege('anon', 'cafe.inventario_ajustes', 'select'),
  'el registro es inmutable: nadie actualiza ni borra, y anon no lo lee'
);
select ok(
  not has_function_privilege('anon', 'cafe.ajustar_inventario(jsonb)', 'execute')
  and not has_function_privilege('anon', 'cafe.carga_inicial(jsonb)', 'execute')
  and has_function_privilege('authenticated', 'cafe.ajustar_inventario(jsonb)', 'execute'),
  'anon no ejecuta las RPC'
);
select is(
  (select array_agg(p.prosecdef order by p.proname)
     from pg_proc p where p.oid in ('cafe.ajustar_inventario(jsonb)'::regprocedure, 'cafe.carga_inicial(jsonb)'::regprocedure)),
  array[false, false], 'ajustar_inventario y carga_inicial son SECURITY INVOKER'
);
select ok(
  exists (select 1 from pg_trigger t where t.tgrelid = 'cafe.inventario_ajustes'::regclass and t.tgname like 'audit%'),
  'la tabla está auditada'
);

-- 2. Ajustar: el −3 de Consumo 2.500 g -------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('admin-a@ajustes.test');

select is(pg_temp.stock('Excelso 2.500 g'), -3.000, 'punto de partida: Excelso 2.500 g en −3');
select lives_ok(
  $$select cafe.ajustar_inventario(pg_temp.aj('Excelso 2.500 g', 'nueva', 0, 'conteo_fisico', '{"observacion": "conteo del 10/11"}'))$$,
  'el admin corrige el −3 con una cantidad nueva (motivo conteo físico)'
);
select is(pg_temp.stock('Excelso 2.500 g'), 0.000, 'el stock queda en 0');
select is(
  (select row(i.tipo, i.clase, i.cantidad_antes, i.cantidad_despues, i.delta, i.motivo, i.observacion,
              i.created_by = '00000000-0000-0000-0000-0000000098b2', i.created_at is not null)::text
     from cafe.inventario_ajustes i where i.articulo_id = pg_temp.aid('Excelso 2.500 g')),
  row('ajuste', 'producto', -3.000::numeric, 0.000::numeric, 3.000::numeric, 'conteo_fisico', 'conteo del 10/11', true, true)::text,
  'queda quién, cuándo, antes → después y el motivo'
);
select is(
  (select row(m.motivo, m.cantidad, m.ref_tipo, m.observaciones)::text from public.movimientos_inventario m
    where m.articulo_id = pg_temp.aid('Excelso 2.500 g') and m.motivo = 'ajuste'),
  row('ajuste'::public.motivo_movimiento, 3.000::numeric, 'cafe.ajuste', 'Conteo físico · -3 → 0 · conteo del 10/11')::text,
  'y en el kardex del producto, con el movimiento ajuste'
);

-- 3. Ajustar por diferencia y validaciones ---------------------------------------------------------------------------------
select lives_ok(
  $$select cafe.ajustar_inventario(pg_temp.aj('Consumo 500 g', 'diferencia', -2, 'dano'))$$, 'una diferencia negativa (daño) se aplica'
);
select is(pg_temp.stock('Consumo 500 g'), 8.000, 'Consumo 500 g baja de 10 a 8');
select lives_ok(
  $$select cafe.ajustar_inventario(pg_temp.aj('Consumo 500 g', 'diferencia', 5, 'correccion'))$$, 'una diferencia positiva (corrección) también'
);
select is(pg_temp.stock('Consumo 500 g'), 13.000, 'Consumo 500 g sube a 13');
select is(
  pg_temp.detalle($q$select cafe.ajustar_inventario(pg_temp.aj('Consumo 500 g', 'diferencia', -20, 'dano'))$q$),
  'El ajuste dejaría Consumo 500 g en -7. El stock no puede quedar negativo.', 'un ajuste no deja el stock en negativo'
);
select throws_ok(
  $$select cafe.ajustar_inventario(pg_temp.aj('Consumo 500 g', 'diferencia', -20, 'dano'))$$,
  'P0001', 'ajuste_deja_negativo', 'con el código de negocio ajuste_deja_negativo'
);
select throws_ok(
  $$select cafe.ajustar_inventario(pg_temp.aj('Consumo 500 g', 'nueva', 13, 'conteo_fisico'))$$, 'P0001', 'sin_cambios', 'dejar el mismo stock: sin_cambios'
);
select throws_ok(
  $$select cafe.ajustar_inventario(pg_temp.aj('Consumo 500 g', 'nueva', 5, 'otro'))$$, 'P0001', 'motivo_requerido', 'el motivo es obligatorio y de la lista'
);
select throws_ok(
  $$select cafe.ajustar_inventario(jsonb_build_object('articulo_id', pg_temp.aid('Consumo 500 g'), 'modo', 'nueva', 'cantidad', 5))$$,
  'P0001', 'datos_invalidos', 'sin motivo: datos_invalidos'
);
select throws_ok(
  $$select cafe.ajustar_inventario(pg_temp.aj('Consumo 500 g', 'nueva', 2.5, 'conteo_fisico'))$$, 'P0001', 'datos_invalidos', 'las unidades son enteras'
);
select throws_ok(
  $$select cafe.ajustar_inventario(pg_temp.aj('Bolsa 500 g', 'nueva', 5, 'conteo_fisico'))$$, 'P0001', 'articulo_no_encontrado', 'un insumo no se ajusta aquí'
);
select is(
  (select count(*)::int from cafe.inventario_ajustes where tipo = 'ajuste'), 3, 'solo quedaron los 3 ajustes válidos (los rechazados no escriben nada)'
);

-- 4. Carga inicial -----------------------------------------------------------------------------------------------------------------
select lives_ok(
  $$select cafe.carga_inicial(jsonb_build_object('clase', 'producto', 'articulo_id', pg_temp.aid('Excelso 500 g'), 'cantidad', 48, 'costo_unitario', 18969))$$,
  'carga inicial de un producto terminado'
);
select is(pg_temp.stock('Excelso 500 g'), 48.000, 'el stock es la carga');
select is(
  (select row(m.motivo, m.costo_unitario, m.ref_tipo)::text from public.movimientos_inventario m
    where m.articulo_id = pg_temp.aid('Excelso 500 g')),
  row('saldo_inicial'::public.motivo_movimiento, 18969.00::numeric, 'cafe.arranque')::text,
  'entra al kardex como saldo inicial con su costo, sin compra ni factura'
);
select is(
  pg_temp.detalle($q$select cafe.carga_inicial(jsonb_build_object('clase', 'producto', 'articulo_id', pg_temp.aid('Excelso 500 g'), 'cantidad', 5, 'costo_unitario', 1))$q$),
  'Este producto ya tiene carga inicial. Usar "Ajustar inventario".', 'una segunda carga del mismo producto se rechaza con el mensaje de la guía'
);
select throws_ok(
  $$select cafe.carga_inicial(jsonb_build_object('clase', 'producto', 'articulo_id', pg_temp.aid('Excelso 500 g'), 'cantidad', 5, 'costo_unitario', 1))$$,
  'P0001', 'carga_inicial_existente', 'con el código carga_inicial_existente'
);
select lives_ok(
  $$select cafe.carga_inicial(jsonb_build_object('clase', 'verde', 'tipo_cafe_id', pg_temp.tid('xa'), 'cantidad', 202.5, 'costo_unitario', 28500))$$,
  'carga inicial de café verde por tipo de café'
);
select lives_ok(
  $$select cafe.carga_inicial(jsonb_build_object('clase', 'tostado', 'tipo_cafe_id', pg_temp.tid('xa'), 'cantidad', 12, 'costo_unitario', 35000))$$,
  'y de tostado sin empacar del mismo tipo (otra etapa)'
);
select throws_ok(
  $$select cafe.carga_inicial(jsonb_build_object('clase', 'verde', 'tipo_cafe_id', pg_temp.tid('xa'), 'cantidad', 1, 'costo_unitario', 1))$$,
  'P0001', 'carga_inicial_existente', 'el café verde de un tipo solo se carga una vez'
);
select throws_ok(
  $$select cafe.carga_inicial(jsonb_build_object('clase', 'verde', 'tipo_cafe_id', pg_temp.tid('xa'), 'cantidad', 0, 'costo_unitario', 1))$$,
  'P0001', 'datos_invalidos', 'la cantidad de la carga es mayor que cero'
);
select is(
  (select sum(i.cantidad_despues) from cafe.inventario_ajustes i where i.tipo = 'carga_inicial' and i.clase = 'verde'), 202.500::numeric,
  'el saldo de café verde queda en el registro (la pantalla lo suma a los lotes)'
);

-- 5. Roles -----------------------------------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('operativo-a@ajustes.test');
select throws_ok(
  $$select cafe.ajustar_inventario(pg_temp.aj('Consumo 500 g', 'nueva', 5, 'conteo_fisico'))$$, '42501', 'no_autorizado', 'un operativo no ajusta'
);
select throws_ok(
  $$select cafe.carga_inicial(jsonb_build_object('clase', 'producto', 'articulo_id', pg_temp.aid('Consumo 500 g'), 'cantidad', 5, 'costo_unitario', 1))$$,
  '42501', 'no_autorizado', 'ni hace carga inicial'
);
select throws_ok(
  $$insert into cafe.inventario_ajustes (tipo, clase, articulo_id, cantidad_antes, cantidad_despues, motivo)
    values ('ajuste', 'producto', pg_temp.aid('Consumo 500 g'), 13, 5, 'correccion')$$,
  '42501', null, 'tampoco por insert directo (RLS)'
);
select is((select count(*)::int from cafe.inventario_ajustes), 6, 'pero sí ve los ajustes y cargas del cliente (la pantalla suma las cargas)');
reset role;
select tests.autenticar_como('viewer-a@ajustes.test');
select throws_ok(
  $$select cafe.ajustar_inventario(pg_temp.aj('Consumo 500 g', 'nueva', 5, 'conteo_fisico'))$$, '42501', 'no_autorizado', 'Gerencia (viewer) tampoco ajusta'
);

-- 6. Aislamiento entre clientes ------------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('owner-b@ajustes.test');
select is((select count(*)::int from cafe.inventario_ajustes), 0, 'otro cliente no ve los ajustes ni las cargas de A');
select throws_ok(
  format($q$select cafe.ajustar_inventario(jsonb_build_object('articulo_id', %L, 'modo', 'nueva', 'cantidad', 1, 'motivo', 'dano'))$q$,
         pg_temp.tid('art_a')),
  'P0001', 'articulo_no_encontrado', 'ni ajusta un producto de A'
);

-- 7. Auditoría -------------------------------------------------------------------------------------------------------------------------
reset role;
select ok(
  exists (select 1 from audit.log l where l.tabla = 'cafe.inventario_ajustes' and l.accion = 'INSERT'),
  'los ajustes y cargas quedan en audit.log'
);

select * from finish();
rollback;
