-- =============================================
-- FINCA TOCA — Copia datos de public → preview
--
-- Raíz del problema: public y preview tienen las mismas
-- columnas y tipos, pero en distinto orden (public tiene gaps
-- por columnas eliminadas). SELECT * insertaría valores en
-- posiciones equivocadas → todas las tablas afectadas usan
-- lista explícita de columnas.
--
-- Cómo usar:
--   Supabase Dashboard → SQL Editor → ejecutar este script.
-- PRECAUCIÓN: borra todos los datos actuales del esquema preview.
-- =============================================


-- =============================================
-- 1. DESHABILITAR FKs
--    (necesario para la dependencia circular vacas ↔ toros
--     y para insertar en cualquier orden)
-- =============================================
SET session_replication_role = 'replica';


-- =============================================
-- 2. VACIAR TABLAS PREVIEW
-- =============================================
TRUNCATE
  preview.user_itinerarios,
  preview.itinerarios_fincas,
  preview.itinerarios,
  preview.recolecciones,
  preview.rutas_fincas,
  preview.rutas_cooperativa,
  preview.fincas_cooperativa,
  preview.eventos_animal,
  preview.pajillas,
  preview.precios,
  preview.extracciones_leche,
  preview.ingresos,
  preview.pagos,
  preview.gastos,
  preview.vacas,
  preview.toros,
  preview.subconceptos_ingreso,
  preview.conceptos_ingreso,
  preview.subconceptos_gasto,
  preview.conceptos_gasto,
  preview.roles
RESTART IDENTITY CASCADE;


-- =============================================
-- 3. COPIAR DATOS
--    Tablas con GENERATED ALWAYS AS IDENTITY
--    requieren OVERRIDING SYSTEM VALUE.
--    Tablas con columnas en distinto orden entre
--    public y preview usan lista explícita.
-- =============================================

-- Catálogos (orden idéntico, GENERATED ALWAYS)
INSERT INTO preview.conceptos_gasto    OVERRIDING SYSTEM VALUE SELECT * FROM public.conceptos_gasto;
INSERT INTO preview.subconceptos_gasto OVERRIDING SYSTEM VALUE SELECT * FROM public.subconceptos_gasto;
INSERT INTO preview.conceptos_ingreso    OVERRIDING SYSTEM VALUE SELECT * FROM public.conceptos_ingreso;
INSERT INTO preview.subconceptos_ingreso OVERRIDING SYSTEM VALUE SELECT * FROM public.subconceptos_ingreso;

-- Animales (columnas en distinto orden entre schemas)
INSERT INTO preview.toros (id, created_at, toro_id, nombre, origen, estado,
  fecha_compra, fecha_nacimiento, numero_registro, madre_id, padre_id, alta)
SELECT id, created_at, toro_id, nombre, origen, estado,
  fecha_compra, fecha_nacimiento, numero_registro, madre_id, padre_id, alta
FROM public.toros;

INSERT INTO preview.vacas (id, created_at, vaca_id, nombre, origen, estado,
  fecha_compra, fecha_nacimiento, numero_registro, madre_id, padre_id, padre_pajilla_nombre, alta)
SELECT id, created_at, vaca_id, nombre, origen, estado,
  fecha_compra, fecha_nacimiento, numero_registro, madre_id, padre_id, padre_pajilla_nombre, alta
FROM public.vacas;

-- Gastos (columnas en distinto orden, public tiene gaps por drops)
INSERT INTO preview.gastos (id, created_at, fecha, valor, subconcepto_id,
  proveedor, numero_factura, observaciones, pagado)
SELECT id, created_at, fecha, valor, subconcepto_id,
  proveedor, numero_factura, observaciones, pagado
FROM public.gastos;

-- Pagos (orden idéntico, GENERATED ALWAYS)
INSERT INTO preview.pagos OVERRIDING SYSTEM VALUE SELECT * FROM public.pagos;

-- Ingresos (columnas en distinto orden, public tiene gaps)
INSERT INTO preview.ingresos (id, created_at, fecha, valor, subconcepto_id, observaciones, source)
SELECT id, created_at, fecha, valor, subconcepto_id, observaciones, source
FROM public.ingresos;

-- Extracciones y precios (orden idéntico)
INSERT INTO preview.extracciones_leche SELECT * FROM public.extracciones_leche;
INSERT INTO preview.precios            SELECT * FROM public.precios;

-- Pajillas y eventos (orden idéntico)
INSERT INTO preview.pajillas       SELECT * FROM public.pajillas;
INSERT INTO preview.eventos_animal SELECT * FROM public.eventos_animal;

-- Cooperativa (columnas en distinto orden, public tiene gaps)
INSERT INTO preview.fincas_cooperativa (id, created_at, nombre, precio_litro, activa)
SELECT id, created_at, nombre, precio_litro, activa
FROM public.fincas_cooperativa;

INSERT INTO preview.rutas_cooperativa (id, created_at, nombre)
SELECT id, created_at, nombre
FROM public.rutas_cooperativa;

-- rutas_fincas y recolecciones
INSERT INTO preview.rutas_fincas SELECT * FROM public.rutas_fincas;

INSERT INTO preview.recolecciones (id, created_at, finca_id, fecha, litros, precio_litro)
SELECT id, created_at, finca_id, fecha, litros, precio_litro
FROM public.recolecciones;

-- Roles (orden idéntico, mismos auth.users en el mismo proyecto)
INSERT INTO preview.roles SELECT * FROM public.roles;

-- Itinerarios (public.itinerarios usa plain integer PK sin sequence)
INSERT INTO preview.itinerarios (id, nombre, created_at)
SELECT id, nombre, created_at FROM public.itinerarios;

INSERT INTO preview.itinerarios_fincas (itinerario_id, finca_id, orden)
SELECT itinerario_id, finca_id, orden FROM public.itinerarios_fincas;

INSERT INTO preview.user_itinerarios (user_id, itinerario_id, created_at)
SELECT user_id, itinerario_id, created_at FROM public.user_itinerarios;


-- =============================================
-- 4. REACTIVAR FKs
-- =============================================
SET session_replication_role = 'origin';


-- =============================================
-- 5. SINCRONIZAR SECUENCIAS
--    Solo tablas con identity/sequence en preview.
-- =============================================
SELECT setval(pg_get_serial_sequence('preview.conceptos_gasto', 'id'),     COALESCE((SELECT MAX(id) FROM preview.conceptos_gasto), 1));
SELECT setval(pg_get_serial_sequence('preview.subconceptos_gasto', 'id'),  COALESCE((SELECT MAX(id) FROM preview.subconceptos_gasto), 1));
SELECT setval(pg_get_serial_sequence('preview.conceptos_ingreso', 'id'),   COALESCE((SELECT MAX(id) FROM preview.conceptos_ingreso), 1));
SELECT setval(pg_get_serial_sequence('preview.subconceptos_ingreso', 'id'),COALESCE((SELECT MAX(id) FROM preview.subconceptos_ingreso), 1));
SELECT setval(pg_get_serial_sequence('preview.gastos', 'id'),              COALESCE((SELECT MAX(id) FROM preview.gastos), 1));
SELECT setval(pg_get_serial_sequence('preview.pagos', 'id'),               COALESCE((SELECT MAX(id) FROM preview.pagos), 1));
SELECT setval(pg_get_serial_sequence('preview.ingresos', 'id'),            COALESCE((SELECT MAX(id) FROM preview.ingresos), 1));
SELECT setval(pg_get_serial_sequence('preview.extracciones_leche', 'id'),  COALESCE((SELECT MAX(id) FROM preview.extracciones_leche), 1));
SELECT setval(pg_get_serial_sequence('preview.precios', 'id'),             COALESCE((SELECT MAX(id) FROM preview.precios), 1));
SELECT setval(pg_get_serial_sequence('preview.fincas_cooperativa', 'id'),  COALESCE((SELECT MAX(id) FROM preview.fincas_cooperativa), 1));
SELECT setval(pg_get_serial_sequence('preview.rutas_cooperativa', 'id'),   COALESCE((SELECT MAX(id) FROM preview.rutas_cooperativa), 1));
SELECT setval(pg_get_serial_sequence('preview.recolecciones', 'id'),       COALESCE((SELECT MAX(id) FROM preview.recolecciones), 1));
SELECT setval(pg_get_serial_sequence('preview.roles', 'id'),               COALESCE((SELECT MAX(id) FROM preview.roles), 1));
SELECT setval(pg_get_serial_sequence('preview.itinerarios', 'id'),         COALESCE((SELECT MAX(id) FROM preview.itinerarios), 1));
