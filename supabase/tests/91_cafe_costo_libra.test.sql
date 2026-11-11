-- A-05 + B-13 (FIN-124, FIN-160) · Costo de producir una libra: `cafe.costo_insumo` (precio vigente de `cafe.insumo_precios`),
-- `cafe.costo_libra_lote` (merma de tostión acumulada, bolsa y etiqueta, precio de venta), el snapshot de insumos en el
-- empaque (`empaque_lineas.costo_*`, `cafe.costo_insumos_empaque`) y `cafe.costo_libra_panel`.
-- Ejemplo del informe: café a $30.000/kg, merma de tostión 18,3 %, bolsa + etiqueta $900 → $19.260 la libra.
-- Todo se crea AQUÍ dentro de la transacción (rollback al final).   p3 operativo A   p5 owner B (sin cafe.dashboard)
begin;

select plan(19);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000091a3', 'authenticated', 'authenticated', 'operativo-a@costo.test'),
  ('00000000-0000-0000-0000-0000000091a5', 'authenticated', 'authenticated', 'owner-b@costo.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Costo A', 'costo-a-t', 'cafe', null, null, array['cafe.dashboard']);
select platform.crear_tenant('Costo B', 'costo-b-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'costo-a-t'
union all select 'b', id from public.tenants where slug = 'costo-b-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), m.rol::public.rol_tenant
  from (values
    ('00000000-0000-0000-0000-0000000091a3', 'a', 'operativo'),
    ('00000000-0000-0000-0000-0000000091a5', 'b', 'owner')) as m(user_id, t, rol);

-- Proveedores (A y B), cliente de servicios de A y los tipos Excelso/Consumo de A (los siembra el alta).
with t as (
  insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles)
  select i.id, x.nombre, 'Calle 1', '3000000000', x.identificacion, x.roles
    from (values ('a', 'Proveedor A', '9100001', array['proveedor']),
                 ('a', 'Cliente A',   '9100002', array['cliente_servicio']),
                 ('b', 'Proveedor B', '9100003', array['proveedor'])) as x(t, nombre, identificacion, roles)
    join ids i on i.clave = x.t
  returning identificacion, id
)
insert into ids select case identificacion when '9100001' then 'pa' when '9100002' then 'ca' else 'pb' end, id from t;
insert into ids select case t.nombre when 'Excelso' then 'xa' else 'ka' end, t.id
  from cafe.tipos_cafe t join ids i on i.id = t.tenant_id and i.clave = 'a';
insert into ids select 'xb', t.id from cafe.tipos_cafe t join ids i on i.id = t.tenant_id and i.clave = 'b' where t.nombre = 'Excelso';

create temp table res (k text primary key, r jsonb);
grant select, insert on res to authenticated;

create or replace function pg_temp.hoy() returns text language sql as $$ select to_char(current_date, 'YYYY-MM-DD') $$;
grant execute on function pg_temp.hoy() to authenticated;

-- Compra de café para marca propia (`p_tipo`: 'xa' Excelso, 'ka' Consumo; proveedor de A; $20.000/kg).
create or replace function pg_temp.comprar(p_k text, p_peso numeric, p_n integer, p_tipo text default 'xa')
returns void language plpgsql as $$
begin
  insert into res
  select p_k, cafe.registrar_compra(jsonb_build_object(
    'tercero_id', (select id from ids where clave = 'pa'), 'tipo_cafe_id', (select id from ids where clave = p_tipo),
    'fecha', pg_temp.hoy(), 'peso_kg', p_peso, 'num_bultos', p_n, 'precio_kg', 30000));
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

create or replace function pg_temp.barr(p_k text, p_nums integer[]) returns uuid[] language sql as $$
  select array_agg(b.id order by b.numero) from cafe.lote_bultos b where b.lote_id = pg_temp.lid(p_k) and b.numero = any(p_nums)
$$;
grant execute on function pg_temp.barr(text, integer[]) to authenticated;

-- Entrada de registrar_proceso: lote `p_k`, tipo, hoy, los bultos de `p_nums` (todos si es null) y `p_extra`.
create or replace function pg_temp.p(p_k text, p_tipo text, p_nums integer[] default null, p_extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('lote_id', pg_temp.lid(p_k), 'tipo', p_tipo, 'fecha', pg_temp.hoy(),
         'bultos', to_jsonb(pg_temp.barr(p_k, coalesce(p_nums, array(select generate_series(1, 200)))))) || p_extra
$$;
grant execute on function pg_temp.p(text, text, integer[], jsonb) to authenticated;

-- Los baches ya no llevan salida (B-05): estas pruebas parten de tostiones CON salida (la que antes pesaba cada bache), así que
-- se fija aquí como lo haría el empaque de la tanda (SECURITY DEFINER de prueba, con la bandera de edición de `editar_lote`).
create or replace function pg_temp.fijar_salida(p_proceso uuid, p_extra jsonb) returns void language plpgsql security definer set search_path = '' as $$
declare v numeric;
begin
  select sum((b ->> 'peso_salida_kg')::numeric) into v from jsonb_array_elements(p_extra -> 'baches') b where b ? 'peso_salida_kg';
  if v is null then return; end if;
  perform set_config('cafe.edicion_lote', 'on', true);
  update cafe.procesos set peso_salida_kg = v where id = p_proceso;
  perform set_config('cafe.edicion_lote', 'off', true);
end $$;
grant execute on function pg_temp.fijar_salida(uuid, jsonb) to authenticated;

create or replace function pg_temp.reg(p_res text, p_k text, p_tipo text, p_nums integer[] default null, p_extra jsonb default '{}')
returns void language plpgsql as $$
declare v jsonb;
begin
  v := cafe.registrar_proceso(pg_temp.p(p_k, p_tipo, p_nums, p_extra));
  insert into res values (p_res, v);
  if p_tipo = 'tostion' then perform pg_temp.fijar_salida((v ->> 'id')::uuid, p_extra); end if;
end $$;
grant execute on function pg_temp.reg(text, text, text, integer[], jsonb) to authenticated;

-- Baches que reparten `p_entrada` según `cafe.sugerir_baches` y dejan salir `p_factor` de cada uno.
create or replace function pg_temp.baches(p_entrada numeric, p_factor numeric) returns jsonb language sql as $$
  select jsonb_build_object('baches', (
    select jsonb_agg(jsonb_build_object('peso_entrada_kg', e.v::numeric, 'peso_salida_kg', round(e.v::numeric * p_factor, 3)) order by e.n)
      from jsonb_array_elements_text(cafe.sugerir_baches(p_entrada) -> 'baches') with ordinality as e(v, n)))
$$;
grant execute on function pg_temp.baches(numeric, numeric) to authenticated;

-- Tostión de TODOS los bultos del lote `p_k` (100 kg → 81 kg, nivel medio), guardada bajo `p_res`.
create or replace function pg_temp.tostar(p_res text, p_k text) returns void language plpgsql as $$
begin
  perform pg_temp.reg(p_res, p_k, 'tostion', null, pg_temp.baches(100, 0.81) || '{"nivel_tueste": "medio"}');
end $$;
grant execute on function pg_temp.tostar(text, text) to authenticated;

-- Entrada de registrar_empaque: lote `p_k`, hoy, los bultos de `p_nums` (todos si es null), las líneas
-- `[[500, 120], [2500, 8]]` y `p_extra`.
create or replace function pg_temp.pe(p_k text, p_lineas integer[][], p_nums integer[] default null, p_extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('lote_id', pg_temp.lid(p_k), 'fecha', pg_temp.hoy(),
         'peso_bascula_kg', pg_temp.tostado(p_k),
         'lineas', (select jsonb_agg(jsonb_build_object('presentacion_g', p_lineas[i][1], 'unidades', p_lineas[i][2]) order by i)
                      from generate_subscripts(p_lineas, 1) i)) || p_extra
$$;
grant execute on function pg_temp.pe(text, integer[][], integer[], jsonb) to authenticated;

create or replace function pg_temp.emp(p_res text, p_k text, p_lineas integer[][], p_nums integer[] default null, p_extra jsonb default '{}')
returns void language plpgsql as $$
begin
  insert into res select p_res, cafe.registrar_empaque(pg_temp.pe(p_k, p_lineas, p_nums, p_extra));
end $$;
grant execute on function pg_temp.emp(text, text, integer[][], integer[], jsonb) to authenticated;

-- Stock y artículo por nombre, para el cliente que esté autenticado.
create or replace function pg_temp.stock(p_nombre text) returns numeric language sql as $$
  select stock from public.v_stock where nombre = p_nombre
$$;
grant execute on function pg_temp.stock(text) to authenticated;
create or replace function pg_temp.aid(p_nombre text) returns uuid language sql as $$
  select articulo_id from public.v_stock where nombre = p_nombre
$$;
grant execute on function pg_temp.aid(text) to authenticated;

-- Instantánea del stock de un artículo y diferencia desde entonces (los empaques de otros lotes también mueven
-- insumos y productos: las comprobaciones de los apartados 7 a 9 se hacen por diferencia).
create temp table sn (k text primary key, v numeric);
grant select, insert on sn to authenticated;
create or replace function pg_temp.snap(p_k text, p_nombre text) returns void language sql as $$
  insert into sn select p_k, pg_temp.stock(p_nombre) $$;
grant execute on function pg_temp.snap(text, text) to authenticated;
create or replace function pg_temp.dl(p_k text, p_nombre text) returns numeric language sql as $$
  select pg_temp.stock(p_nombre) - (select v from sn where k = p_k) $$;
grant execute on function pg_temp.dl(text, text) to authenticated;

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

-- Procesos de empaque vigentes de un lote y líneas de un proceso (para comprobar que NO quedó nada).
create or replace function pg_temp.n_empaques(p_k text) returns bigint language sql as $$
  select count(*) from cafe.procesos where lote_id = pg_temp.lid(p_k) and tipo = 'empaque' $$;
grant execute on function pg_temp.n_empaques(text) to authenticated;


-- Insumos: precio vigente de la bolsa 500 g = $700 y de la etiqueta 500 g = $200 (los fija un administrador; aquí, el rol de BD).
insert into cafe.insumo_precios (tenant_id, articulo_id, precio)
select a.tenant_id, a.id, case a.atributos ->> 'clase' when 'bolsa' then 700 else 200 end
  from public.articulos a
 where a.tipo = 'insumo' and a.tenant_id = (select id from ids where clave = 'a') and (a.atributos ->> 'presentacion_g') = '500';

select tests.autenticar_como('operativo-a@costo.test');
select lives_ok(
  $$ select public.registrar_movimientos(jsonb_build_array(
       jsonb_build_object('articulo_id', pg_temp.aid('Bolsa 500 g'), 'cantidad', 300, 'motivo', 'compra', 'costo_unitario', 600),
       jsonb_build_object('articulo_id', pg_temp.aid('Etiqueta 500 g'), 'cantidad', 500, 'motivo', 'compra', 'costo_unitario', 200))) $$,
  'el operativo compra bolsas y etiquetas (el costo de la compra no cambia el precio vigente)'
);
select is(cafe.costo_insumo('bolsa', 500), 700.00, 'costo de la bolsa 500 g: su precio vigente (no el de la compra)');
select is(cafe.costo_insumo('etiqueta', 2500), null, 'sin precio fijado: NULL, no cero');

-- L1: 10 kg de Excelso a $30.000/kg, sin tostión todavía --------------------------------------------------------------
select pg_temp.comprar('L1', 10, 1);
select is(
  (select row(r ->> 'costo_libra', r ->> 'merma_tostion', r ->> 'completo')::text from (select cafe.costo_libra_lote(pg_temp.lid('L1')) r) x),
  row(null, null, 'false')::text, 'sin tostión: no hay costo (se calcula al registrar la primera tostión)'
);

-- Tostión 10 → 8,17 kg (18,3 %) -------------------------------------------------------------------------------------------
select pg_temp.reg('L1_t', 'L1', 'tostion', null, pg_temp.baches(10, 0.817) || '{"nivel_tueste": "medio"}');
select is(
  (select row(r ->> 'costo_libra', (r ->> 'merma_tostion')::numeric(6,3), r ->> 'costo_bolsa', r ->> 'costo_etiqueta')::text
     from (select cafe.costo_libra_lote(pg_temp.lid('L1')) r) x),
  row('19260', 0.183::numeric(6,3), '700.00', '200.00')::text,
  '30.000 / (1 - 0,183) × 0,5 + 700 + 200 = $19.260 por libra'
);
select is(
  (select row((r ->> 'precio_libra')::numeric, r ->> 'margen', r ->> 'margen_pct', r ->> 'completo')::text from (select cafe.costo_libra_lote(pg_temp.lid('L1')) r) x),
  row(29000.00::numeric, '9740', '33.6', 'true')::text,
  'el precio por libra sale de la tarifa vigente del producto ($29.000 de la lista del alta): margen 9.740 (33,6 %)'
);

-- Merma acumulada: un lote de 20 kg en dos bultos; la segunda tostión recalcula ---------------------------------------------
select pg_temp.comprar('L2', 20, 2);
select pg_temp.reg('L2_t1', 'L2', 'tostion', array[1], pg_temp.baches(10, 0.817) || '{"nivel_tueste": "medio"}');
select is((select (cafe.costo_libra_lote(pg_temp.lid('L2')) ->> 'costo_libra')), '19260', 'primera tostión del lote de 2 bultos: 18,3 %');
select pg_temp.reg('L2_t2', 'L2', 'tostion', array[2], pg_temp.baches(10, 0.8) || '{"nivel_tueste": "medio"}');
select is(
  (select row((r ->> 'merma_tostion')::numeric(6,4), r ->> 'costo_libra')::text from (select cafe.costo_libra_lote(pg_temp.lid('L2')) r) x),
  row(0.1915::numeric(6,4), '19453')::text, 'segunda tostión (20 %): merma acumulada 19,15 % → $19.453'
);

-- Panel: empaque de 16 bolsas de 500 g del lote L1 (8 kg) ------------------------------------------------------------------
select pg_temp.emp('L1_e', 'L1', array[[500, 16]]);
select is(
  (select row(jsonb_array_length(r), r -> 0 ->> 'kg_empacados', r -> 0 ->> 'tipo_cafe', r -> 0 ->> 'costo_libra')::text
     from (select cafe.costo_libra_panel(current_date, current_date) r) x),
  row(1, '8.000', 'Excelso', '19260')::text, 'el panel trae el lote empacado con sus kg y su costo por libra'
);
select is(cafe.costo_libra_panel(current_date + 1, current_date + 1), '[]'::jsonb, 'un día sin empaques: lista vacía');

-- B-13: el empaque estampa el precio de ese momento; cambiar el precio no toca lo ya registrado --------------------------------------
select is(
  (select row(el.costo_bolsa, el.costo_etiqueta)::text from cafe.empaque_lineas el where el.proceso_id = (select (r ->> 'proceso_id')::uuid from res where k = 'L1_e')),
  row(700.00, 200.00)::text, 'la línea del empaque guarda el costo de bolsa y etiqueta vigentes al registrarla'
);
select is(
  (select (cafe.costo_insumos_empaque((select (r ->> 'proceso_id')::uuid from res where k = 'L1_e')) ->> 'total')::numeric),
  14400::numeric, 'costo de insumos del empaque: 16 bolsas × (700 + 200) = $14.400'
);
select throws_ok(
  $$ insert into cafe.insumo_precios (articulo_id, precio) values (pg_temp.aid('Bolsa 500 g'), 900) $$,
  '42501', null, 'un operativo no fija precios de insumos'
);
reset role;
insert into cafe.insumo_precios (tenant_id, articulo_id, precio)
select a.tenant_id, a.id, 900 from public.articulos a
 where a.tipo = 'insumo' and a.tenant_id = (select id from ids where clave = 'a') and a.atributos ->> 'clase' = 'bolsa' and a.atributos ->> 'presentacion_g' = '500';
select tests.autenticar_como('operativo-a@costo.test');
select is(cafe.costo_insumo('bolsa', 500), 900.00, 'el precio nuevo rige para los empaques que vengan');
select is(
  (select (cafe.costo_libra_lote(pg_temp.lid('L1')) ->> 'costo_libra')), '19260',
  'el costo del lote empacado conserva el precio registrado en su empaque (no cambia con el precio nuevo)'
);
select is(
  (select (cafe.costo_libra_lote(pg_temp.lid('L2'), 2500) ->> 'costo_empaque')), null,
  '2.500 g sin precios de bolsa y etiqueta: el costo de empaque no se inventa'
);
reset role;
select tests.autenticar_como('owner-b@costo.test');
select is((select count(*) from cafe.insumo_precios), 0::bigint, 'otro cliente no ve los precios de insumos');
reset role;
select tests.autenticar_como('operativo-a@costo.test');

-- Aislamiento y módulo -------------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('owner-b@costo.test');
select throws_ok(
  format($$select cafe.costo_libra_lote(%L)$$, (select (r ->> 'id') from res where k = 'L1')),
  'P0001', 'lote_no_encontrado', 'otro cliente no ve el costo del lote'
);
select throws_ok($$select cafe.costo_libra_panel()$$, '42501', 'no_autorizado', 'sin el módulo cafe.dashboard el panel da 42501');

select * from finish();
rollback;
