-- 2026-08-07 — "Concentrado por ordeño" en la ficha del animal.
--
-- Cantidad de concentrado (pienso) que se le debe dar a la vaca en CADA ordeño del día.
-- Se mete a mano, es puramente informativo y no lo deriva ningún evento ni el cron.
-- `real` porque son cantidades con decimales (1,5). NULL = no definido, distinto de 0.
--
-- El otro campo de esta tanda, "días en leche", NO se guarda: se deriva en cada lectura de
-- `eventos_animal` (último parto/aborto, o 0 si la vaca está en secado), igual que las
-- alertas. Por eso no aparece aquí.

ALTER TABLE public.animales ADD COLUMN concentrado_por_ordeno real;
ALTER TABLE preview.animales ADD COLUMN concentrado_por_ordeno real;

-- === ROLLBACK (no ejecutar salvo que se necesite revertir) ===
-- ALTER TABLE public.animales DROP COLUMN concentrado_por_ordeno;
-- ALTER TABLE preview.animales DROP COLUMN concentrado_por_ordeno;
