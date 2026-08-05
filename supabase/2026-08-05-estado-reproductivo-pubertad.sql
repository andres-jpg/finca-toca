-- 2026-08-05 — Valores 'pre_puber' y 'puber' en el enum `estado_reproductivo` + backfill.
--
-- Escalera reproductiva de la novilla, gobernada por el tramo productivo (o sea, por la edad)
-- y no por eventos:
--   estado_productivo = leche      → estado_reproductivo = pre_puber
--   estado_productivo = levante_1  → estado_reproductivo = puber
--   estado_productivo = levante_2  → estado_reproductivo = servicio   (ya apta para inseminar)
--
-- La aplica `sincronizarEstadosPorEdad()` en el cron diario y `resolverEstadoReproductivo()`
-- al registrar/editar un animal. Es monótona y solo actúa mientras la vaca siga dentro de la
-- escalera: en cuanto un evento la lleva a `por_confirmar`, `cargada`, `pre_servicio`… deja de
-- gobernarla, para no devolver a "servicio" una novilla ya inseminada en levante 2.
--
-- El enum vive solo en `public`; `preview` lo referencia cualificado, así que el ALTER TYPE
-- cubre los dos schemas. El backfill sí hay que hacerlo en cada uno.

-- === APLICADO (1/2): enum ===
ALTER TYPE public.estado_reproductivo ADD VALUE 'pre_puber' BEFORE 'vacia';
ALTER TYPE public.estado_reproductivo ADD VALUE 'puber' BEFORE 'vacia';

-- === APLICADO (2/2): backfill ===
-- Mismo criterio que el código: solo hembras de alta en el tramo de crianza, solo si el estado
-- actual está dentro de la escalera (o vacío) y solo hacia adelante.
-- En `public` afectó a 21 novillas, todas sin estado reproductivo previo: 4 → pre_puber,
-- 6 → puber, 11 → servicio. Ninguna quedó pisada.
UPDATE public.animales a
SET estado_reproductivo = m.objetivo::public.estado_reproductivo
FROM (VALUES
  ('leche',     'pre_puber', 0),
  ('levante_1', 'puber',     1),
  ('levante_2', 'servicio',  2)
) AS m(productivo, objetivo, pos)
WHERE a.alta = true
  AND a.sexo = 'hembra'
  AND a.estado_productivo::text = m.productivo
  AND (a.estado_reproductivo IS NULL
       OR a.estado_reproductivo::text IN ('pre_puber', 'puber', 'servicio'))
  AND COALESCE(
        CASE a.estado_reproductivo::text
          WHEN 'pre_puber' THEN 0
          WHEN 'puber'     THEN 1
          WHEN 'servicio'  THEN 2
        END, -1) < m.pos;

UPDATE preview.animales a
SET estado_reproductivo = m.objetivo::public.estado_reproductivo
FROM (VALUES
  ('leche',     'pre_puber', 0),
  ('levante_1', 'puber',     1),
  ('levante_2', 'servicio',  2)
) AS m(productivo, objetivo, pos)
WHERE a.alta = true
  AND a.sexo = 'hembra'
  AND a.estado_productivo::text = m.productivo
  AND (a.estado_reproductivo IS NULL
       OR a.estado_reproductivo::text IN ('pre_puber', 'puber', 'servicio'))
  AND COALESCE(
        CASE a.estado_reproductivo::text
          WHEN 'pre_puber' THEN 0
          WHEN 'puber'     THEN 1
          WHEN 'servicio'  THEN 2
        END, -1) < m.pos;

-- === ROLLBACK ===
-- Postgres no permite eliminar valores de un enum; revertir exige recrear el tipo.
-- Ver el bloque equivalente en 2026-08-05-estado-reproductivo-servicio.sql. Antes:
--   UPDATE public.animales SET estado_reproductivo = NULL
--     WHERE estado_reproductivo IN ('pre_puber', 'puber');
--   (ídem en preview.animales)
