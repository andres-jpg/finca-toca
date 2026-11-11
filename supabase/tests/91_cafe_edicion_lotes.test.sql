-- A-18 (FIN-136) · Edición de lotes por el administrador: motivo, historial, recálculo, bloqueos y aislamiento. (Preparación copiada de 94_cafe_merma_dos_lados.test.sql.)
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

select plan(25);

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


-- 1. Lote de marca propia con tostión por baches (40,5 kg → 32,7 kg) y la tostión de un servicio ------------------------
select tests.autenticar_como('operativo-a@procesos.test');
select pg_temp.comprar('M1', 27, 1);
select pg_temp.reg('M1_t', 'M1', 'tostion', null, '{"nivel_tueste": "medio", "baches": [
  {"peso_entrada_kg": 13.5, "peso_salida_kg": 11.0, "temperatura_c": 205, "tiempo_min": 12},
  {"peso_entrada_kg": 13.5, "peso_salida_kg": 11.0, "temperatura_c": 205, "tiempo_min": 12}]}');

-- 2. Un operativo no edita --------------------------------------------------------------------------------------------
select throws_ok(
  format($q$select cafe.editar_lote(jsonb_build_object('lote_id', %L, 'motivo', 'prueba', 'lote', jsonb_build_object('observaciones', 'x')))$q$, pg_temp.lid('M1')),
  '42501', 'no_autorizado', 'un operativo no puede editar el lote'
);
select is(
  tests.filas_afectadas(format($q$update cafe.baches set temperatura_c = 150 where proceso_id = %L$q$, (select (r ->> 'id')::uuid from res where k = 'M1_t'))),
  0, 'el RLS no deja a un operativo actualizar baches directo'
);

-- 3. Administrador -----------------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('admin-a@procesos.test');

select throws_ok(
  format($q$select cafe.editar_lote(jsonb_build_object('lote_id', %L, 'motivo', '  ', 'lote', jsonb_build_object('observaciones', 'x')))$q$, pg_temp.lid('M1')),
  'P0001', 'motivo_requerido', 'el motivo es obligatorio'
);
select throws_ok(
  format($q$select cafe.editar_lote(jsonb_build_object('lote_id', %L, 'motivo', 'sin cambios'))$q$, pg_temp.lid('M1')),
  'P0001', 'sin_cambios', 'sin cambios no registra nada'
);
select throws_ok(
  format($q$update cafe.procesos set peso_salida_kg = 20 where lote_id = %L$q$, pg_temp.lid('M1')),
  'P0001', 'edicion_directa', 'ni siquiera el admin cambia pesos por la vía directa'
);

-- Previsualización: corrige el peso de salida del bache 1 (11,0 → 10,0): la merma sube y no se escribe nada.
create or replace function pg_temp.edicion(p_k text, p_simular boolean, p_motivo text default 'Pesaje mal digitado')
returns jsonb language sql as $$
  select cafe.editar_lote(jsonb_build_object(
    'lote_id', pg_temp.lid(p_k), 'motivo', p_motivo, 'simular', p_simular,
    'procesos', jsonb_build_array(jsonb_build_object(
      'id', (select (r ->> 'id')::uuid from res where k = 'M1_t'),
      'baches', jsonb_build_array(jsonb_build_object(
        'id', (select id from cafe.baches where proceso_id = (select (r ->> 'id')::uuid from res where k = 'M1_t') and numero = 1),
        'temperatura_c', 210))))))
$$;
grant execute on function pg_temp.edicion(text, boolean, text) to authenticated;

insert into res select 'SIM', pg_temp.edicion('M1', true);
select is((select r #>> '{antes,merma_tostion_pct}' from res where k = 'SIM'), '18.5', 'la previsualización mide la merma de antes');
select is((select r #>> '{despues,merma_tostion_pct}' from res where k = 'SIM'), '18.5', 'y la de después: corregir la temperatura no cambia la merma (la salida de la tostión la fija su empaque)');
select is((select count(*)::int from cafe.lote_ediciones), 0, 'simular no deja historial');
select is((select temperatura_c::text from cafe.baches where proceso_id = (select (r ->> 'id')::uuid from res where k = 'M1_t') and numero = 1),
          '205.0', 'ni toca el bache');

-- Guardar de verdad: recalcula el proceso y deja la traza con motivo.
insert into res select 'REAL', pg_temp.edicion('M1', false);
select is((select peso_salida_kg::text || '/' || merma_pct::text from cafe.procesos where id = (select (r ->> 'id')::uuid from res where k = 'M1_t')),
          '22.000/18.519', 'el proceso conserva su salida (la de su empaque) y su merma');
select is(
  (select array_agg(campo || ':' || valor_anterior || '>' || valor_nuevo || ':' || motivo order by campo) from cafe.lote_ediciones where entidad = 'bache'),
  array['temperatura_c:205.0>210.0:Pesaje mal digitado'],
  'la traza guarda campo, antes, después y motivo'
);
select ok((select count(*) from audit.log where tabla = 'cafe.lote_ediciones') >= 1, 'el historial queda en audit.log');

-- Una salida mayor que la entrada se rechaza.
select throws_ok(
  format($q$select cafe.editar_lote(jsonb_build_object('lote_id', %L, 'motivo', 'prueba', 'procesos', jsonb_build_array(jsonb_build_object(
    'id', %L, 'baches', jsonb_build_array(jsonb_build_object('id', %L, 'peso_salida_kg', 99))))))$q$,
    pg_temp.lid('M1'), (select (r ->> 'id')::uuid from res where k = 'M1_t'),
    (select id from cafe.baches where proceso_id = (select (r ->> 'id')::uuid from res where k = 'M1_t') and numero = 1)),
  '23514', null, 'una salida mayor que la entrada del bache no pasa'
);

-- Hora de llegada: solo con motivo y queda en el historial.
select lives_ok(
  format($q$select cafe.editar_lote(jsonb_build_object('lote_id', %L, 'motivo', 'Llegó antes', 'lote', jsonb_build_object('llegada_at', '2026-11-01T14:30:00Z')))$q$, pg_temp.lid('M1')),
  'el admin corrige la hora de llegada'
);

-- B-16 (FIN-161) · Peso recibido: UN solo campo (`peso_recibido_kg`), con motivo; el valor de la compra y los saldos se recalculan.
select pg_temp.comprar('M2', 27, 2);   -- 27 kg a $20.000/kg
select is((select valor_compra::text from cafe.lotes where id = pg_temp.lid('M2')), '540000.00', 'compra de partida: 27 kg × $20.000');
select throws_ok(
  format($q$select cafe.editar_lote(jsonb_build_object('lote_id', %L, 'motivo', 'prueba', 'lote', jsonb_build_object('num_bultos', 3)))$q$, pg_temp.lid('M2')),
  'P0001', 'datos_invalidos', 'una clave que no se puede corregir se rechaza, no se ignora en silencio'
);
select throws_ok(
  format($q$select cafe.editar_lote(jsonb_build_object('lote_id', %L, 'motivo', 'prueba', 'lote', jsonb_build_object('peso_recibido_kg', 0)))$q$, pg_temp.lid('M2')),
  'P0001', 'datos_invalidos', 'un peso recibido de cero se rechaza'
);
insert into res select 'PESO', cafe.editar_lote(jsonb_build_object(
  'lote_id', pg_temp.lid('M2'), 'motivo', 'Báscula mal calibrada', 'lote', jsonb_build_object('peso_recibido_kg', 25.5)));
select is(
  (select peso_recibido_kg::text || '/' || valor_compra::text from cafe.lotes where id = pg_temp.lid('M2')),
  '25.500/510000.00', 'corregir el peso recibido (27 → 25,5 kg) recalcula el valor de la compra'
);
select is(
  (select array_agg(referencia || ':' || campo || ':' || valor_anterior || '>' || valor_nuevo || ':' || motivo order by campo)
     from cafe.lote_ediciones where lote_id = pg_temp.lid('M2')),
  array[(select codigo from cafe.lotes where id = pg_temp.lid('M2')) || ':peso_recibido_kg:27.000>25.500:Báscula mal calibrada'],
  'la traza guarda el peso recibido, antes y después, con motivo'
);
select is(
  (select (r #>> '{antes,peso_recibido_kg}') || '>' || (r #>> '{despues,peso_recibido_kg}') from res where k = 'PESO'),
  '27.000>25.500', 'el «ver impacto» mide el peso recibido de antes y de después'
);

-- Con procesos: el peso no puede quedar por debajo de lo que ya se procesó, ni cambiarse por la vía directa.
select throws_ok(
  format($q$select cafe.editar_lote(jsonb_build_object('lote_id', %L, 'motivo', 'prueba', 'lote', jsonb_build_object('peso_recibido_kg', 20)))$q$, pg_temp.lid('M1')),
  'P0001', 'edicion_incoherente', 'bajar el peso recibido por debajo de lo ya tostado se rechaza (hay que corregir también el proceso)'
);
select throws_ok(
  format($q$update cafe.lotes set peso_recibido_kg = 26 where id = %L$q$, pg_temp.lid('M1')),
  'P0001', 'lote_bloqueado', 'con procesos, el peso recibido no cambia por la vía directa'
);
insert into res select 'PESO2', cafe.editar_lote(jsonb_build_object(
  'lote_id', pg_temp.lid('M1'), 'motivo', 'Se pesó de nuevo', 'lote', jsonb_build_object('peso_recibido_kg', 30)));
select is(
  (select peso_recibido_kg::text || '/' || valor_compra::text from cafe.lotes where id = pg_temp.lid('M1')),
  '30.000/600000.00', 'con procesos registrados, el administrador corrige el peso recibido por la RPC y el valor se recalcula'
);

-- 4. Lote anulado / entregado -----------------------------------------------------------------------------------------
select pg_temp.recibir('S1', 40.5, 1, array['tostion'], 'medio');
update cafe.lotes set anulado_at = now(), motivo_anulacion = 'Duplicado' where id = pg_temp.lid('S1');
select throws_ok(
  format($q$select cafe.editar_lote(jsonb_build_object('lote_id', %L, 'motivo', 'prueba', 'lote', jsonb_build_object('observaciones', 'x')))$q$, pg_temp.lid('S1')),
  'P0001', 'lote_anulado', 'un lote anulado no se edita'
);

-- 5. Aislamiento: otro cliente no ve el historial ni edita el lote ajeno -----------------------------------------------
reset role;
select tests.autenticar_como('owner-b@procesos.test');
select is((select count(*)::int from cafe.lote_ediciones), 0, 'otro cliente no ve el historial');

select * from finish();
rollback;
