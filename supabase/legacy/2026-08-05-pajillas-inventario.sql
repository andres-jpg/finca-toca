-- 2026-08-05 — Inventario de pajillas: proveedor + referencia real al lote desde el evento.
--
-- Dos bugs que arregla esta migración:
--
-- 1. `eventos_animal.pajilla_toro_ref_id` es `uuid`, pero el formulario le enviaba
--    `pajillas.toro_ref_id`, que es TEXTO libre ("NA", "TRO-001A"). El insert fallaba con
--    un error de cast, así que NINGÚN evento llegó a guardar la pajilla usada
--    (`select count(*) ... where pajilla_toro_ref_id is not null` = 0). Sin filas que migrar,
--    la columna se renombra a `pajilla_id` y pasa a apuntar al lote concreto.
--
-- 2. `toro_ref_id` no es único: en producción "NA" lo comparten 5 toros distintos
--    (Arshay, Bebrife, Commet-et, Divinity, Freewill) y "TRO-001A" lo comparten El Campeón y
--    El Guerrero. Agrupar por él —como hacía `getPajillasPorToro()`— fusionaba lotes de toros
--    diferentes bajo un solo nombre y por eso el desplegable no mostraba todas las pajillas.
--    Referenciar el lote por `id` elimina la ambigüedad y permite descontar del lote correcto.
--
-- ON DELETE SET NULL, igual que el `toro_id` hermano: borrar un lote no debe borrar el evento.

-- === APLICADO ===
ALTER TABLE public.pajillas ADD COLUMN proveedor text;
ALTER TABLE preview.pajillas ADD COLUMN proveedor text;

ALTER TABLE public.eventos_animal RENAME COLUMN pajilla_toro_ref_id TO pajilla_id;
ALTER TABLE public.eventos_animal
  ADD CONSTRAINT eventos_animal_pajilla_id_fkey
  FOREIGN KEY (pajilla_id) REFERENCES public.pajillas(id) ON DELETE SET NULL;

ALTER TABLE preview.eventos_animal RENAME COLUMN pajilla_toro_ref_id TO pajilla_id;
ALTER TABLE preview.eventos_animal
  ADD CONSTRAINT eventos_animal_pajilla_id_fkey
  FOREIGN KEY (pajilla_id) REFERENCES preview.pajillas(id) ON DELETE SET NULL;

-- === ROLLBACK (no ejecutar salvo que se necesite revertir) ===
-- ALTER TABLE public.eventos_animal DROP CONSTRAINT eventos_animal_pajilla_id_fkey;
-- ALTER TABLE public.eventos_animal RENAME COLUMN pajilla_id TO pajilla_toro_ref_id;
-- ALTER TABLE public.pajillas DROP COLUMN proveedor;
-- (ídem para preview)
