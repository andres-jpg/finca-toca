-- 2026-08-05 — Nuevo valor 'servicio' en el enum `estado_reproductivo`.
--
-- Flujo: parto/aborto dejan la vaca en `pre_servicio` (período de espera voluntario) y,
-- cumplidos `DIAS_CELO_POST_PARTO` (60) días desde ese evento, el cron diario
-- `/api/cron/animales-estados` la pasa a `servicio` — ya es apta para inseminar.
--
-- El enum vive solo en `public`; `preview` lo referencia cualificado, así que este único
-- ALTER TYPE cubre los dos schemas.
--
-- Se inserta AFTER 'pre_servicio' para que el orden del enum siga el orden del flujo
-- (importante en cualquier ORDER BY sobre la columna).

-- === APLICADO ===
ALTER TYPE public.estado_reproductivo ADD VALUE 'servicio' AFTER 'pre_servicio';

-- === ROLLBACK ===
-- Postgres no permite eliminar un valor de un enum. Revertir exige recrear el tipo:
--
-- UPDATE public.animales SET estado_reproductivo = 'pre_servicio'
--   WHERE estado_reproductivo = 'servicio';
-- ALTER TYPE public.estado_reproductivo RENAME TO estado_reproductivo_old;
-- CREATE TYPE public.estado_reproductivo AS ENUM
--   ('vacia', 'pre_servicio', 'por_confirmar', 'rechequeo', 'cargada');
-- ALTER TABLE public.animales
--   ALTER COLUMN estado_reproductivo TYPE public.estado_reproductivo
--   USING estado_reproductivo::text::public.estado_reproductivo;
-- ALTER TABLE preview.animales
--   ALTER COLUMN estado_reproductivo TYPE public.estado_reproductivo
--   USING estado_reproductivo::text::public.estado_reproductivo;
-- DROP TYPE public.estado_reproductivo_old;
