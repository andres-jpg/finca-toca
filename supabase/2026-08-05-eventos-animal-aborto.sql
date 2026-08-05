-- 2026-08-05 — Nuevo `tipo_evento` = 'aborto' en `eventos_animal` (público y preview).
--
-- El aborto cierra la gestación igual que un parto: `estadoDesdeEvento()` deja a la vaca en
-- `estado_productivo = 'produccion'` y `estado_reproductivo = 'pre_servicio'`, con lo que
-- decaen solas las alertas de parto probable y de pasar a secado (ambas exigen `cargada`)
-- y arranca la de celo a los 50 días (`DIAS_CELO_POST_PARTO`).
--
-- El CHECK pasa de 13 a 14 valores. Se recrea entero porque Postgres no permite añadir un
-- valor a un CHECK existente.

-- === APLICADO ===
ALTER TABLE public.eventos_animal
  DROP CONSTRAINT eventos_animal_tipo_evento_check;

ALTER TABLE public.eventos_animal
  ADD CONSTRAINT eventos_animal_tipo_evento_check CHECK (
    tipo_evento = ANY (ARRAY[
      'vacunacion', 'vitaminacion', 'medicamento', 'enfermedad', 'celo',
      'inseminacion', 'monta', 'palpacion', 'confirmacion_prenez',
      'parto', 'aborto', 'secado', 'topizado', 'observacion'
    ]::text[])
  );

ALTER TABLE preview.eventos_animal
  DROP CONSTRAINT eventos_animal_tipo_evento_check;

ALTER TABLE preview.eventos_animal
  ADD CONSTRAINT eventos_animal_tipo_evento_check CHECK (
    tipo_evento = ANY (ARRAY[
      'vacunacion', 'vitaminacion', 'medicamento', 'enfermedad', 'celo',
      'inseminacion', 'monta', 'palpacion', 'confirmacion_prenez',
      'parto', 'aborto', 'secado', 'topizado', 'observacion'
    ]::text[])
  );

-- === ROLLBACK (no ejecutar salvo que se necesite revertir) ===
-- Falla si ya existe alguna fila con tipo_evento = 'aborto'; borrarlas antes.
--
-- ALTER TABLE public.eventos_animal DROP CONSTRAINT eventos_animal_tipo_evento_check;
-- ALTER TABLE public.eventos_animal
--   ADD CONSTRAINT eventos_animal_tipo_evento_check CHECK (
--     tipo_evento = ANY (ARRAY[
--       'vacunacion', 'vitaminacion', 'medicamento', 'enfermedad', 'celo',
--       'inseminacion', 'monta', 'palpacion', 'confirmacion_prenez',
--       'parto', 'secado', 'topizado', 'observacion'
--     ]::text[])
--   );
-- (ídem para preview.eventos_animal)
