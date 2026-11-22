-- Empaque de marca propia con etiquetas por línea (sí / no / cuántas): `empaque_lineas.etiquetas`, el descuento de etiquetas
-- del inventario y el costo de insumos. Todo se crea AQUÍ dentro de la transacción (rollback al final): un cliente de café A
-- con un operativo (u1).
begin;

select plan(13);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000099e1', 'authenticated', 'authenticated', 'operativo-a@etiquetas.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Etiquetas A', 'etiquetas-a-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as select 'a' as clave, id from public.tenants where slug = 'etiquetas-a-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select '00000000-0000-0000-0000-0000000099e1'::uuid, id, 'operativo' from ids;

with t as (
  insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles)
  select i.id, 'Proveedor A', 'Calle 1', '3000000000', '9900001', array['proveedor'] from ids i
  returning id
)
insert into ids select 'pa', id from t;
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

select has_column('cafe', 'empaque_lineas', 'etiquetas', 'la línea de empaque guarda cuántas bolsas llevan etiqueta');

select tests.autenticar_como('operativo-a@etiquetas.test');
select is(pg_temp.stock('Etiqueta 500 g'), 0::numeric, 'punto de partida: sin movimientos de etiquetas');

-- E1: 60 bolsas de 500 g, solo 20 con etiqueta.
select pg_temp.flujo('L1', 100, 50, 41, '[{"presentacion_g":500,"unidades":60,"etiquetas":20}]'::jsonb);
select is(pg_temp.stock('Etiqueta 500 g'), -20::numeric, 'algunas: solo se descuentan las 20 etiquetas');
select is(pg_temp.stock('Bolsa 500 g'), -60::numeric, 'y las 60 bolsas');
select is((select etiquetas from cafe.empaque_lineas where proceso_id = pg_temp.rid('L1_e')), 20, 'la línea guarda las 20 etiquetas');
select is(
  (select r ->> 'total' from (select cafe.costo_insumos_empaque(pg_temp.rid('L1_e')) r) x), '46000',
  'costo de insumos: 60 × 700 + 20 × 200 = 46.000'
);

-- E2: ninguna etiqueta.
select pg_temp.flujo('L2', 60, 30, 21, '[{"presentacion_g":500,"unidades":40,"etiquetas":0}]'::jsonb);
select is(pg_temp.stock('Etiqueta 500 g'), -20::numeric, 'no: ninguna etiqueta sale del inventario');
select is(
  (select r ->> 'total' || '/' || (r ->> 'completo') from (select cafe.costo_insumos_empaque(pg_temp.rid('L2_e')) r) x), '28000/true',
  'costo sin etiquetas: 40 × 700 = 28.000 y completo'
);

-- E3: sin dato = todas (empaques anteriores y formularios viejos).
select pg_temp.flujo('L3', 30, 20, 11, '[{"presentacion_g":500,"unidades":20}]'::jsonb);
select is(pg_temp.stock('Etiqueta 500 g'), -40::numeric, 'sí: sin dato se descuenta una etiqueta por bolsa');
select is((select etiquetas from cafe.empaque_lineas where proceso_id = pg_temp.rid('L3_e')), 20, 'y la línea guarda todas');

-- Validación.
select throws_ok(
  format($$select cafe.registrar_empaque(jsonb_build_object('lote_id', %L, 'fecha', pg_temp.hoy(), 'origen_proceso_id', %L, 'peso_bascula_kg', 10, 'lineas', '[{"presentacion_g":500,"unidades":5,"etiquetas":6}]'::jsonb))$$, pg_temp.lid('L1'), pg_temp.rid('L1_t')),
  'P0001', 'etiquetas_invalidas', 'no puede haber más etiquetas que bolsas'
);
select throws_ok(
  format($$select cafe.registrar_empaque(jsonb_build_object('lote_id', %L, 'fecha', pg_temp.hoy(), 'origen_proceso_id', %L, 'peso_bascula_kg', 10, 'lineas', '[{"presentacion_g":500,"unidades":5,"etiquetas":-1}]'::jsonb))$$, pg_temp.lid('L1'), pg_temp.rid('L1_t')),
  'P0001', 'etiquetas_invalidas', 'ni etiquetas negativas'
);
select throws_ok(
  format($$select cafe.registrar_empaque(jsonb_build_object('lote_id', %L, 'fecha', pg_temp.hoy(), 'origen_proceso_id', %L, 'peso_bascula_kg', 10, 'lineas', '[{"presentacion_g":500,"unidades":5,"etiquetas":1.5}]'::jsonb))$$, pg_temp.lid('L1'), pg_temp.rid('L1_t')),
  'P0001', 'etiquetas_invalidas', 'ni decimales'
);

select * from finish();
rollback;
