-- Cliente de café de PRUEBA para la Supabase LOCAL: "Cofradía (demo)" con su usuario propietario y datos de ejemplo.
--
-- NO es una migración ni forma parte de supabase/seed.sql: `db reset` lo borra y hay que volver a aplicarlo.
-- Se aplica a mano contra la base local (nunca contra staging ni producción: crea un usuario con contraseña conocida):
--
--   docker exec -i supabase_db_finca-toca psql -U postgres -v ON_ERROR_STOP=1 < supabase/dev/cafe-demo.sql
--
-- Es idempotente: si el cliente o el usuario ya existen no los duplica (los datos de ejemplo solo se cargan
-- la primera vez, cuando el cliente aún no tiene lotes). Usuario: cofradia.pruebas@cofradia.com, con la misma
-- contraseña de prueba que los usuarios de seed.sql (ver CLAUDE.md, «Desarrollo local»).
--
-- OJO con los tests: con este cliente cargado varios ficheros de `pnpm test:db` fallan por claves duplicadas
-- (50_membresias, 80, 90, 96_cafe_*, 98_cafe_lotes). Para correrlos: `pnpm db:reset`, `pnpm test:db` y, después,
-- volver a aplicar este script.
--
-- Los datos de ejemplo se crean por las mismas RPC que usa la app, suplantando al propietario (como hacen los
-- tests pgTAP), así que ejercitan RLS, consecutivos y reglas de negocio de verdad.

begin;

-- 1. Usuario (Auth) ---------------------------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
select
  '00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-0000000000c1', 'authenticated', 'authenticated',
  'cofradia.pruebas@cofradia.com',
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  '', '', '', '', '', '', '', ''
where not exists (select 1 from auth.users where email = 'cofradia.pruebas@cofradia.com');

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select u.id::text, u.id, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email = 'cofradia.pruebas@cofradia.com'
  and not exists (select 1 from auth.identities i where i.user_id = u.id);

-- 2. Cliente de café con todos sus módulos + membresía de propietario --------------------------------------------
do $$
declare
  v_tenant uuid;
  v_user   uuid := (select id from auth.users where email = 'cofradia.pruebas@cofradia.com');
begin
  select id into v_tenant from public.tenants where slug = 'cofradia-demo';
  if v_tenant is null then
    -- crear_tenant exige ser operador de plataforma: aquí se simula la clave de servicio (solo hasta el final de la
    -- transacción; el paso 3 vuelve a suplantar al propietario).
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    -- crear_tenant activa los módulos base del vertical (+ core.terceros, core.auditoria, core.equipo) y siembra
    -- tarifas, parámetros, series, consumidor final, insumos, tipos de café y productos terminados.
    v_tenant := platform.crear_tenant(
      'Cofradía (demo)', 'cofradia-demo', 'cafe', '900000000-1', null,
      array['cafe.dashboard', 'cafe.exportacion', 'cafe.ventas']
    );
  end if;

  insert into public.tenant_members (user_id, tenant_id, rol)
  values (v_user, v_tenant, 'owner')
  on conflict (user_id, tenant_id) do update set rol = 'owner', activo = true;
end $$;

-- 3. Datos de ejemplo (solo si el cliente aún no tiene lotes) -----------------------------------------------------
-- Se suplanta al propietario: a partir de aquí RLS y tenant_actual() aplican como en la app.
select set_config('request.jwt.claims',
  json_build_object('sub', '00000000-0000-0000-0000-0000000000c1', 'role', 'authenticated',
                    'email', 'cofradia.pruebas@cofradia.com')::text, true);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  v_prov    uuid;
  v_cli     uuid;
  v_cli2    uuid;
  v_excelso uuid;
  v_consumo uuid;
  v_r       jsonb;
  v_lote_mq uuid;
  v_lote_mp uuid;
  v_bultos  uuid[];
  v_baches  jsonb;
  v_in      numeric;
  v_out     numeric;
  v_hoy     date := current_date;
  v_art     uuid;
begin
  if exists (select 1 from cafe.lotes) then
    raise notice 'Cofradía (demo) ya tiene lotes: no se cargan datos de ejemplo.';
    return;
  end if;

  -- Terceros -------------------------------------------------------------------------------------------------
  insert into public.terceros (tipo_identificacion, identificacion, nombre, direccion, telefono, roles)
  values ('NIT', '8000123450', 'Cooperativa de Caficultores de Pereira', 'Cra 8 # 20-15, Pereira', '3101234567', array['proveedor'])
  returning id into v_prov;
  insert into public.terceros (tipo_identificacion, identificacion, nombre, direccion, telefono, roles)
  values ('CC', '1012345678', 'Juan Pérez', 'Vereda La Esperanza, Salento', '3157654321', array['cliente_servicio'])
  returning id into v_cli;
  insert into public.terceros (tipo_identificacion, identificacion, nombre, direccion, telefono, roles)
  values ('NIT', '9001112223', 'Finca El Mirador SAS', 'Km 3 vía Armenia', '3009876543', array['cliente_servicio', 'cliente'])
  returning id into v_cli2;

  select id into v_excelso from cafe.tipos_cafe where lower(nombre) = 'excelso';
  select id into v_consumo from cafe.tipos_cafe where lower(nombre) = 'consumo';

  -- Insumos de empaque: compra inicial de bolsas y etiquetas por presentación ------------------------------------
  for v_art in select id from public.articulos where tipo = 'insumo' and (atributos ->> 'clase') in ('bolsa', 'etiqueta') loop
    perform public.registrar_movimientos(
      jsonb_build_array(jsonb_build_object('articulo_id', v_art, 'cantidad', 500, 'motivo', 'compra',
                                           'costo_unitario', 450, 'observaciones', 'Compra inicial (demo)')),
      false);
  end loop;
  update public.articulos set stock_minimo = 100 where tipo = 'insumo' and (atributos ->> 'clase') = 'bolsa';

  -- Compra de marca propia: 375 kg de Excelso en 6 bultos a $18.500/kg -------------------------------------------
  v_r := cafe.registrar_compra(jsonb_build_object(
    'tercero_id', v_prov, 'tipo_cafe_id', v_excelso, 'fecha', v_hoy - 6, 'peso_kg', 375, 'num_bultos', 6,
    'precio_kg', 18500, 'factura_proveedor', 'FV-1234'));
  v_lote_mp := (v_r ->> 'id')::uuid;

  -- Recepciones de clientes ---------------------------------------------------------------------------------------
  -- 1) Ejemplo del informe: 500 kg, trilla + tostión + molienda (el empaque va incluido).
  v_r := cafe.registrar_recepcion(jsonb_build_object(
    'tercero_id', v_cli, 'fecha', v_hoy - 5, 'peso_kg', 500, 'num_bultos', 8, 'humedad_pct', 11.5, 'densidad', 680,
    'servicios', jsonb_build_array('trilla', 'tostion', 'molienda'), 'nivel_tueste', 'medio'));
  v_lote_mq := (v_r ->> 'id')::uuid;
  -- 2) Solo trilla, sin procesar todavía (queda en la cola de la planta).
  perform cafe.registrar_recepcion(jsonb_build_object(
    'tercero_id', v_cli2, 'fecha', v_hoy, 'peso_kg', 250, 'num_bultos', 4, 'humedad_pct', 12.8, 'densidad', 650,
    'servicios', jsonb_build_array('trilla')));

  -- Procesos del lote de servicio (ejemplo del informe): trilla 500→405, tostión 405→332 (30 baches), molienda 332→330
  select array_agg(id order by numero) into v_bultos from cafe.lote_bultos where lote_id = v_lote_mq;
  perform cafe.registrar_proceso(jsonb_build_object(
    'lote_id', v_lote_mq, 'tipo', 'trilla', 'fecha', v_hoy, 'bultos', to_jsonb(v_bultos),
    'peso_entrada_kg', null, 'peso_salida_kg', 405));

  select jsonb_agg(jsonb_build_object('peso_entrada_kg', 13.5,
                                      'peso_salida_kg', case when n < 30 then 11.066 else 11.086 end,
                                      'temperatura_c', 210) order by n)
    into v_baches
    from generate_series(1, 30) n;
  perform cafe.registrar_proceso(jsonb_build_object(
    'lote_id', v_lote_mq, 'tipo', 'tostion', 'fecha', v_hoy, 'bultos', to_jsonb(v_bultos),
    'peso_entrada_kg', 405, 'peso_salida_kg', 332, 'nivel_tueste', 'medio', 'baches', v_baches));
  perform cafe.registrar_proceso(jsonb_build_object(
    'lote_id', v_lote_mq, 'tipo', 'molienda', 'fecha', v_hoy, 'bultos', to_jsonb(v_bultos),
    'peso_entrada_kg', null, 'peso_salida_kg', 330));
  perform cafe.registrar_proceso(jsonb_build_object(
    'lote_id', v_lote_mq, 'tipo', 'empaque', 'fecha', v_hoy, 'bultos', to_jsonb(v_bultos),
    'peso_entrada_kg', null, 'peso_salida_kg', 330));

  -- Procesos del lote de marca propia: tostión de 4 de los 6 bultos (queda «parcial») y empaque de esos 4 -------------
  select array_agg(id order by numero) into v_bultos from (
    select id, numero from cafe.lote_bultos where lote_id = v_lote_mp order by numero limit 4) b;
  v_in := 250;   -- 4 bultos × 62,5 kg
  v_out := 205;  -- 18 % de merma
  select jsonb_agg(jsonb_build_object('peso_entrada_kg', e, 'peso_salida_kg', round(e * 0.82, 3)) order by n)
    into v_baches
    from (select n, case when n < 19 then 13.5 else 7 end as e from generate_series(1, 19) n) t;
  perform cafe.registrar_proceso(jsonb_build_object(
    'lote_id', v_lote_mp, 'tipo', 'tostion', 'fecha', v_hoy, 'bultos', to_jsonb(v_bultos),
    'peso_entrada_kg', v_in,
    'peso_salida_kg', (select sum((b ->> 'peso_salida_kg')::numeric) from jsonb_array_elements(v_baches) b),
    'nivel_tueste', 'medio', 'baches', v_baches));
  -- 200 kg en 500 g (400 uds) y el resto en 2.500 g
  perform cafe.registrar_empaque(jsonb_build_object(
    'lote_id', v_lote_mp, 'fecha', v_hoy, 'bultos', to_jsonb(v_bultos), 'peso_entrada_kg', null,
    'lineas', jsonb_build_array(jsonb_build_object('presentacion_g', 500, 'unidades', 240),
                                jsonb_build_object('presentacion_g', 2500, 'unidades', 32))));

  -- Remisión de entrega del lote de servicio listo ----------------------------------------------------------------
  perform cafe.generar_remision(jsonb_build_object('lote_id', v_lote_mq, 'fecha', v_hoy, 'recibido_por', 'Juan Pérez'));

  raise notice 'Datos de ejemplo cargados.';
end $$;

reset role;

commit;
