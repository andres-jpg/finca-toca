-- 2026-08-05 — Multi-tenancy del lado finca (Villa Blanca + El Velero, y los que vengan).
--
-- Aplicada en 4 migraciones: multitenancy_1_tenants_y_helpers, multitenancy_2_columna_tenant_id,
-- multitenancy_3_politicas_rls y multitenancy_4_seed_conceptos_el_velero.
--
-- ============================================================================
-- DECISIONES
-- ============================================================================
--
-- 1. La tabla se llama `tenants` y la columna `tenant_id`, NO `fincas`/`finca_id`: `finca_id`
--    ya significa "finca proveedora de la cooperativa" en recolecciones, rutas_fincas,
--    itinerarios_fincas y pagos_finca (22.000+ filas). Reusar el nombre haría ambiguo el
--    esquema entero. Un `tenant` es un cliente de la app; una `fincas_cooperativa` es un
--    proveedor de leche de la cooperativa. No son lo mismo.
--
-- 2. El módulo de cooperativa queda FUERA del multi-tenancy a propósito: es otro negocio
--    (una única cooperativa con sus fincas proveedoras) y tiene sus propios roles. Los roles
--    `cooperativa_admin`/`cooperativa_user` llevan `roles.tenant_id` a NULL.
--
-- 3. El aislamiento se apoya en dos mecanismos que hacen innecesario tocar los Server Actions:
--      - lectura: RLS filtra por `tenant_id = tenant_actual()`, así que toda consulta ya
--        existente devuelve solo lo del cliente de la sesión;
--      - escritura: `DEFAULT public.tenant_actual()` estampa el cliente en cada INSERT, y el
--        WITH CHECK de RLS impide falsearlo.
--    Esto evita el riesgo de olvidar un `tenant_id` en alguno de los ~30 INSERT de la app.
--
-- 4. Rendimiento (guía de RLS de Supabase): las políticas antiguas evaluaban
--    `EXISTS (SELECT 1 FROM roles WHERE user_id = auth.uid() ...)` POR CADA FILA. Ahora usan
--    `(SELECT public.rol_actual())` y `(SELECT public.tenant_actual())`, funciones STABLE
--    SECURITY DEFINER que Postgres evalúa una vez por consulta. Además `roles.user_id` no
--    tenía índice pese a que TODAS las políticas de la base filtran por él.
--
-- ============================================================================
-- 1) TENANTS, VÍNCULO CON USUARIOS Y HELPERS
-- ============================================================================
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.tenants (nombre, slug) VALUES
  ('Villa Blanca', 'villa-blanca'),
  ('El Velero', 'el-velero');

ALTER TABLE public.roles ADD COLUMN tenant_id uuid REFERENCES public.tenants(id);
CREATE UNIQUE INDEX roles_user_id_key ON public.roles (user_id);
CREATE INDEX roles_tenant_id_idx ON public.roles (tenant_id);

UPDATE public.roles SET tenant_id = (SELECT id FROM public.tenants WHERE slug = 'villa-blanca')
WHERE rol IN ('admin', 'user', 'viewer');

INSERT INTO public.roles (user_id, rol, tenant_id)
SELECT u.id, 'admin'::public.rol, t.id
FROM auth.users u, public.tenants t
WHERE u.email = 'elvelero@appfinca.com' AND t.slug = 'el-velero';

CREATE OR REPLACE FUNCTION public.tenant_actual()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT tenant_id FROM public.roles WHERE user_id = (SELECT auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.rol_actual()
RETURNS public.rol LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT rol FROM public.roles WHERE user_id = (SELECT auth.uid())
$$;

-- Postgres concede EXECUTE a PUBLIC al crear una función: revocar solo a anon no basta.
REVOKE EXECUTE ON FUNCTION public.tenant_actual() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rol_actual() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_actual() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rol_actual() TO authenticated;

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenants_select ON public.tenants FOR SELECT TO authenticated
  USING (id = (SELECT public.tenant_actual()));

-- ============================================================================
-- 2) COLUMNA tenant_id EN LAS 12 TABLAS DEL LADO FINCA
-- ============================================================================
DO $$
DECLARE
  t text;
  vb uuid := (SELECT id FROM public.tenants WHERE slug = 'villa-blanca');
  tablas text[] := ARRAY[
    'animales', 'eventos_animal', 'extracciones_leche', 'gastos', 'ingresos', 'pagos',
    'pajillas', 'precios', 'conceptos_gasto', 'subconceptos_gasto',
    'conceptos_ingreso', 'subconceptos_ingreso'
  ];
BEGIN
  FOREACH t IN ARRAY tablas LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN tenant_id uuid REFERENCES public.tenants(id)', t);
    EXECUTE format('UPDATE public.%I SET tenant_id = %L', t, vb);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', t);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT public.tenant_actual()', t);
    EXECUTE format('CREATE INDEX %I ON public.%I (tenant_id)', t || '_tenant_id_idx', t);
  END LOOP;
END $$;

-- Los nombres de concepto eran únicos GLOBALES: dos clientes no podrían tener ambos
-- "Alimentación". Pasan a ser únicos dentro de cada cliente.
ALTER TABLE public.conceptos_gasto DROP CONSTRAINT conceptos_gasto_nombre_key;
ALTER TABLE public.conceptos_gasto ADD CONSTRAINT conceptos_gasto_tenant_nombre_key UNIQUE (tenant_id, nombre);
ALTER TABLE public.conceptos_ingreso DROP CONSTRAINT conceptos_ingreso_nombre_key;
ALTER TABLE public.conceptos_ingreso ADD CONSTRAINT conceptos_ingreso_tenant_nombre_key UNIQUE (tenant_id, nombre);

-- ============================================================================
-- 3) POLÍTICAS RLS  (la matriz de roles se conserva idéntica a la anterior)
-- ============================================================================
DO $$
DECLARE
  t text;
  operativas text[] := ARRAY['animales','eventos_animal','extracciones_leche','gastos','ingresos','pagos','pajillas'];
  config text[] := ARRAY['precios','conceptos_gasto','subconceptos_gasto','conceptos_ingreso','subconceptos_ingreso'];
  lectores text := '(SELECT public.rol_actual()) = ANY (ARRAY[''admin'',''user'',''viewer'']::public.rol[])';
  escritores text := '(SELECT public.rol_actual()) = ANY (ARRAY[''admin'',''user'']::public.rol[])';
  solo_admin text := '(SELECT public.rol_actual()) = ''admin''::public.rol';
  mismo_cliente text := 'tenant_id = (SELECT public.tenant_actual())';
BEGIN
  FOREACH t IN ARRAY (operativas || config) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s AND %s)',
                   t || '_select', t, mismo_cliente, lectores);
  END LOOP;

  FOREACH t IN ARRAY operativas LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s AND %s)',
                   t || '_insert', t, mismo_cliente, escritores);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s AND %s) WITH CHECK (%s AND %s)',
                   t || '_update', t, mismo_cliente, escritores, mismo_cliente, escritores);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s AND %s)',
                   t || '_delete', t, mismo_cliente, escritores);
  END LOOP;

  FOREACH t IN ARRAY config LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s AND %s)',
                   t || '_insert', t, mismo_cliente, solo_admin);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s AND %s) WITH CHECK (%s AND %s)',
                   t || '_update', t, mismo_cliente, solo_admin, mismo_cliente, solo_admin);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s AND %s)',
                   t || '_delete', t, mismo_cliente, solo_admin);
  END LOOP;
END $$;

-- ============================================================================
-- 4) SEMILLA DEL NUEVO CLIENTE — solo taxonomía, ningún dato de negocio
-- ============================================================================
WITH vb AS (SELECT id FROM public.tenants WHERE slug = 'villa-blanca'),
     ev AS (SELECT id FROM public.tenants WHERE slug = 'el-velero'),
     nuevos_cg AS (
       INSERT INTO public.conceptos_gasto (nombre, tenant_id)
       SELECT c.nombre, (SELECT id FROM ev)
       FROM public.conceptos_gasto c WHERE c.tenant_id = (SELECT id FROM vb)
       RETURNING id, nombre
     )
INSERT INTO public.subconceptos_gasto (concepto_id, nombre, tenant_id)
SELECT n.id, s.nombre, (SELECT id FROM ev)
FROM public.subconceptos_gasto s
JOIN public.conceptos_gasto c ON c.id = s.concepto_id AND c.tenant_id = (SELECT id FROM vb)
JOIN nuevos_cg n ON n.nombre = c.nombre;

WITH vb AS (SELECT id FROM public.tenants WHERE slug = 'villa-blanca'),
     ev AS (SELECT id FROM public.tenants WHERE slug = 'el-velero'),
     nuevos_ci AS (
       INSERT INTO public.conceptos_ingreso (nombre, tenant_id)
       SELECT c.nombre, (SELECT id FROM ev)
       FROM public.conceptos_ingreso c WHERE c.tenant_id = (SELECT id FROM vb)
       RETURNING id, nombre
     )
INSERT INTO public.subconceptos_ingreso (concepto_id, nombre, tenant_id)
SELECT n.id, s.nombre, (SELECT id FROM ev)
FROM public.subconceptos_ingreso s
JOIN public.conceptos_ingreso c ON c.id = s.concepto_id AND c.tenant_id = (SELECT id FROM vb)
JOIN nuevos_ci n ON n.nombre = c.nombre;

-- ============================================================================
-- 5) SCHEMA `preview`  (migración multitenancy_5_schema_preview)
-- ============================================================================
-- El deploy de `develop` usa NEXT_PUBLIC_SUPABASE_SCHEMA=preview, así que necesita el mismo
-- esquema o la barra lateral se queda sin nombre y no hay aislamiento. Mismo diseño, con
-- `preview.tenants`, `preview.tenant_actual()` y `preview.rol_actual()` propios del schema.
-- Los enums siguen viviendo solo en `public` y se referencian cualificados, como ya pasaba.
-- (Ver el cuerpo completo en la migración; es el mismo bloque cambiando public → preview.)

-- ============================================================================
-- ALTA DE UN CLIENTE NUEVO EN EL FUTURO
-- ============================================================================
-- 1. INSERT INTO public.tenants (nombre, slug) VALUES ('<Nombre>', '<slug>');
-- 2. Crear el usuario en Supabase Auth.
-- 3. INSERT INTO public.roles (user_id, rol, tenant_id)
--      SELECT u.id, 'admin'::public.rol, t.id FROM auth.users u, public.tenants t
--      WHERE u.email = '<email>' AND t.slug = '<slug>';
-- 4. Opcional: copiar el árbol de conceptos con el bloque 4 cambiando el slug destino.
-- No hay que tocar ni el código ni las políticas: el aislamiento es automático.
--
-- ============================================================================
-- ROLLBACK (no ejecutar salvo necesidad)
-- ============================================================================
-- Restaurar las políticas anteriores (rol sin tenant), y después:
--   ALTER TABLE public.<tabla> DROP COLUMN tenant_id;   -- x12
--   ALTER TABLE public.roles DROP COLUMN tenant_id;
--   DROP FUNCTION public.tenant_actual(); DROP FUNCTION public.rol_actual();
--   DROP TABLE public.tenants;
-- Antes hay que borrar los datos del cliente nuevo, o su `tenant_id` quedaría huérfano.
