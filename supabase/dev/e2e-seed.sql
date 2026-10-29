-- Datos de los tests E2E (Playwright, FIN-117 / CO-36) para la Supabase LOCAL.
--
-- NO es una migración ni forma parte de supabase/seed.sql, y por eso mismo: el tenant de café que necesitan los tests
-- rompería pgTAP si viviera en el seed (varios ficheros de `pnpm test:db` cuentan clientes o dependen de claves que un
-- cliente extra duplica; ya pasaba con `cafe-demo.sql`). Lo aplica `e2e/global-setup.ts` antes de cada ejecución de
-- `pnpm test:e2e`, sobre la base que dejó `pnpm db:reset`. A mano:
--
--   docker exec -i supabase_db_finca-toca psql -U postgres -v ON_ERROR_STOP=1 < supabase/dev/e2e-seed.sql
--
-- Es IDEMPOTENTE: se puede aplicar tantas veces como se quiera sobre la misma base (reintentos, ejecuciones seguidas sin
-- `db:reset`); no duplica nada y solo repone el stock de insumos si lo agotaron las ejecuciones anteriores. Las pruebas
-- de regresión de ganadería y cooperativa NO necesitan nada de aquí: usan los usuarios de `seed.sql` (admin@vb.test,
-- coop.admin@test, coop.user@test).
--
-- SOLO LOCAL: crea usuarios con una contraseña conocida (`password123`). `global-setup.ts` se niega a aplicarlo si
-- `NEXT_PUBLIC_SUPABASE_URL` no es localhost. Nunca contra staging ni producción.
--
-- Qué crea (todo ficticio):
--   · Cliente de café «Cofradía (E2E)» (slug `cafe-e2e`) con sus módulos base + panel, exportación y ventas.
--   · Usuarios admin@cafe.test (admin), operativo@cafe.test (operativo) y gerencia@cafe.test (viewer).
--   · Un proveedor y un cliente de servicios, el rango de humedad 10–12 % y el de densidad 600–750, y stock de bolsas y
--     etiquetas para empacar. Las tarifas, mermas de referencia, tipos de café (Consumo y Excelso), series, consumidor
--     final y precios de 500 g los siembra la propia alta (`platform.crear_tenant`).
-- Cada test crea además sus propios lotes, compras y ventas: aquí solo está lo que comparten.

begin;

-- 1. Usuarios (Auth) -----------------------------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email,
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  '', '', '', '', '', '', '', ''
from (values
  ('00000000-0000-0000-0000-0000000000e1', 'admin@cafe.test'),
  ('00000000-0000-0000-0000-0000000000e2', 'operativo@cafe.test'),
  ('00000000-0000-0000-0000-0000000000e3', 'gerencia@cafe.test')
) as u(id, email)
where not exists (select 1 from auth.users x where x.email = u.email);

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select a.id::text, a.id, jsonb_build_object('sub', a.id::text, 'email', a.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users a
where a.email in ('admin@cafe.test', 'operativo@cafe.test', 'gerencia@cafe.test')
  and not exists (select 1 from auth.identities i where i.user_id = a.id);

-- 2. Cliente de café + membresías ----------------------------------------------------------------------------------
do $$
declare
  v_tenant uuid;
begin
  select id into v_tenant from public.tenants where slug = 'cafe-e2e';
  if v_tenant is null then
    -- crear_tenant exige ser operador de plataforma: aquí se simula la clave de servicio (solo hasta el final de la
    -- transacción). Activa los módulos base del vertical (+ core.terceros, core.auditoria, core.equipo) y siembra
    -- tarifas, parámetros, series, consumidor final, insumos, tipos de café y productos terminados.
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    v_tenant := platform.crear_tenant(
      'Cofradía (E2E)', 'cafe-e2e', 'cafe', '900000000-2', null,
      array['cafe.dashboard', 'cafe.exportacion', 'cafe.ventas']
    );
  end if;

  insert into public.tenant_members (user_id, tenant_id, rol)
  select a.id, v_tenant, m.rol::public.rol_tenant
  from (values
    ('admin@cafe.test', 'admin'),
    ('operativo@cafe.test', 'operativo'),
    ('gerencia@cafe.test', 'viewer')
  ) as m(email, rol)
  join auth.users a on a.email = m.email
  on conflict (user_id, tenant_id) do update set rol = excluded.rol, activo = true;
end $$;

-- 3. Parámetros de calidad (el alta los deja «sin configurar») ------------------------------------------------------
-- Se escriben como postgres con el tenant explícito (el DEFAULT tenant_actual() necesita sesión).
insert into public.parametros (tenant_id, clave, valor)
select t.id, p.clave, p.valor
from public.tenants t,
     (values
       ('cafe.humedad_rango_pct', '{"min": 10, "max": 12}'::jsonb),
       ('cafe.densidad_rango',    '{"min": 600, "max": 750}'::jsonb)
     ) as p(clave, valor)
where t.slug = 'cafe-e2e'
on conflict (tenant_id, clave) do update set valor = excluded.valor;

-- 4. Datos operativos: se crean como el administrador, por las mismas vías que la app (RLS y consecutivos de verdad) ---
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000e1', 'role', 'authenticated',
                    'email', 'admin@cafe.test')::text, true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000e1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  v_art uuid;
  v_stock numeric;
begin
  -- Proveedor y cliente de servicios compartidos por los tests (los lotes y las ventas son de cada test).
  insert into public.terceros (tipo_identificacion, identificacion, nombre, direccion, telefono, roles)
  select 'NIT', '8009990010', 'Proveedor E2E SAS', 'Cra 1 # 2-3, Pereira', '3100000001', array['proveedor']
  where not exists (select 1 from public.terceros where identificacion = '8009990010');

  insert into public.terceros (tipo_identificacion, identificacion, nombre, direccion, telefono, roles)
  select 'CC', '1009990020', 'Cliente E2E', 'Vereda La Palma, Salento', '3100000002', array['cliente_servicio']
  where not exists (select 1 from public.terceros where identificacion = '1009990020');

  -- Bolsas y etiquetas: stock de sobra para que ningún empaque de los tests dispare avisos de faltante. Se repone hasta
  -- 20.000 si una ejecución anterior lo gastó (los tests miden diferencias, no valores absolutos).
  for v_art in select id from public.articulos where tipo = 'insumo' and (atributos ->> 'clase') in ('bolsa', 'etiqueta') loop
    select coalesce(stock, 0) into v_stock from public.v_stock where articulo_id = v_art;
    if coalesce(v_stock, 0) < 5000 then
      perform public.registrar_movimientos(
        jsonb_build_array(jsonb_build_object('articulo_id', v_art, 'cantidad', 20000 - coalesce(v_stock, 0), 'motivo', 'compra',
                                             'costo_unitario', 450, 'observaciones', 'Reposición E2E')),
        false);
    end if;
  end loop;
end $$;

reset role;

commit;
