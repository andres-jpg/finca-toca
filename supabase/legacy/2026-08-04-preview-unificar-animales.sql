-- 2026-08-04 — Migración del schema `preview` a la entidad unificada `animales`.
--
-- Replica en `preview` el refactor que ya estaba aplicado en `public`: `vacas` + `toros`
-- pasan a una sola tabla `animales` con `sexo`, y el estado único se convierte en el doble
-- eje `estado_productivo` / `estado_reproductivo`. Se preservan los datos propios de preview
-- (50 vacas, 4 toros, 119 eventos) y los UUID originales, de modo que `eventos_animal.animal_id`
-- y las referencias madre/padre siguen siendo válidas sin remapear nada.
--
-- Las tablas viejas se conservan renombradas a `vacas_legacy` / `toros_legacy`, igual que en `public`.
-- Los enums (`animal_sexo`, `animal_raza`, `vaca_origen`, `estado_productivo`, `estado_reproductivo`,
-- `rol`) viven solo en `public` y se referencian cualificados desde aquí.

-- ============================================================
-- 1) Tabla `animales`
-- ============================================================
CREATE TABLE preview.animales (
  id                  uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at          timestamptz DEFAULT now(),
  identificador       text NOT NULL,
  nombre              varchar NOT NULL,
  sexo                public.animal_sexo NOT NULL,
  raza                public.animal_raza,
  origen              public.vaca_origen,
  fecha_compra        date,
  fecha_nacimiento    date,
  numero_registro     text,
  madre_id            uuid,
  padre_id            uuid,
  padre_pajilla_nombre text,
  alta                boolean NOT NULL DEFAULT true,
  estado_productivo   public.estado_productivo,
  estado_reproductivo public.estado_reproductivo,
  CONSTRAINT animales_pkey PRIMARY KEY (id)
);

-- ============================================================
-- 2) Datos: vacas → animales (hembra)
-- ============================================================
-- Mapeo del `vaca_estado` viejo al eje productivo nuevo:
--   pre_jardin → leche | jardin → levante_1 | transicion → levante_2
--   produccion → produccion | secado → secado
INSERT INTO preview.animales (
  id, created_at, identificador, nombre, sexo, origen, fecha_compra, fecha_nacimiento,
  numero_registro, madre_id, padre_id, padre_pajilla_nombre, alta, estado_productivo
)
SELECT
  v.id, v.created_at, v.vaca_id, v.nombre, 'hembra'::public.animal_sexo, v.origen,
  v.fecha_compra, v.fecha_nacimiento, v.numero_registro, v.madre_id, v.padre_id,
  v.padre_pajilla_nombre, v.alta,
  (CASE v.estado::text
     WHEN 'pre_jardin' THEN 'leche'
     WHEN 'jardin'     THEN 'levante_1'
     WHEN 'transicion' THEN 'levante_2'
     WHEN 'produccion' THEN 'produccion'
     WHEN 'secado'     THEN 'secado'
   END)::public.estado_productivo
FROM preview.vacas v;

-- ============================================================
-- 3) Datos: toros → animales (macho)
-- ============================================================
-- Los machos no tienen `padre_pajilla_nombre` ni pasan por producción/secado:
--   jardin → levante_1 | reproductor → reproductor
INSERT INTO preview.animales (
  id, created_at, identificador, nombre, sexo, origen, fecha_compra, fecha_nacimiento,
  numero_registro, madre_id, padre_id, alta, estado_productivo
)
SELECT
  t.id, t.created_at, t.toro_id::text, t.nombre, 'macho'::public.animal_sexo, t.origen,
  t.fecha_compra, t.fecha_nacimiento, t.numero_registro, t.madre_id, t.padre_id, t.alta,
  (CASE t.estado
     WHEN 'jardin'      THEN 'levante_1'
     WHEN 'reproductor' THEN 'reproductor'
   END)::public.estado_productivo
FROM preview.toros t;

-- ============================================================
-- 4) Avance por edad de las crías
-- ============================================================
-- Mismo criterio que `sincronizarEstadosPorEdad()`: meses *cumplidos* desde el nacimiento,
-- leche → levante_1 a los 5 (MESES_LEVANTE_1) y → levante_2 a los 23 (5 + MESES_LEVANTE_2).
-- Monótono: solo avanza, nunca retrocede, y no toca produccion/secado/reproductor.
UPDATE preview.animales a
SET estado_productivo = calc.v
FROM (
  SELECT
    id,
    (CASE
       WHEN EXTRACT(year FROM age(current_date, fecha_nacimiento)) * 12
          + EXTRACT(month FROM age(current_date, fecha_nacimiento)) >= 23 THEN 'levante_2'
       WHEN EXTRACT(year FROM age(current_date, fecha_nacimiento)) * 12
          + EXTRACT(month FROM age(current_date, fecha_nacimiento)) >= 5  THEN 'levante_1'
       ELSE 'leche'
     END)::public.estado_productivo AS v
  FROM preview.animales
  WHERE fecha_nacimiento IS NOT NULL
) calc
WHERE a.id = calc.id
  AND (a.estado_productivo IS NULL
       OR a.estado_productivo IN ('leche', 'levante_1', 'levante_2'))
  AND array_position(
        ARRAY['leche', 'levante_1', 'levante_2']::public.estado_productivo[], calc.v)
    > COALESCE(
        array_position(
          ARRAY['leche', 'levante_1', 'levante_2']::public.estado_productivo[], a.estado_productivo),
        0);

-- ============================================================
-- 5) FKs e índices de `animales`
-- ============================================================
-- Se añaden después del INSERT: una vaca puede tener `padre_id` de un toro que aún no
-- se había insertado cuando corre el primer INSERT.
ALTER TABLE preview.animales
  ADD CONSTRAINT animales_madre_id_fkey FOREIGN KEY (madre_id) REFERENCES preview.animales(id),
  ADD CONSTRAINT animales_padre_id_fkey FOREIGN KEY (padre_id) REFERENCES preview.animales(id);

CREATE INDEX idx_animales_estado_productivo   ON preview.animales USING btree (estado_productivo);
CREATE INDEX idx_animales_estado_reproductivo ON preview.animales USING btree (estado_reproductivo);

-- ============================================================
-- 6) Grants y RLS de `animales`
-- ============================================================
GRANT ALL ON TABLE preview.animales TO postgres, anon, authenticated, service_role;

ALTER TABLE preview.animales ENABLE ROW LEVEL SECURITY;

CREATE POLICY animales_select ON preview.animales FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM preview.roles
  WHERE roles.user_id = auth.uid()
    AND roles.rol = ANY (ARRAY['admin'::public.rol, 'user'::public.rol, 'viewer'::public.rol])
));

CREATE POLICY animales_insert ON preview.animales FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM preview.roles
  WHERE roles.user_id = auth.uid()
    AND roles.rol = ANY (ARRAY['admin'::public.rol, 'user'::public.rol])
));

CREATE POLICY animales_update ON preview.animales FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM preview.roles
  WHERE roles.user_id = auth.uid()
    AND roles.rol = ANY (ARRAY['admin'::public.rol, 'user'::public.rol])
))
WITH CHECK (EXISTS (
  SELECT 1 FROM preview.roles
  WHERE roles.user_id = auth.uid()
    AND roles.rol = ANY (ARRAY['admin'::public.rol, 'user'::public.rol])
));

CREATE POLICY animales_delete ON preview.animales FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM preview.roles
  WHERE roles.user_id = auth.uid()
    AND roles.rol = ANY (ARRAY['admin'::public.rol, 'user'::public.rol])
));

-- ============================================================
-- 7) `eventos_animal` al día
-- ============================================================
ALTER TABLE preview.eventos_animal
  ADD COLUMN resultado           text,
  ADD COLUMN pajilla_toro_ref_id uuid,
  ADD COLUMN toro_id             uuid;

ALTER TABLE preview.eventos_animal
  ADD CONSTRAINT eventos_animal_resultado_check
  CHECK (resultado IS NULL OR resultado = ANY (ARRAY['cargada'::text, 'rechequeo'::text, 'vacia'::text]));

-- El CHECK viejo solo tenía 10 tipos: le faltaban `monta`, `secado` y `topizado`.
ALTER TABLE preview.eventos_animal DROP CONSTRAINT eventos_animal_tipo_evento_check;
ALTER TABLE preview.eventos_animal
  ADD CONSTRAINT eventos_animal_tipo_evento_check
  CHECK (tipo_evento = ANY (ARRAY[
    'vacunacion'::text, 'vitaminacion'::text, 'medicamento'::text, 'enfermedad'::text,
    'celo'::text, 'inseminacion'::text, 'monta'::text, 'palpacion'::text,
    'confirmacion_prenez'::text, 'parto'::text, 'secado'::text, 'topizado'::text,
    'observacion'::text
  ]));

-- `animal_id` no tenía FK porque apuntaba a dos tablas distintas; ahora ya puede tenerla.
ALTER TABLE preview.eventos_animal
  ADD CONSTRAINT eventos_animal_animal_id_fkey
    FOREIGN KEY (animal_id) REFERENCES preview.animales(id) ON DELETE CASCADE,
  ADD CONSTRAINT eventos_animal_toro_id_fkey
    FOREIGN KEY (toro_id) REFERENCES preview.animales(id) ON DELETE SET NULL;

CREATE INDEX idx_eventos_animal_fecha      ON preview.eventos_animal USING btree (fecha);
CREATE INDEX idx_eventos_animal_tipo_fecha ON preview.eventos_animal USING btree (tipo_evento, fecha);

-- ============================================================
-- 8) Tablas viejas → legacy
-- ============================================================
ALTER TABLE preview.vacas RENAME TO vacas_legacy;
ALTER TABLE preview.toros RENAME TO toros_legacy;
