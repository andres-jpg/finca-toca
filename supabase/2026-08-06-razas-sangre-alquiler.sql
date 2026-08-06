-- 2026-08-06 — Razas nuevas, campo "Sangre" (% de pureza), padre por toro de alquiler,
-- y raza en el inventario de pajillas.
--
-- 1. El enum `animal_raza` tenía un typo histórico ("jerholm"); se corrige a "jerhol" y se
--    agregan "ayrshire" y "cruce". El enum vive solo en `public`; `preview` lo referencia
--    qualified (`public.animal_raza`), así que el ALTER TYPE cubre los dos schemas — no hace
--    falta repetirlo en `preview`.
-- 2. `animales.sangre` (texto libre, opcional): composición racial ej. "AYR:88% x HOL:13%".
--    Se guarda como texto y no como columnas estructuradas porque puede tener 1 o 2 razas.
-- 3. `animales.padre_alquiler_nombre` (texto libre, opcional): nombre de un toro de monta
--    natural que no es de la finca ni fue usado por pajilla — tercera alternativa de "padre"
--    junto a `padre_id` (macho de finca) y `padre_pajilla_nombre` (inseminación).
-- 4. `pajillas.raza`: mismas categorías que `animales.raza`.

-- === enum: rename + nuevos valores ===
ALTER TYPE public.animal_raza RENAME VALUE 'jerholm' TO 'jerhol';
ALTER TYPE public.animal_raza ADD VALUE 'ayrshire';
ALTER TYPE public.animal_raza ADD VALUE 'cruce';

-- === animales: sangre + padre de alquiler ===
ALTER TABLE public.animales ADD COLUMN sangre text;
ALTER TABLE preview.animales ADD COLUMN sangre text;

ALTER TABLE public.animales ADD COLUMN padre_alquiler_nombre text;
ALTER TABLE preview.animales ADD COLUMN padre_alquiler_nombre text;

-- === pajillas: raza ===
ALTER TABLE public.pajillas ADD COLUMN raza public.animal_raza;
ALTER TABLE preview.pajillas ADD COLUMN raza public.animal_raza;

-- === animales: raza del toro de alquiler (aplicado 2026-08-06, en un segundo paso) ===
-- El padre por monta/pajilla infiere su raza del animal/lote; el toro de alquiler no tiene
-- registro propio, así que su raza se guarda aparte, junto a padre_alquiler_nombre.
ALTER TABLE public.animales ADD COLUMN padre_alquiler_raza public.animal_raza;
ALTER TABLE preview.animales ADD COLUMN padre_alquiler_raza public.animal_raza;

-- === ROLLBACK (no ejecutar salvo que se necesite revertir) ===
-- ALTER TABLE public.animales DROP COLUMN padre_alquiler_raza;
-- ALTER TABLE preview.animales DROP COLUMN padre_alquiler_raza;
-- ALTER TABLE public.pajillas DROP COLUMN raza;
-- ALTER TABLE preview.pajillas DROP COLUMN raza;
-- ALTER TABLE public.animales DROP COLUMN padre_alquiler_nombre;
-- ALTER TABLE preview.animales DROP COLUMN padre_alquiler_nombre;
-- ALTER TABLE public.animales DROP COLUMN sangre;
-- ALTER TABLE preview.animales DROP COLUMN sangre;
-- Postgres no permite eliminar valores de un enum ni revertir un RENAME VALUE sin recrear
-- el tipo; si hace falta deshacer el paso 1, requiere migrar todas las columnas que usan
-- `animal_raza` a un tipo nuevo sin "ayrshire"/"cruce" y con "jerholm" en vez de "jerhol".
