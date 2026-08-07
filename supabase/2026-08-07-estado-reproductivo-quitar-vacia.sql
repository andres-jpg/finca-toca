-- 2026-08-07 — Elimina el estado reproductivo "vacía"; todo lo que hoy sería "vacía" pasa
-- directo a "servicio" (la vaca vuelve al pool de servicio en vez de un estado de espera
-- aparte). Aplica tanto a datos existentes como al código: una palpación con resultado
-- "vacía" ya no deja al animal en un estado propio, lo manda a "servicio".
--
-- Postgres no permite DROP VALUE en un enum, así que se recrea el tipo sin "vacia" y se
-- migran las columnas que lo usan (public.animales y preview.animales).

-- === 1. Reasignar filas existentes en 'vacia' a 'servicio' (defensivo; 0 filas al momento
--        de escribir esta migración, verificado en public y preview) ===
UPDATE public.animales SET estado_reproductivo = 'servicio' WHERE estado_reproductivo = 'vacia';
UPDATE preview.animales SET estado_reproductivo = 'servicio' WHERE estado_reproductivo = 'vacia';

-- === 2. Recrear el enum sin 'vacia' ===
CREATE TYPE public.estado_reproductivo_new AS ENUM (
  'pre_puber', 'puber', 'pre_servicio', 'servicio', 'por_confirmar', 'rechequeo', 'cargada'
);

ALTER TABLE public.animales
  ALTER COLUMN estado_reproductivo TYPE public.estado_reproductivo_new
  USING estado_reproductivo::text::public.estado_reproductivo_new;

ALTER TABLE preview.animales
  ALTER COLUMN estado_reproductivo TYPE public.estado_reproductivo_new
  USING estado_reproductivo::text::public.estado_reproductivo_new;

DROP TYPE public.estado_reproductivo;
ALTER TYPE public.estado_reproductivo_new RENAME TO estado_reproductivo;

-- === ROLLBACK (no ejecutar salvo que se necesite revertir) ===
-- ALTER TYPE public.estado_reproductivo ADD VALUE 'vacia';
-- -- El valor del enum vuelve a existir, pero las filas que se migraron a "servicio" ya no
-- -- se pueden distinguir de las que ya eran "servicio" de por sí — el rollback no recupera
-- -- qué filas eran originalmente "vacia".
