-- Marca propia «poco a poco»: pesar la tanda sin bolsas (todo a planta), moler tostado en planta y empacar desde planta.
-- Todo se crea AQUÍ dentro de la transacción (rollback al final): un cliente de café A con un operativo y otro de B.
begin;

select plan(26);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000099e1', 'authenticated', 'authenticated', 'operativo-a@planta.test'),
  ('00000000-0000-0000-0000-0000000099e2', 'authenticated', 'authenticated', 'owner-b@planta.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Planta A', 'planta-a-t', 'cafe');
select platform.crear_tenant('Planta B', 'planta-b-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as select 'a' as clave, id from public.tenants where slug = 'planta-a-t' union all select 'b', id from public.tenants where slug = 'planta-b-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select '00000000-0000-0000-0000-0000000099e1'::uuid, id, 'operativo'::public.rol_tenant from ids where clave = 'a'
union all select '00000000-0000-0000-0000-0000000099e2'::uuid, id, 'owner'::public.rol_tenant from ids where clave = 'b';

with t as (
  insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles)
  select i.id, x.nombre, 'Calle 1', '3000000000', x.ident, x.roles from ids i, (values ('Proveedor A', '9900001', array['proveedor']), ('Cliente A', '9900002', array['cliente_servicio'])) as x(nombre, ident, roles) where i.clave = 'a'
  returning identificacion, id
)
insert into ids select case identificacion when '9900001' then 'pa' else 'ca' end, id from t;
insert into ids select 'xa', t.id from cafe.tipos_cafe t join ids i on i.id = t.tenant_id and i.clave = 'a' where t.nombre = 'Excelso';

-- Precios vigentes de la bolsa y la etiqueta de 500 g (los fija un administrador; aquí, el rol de BD).
insert into cafe.insumo_precios (tenant_id, articulo_id, precio)
select a.tenant_id, a.id, case a.atributos ->> 'clase' when 'bolsa' then 700 else 200 end
  from public.articulos a
 where a.tipo = 'insumo' and a.tenant_id = (select id from ids where clave = 'a') and (a.atributos ->> 'presentacion_g') = '500';

create temp table res (k text primary key, r jsonb);
grant select, insert on res to authenticated;

create or replace function pg_temp.hoy() returns text language sql as $$ select to_char(current_date, 'YYYY-MM-DD') $$;
grant execute on function pg_temp.hoy() to authenticated;
create or replace function pg_temp.lid(p_k text) returns uuid language sql as $$ select (r ->> 'id')::uuid from res where k = p_k $$;
grant execute on function pg_temp.lid(text) to authenticated;
create or replace function pg_temp.rid(p_k text) returns uuid language sql as $$ select coalesce((r ->> 'id')::uuid, (r ->> 'proceso_id')::uuid) from res where k = p_k $$;
grant execute on function pg_temp.rid(text) to authenticated;
create or replace function pg_temp.stock(p_nombre text) returns numeric language sql as $$ select coalesce((select stock from public.v_stock where nombre = p_nombre), 0) $$;
grant execute on function pg_temp.stock(text) to authenticated;

-- Compra de `p_peso` kg, tostión de `p_tost` kg (sin salida) y empaque con `p_lineas` y `p_bascula`.
create or replace function pg_temp.flujo(p_k text, p_peso numeric, p_tost numeric, p_bascula numeric, p_lineas jsonb) returns void language plpgsql as $$
declare v_t jsonb;
begin
  insert into res select p_k, cafe.registrar_compra(jsonb_build_object(
    'tercero_id', (select id from ids where clave = 'pa'), 'tipo_cafe_id', (select id from ids where clave = 'xa'),
    'fecha', pg_temp.hoy(), 'peso_kg', p_peso, 'precio_kg', 20000));
  v_t := cafe.registrar_proceso(jsonb_build_object('lote_id', pg_temp.lid(p_k), 'tipo', 'tostion', 'fecha', pg_temp.hoy(),
    'nivel_tueste', 'medio', 'peso_entrada_kg', p_tost,
    'baches', (select jsonb_agg(jsonb_build_object('peso_entrada_kg', e.v::numeric, 'temperatura_c', 216, 'tiempo_min', 17) order by e.n)
                 from jsonb_array_elements_text(cafe.sugerir_baches(p_tost) -> 'baches') with ordinality as e(v, n))));
  insert into res select p_k || '_t', v_t;
  insert into res select p_k || '_e', cafe.registrar_empaque(jsonb_build_object('lote_id', pg_temp.lid(p_k), 'fecha', pg_temp.hoy(),
    'origen_proceso_id', (v_t ->> 'id')::uuid, 'peso_bascula_kg', p_bascula, 'lineas', p_lineas));
end $$;
grant execute on function pg_temp.flujo(text, numeric, numeric, numeric, jsonb) to authenticated;


select tests.autenticar_como('operativo-a@planta.test');

-- 1. Pesar la tanda sin bolsas: todo el tostado queda en planta -------------------------------------------------------------
select pg_temp.flujo('L1', 100, 50, 41, '[]'::jsonb);
select is((select r ->> 'sobrante_kg' from res where k = 'L1_e'), '41.000', 'cero bolsas: toda la báscula queda como sobrante');
select is(
  (select row(peso_entrada_kg, peso_salida_kg, merma_kg)::text from cafe.procesos where id = pg_temp.rid('L1_t')),
  row(50.000, 41.000, 9.000)::text, 'la báscula fija la salida y la merma de la tostión (50,0 → 41,0)'
);
select is((select kg from cafe.v_inventario_tostado where lote_id = pg_temp.lid('L1') and forma = 'grano'), 41.000, 'el tostado en planta (grano) es lo pesado');
select is((select count(*)::int from cafe.empaque_lineas where proceso_id = pg_temp.rid('L1_e')), 0, 'y el empaque no tiene líneas');
select throws_ok(
  format($$select cafe.registrar_empaque(jsonb_build_object('lote_id', %L, 'fecha', pg_temp.hoy(), 'peso_bascula_kg', 10, 'lineas', '[]'::jsonb))$$, pg_temp.lid('L1')),
  'P0001', null, 'una tanda ya pesada no admite otro empaque (una tanda, un cierre)'
);

-- 2. Moler poco a poco ---------------------------------------------------------------------------------------------------------
select lives_ok(
  format($$select cafe.moler_tostado(jsonb_build_object('lote_id', %L, 'kg', 10))$$, pg_temp.lid('L1')),
  'se muelen 10 kg del tostado en planta'
);
select is(
  (select string_agg(forma || ':' || kg, ',' order by forma) from cafe.v_inventario_tostado where lote_id = pg_temp.lid('L1')),
  'grano:31.000,molido:10.000', 'quedan 31 kg en grano y 10 kg molidos'
);
select throws_ok(
  format($$select cafe.moler_tostado(jsonb_build_object('lote_id', %L, 'kg', 40))$$, pg_temp.lid('L1')),
  'P0001', 'tostado_insuficiente', 'no se muele más grano del que hay'
);
select lives_ok(
  format($$select cafe.moler_tostado(jsonb_build_object('lote_id', %L, 'kg', 6))$$, pg_temp.lid('L1')),
  'otra molienda más tarde (poco a poco)'
);

-- 3. Empacar desde planta (sin báscula) --------------------------------------------------------------------------------------
insert into res select 'P1', cafe.empacar_tostado(jsonb_build_object('lote_id', pg_temp.lid('L1'), 'fecha', pg_temp.hoy(),
  'lineas', '[{"presentacion_g":500,"unidades":20,"etiquetas":5},{"presentacion_g":500,"unidades":10,"forma":"molido","etiquetas":0}]'::jsonb));
select is((select r ->> 'en_bolsas_kg' from res where k = 'P1'), '15.000', 'empaque desde planta: 20 + 10 bolsas de 500 g = 15 kg');
select is(
  (select string_agg(forma || ':' || kg, ',' order by forma) from cafe.v_inventario_tostado where lote_id = pg_temp.lid('L1')),
  'grano:15.000,molido:11.000', 'sale del libro: 25 − 10 = 15 kg en grano y 16 − 5 = 11 kg molidos');
select is(pg_temp.stock('Etiqueta 500 g'), -5::numeric, 'solo se descuentan las 5 etiquetas indicadas');
select is(pg_temp.stock('Bolsa 500 g'), -30::numeric, 'y las 30 bolsas');
select is(
  (select row(tipo::text, origen_proceso_id is null, peso_entrada_kg, peso_salida_kg)::text from cafe.procesos where id = pg_temp.rid('P1')),
  row('empaque', true, 15.000, 15.000)::text, 'el proceso de empaque desde planta no tiene origen'
);
select is(
  (select consumido_kg from cafe.v_origenes_disponibles where lote_id = pg_temp.lid('L1') and proceso_id is null), 50.000,
  'el café recibido solo registra lo que consumió la tostión (50,0 kg): el empaque desde planta no lo gasta'
);
select is(cafe.peso_disponible(pg_temp.lid('L1'), 'tostion'), 50.000, 'y quedan 50,0 kg verdes por tostar');
select throws_ok(
  format($$select cafe.empacar_tostado(jsonb_build_object('lote_id', %L, 'fecha', pg_temp.hoy(), 'lineas', '[{"presentacion_g":500,"unidades":100}]'::jsonb))$$, pg_temp.lid('L1')),
  'P0001', 'tostado_insuficiente', 'no se empaca más grano del que queda en planta'
);
select throws_ok(
  format($$select cafe.empacar_tostado(jsonb_build_object('lote_id', %L, 'fecha', pg_temp.hoy(), 'lineas', '[{"presentacion_g":500,"unidades":2,"etiquetas":3}]'::jsonb))$$, pg_temp.lid('L1')),
  'P0001', 'etiquetas_invalidas', 'no puede haber más etiquetas que bolsas'
);
select is(
  (select r ->> 'total' from (select cafe.costo_insumos_empaque(pg_temp.rid('P1')) r) x), '22000',
  'costo de insumos del empaque desde planta: 20 × 700 + 5 × 200 + 10 × 700 = 22.000'
);

-- 4. Servicios a terceros: el empaque ya no registra bolsas del cliente --------------------------------------------------------
insert into res select 'S1', cafe.registrar_recepcion(jsonb_build_object('tercero_id', (select id from ids where clave = 'ca'),
  'fecha', pg_temp.hoy(), 'peso_kg', 50, 'servicios', '["tostion"]'::jsonb, 'nivel_tueste', 'medio'));
insert into res select 'S1_t', cafe.registrar_proceso(jsonb_build_object('lote_id', pg_temp.lid('S1'), 'tipo', 'tostion', 'fecha', pg_temp.hoy(),
  'nivel_tueste', 'medio', 'peso_entrada_kg', 50,
  'baches', (select jsonb_agg(jsonb_build_object('peso_entrada_kg', e.v::numeric, 'temperatura_c', 216, 'tiempo_min', 17) order by e.n)
               from jsonb_array_elements_text(cafe.sugerir_baches(50) -> 'baches') with ordinality as e(v, n))));
insert into res select 'S1_e', cafe.registrar_empaque(jsonb_build_object('lote_id', pg_temp.lid('S1'), 'fecha', pg_temp.hoy(),
  'origen_proceso_id', (select (r ->> 'id')::uuid from res where k = 'S1_t'), 'peso_bascula_kg', 41, 'lineas', '[]'::jsonb));
select is(
  (select row(peso_entrada_kg, peso_salida_kg, diferencia_kg)::text from cafe.procesos where id = pg_temp.rid('S1_e')),
  row(41.000, 41.000, 0.000)::text, 'sin bolsas del cliente: todo lo pesado se entrega empacado (sin sobrante)'
);
select is((select count(*)::int from cafe.empaque_lineas where proceso_id = pg_temp.rid('S1_e')), 0, 'y no se guarda ninguna línea de bolsas');
select is(
  (select row(estado, peso_actual_kg)::text from cafe.v_lotes where id = pg_temp.lid('S1')), row('listo', 41.000)::text,
  'el lote queda listo y pesa lo que salió de la báscula'
);
select throws_ok(
  format($$select cafe.registrar_empaque(jsonb_build_object('lote_id', %L, 'fecha', pg_temp.hoy(), 'lineas', '[]'::jsonb))$$, pg_temp.lid('S1')),
  'P0001', null, 'una tanda ya empacada no admite otro empaque'
);

-- 5. Permisos y aislamiento --------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('owner-b@planta.test');
select throws_ok(
  format($$select cafe.moler_tostado(jsonb_build_object('lote_id', %L, 'kg', 1))$$, pg_temp.lid('L1')),
  'P0001', 'lote_no_encontrado', 'otro cliente no ve el lote ni muele su tostado'
);
select throws_ok(
  format($$select cafe.empacar_tostado(jsonb_build_object('lote_id', %L, 'fecha', pg_temp.hoy(), 'lineas', '[{"presentacion_g":500,"unidades":1}]'::jsonb))$$, pg_temp.lid('L1')),
  'P0001', 'lote_no_encontrado', 'ni empaca desde él'
);
select is((select count(*)::int from cafe.v_inventario_tostado), 0, 'y no ve el tostado del otro cliente');

select * from finish();
rollback;
