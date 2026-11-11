-- B-14 (FIN-162) · Panel del dueño: `cafe.produccion_panel` (kg que ENTRAN a trilla, tostión y molienda, con las tandas sin salida;
-- sin empaque) y `cafe.ventas_por_presentacion` (unidades, libras e ingreso de las ventas no anuladas; sin cortesías). Aislamiento por
-- cliente y por módulo (`cafe.dashboard`). Todo se crea aquí dentro (rollback al final).
--   o1 owner A (dashboard + ventas)   o2 owner B (dashboard + ventas)   o3 owner C (sin dashboard)
begin;

select plan(13);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000087c1', 'authenticated', 'authenticated', 'owner-a@dueno.test'),
  ('00000000-0000-0000-0000-0000000087c2', 'authenticated', 'authenticated', 'owner-b@dueno.test'),
  ('00000000-0000-0000-0000-0000000087c3', 'authenticated', 'authenticated', 'owner-c@dueno.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Dueno A', 'dueno-a-t', 'cafe', null, null, array['cafe.dashboard', 'cafe.ventas']);
select platform.crear_tenant('Dueno B', 'dueno-b-t', 'cafe', null, null, array['cafe.dashboard', 'cafe.ventas']);
select platform.crear_tenant('Dueno C', 'dueno-c-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'dueno-a-t'
union all select 'b', id from public.tenants where slug = 'dueno-b-t'
union all select 'c', id from public.tenants where slug = 'dueno-c-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), 'owner'::public.rol_tenant
  from (values ('00000000-0000-0000-0000-0000000087c1', 'a'), ('00000000-0000-0000-0000-0000000087c2', 'b'),
               ('00000000-0000-0000-0000-0000000087c3', 'c')) as m(user_id, t);

insert into ids select 'cf', id from public.terceros where tenant_id = (select id from ids where clave = 'a') and es_consumidor_final;
with n as (
  insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles)
  select id, 'Proveedor Dueno', 'Calle 1', '3000000000', '9400001', array['proveedor'] from ids where clave = 'a' returning id
)
insert into ids select 'pa', id from n;
insert into ids select 'xa', t.id from cafe.tipos_cafe t join ids i on i.id = t.tenant_id and i.clave = 'a' where t.nombre = 'Excelso';

insert into public.movimientos_inventario (tenant_id, articulo_id, cantidad, motivo, ref_tipo)
select a.tenant_id, a.id, s.cantidad, 'saldo_inicial', 'cafe.arranque'
  from public.articulos a
  join (values ('Excelso 500 g', 100), ('Excelso 2.500 g', 20)) as s(nombre, cantidad) on s.nombre = a.nombre
 where a.tenant_id = (select id from ids where clave = 'a') and a.tipo = 'producto_terminado';

create temp table res (k text primary key, r jsonb);
grant select, insert on res to authenticated;

create or replace function pg_temp.hoy() returns text language sql as $$ select to_char((now() at time zone 'America/Bogota')::date, 'YYYY-MM-DD') $$;
grant execute on function pg_temp.hoy() to authenticated;
create or replace function pg_temp.aid(p_nombre text) returns uuid language sql as $$ select articulo_id from public.v_stock where nombre = p_nombre $$;
grant execute on function pg_temp.aid(text) to authenticated;

create or replace function pg_temp.vender(p_k text, p_tipo text, p_fecha date, p_nombre text, p_cantidad integer, p_precio numeric)
returns void language plpgsql as $$
begin
  insert into res select p_k, cafe.registrar_venta(jsonb_build_object(
    'tipo', p_tipo, 'fecha', to_char(p_fecha, 'YYYY-MM-DD'), 'tercero_id', (select id from ids where clave = 'cf'),
    'lineas', jsonb_build_array(jsonb_build_object('articulo_id', pg_temp.aid(p_nombre), 'cantidad', p_cantidad, 'precio_unitario', p_precio))));
end $$;
grant execute on function pg_temp.vender(text, text, date, text, integer, numeric) to authenticated;

create or replace function pg_temp.comprar(p_k text, p_peso numeric, p_n integer) returns void language plpgsql as $$
begin
  insert into res select p_k, cafe.registrar_compra(jsonb_build_object(
    'tercero_id', (select id from ids where clave = 'pa'), 'tipo_cafe_id', (select id from ids where clave = 'xa'),
    'fecha', pg_temp.hoy(), 'peso_kg', p_peso, 'num_bultos', p_n, 'precio_kg', 30000));
end $$;
grant execute on function pg_temp.comprar(text, numeric, integer) to authenticated;

-- Tostión de todos los bultos del lote `p_k` (100 kg, sin salida: la fija el empaque). Con `p_salida`, la fija aquí como lo haría
-- el cierre de la tanda (SECURITY DEFINER de prueba, con la bandera de edición de `editar_lote`).
create or replace function pg_temp.fijar_salida(p_proceso uuid, p_salida numeric) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('cafe.edicion_lote', 'on', true);
  update cafe.procesos set peso_salida_kg = p_salida where id = p_proceso;
  perform set_config('cafe.edicion_lote', 'off', true);
end $$;
grant execute on function pg_temp.fijar_salida(uuid, numeric) to authenticated;

create or replace function pg_temp.tostar(p_k text, p_salida numeric) returns void language plpgsql as $$
declare
  v_lote uuid := (select (r ->> 'id')::uuid from res where k = p_k);
  v jsonb;
begin
  v := cafe.registrar_proceso(jsonb_build_object(
    'lote_id', v_lote, 'tipo', 'tostion', 'fecha', pg_temp.hoy(), 'nivel_tueste', 'medio',
    'bultos', to_jsonb((select array_agg(b.id order by b.numero) from cafe.lote_bultos b where b.lote_id = v_lote)),
    'baches', (select jsonb_agg(jsonb_build_object('peso_entrada_kg', e.v::numeric) order by e.n)
                 from jsonb_array_elements_text(cafe.sugerir_baches(100) -> 'baches') with ordinality as e(v, n))));
  if p_salida is not null then perform pg_temp.fijar_salida((v ->> 'id')::uuid, p_salida); end if;
end $$;
grant execute on function pg_temp.tostar(text, numeric) to authenticated;

select tests.autenticar_como('owner-a@dueno.test');

-- 1. Producción: dos lotes de 100 kg, uno con la tanda sin salida y otro con salida 81.
select pg_temp.comprar('L1', 100, 2);
select pg_temp.comprar('L2', 100, 2);
select pg_temp.tostar('L1', null);
select pg_temp.tostar('L2', 81);

select is((select procesos from cafe.produccion_panel() where tipo = 'tostion' and linea = 'marca_propia'), 2::bigint, 'dos tostiones de marca propia');
select is((select kg_entrada from cafe.produccion_panel() where tipo = 'tostion' and linea = 'marca_propia'), 200.000::numeric, 'kg que entran: cuenta también la tanda sin salida');
select is((select kg_entrada_medida from cafe.produccion_panel() where tipo = 'tostion' and linea = 'marca_propia'), 100.000::numeric, 'la merma se mide solo sobre la tanda con salida');
select is((select kg_salida from cafe.produccion_panel() where tipo = 'tostion' and linea = 'marca_propia'), 81.000::numeric, 'kg de salida de la tanda cerrada');
select is((select count(*) from cafe.produccion_panel() where tipo::text not in ('trilla', 'tostion', 'molienda')), 0::bigint, 'sin filas de empaque');
select is((select count(*) from cafe.produccion_panel(current_date + 1, current_date + 2)), 0::bigint, 'otro periodo: sin filas');

-- 2. Ventas por presentación.
select pg_temp.vender('v1', 'venta', current_date, 'Excelso 500 g', 10, 29000);
select pg_temp.vender('v2', 'venta', current_date, 'Excelso 2.500 g', 3, 145000);
select pg_temp.vender('v3', 'cortesia', current_date, 'Excelso 500 g', 2, 0);
select pg_temp.vender('v4', 'venta', current_date, 'Excelso 500 g', 4, 29000);
select cafe.anular_venta((select (r ->> 'id')::uuid from res where k = 'v4'), 'Error de captura en la prueba');

select is(
  (select row(unidades, libras, ingreso)::text from cafe.ventas_por_presentacion(current_date, current_date) where nombre = 'Excelso 500 g'),
  '(10,10.000,290000.00)', '500 g: 10 vendidas (sin la cortesía ni la anulada), 10 lb, $290.000');
select is(
  (select row(unidades, libras, presentacion_g, ingreso)::text from cafe.ventas_por_presentacion(current_date, current_date) where nombre = 'Excelso 2.500 g'),
  '(3,15.000,2500,435000.00)', '2.500 g: 3 bolsas son 15 lb');
select throws_ok($$select cafe.ventas_por_presentacion(current_date, current_date - 1)$$, 'P0001', 'datos_invalidos', 'un rango invertido es inválido');

-- 3. Aislamiento y permisos.
reset role;
select tests.autenticar_como('owner-b@dueno.test');
select is((select count(*) from cafe.ventas_por_presentacion(current_date, current_date)), 0::bigint, 'otro cliente no ve las ventas de A');
select is((select count(*) from cafe.produccion_panel()), 0::bigint, 'otro cliente no ve la producción de A');
reset role;
select tests.autenticar_como('owner-c@dueno.test');
select throws_ok($$select * from cafe.produccion_panel()$$, '42501', null, 'sin el módulo cafe.dashboard no hay cifras');
reset role;
select ok(not has_function_privilege('anon', 'cafe.produccion_panel(date, date)', 'execute')
          and not has_function_privilege('anon', 'cafe.ventas_por_presentacion(date, date)', 'execute'), 'anon no puede ejecutarlas');

select * from finish();
rollback;
