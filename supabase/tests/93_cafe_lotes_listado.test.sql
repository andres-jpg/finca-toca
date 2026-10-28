-- Ficha del lote (FIN-110 · CO-29): cafe.responsables_lote(p_lote), el email de quienes registraron el lote y sus
-- procesos, legible por cualquier miembro (incluido viewer) pero SOLO del cliente actual.
-- Todo se crea AQUÍ dentro de la transacción (rollback al final): dos clientes de café (A y B), sin depender del seed.
--   p1 owner A   p2 operativo A   p3 viewer A   p4 owner B   p5 usuario sin membresía
begin;

select plan(13);

-- 0. Preparación --------------------------------------------------------------------------------------------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000093a1', 'authenticated', 'authenticated', 'owner-a@listado.test'),
  ('00000000-0000-0000-0000-0000000093a2', 'authenticated', 'authenticated', 'operativo-a@listado.test'),
  ('00000000-0000-0000-0000-0000000093a3', 'authenticated', 'authenticated', 'viewer-a@listado.test'),
  ('00000000-0000-0000-0000-0000000093a4', 'authenticated', 'authenticated', 'owner-b@listado.test'),
  ('00000000-0000-0000-0000-0000000093a5', 'authenticated', 'authenticated', 'sin-cliente@listado.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Listado A', 'listado-a-t', 'cafe');
select platform.crear_tenant('Listado B', 'listado-b-t', 'cafe');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'listado-a-t'
union all select 'b', id from public.tenants where slug = 'listado-b-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), m.rol::public.rol_tenant
  from (values
    ('00000000-0000-0000-0000-0000000093a1', 'a', 'owner'),
    ('00000000-0000-0000-0000-0000000093a2', 'a', 'operativo'),
    ('00000000-0000-0000-0000-0000000093a3', 'a', 'viewer'),
    ('00000000-0000-0000-0000-0000000093a4', 'b', 'owner')) as m(user_id, t, rol);

with t as (
  insert into public.terceros (tenant_id, nombre, direccion, telefono, identificacion, roles)
  select i.id, 'Cliente ' || upper(i.clave), 'Calle 1', '3000000000', '93000' || (case i.clave when 'a' then '1' else '2' end),
         array['cliente_servicio']
    from ids i
  returning identificacion, id
)
insert into ids select case identificacion when '930001' then 'ca' else 'cb' end, id from t;

create temp table res (k text primary key, r jsonb);
grant select, insert on res to authenticated;

-- 1. Estructura -----------------------------------------------------------------------------------------------
select ok(
  (select p.prosecdef from pg_proc p where p.oid = 'cafe.responsables_lote(uuid)'::regprocedure),
  'responsables_lote es SECURITY DEFINER (lee auth.users)'
);
select ok(
  not has_function_privilege('anon', 'cafe.responsables_lote(uuid)', 'execute')
  and has_function_privilege('authenticated', 'cafe.responsables_lote(uuid)', 'execute'),
  'anon no la ejecuta; authenticated sí'
);

-- 2. Un lote con dos autores: el operativo lo recibe y el owner anula su trilla ---------------------------------------
select tests.autenticar_como('operativo-a@listado.test');
insert into res
select 'L', cafe.registrar_recepcion(jsonb_build_object(
  'tercero_id', (select id from ids where clave = 'ca'), 'fecha', to_char(current_date, 'YYYY-MM-DD'),
  'peso_kg', 100, 'num_bultos', 2, 'servicios', to_jsonb(array['trilla'])));
insert into res
select 'P', cafe.registrar_proceso(jsonb_build_object(
  'lote_id', (select (r ->> 'id')::uuid from res where k = 'L'), 'tipo', 'trilla', 'fecha', to_char(current_date, 'YYYY-MM-DD'),
  'peso_salida_kg', 80,
  'bultos', to_jsonb((select array_agg(b.id) from cafe.lote_bultos b where b.lote_id = (select (r ->> 'id')::uuid from res where k = 'L')))));

select is(
  (select array_agg(email order by email) from cafe.responsables_lote((select (r ->> 'id')::uuid from res where k = 'L'))),
  array['operativo-a@listado.test'],
  'el operativo registró el lote y el proceso: aparece una sola vez'
);

reset role;
select tests.autenticar_como('owner-a@listado.test');
select cafe.anular_proceso((select (r ->> 'id')::uuid from res where k = 'P'), 'Pesaje equivocado');
select is(
  (select array_agg(email order by email) from cafe.responsables_lote((select (r ->> 'id')::uuid from res where k = 'L'))),
  array['operativo-a@listado.test', 'owner-a@listado.test'],
  'quien anula el proceso también figura'
);

-- 3. Gerencia (viewer) lo lee igual -------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('viewer-a@listado.test');
select is(
  (select count(*)::int from cafe.responsables_lote((select (r ->> 'id')::uuid from res where k = 'L'))), 2,
  'un viewer ve quién registró el lote (solo lectura)'
);
select is(
  (select count(*)::int from cafe.v_lotes where id = (select (r ->> 'id')::uuid from res where k = 'L')), 1,
  'el viewer lee el lote en v_lotes'
);

-- 4. Aislamiento entre clientes ------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('owner-b@listado.test');
select is(
  (select count(*)::int from cafe.responsables_lote((select (r ->> 'id')::uuid from res where k = 'L'))), 0,
  'otro cliente no obtiene los emails de un lote ajeno'
);
select is(
  (select count(*)::int from cafe.responsables_lote(gen_random_uuid())), 0,
  'un lote inexistente devuelve cero filas'
);
select is(
  (select count(*)::int from cafe.v_lotes where id = (select (r ->> 'id')::uuid from res where k = 'L')), 0,
  'otro cliente no ve el lote en v_lotes'
);

-- 5. Sin cliente o sin módulo ----------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('sin-cliente@listado.test');
select throws_ok(
  format($$select * from cafe.responsables_lote(%L)$$, (select (r ->> 'id')::uuid from res where k = 'L')),
  '42501', null, 'una cuenta sin cliente no la ejecuta'
);

reset role;
update public.tenant_modulos set activo = false
 where tenant_id = (select id from ids where clave = 'a') and modulo_id = 'cafe.recepcion';
select tests.autenticar_como('viewer-a@listado.test');
select throws_ok(
  format($$select * from cafe.responsables_lote(%L)$$, (select (r ->> 'id')::uuid from res where k = 'L')),
  '42501', null, 'sin el módulo cafe.recepcion no se lee'
);
select is(
  (select count(*)::int from cafe.v_lotes), 0, 'y la vista tampoco muestra lotes'
);

-- 6. Quien ya no es miembro del cliente no se expone (el email es de la cuenta, no del cliente).
reset role;
update public.tenant_modulos set activo = true
 where tenant_id = (select id from ids where clave = 'a') and modulo_id = 'cafe.recepcion';
delete from public.tenant_members where user_id = '00000000-0000-0000-0000-0000000093a2';
reset role;
select tests.autenticar_como('owner-a@listado.test');
select is(
  (select array_agg(email) from cafe.responsables_lote((select (r ->> 'id')::uuid from res where k = 'L'))),
  array['owner-a@listado.test'],
  'quien dejó de ser miembro del cliente ya no se expone'
);

select * from finish();
rollback;
