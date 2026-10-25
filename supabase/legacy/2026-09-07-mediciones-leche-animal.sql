-- 2026-09-07 — Control lechero: mediciones mensuales de litros por animal, en la ficha
-- (`/dashboard/animales/[id]`). Tabla nueva `mediciones_leche_animal`, separada de
-- `extracciones_leche` (que es el ordeño diario de toda la finca, no por vaca).
--
-- `dias_en_leche` NO es columna: se deriva en cada lectura con `calcularDiasEnLecheEnFecha()`
-- a partir de `eventos_animal` y la `fecha` de la medición, igual que el resto de valores
-- calculados de la ficha (edad, DEL de hoy, alertas, saldo de arriendos). Persistirlo lo
-- dejaría desincronizado si más adelante se corrige la fecha de un parto.
--
-- Multi-tenant igual que `arriendos`/`arriendos_abonos`: `tenant_id` con
-- `DEFAULT tenant_actual()` y RLS filtrando por él + `rol_actual()`. UNIQUE(animal_id, fecha)
-- porque solo tiene sentido una medición por animal y por fecha.

-- === public ===
CREATE TABLE public.mediciones_leche_animal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.tenant_actual(),
  animal_id uuid NOT NULL REFERENCES public.animales(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  litros numeric NOT NULL CHECK (litros > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (animal_id, fecha)
);

CREATE INDEX mediciones_leche_animal_animal_id_idx ON public.mediciones_leche_animal (animal_id);
CREATE INDEX mediciones_leche_animal_tenant_id_idx ON public.mediciones_leche_animal (tenant_id);

ALTER TABLE public.mediciones_leche_animal ENABLE ROW LEVEL SECURITY;

CREATE POLICY mediciones_leche_animal_select ON public.mediciones_leche_animal
  FOR SELECT TO authenticated
  USING (
    tenant_id = public.tenant_actual()
    AND public.rol_actual() = ANY (ARRAY['admin'::public.rol, 'user'::public.rol, 'viewer'::public.rol])
  );

CREATE POLICY mediciones_leche_animal_insert ON public.mediciones_leche_animal
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.tenant_actual()
    AND public.rol_actual() = ANY (ARRAY['admin'::public.rol, 'user'::public.rol])
  );

CREATE POLICY mediciones_leche_animal_update ON public.mediciones_leche_animal
  FOR UPDATE TO authenticated
  USING (
    tenant_id = public.tenant_actual()
    AND public.rol_actual() = ANY (ARRAY['admin'::public.rol, 'user'::public.rol])
  )
  WITH CHECK (
    tenant_id = public.tenant_actual()
    AND public.rol_actual() = ANY (ARRAY['admin'::public.rol, 'user'::public.rol])
  );

CREATE POLICY mediciones_leche_animal_delete ON public.mediciones_leche_animal
  FOR DELETE TO authenticated
  USING (
    tenant_id = public.tenant_actual()
    AND public.rol_actual() = ANY (ARRAY['admin'::public.rol, 'user'::public.rol])
  );

-- === preview ===
CREATE TABLE preview.mediciones_leche_animal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT preview.tenant_actual(),
  animal_id uuid NOT NULL REFERENCES preview.animales(id) ON DELETE CASCADE,
  fecha date NOT NULL,
  litros numeric NOT NULL CHECK (litros > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (animal_id, fecha)
);

CREATE INDEX mediciones_leche_animal_animal_id_idx ON preview.mediciones_leche_animal (animal_id);
CREATE INDEX mediciones_leche_animal_tenant_id_idx ON preview.mediciones_leche_animal (tenant_id);

ALTER TABLE preview.mediciones_leche_animal ENABLE ROW LEVEL SECURITY;

CREATE POLICY mediciones_leche_animal_select ON preview.mediciones_leche_animal
  FOR SELECT TO authenticated
  USING (
    tenant_id = preview.tenant_actual()
    AND preview.rol_actual() = ANY (ARRAY['admin'::public.rol, 'user'::public.rol, 'viewer'::public.rol])
  );

CREATE POLICY mediciones_leche_animal_insert ON preview.mediciones_leche_animal
  FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = preview.tenant_actual()
    AND preview.rol_actual() = ANY (ARRAY['admin'::public.rol, 'user'::public.rol])
  );

CREATE POLICY mediciones_leche_animal_update ON preview.mediciones_leche_animal
  FOR UPDATE TO authenticated
  USING (
    tenant_id = preview.tenant_actual()
    AND preview.rol_actual() = ANY (ARRAY['admin'::public.rol, 'user'::public.rol])
  )
  WITH CHECK (
    tenant_id = preview.tenant_actual()
    AND preview.rol_actual() = ANY (ARRAY['admin'::public.rol, 'user'::public.rol])
  );

CREATE POLICY mediciones_leche_animal_delete ON preview.mediciones_leche_animal
  FOR DELETE TO authenticated
  USING (
    tenant_id = preview.tenant_actual()
    AND preview.rol_actual() = ANY (ARRAY['admin'::public.rol, 'user'::public.rol])
  );

-- === ROLLBACK (no ejecutar salvo que se necesite revertir) ===
-- DROP TABLE public.mediciones_leche_animal;
-- DROP TABLE preview.mediciones_leche_animal;
