-- Perfiles de tueste por tipo de café con vigencia (FIN-147 · B-18): cafe.perfil_tueste_tipo, RLS por tenant,
-- cafe.perfil_tueste_vigente(), siembra. Todo dentro de la transacción (rollback al final).
--   d1 owner A   d2 admin A   d3 operativo A   d4 viewer A   d5 owner B   d6 owner G (ganadería)
begin;

select plan(31);

insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-0000000000d1', 'authenticated', 'authenticated', 'owner-a@cafe.test'),
  ('00000000-0000-0000-0000-0000000000d2', 'authenticated', 'authenticated', 'admin-a@cafe.test'),
  ('00000000-0000-0000-0000-0000000000d3', 'authenticated', 'authenticated', 'operativo-a@cafe.test'),
  ('00000000-0000-0000-0000-0000000000d4', 'authenticated', 'authenticated', 'viewer-a@cafe.test'),
  ('00000000-0000-0000-0000-0000000000d5', 'authenticated', 'authenticated', 'owner-b@cafe.test'),
  ('00000000-0000-0000-0000-0000000000d6', 'authenticated', 'authenticated', 'owner-g@gan.test');

select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select platform.crear_tenant('Café A', 'cafe-a-t', 'cafe');
select platform.crear_tenant('Café B', 'cafe-b-t', 'cafe');
select platform.crear_tenant('Granja G', 'granja-g-t', 'ganaderia');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);

create temp table ids as
select 'a' as clave, id from public.tenants where slug = 'cafe-a-t'
union all select 'b', id from public.tenants where slug = 'cafe-b-t'
union all select 'g', id from public.tenants where slug = 'granja-g-t';
grant select on ids to authenticated;

insert into public.tenant_members (user_id, tenant_id, rol)
select m.user_id::uuid, (select id from ids where clave = m.t), m.rol::public.rol_tenant
  from (values
    ('00000000-0000-0000-0000-0000000000d1', 'a', 'owner'),
    ('00000000-0000-0000-0000-0000000000d2', 'a', 'admin'),
    ('00000000-0000-0000-0000-0000000000d3', 'a', 'operativo'),
    ('00000000-0000-0000-0000-0000000000d4', 'a', 'viewer'),
    ('00000000-0000-0000-0000-0000000000d5', 'b', 'owner'),
    ('00000000-0000-0000-0000-0000000000d6', 'g', 'owner')) as m(user_id, t, rol);

-- Ids de los tipos de cada cliente, claves «a:excelso», «b:excelso»… (como dueño, sin RLS).
create temp table tipos as
select i.clave || ':' || lower(t.nombre) as clave, t.id
  from cafe.tipos_cafe t join ids i on i.id = t.tenant_id;
grant select on tipos to authenticated;

-- 1. Estructura y privilegios ----------------------------------------------------------------------------------
select has_table('cafe', 'perfil_tueste_tipo', 'existe cafe.perfil_tueste_tipo');
select ok((select relrowsecurity from pg_class where oid = 'cafe.perfil_tueste_tipo'::regclass), 'tiene RLS activada');
select ok(
  not has_table_privilege('authenticated', 'cafe.perfil_tueste_tipo', 'update')
  and not has_table_privilege('authenticated', 'cafe.perfil_tueste_tipo', 'delete')
  and not has_table_privilege('service_role', 'cafe.perfil_tueste_tipo', 'delete')
  and not has_table_privilege('anon', 'cafe.perfil_tueste_tipo', 'select'),
  'nadie actualiza ni borra versiones y anon no las lee'
);
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'cafe.perfil_tueste_vigente(uuid, date)'::regprocedure),
  false, 'perfil_tueste_vigente es SECURITY INVOKER'
);
select ok(
  not has_function_privilege('anon', 'cafe.perfil_tueste_vigente(uuid, date)', 'execute')
  and has_function_privilege('authenticated', 'cafe.perfil_tueste_vigente(uuid, date)', 'execute')
  and not has_function_privilege('authenticated', 'cafe.sembrar_perfiles_tueste(uuid)', 'execute'),
  'privilegios de las funciones'
);

-- 2. Siembra del alta -----------------------------------------------------------------------------------------------
select is(
  (select array_agg(coalesce(tc.nombre, 'maquila') || ':' || p.nivel || ':' || p.temp_c || ':' || p.tiempo_min
                    order by tc.nombre nulls last)
     from cafe.perfil_tueste_tipo p left join cafe.tipos_cafe tc on tc.id = p.tipo_cafe_id
    where p.tenant_id = (select id from ids where clave = 'a')),
  array['Consumo:medio:222.0:17.0', 'Excelso:medio:216.0:17.0', 'maquila:medio:222.0:17.0'],
  'el alta siembra Excelso 216 °C, Consumo 222 °C y maquila 222 °C (Medio, 17 min)'
);
select is(
  (select count(*)::int from cafe.perfil_tueste_tipo where tenant_id = (select id from ids where clave = 'g')),
  0, 'ganadería no recibe perfiles'
);
select set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok($$select platform.seed_vertical((select id from ids where clave = 'a'), 'cafe')$$, 'seed_vertical se repite');
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.role', '', true);
select is(
  (select count(*)::int from cafe.perfil_tueste_tipo where tenant_id = (select id from ids where clave = 'a')),
  3, 'y no duplica los perfiles');

-- 3. Owner/admin crean versiones; vigencia ---------------------------------------------------------------------------
reset role;
select tests.autenticar_como('owner-a@cafe.test');

select lives_ok(
  $$insert into cafe.perfil_tueste_tipo (tipo_cafe_id, nivel, temp_c, tiempo_min, vigente_desde)
    values ((select id from tipos where clave = 'a:excelso'), 'alto', 220, 18, date '2026-12-01')$$,
  'el owner crea una nueva versión de Excelso');
select is(
  (select tenant_id from cafe.perfil_tueste_tipo where vigente_desde = date '2026-12-01'),
  (select id from ids where clave = 'a'), 'tenant_id se estampa solo');
select is(
  (select (nivel || ':' || temp_c)::text from cafe.perfil_tueste_vigente((select id from tipos where clave = 'a:excelso'), date '2026-11-30')),
  'medio:216.0', 'antes de la fecha rige la versión anterior (lotes anteriores no cambian)');
select is(
  (select (nivel || ':' || temp_c)::text from cafe.perfil_tueste_vigente((select id from tipos where clave = 'a:excelso'), date '2026-12-01')),
  'alto:220.0', 'desde la fecha rige la nueva');
select is(
  (select count(*)::int from cafe.perfil_tueste_vigente((select id from tipos where clave = 'a:excelso'), date '1999-01-01')),
  0, 'antes de la primera versión no hay perfil');
select is(
  (select temp_c from cafe.perfil_tueste_vigente(null, date '2026-11-30')),
  222.0::numeric, 'p_tipo = null devuelve el de maquila');

select throws_ok(
  $$insert into cafe.perfil_tueste_tipo (tipo_cafe_id, nivel, temp_c, tiempo_min, vigente_desde)
    values ((select id from tipos where clave = 'a:excelso'), 'bajo', 200, 15, date '2026-12-01')$$,
  '23505', null, 'una segunda versión del mismo tipo y fecha se rechaza');
select throws_ok(
  $$insert into cafe.perfil_tueste_tipo (tipo_cafe_id, nivel, temp_c, tiempo_min, vigente_desde)
    values (null, 'medio', 0, 17, date '2026-12-02')$$,
  '23514', null, 'una temperatura no positiva se rechaza');
select lives_ok(
  $$insert into cafe.perfil_tueste_tipo (tipo_cafe_id, nivel, temp_c, tiempo_min, vigente_desde)
    values (null, 'medio', 222, 17, date '2026-12-01'), (null, 'bajo', 210, 14, date '2026-12-02')$$,
  'maquila (tipo null) admite varias fechas');
select throws_ok(
  $$insert into cafe.perfil_tueste_tipo (tipo_cafe_id, nivel, temp_c, tiempo_min, vigente_desde)
    values (null, 'medio', 222, 17, date '2026-12-02')$$,
  '23505', null, 'y la unicidad también vale para tipo null');
select throws_ok($$update cafe.perfil_tueste_tipo set temp_c = 1$$, '42501', null, 'no se actualizan versiones');
select throws_ok($$delete from cafe.perfil_tueste_tipo$$, '42501', null, 'no se borran versiones');
select throws_ok(
  $$insert into cafe.perfil_tueste_tipo (tipo_cafe_id, nivel, temp_c, tiempo_min, vigente_desde)
    values ((select id from tipos where clave = 'b:excelso'), 'medio', 216, 17, date '2026-12-05')$$,
  '42501', null, 'no se cuelga un perfil de un tipo de otro cliente');

reset role;
select tests.autenticar_como('admin-a@cafe.test');
select lives_ok(
  $$insert into cafe.perfil_tueste_tipo (tipo_cafe_id, nivel, temp_c, tiempo_min, vigente_desde)
    values (null, 'medio', 225, 16, date '2026-12-10')$$, 'el admin crea una versión de maquila');

-- 4. Roles sin escritura ----------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('operativo-a@cafe.test');
select is((select count(*)::int from cafe.perfil_tueste_tipo), 7, 'el operativo lee los perfiles de su cliente');
select throws_ok(
  $$insert into cafe.perfil_tueste_tipo (tipo_cafe_id, nivel, temp_c, tiempo_min, vigente_desde)
    values (null, 'medio', 222, 17, date '2026-12-20')$$, '42501', null, 'el operativo no escribe perfiles');
reset role;
select tests.autenticar_como('viewer-a@cafe.test');
select is((select count(*)::int from cafe.perfil_tueste_tipo), 7, 'el viewer lee');
select throws_ok(
  $$insert into cafe.perfil_tueste_tipo (tipo_cafe_id, nivel, temp_c, tiempo_min, vigente_desde)
    values (null, 'medio', 222, 17, date '2026-12-20')$$, '42501', null, 'el viewer no escribe perfiles');

-- 5. Aislamiento por tenant -------------------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('owner-b@cafe.test');
select is((select count(*)::int from cafe.perfil_tueste_tipo), 3, 'B solo ve sus 3 perfiles');
select is((select count(*)::int from cafe.perfil_tueste_tipo where tenant_id = (select id from ids where clave = 'a')), 0,
  'B no ve los de A');
select is((select temp_c from cafe.perfil_tueste_vigente(null, date '2026-12-31')), 222.0::numeric,
  'perfil_tueste_vigente de B no ve las versiones de A (maquila 225 °C)');
reset role;
select tests.autenticar_como('owner-g@gan.test');
select is((select count(*)::int from cafe.perfil_tueste_tipo), 0, 'un cliente de ganadería (sin módulo) no ve nada');

select * from finish();
rollback;
