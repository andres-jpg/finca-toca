-- A-03 (FIN-121) · Merma de dos lados: `desvio_sentido`, referencia por nivel de tueste, tolerancia ±2 y snapshot.
-- (Preparación copiada de 94_cafe_procesos.test.sql; las líneas siguientes describen ese fichero.)
-- cafe.procesos, cafe.proceso_bultos, cafe.baches, las funciones
-- pasos_del_lote / paso_previo / peso_disponible / sugerir_baches / registrar_proceso / anular_proceso y las vistas
-- v_lote_etapas / v_lotes / v_bultos_estado.
-- Cubre el ejemplo del informe (500 kg → trilla 405 → tostión 332 → molienda 330), el orden de los pasos, el proceso
-- parcial por bultos (Excelso de 6 bultos), el desvío, la congelación de tarifas, los baches, la anulación, los roles
-- y el aislamiento entre clientes.
-- Todo se crea AQUÍ dentro de la transacción (rollback al final): dos clientes de café (A y B), sin depender del seed.
--   p1 owner A   p2 admin A   p3 operativo A   p4 viewer A   p5 owner B
-- Los lotes se crean con las RPC reales (registrar_recepcion / registrar_compra), como operativo.
begin;

select plan(11);

-- 0. Preparación --------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000094a1', 'authenticated', 'authenticated', 'owner-a@procesos.test'),
  ('00000000-0000-0000-0000-0000000094a2', 'authenticated', 'authenticated', 'admin-a@procesos.test'),
  ('00000000-0000-0000-0000-0000000094a3', 'authenticated', 'authenticated', 'operativo-a@procesos.test'),
  ('00000000-0000-0000-0000-0000000094a4', 'authenticated', 'authenticated', 'viewer-a@procesos.test'),
  ('00000000-0000-0000-0000-0000000094a5', 'authenticated', 'authenticated', 'owner-b@procesos.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Procesos A', 'procesos-a-t', 'cafe');
select platform.crear_tenant('Procesos B', 'procesos-b-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'procesos-a-t'
union all select 'b', id from public.tenants where slug = 'procesos-b-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), m.rol::public.rol_tenant
  from (values
    ('00000000-0000-0000-0000-0000000094a1', 'a', 'owner'),
    ('00000000-0000-0000-0000-0000000094a2', 'a', 'admin'),
    ('00000000-0000-0000-0000-0000000094a3', 'a', 'operativo'),
    ('00000000-0000-0000-0000-0000000094a4', 'a', 'viewer'),
    ('00000000-0000-0000-0000-0000000094a5', 'b', 'owner')) as m(user_id, t, rol);

-- Terceros: ca (cliente de servicios de A), pa (proveedor de A), cb (cliente de servicios de B). Excelso de A.
with t as (
  insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles)
  select i.id, x.nombre, 'Calle 1', '3000000000', x.identificacion, x.roles
    from (values ('a', 'Cliente A',   '9400001', array['cliente_servicio']),
                 ('a', 'Proveedor A', '9400002', array['proveedor']),
                 ('b', 'Cliente B',   '9400003', array['cliente_servicio'])) as x(t, nombre, identificacion, roles)
    join ids i on i.clave = x.t
  returning identificacion, id
)
insert into ids select case identificacion when '9400001' then 'ca' when '9400002' then 'pa' else 'cb' end, id from t;
insert into ids select 'xa', t.id from cafe.tipos_cafe t join ids i on i.id = t.tenant_id and i.clave = 'a' where t.nombre = 'Excelso';

-- Resultados de las RPC por clave, para comprobarlos sin repetir llamadas.
create temp table res (k text primary key, r jsonb);
grant select, insert on res to authenticated;

-- Fecha de hoy como la mandaría la app.
create or replace function pg_temp.hoy() returns text language sql as $$ select to_char(current_date, 'YYYY-MM-DD') $$;
grant execute on function pg_temp.hoy() to authenticated;

-- Recibe un café de cliente (servicio) y guarda el resultado bajo `k`.
create or replace function pg_temp.recibir(p_k text, p_peso numeric, p_n integer, p_servicios text[],
                                           p_nivel text default null, p_ter text default 'ca')
returns void language plpgsql as $$
begin
  insert into res
  select p_k, cafe.registrar_recepcion(jsonb_build_object(
    'tercero_id', (select id from ids where clave = p_ter), 'fecha', pg_temp.hoy(), 'peso_kg', p_peso,
    'num_bultos', p_n, 'servicios', to_jsonb(p_servicios), 'nivel_tueste', p_nivel));
end $$;
grant execute on function pg_temp.recibir(text, numeric, integer, text[], text, text) to authenticated;

-- Compra de café para marca propia (Excelso de A a $20.000/kg).
create or replace function pg_temp.comprar(p_k text, p_peso numeric, p_n integer)
returns void language plpgsql as $$
begin
  insert into res
  select p_k, cafe.registrar_compra(jsonb_build_object(
    'tercero_id', (select id from ids where clave = 'pa'), 'tipo_cafe_id', (select id from ids where clave = 'xa'),
    'fecha', pg_temp.hoy(), 'peso_kg', p_peso, 'num_bultos', p_n, 'precio_kg', 20000));
end $$;
grant execute on function pg_temp.comprar(text, numeric, integer) to authenticated;

create or replace function pg_temp.lid(p_k text) returns uuid language sql as $$ select (r ->> 'id')::uuid from res where k = p_k $$;
grant execute on function pg_temp.lid(text) to authenticated;

-- Ids de los bultos del lote `p_k` con esos números.
create or replace function pg_temp.barr(p_k text, p_nums integer[]) returns uuid[] language sql as $$
  select array_agg(b.id order by b.numero) from cafe.lote_bultos b where b.lote_id = pg_temp.lid(p_k) and b.numero = any(p_nums)
$$;
grant execute on function pg_temp.barr(text, integer[]) to authenticated;

-- Entrada de registrar_proceso: lote `p_k`, tipo, fecha de hoy, los bultos de `p_nums` (todos si es null) y `p_extra`.
create or replace function pg_temp.p(p_k text, p_tipo text, p_nums integer[] default null, p_extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('lote_id', pg_temp.lid(p_k), 'tipo', p_tipo, 'fecha', pg_temp.hoy(),
         'bultos', to_jsonb(pg_temp.barr(p_k, coalesce(p_nums, array(select generate_series(1, 200)))))) || p_extra
$$;
grant execute on function pg_temp.p(text, text, integer[], jsonb) to authenticated;

-- Registra un proceso y guarda el resultado bajo `p_res`.
create or replace function pg_temp.reg(p_res text, p_k text, p_tipo text, p_nums integer[] default null, p_extra jsonb default '{}')
returns void language plpgsql as $$
begin
  insert into res select p_res, cafe.registrar_proceso(pg_temp.p(p_k, p_tipo, p_nums, p_extra));
end $$;
grant execute on function pg_temp.reg(text, text, text, integer[], jsonb) to authenticated;

-- Baches que reparten `p_entrada` según `cafe.sugerir_baches` y dejan salir `p_factor` de cada uno.
create or replace function pg_temp.baches(p_entrada numeric, p_factor numeric) returns jsonb language sql as $$
  select jsonb_build_object('baches', (
    select jsonb_agg(jsonb_build_object('peso_entrada_kg', e.v::numeric, 'peso_salida_kg', round(e.v::numeric * p_factor, 3)) order by e.n)
      from jsonb_array_elements_text(cafe.sugerir_baches(p_entrada) -> 'baches') with ordinality as e(v, n)))
$$;
grant execute on function pg_temp.baches(numeric, numeric) to authenticated;

-- `detail` del error que lanza una sentencia (NULL si no falla).
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

-- 1. Bache 13,5 → 11,8 kg, tueste medio: 12,6 % < 18 - 2 → baja ---------------------------------------------
select tests.autenticar_como('operativo-a@procesos.test');
select pg_temp.recibir('M1', 13.5, 1, array['tostion'], 'medio');
select pg_temp.reg('M1_t', 'M1', 'tostion', null,
  '{"nivel_tueste": "medio", "baches": [{"peso_entrada_kg": 13.5, "peso_salida_kg": 11.8}]}');
select is(
  (select row(r ->> 'merma_pct', r ->> 'desvio', r ->> 'desvio_sentido')::text from res where k = 'M1_t'),
  row('12.593', 'true', 'baja')::text, '13,5 → 11,8 kg (12,6 %), tueste medio: desvío por abajo'
);

-- 2. Bache 13,5 → 10,6 kg: 21,5 % > 18 + 2 → alta --------------------------------------------------------
select pg_temp.recibir('M2', 13.5, 1, array['tostion'], 'medio');
select pg_temp.reg('M2_t', 'M2', 'tostion', null,
  '{"nivel_tueste": "medio", "baches": [{"peso_entrada_kg": 13.5, "peso_salida_kg": 10.6}]}');
select is(
  (select row(r ->> 'desvio', r ->> 'desvio_sentido')::text from res where k = 'M2_t'),
  row('true', 'alta')::text, '13,5 → 10,6 kg (21,5 %): desvío por arriba'
);

-- 3. En rango (justo en el límite ref + tol = 20 %) ------------------------------------------------------------
select pg_temp.recibir('M3', 10, 1, array['tostion'], 'medio');
select pg_temp.reg('M3_t', 'M3', 'tostion', null,
  '{"nivel_tueste": "medio", "baches": [{"peso_entrada_kg": 10, "peso_salida_kg": 8}]}');
select is(
  (select row(r ->> 'desvio', r ->> 'desvio_sentido')::text from res where k = 'M3_t'),
  row('false', null)::text, '20 % con referencia 18 ± 2: en rango (el límite no es desvío)'
);

-- 4. Tolerancia por defecto ±2 y referencia congelada ---------------------------------------------------------
select is(
  (select tolerancia_pts from cafe.procesos where id = (select (r ->> 'id')::uuid from res where k = 'M1_t')),
  2.000, 'la tolerancia por defecto es 2 puntos'
);
select is(
  (select merma_referencia_pct from cafe.procesos where id = (select (r ->> 'id')::uuid from res where k = 'M1_t')),
  18.000, 'la referencia de tostión sin configurar por nivel es 18'
);

-- 5. Referencia por nivel de tueste: «alto» = 14; «medio» no cambia ----------------------------------------------
reset role;
insert into public.parametros (tenant_id, clave, valor)
select id, 'cafe.merma_referencia_tostion_alto_pct', to_jsonb(14::numeric) from ids where clave = 'a';
select tests.autenticar_como('operativo-a@procesos.test');
select pg_temp.recibir('M4', 10, 1, array['tostion'], 'alto');
select pg_temp.reg('M4_t', 'M4', 'tostion', null,
  '{"nivel_tueste": "alto", "baches": [{"peso_entrada_kg": 10, "peso_salida_kg": 8.5}]}');
select is(
  (select row(p.merma_referencia_pct, p.desvio_sentido)::text from cafe.procesos p where p.id = (select (r ->> 'id')::uuid from res where k = 'M4_t')),
  row(14.000::numeric, null)::text, 'nivel alto: referencia 14 (15 % está en rango)'
);
select pg_temp.recibir('M5', 10, 1, array['tostion'], 'medio');
select pg_temp.reg('M5_t', 'M5', 'tostion', null,
  '{"nivel_tueste": "medio", "baches": [{"peso_entrada_kg": 10, "peso_salida_kg": 8.5}]}');
select is(
  (select row(p.merma_referencia_pct, p.desvio_sentido)::text from cafe.procesos p where p.id = (select (r ->> 'id')::uuid from res where k = 'M5_t')),
  row(18.000::numeric, 'baja')::text, 'nivel medio sigue en 18: 15 % es baja'
);

-- 6. Cambiar la referencia de «medio» solo afecta a procesos posteriores ---------------------------------------------
reset role;
insert into public.parametros (tenant_id, clave, valor)
select id, 'cafe.merma_referencia_tostion_medio_pct', to_jsonb(15::numeric) from ids where clave = 'a';
select tests.autenticar_como('operativo-a@procesos.test');
select pg_temp.recibir('M6', 10, 1, array['tostion'], 'medio');
select pg_temp.reg('M6_t', 'M6', 'tostion', null,
  '{"nivel_tueste": "medio", "baches": [{"peso_entrada_kg": 10, "peso_salida_kg": 8.5}]}');
select is(
  (select row(p.merma_referencia_pct, p.desvio_sentido)::text from cafe.procesos p where p.id = (select (r ->> 'id')::uuid from res where k = 'M6_t')),
  row(15.000::numeric, null)::text, 'tras cambiar «medio» a 15, el proceso nuevo usa 15 (15 % en rango)'
);
select is(
  (select row(p.merma_referencia_pct, p.desvio_sentido)::text from cafe.procesos p where p.id = (select (r ->> 'id')::uuid from res where k = 'M5_t')),
  row(18.000::numeric, 'baja')::text, 'y el proceso anterior conserva su referencia (18) y su estado'
);

-- 7. Trilla: sentido en las dos direcciones ------------------------------------------------------------------------
select pg_temp.recibir('M7', 100, 1, array['trilla']);
select pg_temp.reg('M7_t', 'M7', 'trilla', null, '{"peso_salida_kg": 70}');
select is(
  (select r ->> 'desvio_sentido' from res where k = 'M7_t'), 'alta', 'trilla 30 % con referencia 19 ± 2: alta'
);
select is(
  (select count(*)::int from cafe.procesos where desvio is distinct from (desvio_sentido is not null)), 0,
  'desvio coincide siempre con «tiene sentido» (alta o baja)'
);

select * from finish();
rollback;
