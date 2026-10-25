-- 2026-08-05 — Política DELETE para `eventos_animal` (público y preview).
--
-- Contexto: la tabla tenía RLS activo con políticas SELECT / INSERT / UPDATE, pero ninguna
-- de DELETE. Con RLS activo eso no da error al borrar: el DELETE simplemente afecta a 0 filas,
-- así que la nueva opción "eliminar evento" de la ficha del animal no habría hecho nada.
--
-- Se replica la matriz de roles de INSERT/UPDATE (`admin`, `user`), que es la misma que exige
-- `deleteEventoAnimal()` con `requireRole(["admin", "user"])`. `viewer` conserva solo SELECT.

-- === APLICADO ===
CREATE POLICY eventos_animal_delete ON public.eventos_animal
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.roles
      WHERE roles.user_id = auth.uid()
        AND roles.rol = ANY (ARRAY['admin'::rol, 'user'::rol])
    )
  );

CREATE POLICY eventos_animal_delete ON preview.eventos_animal
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM preview.roles
      WHERE roles.user_id = auth.uid()
        AND roles.rol = ANY (ARRAY['admin'::public.rol, 'user'::public.rol])
    )
  );

-- === ROLLBACK (no ejecutar salvo que se necesite revertir) ===
-- DROP POLICY eventos_animal_delete ON public.eventos_animal;
-- DROP POLICY eventos_animal_delete ON preview.eventos_animal;
