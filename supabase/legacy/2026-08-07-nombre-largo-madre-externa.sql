-- 2026-08-07 — "Nombre largo" (solo El Velero) y nombre libre de la madre externa.
--
-- 1. `animales.nombre_largo` (texto libre, opcional): campo adicional que solo el formulario
--    de El Velero ofrece diligenciar. La columna es global — la multi-tenancy es por fila vía
--    `tenant_id`, no por esquema — pero queda NULL para los demás tenants.
-- 2. `animales.madre_externa_nombre` (texto libre, opcional): nombre de la madre cuando el
--    animal es de origen externo y la madre no está registrada como animal en el sistema.
--    Análogo a `padre_alquiler_nombre` para el padre de monta natural externa.

ALTER TABLE public.animales ADD COLUMN nombre_largo text;
ALTER TABLE preview.animales ADD COLUMN nombre_largo text;

ALTER TABLE public.animales ADD COLUMN madre_externa_nombre text;
ALTER TABLE preview.animales ADD COLUMN madre_externa_nombre text;

-- === ROLLBACK (no ejecutar salvo que se necesite revertir) ===
-- ALTER TABLE public.animales DROP COLUMN madre_externa_nombre;
-- ALTER TABLE preview.animales DROP COLUMN madre_externa_nombre;
-- ALTER TABLE public.animales DROP COLUMN nombre_largo;
-- ALTER TABLE preview.animales DROP COLUMN nombre_largo;
