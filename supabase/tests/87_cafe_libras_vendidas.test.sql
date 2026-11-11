-- B-10 (FIN-156) · `cafe.libras_vendidas(desde, hasta)`: libras vendidas por producto (1 lb = 500 g; 2.500 g = 5 lb), con ventas
-- y cortesías no anuladas, dentro del rango, aisladas por cliente. Todo se crea AQUÍ dentro de la transacción (rollback al final).
--   o1 owner A (cafe.ventas)   o2 owner B (cafe.ventas)   o3 owner C (sin cafe.ventas)
begin;

select plan(8);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000087b1', 'authenticated', 'authenticated', 'owner-a@libras.test'),
  ('00000000-0000-0000-0000-0000000087b2', 'authenticated', 'authenticated', 'owner-b@libras.test'),
  ('00000000-0000-0000-0000-0000000087b3', 'authenticated', 'authenticated', 'owner-c@libras.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Libras A', 'libras-a-t', 'cafe', null, null, array['cafe.ventas']);
select platform.crear_tenant('Libras B', 'libras-b-t', 'cafe', null, null, array['cafe.ventas']);
select platform.crear_tenant('Libras C', 'libras-c-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'libras-a-t'
union all select 'b', id from public.tenants where slug = 'libras-b-t'
union all select 'c', id from public.tenants where slug = 'libras-c-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), 'owner'::public.rol_tenant
  from (values ('00000000-0000-0000-0000-0000000087b1', 'a'), ('00000000-0000-0000-0000-0000000087b2', 'b'),
               ('00000000-0000-0000-0000-0000000087b3', 'c')) as m(user_id, t);

insert into ids select 'cf', id from public.terceros where tenant_id = (select id from ids where clave = 'a') and es_consumidor_final;

-- Stock inicial de A: Excelso 500 g = 100, Excelso 2.500 g = 20.
insert into public.movimientos_inventario (tenant_id, articulo_id, cantidad, motivo, ref_tipo)
select a.tenant_id, a.id, s.cantidad, 'saldo_inicial', 'cafe.arranque'
  from public.articulos a
  join (values ('Excelso 500 g', 100), ('Excelso 2.500 g', 20)) as s(nombre, cantidad) on s.nombre = a.nombre
 where a.tenant_id = (select id from ids where clave = 'a') and a.tipo = 'producto_terminado';

create temp table res (k text primary key, r jsonb);
grant select, insert on res to authenticated;

create or replace function pg_temp.aid(p_nombre text) returns uuid language sql as $$
  select articulo_id from public.v_stock where nombre = p_nombre $$;
grant execute on function pg_temp.aid(text) to authenticated;

create or replace function pg_temp.vender(p_k text, p_tipo text, p_fecha date, p_nombre text, p_cantidad integer, p_precio numeric)
returns void language plpgsql as $$
begin
  insert into res select p_k, cafe.registrar_venta(jsonb_build_object(
    'tipo', p_tipo, 'fecha', to_char(p_fecha, 'YYYY-MM-DD'), 'tercero_id', (select id from ids where clave = 'cf'),
    'lineas', jsonb_build_array(jsonb_build_object('articulo_id', pg_temp.aid(p_nombre), 'cantidad', p_cantidad, 'precio_unitario', p_precio))));
end $$;
grant execute on function pg_temp.vender(text, text, date, text, integer, numeric) to authenticated;

create or replace function pg_temp.lb(p_nombre text) returns numeric language sql as $$
  select (e ->> 'libras')::numeric
    from jsonb_array_elements(cafe.libras_vendidas(current_date - 29, current_date)) e
   where (e ->> 'articulo_pt_id')::uuid = pg_temp.aid(p_nombre) $$;
grant execute on function pg_temp.lb(text) to authenticated;

select tests.autenticar_como('owner-a@libras.test');

select is(cafe.libras_vendidas(current_date - 29, current_date), '[]'::jsonb, 'sin ventas: lista vacía');

select pg_temp.vender('v1', 'venta', current_date, 'Excelso 500 g', 10, 29000);
select pg_temp.vender('v2', 'venta', current_date - 2, 'Excelso 2.500 g', 3, 145000);
select pg_temp.vender('v3', 'cortesia', current_date - 1, 'Excelso 500 g', 2, 0);
select pg_temp.vender('v4', 'venta', current_date - 40, 'Excelso 500 g', 5, 29000);

select is(pg_temp.lb('Excelso 2.500 g'), 15.000, '3 bolsas de 2.500 g son 15 lb');
select is(pg_temp.lb('Excelso 500 g'), 12.000, '10 vendidas + 2 de cortesía = 12 lb; la venta de hace 40 días queda fuera de la ventana');

select cafe.anular_venta((select (r ->> 'id')::uuid from res where k = 'v1'), 'Error de captura en la prueba');
select is(pg_temp.lb('Excelso 500 g'), 2.000, 'una venta anulada no cuenta');

select throws_ok($$select cafe.libras_vendidas(current_date, current_date - 1)$$, 'P0001', 'datos_invalidos', 'un rango invertido es inválido');

reset role;
select tests.autenticar_como('owner-b@libras.test');
select is(cafe.libras_vendidas(current_date - 29, current_date), '[]'::jsonb, 'otro cliente no ve las libras de A');

reset role;
select tests.autenticar_como('owner-c@libras.test');
select is(cafe.libras_vendidas(current_date - 29, current_date), '[]'::jsonb, 'sin el módulo cafe.ventas la lista sale vacía');

reset role;
select tests.como_anon();
select throws_ok($$select cafe.libras_vendidas(current_date - 29, current_date)$$, '42501', null, 'sin sesión: sin permiso');

select * from finish();
rollback;
