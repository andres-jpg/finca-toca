-- «Entregar» varios lotes en una remisión (FIN-132 · A-14): cafe.remisiones_lotes (N:N), cafe.entregar_lotes()
-- y la anulación que libera todos los lotes. Dos lotes listos del mismo cliente salen en UNA remisión con UN número y
-- UN total; quién recibe (nombre y cédula) es obligatorio; un lote no puede estar en dos remisiones vigentes; la
-- relación se aísla por cliente. Todo se crea aquí dentro (rollback al final): dos clientes de café, sin el seed.
begin;

select plan(35);

-- 0. Preparación --------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000092a1', 'authenticated', 'authenticated', 'owner-a@multilote.test'),
  ('00000000-0000-0000-0000-0000000092a2', 'authenticated', 'authenticated', 'admin-a@multilote.test'),
  ('00000000-0000-0000-0000-0000000092a3', 'authenticated', 'authenticated', 'operativo-a@multilote.test'),
  ('00000000-0000-0000-0000-0000000092a4', 'authenticated', 'authenticated', 'viewer-a@multilote.test'),
  ('00000000-0000-0000-0000-0000000092a5', 'authenticated', 'authenticated', 'owner-b@multilote.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Multilote A', 'multilote-a-t', 'cafe');
select platform.crear_tenant('Multilote B', 'multilote-b-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'multilote-a-t'
union all select 'b', id from public.tenants where slug = 'multilote-b-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), m.rol::public.rol_tenant
  from (values
    ('00000000-0000-0000-0000-0000000092a1', 'a', 'owner'),
    ('00000000-0000-0000-0000-0000000092a2', 'a', 'admin'),
    ('00000000-0000-0000-0000-0000000092a3', 'a', 'operativo'),
    ('00000000-0000-0000-0000-0000000092a4', 'a', 'viewer'),
    ('00000000-0000-0000-0000-0000000092a5', 'b', 'owner')) as m(user_id, t, rol);

-- Terceros: ca (cliente de servicios de A), pa (proveedor de A), cb (cliente de servicios de B). Excelso de A.
with t as (
  insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles)
  select i.id, x.nombre, 'Calle 1', '3000000000', x.identificacion, x.roles
    from (values ('a', 'Juan Pérez',  '9200001', array['cliente_servicio']),
                 ('a', 'Proveedor A', '9200002', array['proveedor']),
                 ('b', 'Cliente B',   '9200003', array['cliente_servicio'])) as x(t, nombre, identificacion, roles)
    join ids i on i.clave = x.t
  returning identificacion, id
)
insert into ids select case identificacion when '9200001' then 'ca' when '9200002' then 'pa' else 'cb' end, id from t;
insert into ids select 'xa', t.id from cafe.tipos_cafe t join ids i on i.id = t.tenant_id and i.clave = 'a' where t.nombre = 'Excelso';

-- Resultados de las RPC por clave, para comprobarlos sin repetir llamadas.
create temp table res (k text primary key, r jsonb);
grant select, insert on res to authenticated;

create or replace function pg_temp.hoy() returns text language sql as $$ select to_char(current_date, 'YYYY-MM-DD') $$;
grant execute on function pg_temp.hoy() to authenticated;

-- Número REM esperado: REM-<año de hoy>-000n.
create or replace function pg_temp.rem(n integer) returns text language sql as $$
  select 'REM-' || to_char(current_date, 'YYYY') || '-' || lpad(n::text, 4, '0')
$$;
grant execute on function pg_temp.rem(integer) to authenticated;

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

create or replace function pg_temp.barr(p_k text, p_nums integer[]) returns uuid[] language sql as $$
  select array_agg(b.id order by b.numero) from cafe.lote_bultos b where b.lote_id = pg_temp.lid(p_k) and b.numero = any(p_nums)
$$;
grant execute on function pg_temp.barr(text, integer[]) to authenticated;

-- Entrada de registrar_proceso: lote `p_k`, tipo, fecha de hoy, todos los bultos y `p_extra`.
create or replace function pg_temp.p(p_k text, p_tipo text, p_extra jsonb default '{}')
returns jsonb language sql as $$
  select jsonb_build_object('lote_id', pg_temp.lid(p_k), 'tipo', p_tipo, 'fecha', pg_temp.hoy(),
         'bultos', to_jsonb(pg_temp.barr(p_k, array(select generate_series(1, 200))))) || p_extra
$$;
grant execute on function pg_temp.p(text, text, jsonb) to authenticated;

create or replace function pg_temp.reg(p_k text, p_tipo text, p_extra jsonb default '{}')
returns void language plpgsql as $$
begin
  perform cafe.registrar_proceso(pg_temp.p(p_k, p_tipo, p_extra));
end $$;
grant execute on function pg_temp.reg(text, text, jsonb) to authenticated;

-- Baches de 13,5 kg (n) que dejan salir `p_salida` kg cada uno.
create or replace function pg_temp.baches(p_n integer, p_salida numeric) returns jsonb language sql as $$
  select jsonb_build_object('baches', (
    select jsonb_agg(jsonb_build_object('peso_entrada_kg', 13.5, 'peso_salida_kg', p_salida) order by g)
      from generate_series(1, p_n) g))
$$;
grant execute on function pg_temp.baches(integer, numeric) to authenticated;

-- Los 30 baches del ejemplo del informe: 405 kg de entrada y 332 kg de salida (26 × 11 + 4 × 11,5).
create or replace function pg_temp.baches_ejemplo() returns jsonb language sql as $$
  select jsonb_build_object('baches', (
    select jsonb_agg(jsonb_build_object('peso_entrada_kg', 13.5, 'peso_salida_kg', case when g <= 26 then 11 else 11.5 end) order by g)
      from generate_series(1, 30) g))
$$;
grant execute on function pg_temp.baches_ejemplo() to authenticated;

-- Genera la remisión del lote `p_k` (fecha de hoy) y guarda el resultado bajo `p_res`.
create or replace function pg_temp.gen(p_res text, p_k text, p_extra jsonb default '{}')
returns void language plpgsql as $$
begin
  insert into res select p_res, cafe.generar_remision(
    jsonb_build_object('lote_id', pg_temp.lid(p_k), 'fecha', pg_temp.hoy(), 'recibe_documento', '1000')
    || case when p_extra ? 'recibido_por' then '{}'::jsonb else '{"recibe_nombre": "Quien Recibe"}'::jsonb end
    || p_extra);
end $$;
grant execute on function pg_temp.gen(text, text, jsonb) to authenticated;

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


-- Entrega de los lotes `p_ks` (claves de `res`) con los datos de quien recibe; `p_extra` los pisa.
create or replace function pg_temp.ent(p_res text, p_ks text[], p_extra jsonb default '{}')
returns void language plpgsql as $$
begin
  insert into res select p_res, cafe.entregar_lotes(
    jsonb_build_object('lote_ids', (select jsonb_agg(pg_temp.lid(k)) from unnest(p_ks) k), 'fecha', pg_temp.hoy(),
                       'recibe_nombre', 'Ana Ruiz', 'recibe_documento', '1020304050') || p_extra);
end $$;
grant execute on function pg_temp.ent(text, text[], jsonb) to authenticated;

-- 1. Estructura ---------------------------------------------------------------------------------------------
select has_table('cafe', 'remisiones_lotes', 'existe la relación remisión-lote');
select ok((select relrowsecurity from pg_class where oid = 'cafe.remisiones_lotes'::regclass), 'con RLS activada');
select ok(
  not has_table_privilege('authenticated', 'cafe.remisiones_lotes', 'update')
  and not has_table_privilege('authenticated', 'cafe.remisiones_lotes', 'delete')
  and not has_table_privilege('anon', 'cafe.remisiones_lotes', 'select')
  and not has_column_privilege('authenticated', 'cafe.remisiones_lotes', 'activa', 'insert'),
  'nadie edita ni borra la relación, y `activa` solo la mueve el trigger'
);
select has_index('cafe', 'remisiones_lotes', 'remisiones_lotes_un_lote', 'un lote en una sola remisión vigente');
select is((select count(*)::int from pg_trigger where tgrelid = 'cafe.remisiones_lotes'::regclass and tgname like 'audit%'), 1, 'está auditada');
select col_not_null('cafe', 'remisiones', 'recibe_nombre', 'quién recibe es obligatorio (NOT NULL)');
select col_not_null('cafe', 'remisiones', 'recibe_documento', 'y su cédula también');

-- 2. Dos lotes del mismo cliente, una remisión ---------------------------------------------------------------------------
insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles)
select id, 'Otro Cliente', 'Calle 2', '3000000001', '9200004', array['cliente_servicio'] from ids where clave = 'a';
insert into ids select 'cc', id from public.terceros where identificacion = '9200004';
select tests.autenticar_como('operativo-a@multilote.test');
select pg_temp.recibir('A1', 100, 2, array['trilla']);
select pg_temp.recibir('A2', 60, 1, array['trilla']);
select pg_temp.recibir('A3', 40, 1, array['trilla']);
select pg_temp.recibir('A4', 30, 1, array['trilla']);     -- sin procesos
select pg_temp.recibir('X1', 50, 1, array['trilla'], null, 'cc');
select pg_temp.reg('A1', 'trilla', '{"peso_salida_kg": 80}');
select pg_temp.reg('A2', 'trilla', '{"peso_salida_kg": 50}');
select pg_temp.reg('A3', 'trilla', '{"peso_salida_kg": 32}');
select pg_temp.reg('X1', 'trilla', '{"peso_salida_kg": 40}');
select is((select v.estado from cafe.v_lotes v where v.id = pg_temp.lid('A1')), 'listo', 'el lote queda listo tras su servicio');

select throws_ok($$select pg_temp.ent('x', array['A1'], '{"recibe_nombre": "  "}')$$, 'P0001', 'datos_invalidos', 'sin nombre de quien recibe no se entrega');
select is(pg_temp.detalle($$select pg_temp.ent('x', array['A1'], '{"recibe_nombre": null}')$$), 'Escribe el nombre de quien recibe.', 'y el mensaje lo dice');
select throws_ok($$select pg_temp.ent('x', array['A1'], '{"recibe_documento": ""}')$$, 'P0001', 'datos_invalidos', 'sin cédula tampoco');
select is(pg_temp.detalle($$select pg_temp.ent('x', array['A1'], '{"recibe_documento": null}')$$), 'Escribe la cédula de quien recibe.', 'y el mensaje lo dice');
select throws_ok($$select pg_temp.ent('x', array[]::text[])$$, 'P0001', 'datos_invalidos', 'sin lotes no hay entrega');
select throws_ok($$select pg_temp.ent('x', array['A1', 'X1'])$$, 'P0001', 'remision_clientes_distintos', 'lotes de clientes distintos no van juntos');
select throws_ok($$select pg_temp.ent('x', array['A1', 'A4'])$$, 'P0001', 'remision_sin_procesos', 'un lote sin procesos frena toda la entrega');
select is((select count(*)::int from cafe.remisiones), 0, 'y no se escribió nada');
select is((select count(*)::int from public.consecutivos where serie = 'REM'), 0, 'ni se consumió número REM');

select pg_temp.ent('R1', array['A1', 'A2']);
select is((select r ->> 'numero' from res where k = 'R1'), pg_temp.rem(1), 'sale UNA remisión con UN número REM');
select is((select count(*)::int from cafe.remisiones), 1, 'una sola fila de remisión');
select is((select count(*)::int from cafe.remisiones_lotes where remision_id = pg_temp.lid('R1') and activa), 2, 'con sus dos lotes en la relación');
select is(
  (select row(r.peso_recibido_kg, r.peso_entregado_kg, r.recibe_nombre, r.recibe_documento, r.recibido_por)::text from cafe.remisiones r where r.id = pg_temp.lid('R1')),
  '(160.000,130.000,"Ana Ruiz",1020304050,"Ana Ruiz")', 'el total suma los dos lotes y guarda quién recibe y su cédula'
);
select is(
  (select sum(rl.peso_entregado_kg)::text from cafe.remisiones_lotes rl where rl.remision_id = pg_temp.lid('R1')),
  '130.000', 'cada lote conserva su snapshot'
);
select is(
  (select array_agg(v.estado order by v.codigo) from cafe.v_lotes v where v.id in (pg_temp.lid('A1'), pg_temp.lid('A2'))),
  array['entregado', 'entregado'], 'ambos lotes pasan a entregado (también el que no es el primero)'
);
select throws_ok($$select pg_temp.ent('x', array['A2', 'A3'])$$, 'P0001', 'remision_duplicada', 'un lote ya entregado no entra en otra remisión');
-- 3. Anular libera todos los lotes ---------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('admin-a@multilote.test');
select throws_ok(
  format($$select cafe.anular_proceso(%L, 'Intento')$$, (select p.id from cafe.procesos p where p.lote_id = pg_temp.lid('A2') and p.tipo = 'trilla')),
  'P0001', 'lote_entregado', 'un lote entregado (no solo el primero) no admite anular procesos');
select is(
  ((select cafe.anular_remision(pg_temp.lid('R1'), 'Se entregó al cliente equivocado')) -> 'lote_ids') @> to_jsonb(array[pg_temp.lid('A1'), pg_temp.lid('A2')]),
  true, 'anular devuelve los lotes liberados'
);
select is(
  (select array_agg(v.estado order by v.codigo) from cafe.v_lotes v where v.id in (pg_temp.lid('A1'), pg_temp.lid('A2'))),
  array['listo', 'listo'], 'los dos lotes vuelven a listo'
);
select is((select count(*)::int from cafe.remisiones_lotes where remision_id = pg_temp.lid('R1') and activa), 0, 'y la relación queda inactiva (se conserva el historial)');
select pg_temp.ent('R2', array['A1', 'A2', 'A3'], '{"recibe_nombre": "Luis Mora", "recibe_documento": "7000111"}');
select is((select r ->> 'numero' from res where k = 'R2'), pg_temp.rem(2), 'se puede entregar de nuevo; el número anulado no se reutiliza');
select throws_ok(
  format($$insert into cafe.remisiones_lotes (remision_id, lote_id, lote_codigo, peso_recibido_kg, peso_entregado_kg, detalle, valor_servicios)
           values (%L, %L, 'X', 40, 32, '[]', 0)$$, pg_temp.lid('R1'), pg_temp.lid('A3')),
  '23505', null, 'ni insertando directo: el índice parcial impide un lote en dos remisiones vigentes'
);

-- 4. Roles y aislamiento -----------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('viewer-a@multilote.test');
select throws_ok($$select pg_temp.ent('x', array['X1'])$$, '42501', null, 'Gerencia (viewer) no entrega');
select is((select count(*)::int from cafe.remisiones_lotes), 5, 'pero lee las relaciones de su cliente (3 vigentes y 2 de la anulada)');
reset role;
select tests.autenticar_como('owner-b@multilote.test');
select is((select count(*)::int from cafe.remisiones_lotes), 0, 'el cliente B no ve la relación de A');
select throws_ok($$select pg_temp.ent('x', array['A3'])$$, 'P0001', 'lote_no_encontrado', 'ni entrega un lote de A');
select throws_ok(
  format($$insert into cafe.remisiones_lotes (remision_id, lote_id, lote_codigo, peso_recibido_kg, peso_entregado_kg, detalle, valor_servicios)
           values (%L, %L, 'X', 1, 1, '[]', 0)$$, pg_temp.lid('R2'), pg_temp.lid('A4')),
  '23503', null, 'ni cuelga una relación suya de una remisión de A (FK compuesta con el tenant)'
);

select * from finish();
rollback;
