-- =============================================================================
-- SEED DE DESARROLLO LOCAL (FIN-82 / CO-02)
--
-- Lo ejecuta `supabase db reset` (pnpm db:reset) justo después de aplicar las migraciones.
-- SOLO LOCAL: crea usuarios con una contraseña conocida (`password123`). NO lo ejecutes
-- contra staging ni producción. Todo son datos ficticios.
--
-- Las fechas son relativas a `current_date` para que el dashboard (mes en curso), las
-- alertas y los "últimos días" no se queden vacíos; la forma de los datos es siempre la misma.
--
-- Slugs: se usan los reales (`villa-blanca`, `el-velero`) porque el código los compara
-- (módulo Arriendos de Villa Blanca, campos de sangre de El Velero). Solo el nombre dice "demo".
--
-- `tenant_id` se pasa SIEMPRE explícito: su DEFAULT `tenant_actual()` depende de auth.uid()
-- y el seed corre sin sesión, así que devolvería NULL.
-- =============================================================================

-- 1. Clientes ---------------------------------------------------------------------

INSERT INTO public.tenants (id, nombre, slug) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'Villa Blanca (demo)', 'villa-blanca'),
  ('00000000-0000-0000-0000-0000000000a2', 'El Velero (demo)', 'el-velero');

-- 2. Usuarios (Auth) + roles ---------------------------------------------------------
-- Patrón documentado por Supabase: auth.users + auth.identities. Los *_token van a ''
-- (no NULL) o GoTrue falla al leer la fila.

INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
)
SELECT
  '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email,
  extensions.crypt('password123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(),
  '', '', '', '', '', '', '', ''
FROM (VALUES
  ('00000000-0000-0000-0000-0000000000b1', 'admin@vb.test'),
  ('00000000-0000-0000-0000-0000000000b2', 'user@vb.test'),
  ('00000000-0000-0000-0000-0000000000b3', 'viewer@vb.test'),
  ('00000000-0000-0000-0000-0000000000b4', 'admin@velero.test'),
  ('00000000-0000-0000-0000-0000000000b5', 'coop.admin@test'),
  ('00000000-0000-0000-0000-0000000000b6', 'coop.user@test')
) AS u(id, email);

INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT id::text, id, jsonb_build_object('sub', id::text, 'email', email, 'email_verified', true),
       'email', now(), now(), now()
FROM auth.users
WHERE id::text LIKE '00000000-0000-0000-0000-0000000000b%';

INSERT INTO public.roles (user_id, rol, tenant_id) VALUES
  ('00000000-0000-0000-0000-0000000000b1', 'admin',             '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b2', 'user',              '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b3', 'viewer',            '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000b4', 'admin',             '00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000b5', 'cooperativa_admin', NULL),
  ('00000000-0000-0000-0000-0000000000b6', 'cooperativa_user',  NULL);

-- 3. Catálogos de gastos / ingresos (los mismos para los dos clientes) --------------------
-- El código depende de tres nombres: subconcepto de ingreso que contenga "leche",
-- "Leche para crías" (gasto) y "Arriendos" (gasto, módulo de Villa Blanca).

INSERT INTO public.conceptos_gasto (nombre, tenant_id)
SELECT c.nombre, t.id
FROM public.tenants t
CROSS JOIN (VALUES ('Alimentación animal'), ('Operación y mantenimiento'), ('Sanidad')) AS c(nombre);

INSERT INTO public.subconceptos_gasto (concepto_id, nombre, tenant_id)
SELECT cg.id, s.sub, cg.tenant_id
FROM (VALUES
  ('Alimentación animal', 'Concentrado'),
  ('Alimentación animal', 'Leche para crías'),
  ('Alimentación animal', 'Sal mineralizada'),
  ('Operación y mantenimiento', 'Arriendos'),
  ('Operación y mantenimiento', 'Mano de obra'),
  ('Operación y mantenimiento', 'Combustible'),
  ('Sanidad', 'Medicamentos'),
  ('Sanidad', 'Vacunas')
) AS s(concepto, sub)
JOIN public.conceptos_gasto cg ON cg.nombre = s.concepto;

INSERT INTO public.conceptos_ingreso (nombre, tenant_id)
SELECT c.nombre, t.id
FROM public.tenants t
CROSS JOIN (VALUES ('Ventas')) AS c(nombre);

INSERT INTO public.subconceptos_ingreso (concepto_id, nombre, tenant_id)
SELECT ci.id, s.sub, ci.tenant_id
FROM (VALUES
  ('Ventas', 'Venta de leche'),
  ('Ventas', 'Venta de animales')
) AS s(concepto, sub)
JOIN public.conceptos_ingreso ci ON ci.nombre = s.concepto;

-- 4. Precio del litro (sin él no se generan los apuntes automáticos de la leche) -----------

INSERT INTO public.precios (valor, tipo, tenant_id)
SELECT 2200, 'leche', id FROM public.tenants;

-- 5. Animales: 3 por cliente (vaca cargada, novilla, toro) --------------------------------

INSERT INTO public.animales (
  id, tenant_id, identificador, nombre, sexo, raza, origen, fecha_nacimiento,
  estado_productivo, estado_reproductivo, sangre, nombre_largo
) VALUES
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-0000000000a1', 'VB-001', 'Luna',   'hembra', 'holstein', 'finca', current_date - 1800, 'produccion', 'cargada',  NULL, NULL),
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-0000000000a1', 'VB-002', 'Estrella','hembra', 'jersey',   'finca', current_date - 430,  'levante_2',  'servicio', NULL, NULL),
  ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-0000000000a1', 'VB-T01', 'Rayo',    'macho',  'holstein', 'externa', current_date - 1500, 'reproductor', NULL,    NULL, NULL),
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0000-0000000000a2', 'EV-001', 'Aurora',  'hembra', 'jerhol',   'finca', current_date - 1700, 'produccion', 'cargada',  'HOL:50% x JER:50%', 'Aurora del Velero'),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0000-0000000000a2', 'EV-002', 'Brisa',   'hembra', 'ayrshire', 'finca', current_date - 410,  'levante_2',  'servicio', 'AYR:75% x HOL:25%', 'Brisa del Velero'),
  ('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0000-0000000000a2', 'EV-T01', 'Trueno',  'macho',  'holstein', 'externa', current_date - 1400, 'reproductor', NULL,    NULL, NULL);

-- Una cría con su madre, para ver la genealogía en la ficha
UPDATE public.animales SET madre_id = '00000000-0000-0000-0001-000000000001', padre_id = '00000000-0000-0000-0001-000000000003'
WHERE id = '00000000-0000-0000-0001-000000000002';
UPDATE public.animales SET madre_id = '00000000-0000-0000-0002-000000000001', padre_id = '00000000-0000-0000-0002-000000000003'
WHERE id = '00000000-0000-0000-0002-000000000002';

-- 6. Pajillas: un lote por cliente (la inseminación descuenta stock de aquí) ----------------

INSERT INTO public.pajillas (id, tenant_id, toro_nombre, toro_ref_id, proveedor, fecha_compra, cantidad, cantidad_disponible, raza) VALUES
  ('00000000-0000-0000-0003-000000000001', '00000000-0000-0000-0000-0000000000a1', 'Toro Demo A', 'DEMO-A', 'Proveedor demo', current_date - 200, 10, 9, 'holstein'),
  ('00000000-0000-0000-0003-000000000002', '00000000-0000-0000-0000-0000000000a2', 'Toro Demo B', 'DEMO-B', 'Proveedor demo', current_date - 200, 10, 9, 'jersey');

-- 7. Eventos: 5 por cliente ---------------------------------------------------------------
-- Coherentes con el estado: parto → inseminación → confirmación de preñez (vaca ya `cargada`),
-- una vacunación con revacunación a 1 mes (alerta cercana) y un celo de la novilla.

INSERT INTO public.eventos_animal (
  tenant_id, animal_id, animal_tipo, tipo_evento, fecha, descripcion, resultado, pajilla_id,
  requiere_revacunacion, periodo_revacunacion, fecha_revacunacion
)
SELECT t.id, v.animal_id, 'vaca', v.tipo, current_date + v.dias, v.descripcion, v.resultado, v.pajilla_id,
       v.req, v.periodo, v.f_reva
FROM (VALUES
  ('00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0001-000000000001'::uuid, 'parto',               -150, 'Parto normal (demo)',          NULL,      NULL::uuid,                                   NULL::boolean, NULL, NULL::date),
  ('00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0001-000000000001'::uuid, 'inseminacion',         -60, 'Inseminación artificial (demo)', NULL,   '00000000-0000-0000-0003-000000000001'::uuid, NULL,          NULL, NULL),
  ('00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0001-000000000001'::uuid, 'confirmacion_prenez',  -20, 'Preñez confirmada (demo)',     'cargada', NULL,                                          NULL,          NULL, NULL),
  ('00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0001-000000000001'::uuid, 'vacunacion',           -10, 'Vacuna aftosa (demo)',          NULL,      NULL,                                          true,          '1_mes', current_date + 20),
  ('00000000-0000-0000-0000-0000000000a1'::uuid, '00000000-0000-0000-0001-000000000002'::uuid, 'celo',                  -3, 'Celo observado (demo)',         NULL,      NULL,                                          NULL,          NULL, NULL),
  ('00000000-0000-0000-0000-0000000000a2'::uuid, '00000000-0000-0000-0002-000000000001'::uuid, 'parto',               -150, 'Parto normal (demo)',          NULL,      NULL,                                          NULL,          NULL, NULL),
  ('00000000-0000-0000-0000-0000000000a2'::uuid, '00000000-0000-0000-0002-000000000001'::uuid, 'inseminacion',         -60, 'Inseminación artificial (demo)', NULL,   '00000000-0000-0000-0003-000000000002'::uuid, NULL,          NULL, NULL),
  ('00000000-0000-0000-0000-0000000000a2'::uuid, '00000000-0000-0000-0002-000000000001'::uuid, 'confirmacion_prenez',  -20, 'Preñez confirmada (demo)',     'cargada', NULL,                                          NULL,          NULL, NULL),
  ('00000000-0000-0000-0000-0000000000a2'::uuid, '00000000-0000-0000-0002-000000000001'::uuid, 'vacunacion',           -10, 'Vacuna aftosa (demo)',          NULL,      NULL,                                          true,          '1_mes', current_date + 20),
  ('00000000-0000-0000-0000-0000000000a2'::uuid, '00000000-0000-0000-0002-000000000002'::uuid, 'celo',                  -3, 'Celo observado (demo)',         NULL,      NULL,                                          NULL,          NULL, NULL)
) AS v(tenant_id, animal_id, tipo, dias, descripcion, resultado, pajilla_id, req, periodo, f_reva)
JOIN public.tenants t ON t.id = v.tenant_id;

-- 8. Extracciones de leche: 10 días por cliente ---------------------------------------------

INSERT INTO public.extracciones_leche (tenant_id, fecha, litros_cantina, litros_cria, vacas_en_produccion)
SELECT t.id, current_date - g,
       (CASE WHEN t.slug = 'el-velero' THEN 140 ELSE 200 END + g * 3)::real,
       (10 + g % 3)::real,
       CASE WHEN t.slug = 'el-velero' THEN 12 ELSE 18 END
FROM public.tenants t
CROSS JOIN generate_series(0, 9) AS g;

-- 9. Gastos e ingresos manuales de ejemplo (los de la leche los genera la app) ---------------

INSERT INTO public.gastos (tenant_id, fecha, valor, subconcepto_id, proveedor, pagado, observaciones)
SELECT sg.tenant_id, current_date - 5, 450000, sg.id, 'Agropecuaria Demo', false, 'Gasto de ejemplo (demo)'
FROM public.subconceptos_gasto sg WHERE sg.nombre = 'Concentrado';

INSERT INTO public.ingresos (tenant_id, fecha, valor, subconcepto_id, observaciones)
SELECT si.tenant_id, current_date - 4, 1200000, si.id, 'Ingreso de ejemplo (demo)'
FROM public.subconceptos_ingreso si WHERE si.nombre = 'Venta de animales';

-- 10. Cooperativa: 2 fincas, 1 ruta, 1 itinerario, 5 recolecciones ---------------------------
-- Las tablas con id serial NO llevan id explícito (la secuencia seguiría en 1 y el siguiente
-- alta desde la app chocaría). `itinerarios.id` no tiene default, así que ahí va explícito.

INSERT INTO public.fincas_cooperativa (nombre, precio_litro, activa, metodo_pago) VALUES
  ('Finca La Esperanza (demo)', 1900.00, true, 'conductor'),
  ('Finca El Roble (demo)',     1850.00, true, 'punto_venta');

INSERT INTO public.rutas_cooperativa (nombre) VALUES ('Ruta Norte (demo)');

INSERT INTO public.rutas_fincas (ruta_id, finca_id, orden)
SELECT (SELECT id FROM public.rutas_cooperativa WHERE nombre = 'Ruta Norte (demo)'), f.id,
       row_number() OVER (ORDER BY f.nombre) - 1
FROM public.fincas_cooperativa f;

INSERT INTO public.itinerarios (id, nombre) VALUES (1, 'Itinerario 1 (demo)');

INSERT INTO public.itinerarios_fincas (itinerario_id, finca_id, orden)
SELECT 1, f.id, row_number() OVER (ORDER BY f.nombre) - 1
FROM public.fincas_cooperativa f;

INSERT INTO public.user_itinerarios (user_id, itinerario_id) VALUES
  ('00000000-0000-0000-0000-0000000000b6', 1);

INSERT INTO public.recolecciones (finca_id, fecha, litros, precio_litro)
SELECT f.id, current_date - r.dias, r.litros, f.precio_litro
FROM (VALUES
  ('Finca La Esperanza (demo)', 0, 850.50),
  ('Finca La Esperanza (demo)', 1, 820.00),
  ('Finca La Esperanza (demo)', 2, 835.25),
  ('Finca El Roble (demo)',     0, 410.00),
  ('Finca El Roble (demo)',     1, 395.75)
) AS r(finca, dias, litros)
JOIN public.fincas_cooperativa f ON f.nombre = r.finca;
