-- Convertir presentación (A-15 · FIN-133): cafe.conversiones_presentacion y cafe.convertir_presentacion.
-- Ejemplo: 2 x 2.500 g -> 10 x 500 g (kg cuadran), bolsas/etiquetas del destino, traza en el lote de origen, aviso si
-- los kg no cuadran, errores, roles y aislamiento. Todo se crea dentro de la transaccion (rollback al final).
begin;

select plan(22);

-- 0. Preparación --------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000099a1', 'authenticated', 'authenticated', 'owner-a@conversion.test'),
  ('00000000-0000-0000-0000-0000000099a2', 'authenticated', 'authenticated', 'admin-a@conversion.test'),
  ('00000000-0000-0000-0000-0000000099a3', 'authenticated', 'authenticated', 'operativo-a@conversion.test'),
  ('00000000-0000-0000-0000-0000000099a4', 'authenticated', 'authenticated', 'viewer-a@conversion.test'),
  ('00000000-0000-0000-0000-0000000099a5', 'authenticated', 'authenticated', 'owner-b@conversion.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Conversión A', 'conversion-a-t', 'cafe');
select platform.crear_tenant('Conversión B', 'conversion-b-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'conversion-a-t'
union all select 'b', id from public.tenants where slug = 'conversion-b-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), m.rol::public.rol_tenant
  from (values
    ('00000000-0000-0000-0000-0000000099a1', 'a', 'owner'),
    ('00000000-0000-0000-0000-0000000099a2', 'a', 'admin'),
    ('00000000-0000-0000-0000-0000000099a3', 'a', 'operativo'),
    ('00000000-0000-0000-0000-0000000099a4', 'a', 'viewer'),
    ('00000000-0000-0000-0000-0000000099a5', 'b', 'owner')) as m(user_id, t, rol);

-- Proveedor de A, cliente de servicios de A y los tipos Excelso/Consumo de A (los siembra el alta).
with t as (
  insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles)
  select i.id, x.nombre, 'Calle 1', '3000000000', x.identificacion, x.roles
    from (values ('a', 'Proveedor A', '9900001', array['proveedor']),
                 ('a', 'Cliente A',   '9900002', array['cliente_servicio'])) as x(t, nombre, identificacion, roles)
    join ids i on i.clave = x.t
  returning identificacion, id
)
insert into ids select case identificacion when '9900001' then 'pa' else 'ca' end, id from t;
insert into ids select case t.nombre when 'Excelso' then 'xa' else 'ka' end, t.id
  from cafe.tipos_cafe t join ids i on i.id = t.tenant_id and i.clave = 'a';

create temp table res (k text primary key, r jsonb);
grant select, insert on res to authenticated;

create or replace function pg_temp.hoy() returns text language sql as $$ select to_char(current_date, 'YYYY-MM-DD') $$;
grant execute on function pg_temp.hoy() to authenticated;

create or replace function pg_temp.comprar(p_k text, p_peso numeric, p_n integer, p_tipo text default 'xa')
returns void language plpgsql as $$
begin
  insert into res
  select p_k, cafe.registrar_compra(jsonb_build_object(
    'tercero_id', (select id from ids where clave = 'pa'), 'tipo_cafe_id', (select id from ids where clave = p_tipo),
    'fecha', pg_temp.hoy(), 'peso_kg', p_peso, 'num_bultos', p_n, 'precio_kg', 20000));
end $$;
grant execute on function pg_temp.comprar(text, numeric, integer, text) to authenticated;

create or replace function pg_temp.lid(p_k text) returns uuid language sql as $$ select (r ->> 'id')::uuid from res where k = p_k $$;
grant execute on function pg_temp.lid(text) to authenticated;

-- Peso en báscula de la tanda: lo que dejó la tostión abierta del lote (su salida, o su entrada si aún no la tiene).
create or replace function pg_temp.tostado(p_k text) returns numeric language sql as $$
  select sum(coalesce(t.peso_salida_kg, t.peso_entrada_kg)) from cafe.procesos t
   where t.lote_id = pg_temp.lid(p_k) and t.tipo = 'tostion' and t.anulado_at is null
     and not exists (select 1 from cafe.procesos e where e.origen_proceso_id = t.id and e.tipo = 'empaque' and e.anulado_at is null)
$$;
grant execute on function pg_temp.tostado(text) to authenticated;

create or replace function pg_temp.barr(p_k text) returns uuid[] language sql as $$
  select array_agg(b.id order by b.numero) from cafe.lote_bultos b where b.lote_id = pg_temp.lid(p_k)
$$;
grant execute on function pg_temp.barr(text) to authenticated;

-- Tostión de TODOS los bultos del lote `p_k` (100 kg → 81 kg, nivel medio), guardada bajo `p_res`.
create or replace function pg_temp.tostar(p_res text, p_k text) returns void language plpgsql as $$
begin
  insert into res select p_res, cafe.registrar_proceso(jsonb_build_object(
    'lote_id', pg_temp.lid(p_k), 'tipo', 'tostion', 'fecha', pg_temp.hoy(), 'bultos', to_jsonb(pg_temp.barr(p_k)),
    'nivel_tueste', 'medio',
    'baches', (select jsonb_agg(jsonb_build_object('peso_entrada_kg', e.v::numeric, 'peso_salida_kg', round(e.v::numeric * 0.81, 3)) order by e.n)
                 from jsonb_array_elements_text(cafe.sugerir_baches(100) -> 'baches') with ordinality as e(v, n))));
end $$;
grant execute on function pg_temp.tostar(text, text) to authenticated;

-- Empaque de TODOS los bultos del lote `p_k` con las líneas `[[500, 120]]`.
create or replace function pg_temp.empacar(p_res text, p_k text, p_lineas integer[][]) returns void language plpgsql as $$
begin
  insert into res select p_res, cafe.registrar_empaque(jsonb_build_object(
    'lote_id', pg_temp.lid(p_k), 'fecha', pg_temp.hoy(), 'peso_bascula_kg', pg_temp.tostado(p_k),
    'lineas', (select jsonb_agg(jsonb_build_object('presentacion_g', p_lineas[i][1], 'unidades', p_lineas[i][2]) order by i)
                 from generate_subscripts(p_lineas, 1) i)));
end $$;
grant execute on function pg_temp.empacar(text, text, integer[][]) to authenticated;

-- Reabrir producto del lote `p_k`: presentación y unidades.
create or replace function pg_temp.rp(p_k text, p_g integer, p_u integer, p_extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('lote_id', pg_temp.lid(p_k), 'presentacion_g', p_g, 'unidades', p_u, 'fecha', pg_temp.hoy()) || p_extra
$$;
grant execute on function pg_temp.rp(text, integer, integer, jsonb) to authenticated;

create or replace function pg_temp.reabrir(p_res text, p_k text, p_g integer, p_u integer, p_extra jsonb default '{}')
returns void language plpgsql as $$
begin
  insert into res select p_res, cafe.reabrir_producto(pg_temp.rp(p_k, p_g, p_u, p_extra));
end $$;
grant execute on function pg_temp.reabrir(text, text, integer, integer, jsonb) to authenticated;

create or replace function pg_temp.rid(p_res text) returns uuid language sql as $$ select (r ->> 'id')::uuid from res where k = p_res $$;
grant execute on function pg_temp.rid(text) to authenticated;

-- Proceso sobre una reapertura (molienda por `registrar_proceso`).
create or replace function pg_temp.pr(p_k text, p_reap text, p_tipo text, p_extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('lote_id', pg_temp.lid(p_k), 'tipo', p_tipo, 'fecha', pg_temp.hoy(), 'reapertura_id', pg_temp.rid(p_reap)) || p_extra
$$;
grant execute on function pg_temp.pr(text, text, text, jsonb) to authenticated;

-- Empaque sobre una reapertura: `[[2500, 7]]`.
create or replace function pg_temp.pe(p_k text, p_reap text, p_lineas integer[][], p_extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('lote_id', pg_temp.lid(p_k), 'fecha', pg_temp.hoy(), 'reapertura_id', pg_temp.rid(p_reap),
         'diferencia_destino', 'perdida',
         'lineas', (select jsonb_agg(jsonb_build_object('presentacion_g', p_lineas[i][1], 'unidades', p_lineas[i][2]) order by i)
                      from generate_subscripts(p_lineas, 1) i)) || p_extra
$$;
grant execute on function pg_temp.pe(text, text, integer[][], jsonb) to authenticated;

create or replace function pg_temp.stock(p_nombre text) returns numeric language sql as $$
  select stock from public.v_stock where nombre = p_nombre
$$;
grant execute on function pg_temp.stock(text) to authenticated;
create or replace function pg_temp.aid(p_nombre text) returns uuid language sql as $$
  select articulo_id from public.v_stock where nombre = p_nombre
$$;
grant execute on function pg_temp.aid(text) to authenticated;

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

create or replace function pg_temp.conv(p_k text, p_o text, p_uo integer, p_d text, p_ud integer, p_extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('lote_id', pg_temp.lid(p_k), 'fecha', pg_temp.hoy(),
    'origen', jsonb_build_object('articulo_id', pg_temp.aid(p_o), 'unidades', p_uo),
    'destino', jsonb_build_object('articulo_id', pg_temp.aid(p_d), 'unidades', p_ud)) || p_extra
$$;
grant execute on function pg_temp.conv(text, text, integer, text, integer, jsonb) to authenticated;

-- 1. Estructura y privilegios
select ok((select relrowsecurity from pg_class where oid = 'cafe.conversiones_presentacion'::regclass), 'conversiones tiene RLS activada');
select ok(
  not has_table_privilege('authenticated', 'cafe.conversiones_presentacion', 'delete')
  and not has_table_privilege('authenticated', 'cafe.conversiones_presentacion', 'update')
  and not has_table_privilege('anon', 'cafe.conversiones_presentacion', 'select'),
  'append-only: nadie edita ni borra y anon no lee'
);
select ok(
  not has_function_privilege('anon', 'cafe.convertir_presentacion(jsonb)', 'execute')
  and has_function_privilege('authenticated', 'cafe.convertir_presentacion(jsonb)', 'execute')
  and not (select prosecdef from pg_proc where oid = 'cafe.convertir_presentacion(jsonb)'::regprocedure),
  'la RPC es SECURITY INVOKER, de authenticated y no de anon'
);

-- 2. Preparación: MP1 con 4 x 2.500 g empacadas
reset role;
select tests.autenticar_como('operativo-a@conversion.test');
select public.registrar_movimientos(jsonb_build_array(
  jsonb_build_object('articulo_id', pg_temp.aid('Bolsa 500 g'), 'cantidad', 400, 'motivo', 'compra'),
  jsonb_build_object('articulo_id', pg_temp.aid('Etiqueta 500 g'), 'cantidad', 400, 'motivo', 'compra'),
  jsonb_build_object('articulo_id', pg_temp.aid('Bolsa 2.500 g'), 'cantidad', 20, 'motivo', 'compra'),
  jsonb_build_object('articulo_id', pg_temp.aid('Etiqueta 2.500 g'), 'cantidad', 20, 'motivo', 'compra')));
select pg_temp.comprar('MP1', 100, 4);
select pg_temp.tostar('MP1_t', 'MP1');
select pg_temp.empacar('MP1_e', 'MP1', array[[2500, 4]]);
insert into res select 'S1', cafe.registrar_recepcion(jsonb_build_object(
  'tercero_id', (select id from ids where clave = 'ca'), 'fecha', pg_temp.hoy(), 'peso_kg', 100, 'num_bultos', 2,
  'servicios', '["tostion"]'::jsonb, 'nivel_tueste', 'medio'));

select is(pg_temp.stock('Excelso 2.500 g'), 4.000, 'hay 4 x Excelso 2.500 g');

-- 3. 2 x 2.500 g -> 10 x 500 g
select lives_ok($$ insert into res select 'C1', cafe.convertir_presentacion(pg_temp.conv('MP1', 'Excelso 2.500 g', 2, 'Excelso 500 g', 10)) $$,
  'el operativo convierte 2 x 2.500 g en 10 x 500 g');
select is(pg_temp.stock('Excelso 2.500 g'), 2.000, 'el origen baja 2');
select is(pg_temp.stock('Excelso 500 g'), 10.000, 'el destino sube 10');
select is(pg_temp.stock('Bolsa 500 g'), 390.000, 'se descuentan 10 bolsas del destino');
select is(pg_temp.stock('Etiqueta 500 g'), 390.000, 'y 10 etiquetas');
select is((select (r ->> 'cuadra')::boolean from res where k = 'C1'), true, 'los kg cuadran (5 kg = 5 kg)');
select is(
  (select array_agg(row(c.lote_id = pg_temp.lid('MP1'), c.unidades_origen, c.unidades_destino, c.diferencia_kg)::text)
     from cafe.conversiones_presentacion c),
  array[row(true, 2, 10, 0.000)::text], 'queda la traza en el lote de origen'
);
select is(
  (select count(*)::int from public.movimientos_inventario m where m.ref_tipo = 'cafe.conversion' and m.ref_id = pg_temp.rid('C1')),
  4, 'cuatro movimientos ligados a la conversión'
);

-- 4. Kilos que no cuadran: avisa, no bloquea
select lives_ok($$ insert into res select 'C2', cafe.convertir_presentacion(pg_temp.conv('MP1', 'Excelso 2.500 g', 1, 'Excelso 500 g', 4)) $$,
  'convertir 1 x 2.500 g en 4 x 500 g se registra');
select is((select (r ->> 'cuadra')::boolean from res where k = 'C2'), false, 'pero avisa de que los kg no cuadran');
select is((select (r ->> 'diferencia_kg')::numeric from res where k = 'C2'), -0.500, 'con una diferencia de -0,5 kg');

-- 5. Errores
select throws_ok($$select cafe.convertir_presentacion(pg_temp.conv('MP1', 'Excelso 2.500 g', 2, 'Excelso 500 g', 10))$$,
  'P0001', 'conversion_supera_saldo_lote', 'no se convierte más de lo que queda del lote (queda 1)');
select throws_ok($$select cafe.convertir_presentacion(pg_temp.conv('MP1', 'Excelso 2.500 g', 1, 'Excelso 2.500 g', 1))$$,
  'P0001', 'conversion_mismo_producto', 'origen y destino distintos');
select throws_ok($$select cafe.convertir_presentacion(pg_temp.conv('MP1', 'Excelso 2.500 g', 1, 'Consumo 500 g', 5))$$,
  'P0001', 'conversion_incompatible', 'el destino debe ser del mismo tipo de café');
select throws_ok($$select cafe.convertir_presentacion(pg_temp.conv('S1', 'Excelso 2.500 g', 1, 'Excelso 500 g', 5))$$,
  'P0001', 'reapertura_solo_marca_propia', 'nunca café de un cliente');
select throws_ok($$ insert into public.movimientos_inventario (articulo_id, cantidad, motivo) values (pg_temp.aid('Excelso 500 g'), 5, 'produccion') $$,
  'P0001', 'entrada_pt_no_permitida', 'el destino no admite una entrada sin conversión que la respalde');

-- 6. Roles
reset role;
select tests.autenticar_como('viewer-a@conversion.test');
select throws_ok($$select cafe.convertir_presentacion(pg_temp.conv('MP1', 'Excelso 2.500 g', 1, 'Excelso 500 g', 5))$$,
  '42501', 'no_autorizado', 'un viewer no convierte');

-- 7. Aislamiento
reset role;
select tests.autenticar_como('owner-b@conversion.test');
select is((select count(*)::int from cafe.conversiones_presentacion), 0, 'el otro cliente no ve las conversiones de A');

select * from finish();
rollback;
