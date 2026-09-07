-- 2026-09-07 — Elimina "vacia" como valor de eventos_animal.resultado; la palpación que hoy
-- registraría "vacía" pasa a registrarse directamente como "servicio" (mismo nombre que el
-- estado reproductivo al que ya mapeaba desde 2026-08-07, cuando "vacía" dejó de ser un
-- estado propio de animales.estado_reproductivo). Con este cambio el resultado de la
-- palpación coincide 1:1 con el estado reproductivo ("cargada" | "rechequeo" | "servicio")
-- y estadoDesdeEvento() ya no necesita traducir "vacia" → "servicio".
--
-- eventos_animal.resultado es texto con CHECK (no enum), así que no hace falta recrear tipo.
-- El CHECK se quita antes del UPDATE y se recrea después: añadirlo primero rechazaría las
-- filas que todavía dicen 'vacia', y actualizar bajo el CHECK viejo rechazaría 'servicio'.

-- === 1. Quitar el CHECK temporalmente ===
ALTER TABLE public.eventos_animal DROP CONSTRAINT eventos_animal_resultado_check;
ALTER TABLE preview.eventos_animal DROP CONSTRAINT eventos_animal_resultado_check;

-- === 2. Reasignar filas existentes en 'vacia' a 'servicio' (12 filas en public, 0 en preview
--        al momento de escribir esta migración) ===
UPDATE public.eventos_animal SET resultado = 'servicio' WHERE resultado = 'vacia';
UPDATE preview.eventos_animal SET resultado = 'servicio' WHERE resultado = 'vacia';

-- === 3. Recrear el CHECK sin 'vacia' ===
ALTER TABLE public.eventos_animal
  ADD CONSTRAINT eventos_animal_resultado_check
  CHECK (resultado IS NULL OR resultado = ANY (ARRAY['cargada'::text, 'rechequeo'::text, 'servicio'::text]));

ALTER TABLE preview.eventos_animal
  ADD CONSTRAINT eventos_animal_resultado_check
  CHECK (resultado IS NULL OR resultado = ANY (ARRAY['cargada'::text, 'rechequeo'::text, 'servicio'::text]));

-- === ROLLBACK (no ejecutar salvo que se necesite revertir) ===
-- ALTER TABLE public.eventos_animal DROP CONSTRAINT eventos_animal_resultado_check;
-- ALTER TABLE public.eventos_animal ADD CONSTRAINT eventos_animal_resultado_check
--   CHECK (resultado IS NULL OR resultado = ANY (ARRAY['cargada'::text, 'rechequeo'::text, 'vacia'::text]));
-- ALTER TABLE preview.eventos_animal DROP CONSTRAINT eventos_animal_resultado_check;
-- ALTER TABLE preview.eventos_animal ADD CONSTRAINT eventos_animal_resultado_check
--   CHECK (resultado IS NULL OR resultado = ANY (ARRAY['cargada'::text, 'rechequeo'::text, 'vacia'::text]));
-- -- El valor vuelve a ser aceptado, pero las filas migradas a "servicio" ya no se pueden
-- -- distinguir de las que ya eran "servicio" de por sí — el rollback no recupera qué filas
-- -- eran originalmente "vacia".
