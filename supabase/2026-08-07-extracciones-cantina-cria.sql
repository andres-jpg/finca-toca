-- 2026-08-07 — La extracción de leche se parte en dos destinos:
--   * "cantina": la leche que se vende → genera el ingreso automático (como hasta ahora).
--   * "cría":    la leche que se queda en la finca para alimentar a las crías → genera un
--                gasto automático = litros x precio del litro.
--
-- `litros` se renombra a `litros_cantina` porque ese fue siempre su significado real: es la
-- cantidad que `upsertIngresoLeche` multiplicaba por el precio para generar el ingreso. Las
-- filas históricas quedan por tanto correctas sin migrar datos, con `litros_cria = 0`.
--
-- OJO: el renombrado rompe el código viejo, así que el deploy debe ir junto con esta
-- migración (no hay ventana de compatibilidad hacia atrás).

-- === 1. extracciones_leche: cantina + cría ===
ALTER TABLE public.extracciones_leche RENAME COLUMN litros TO litros_cantina;
ALTER TABLE preview.extracciones_leche RENAME COLUMN litros TO litros_cantina;

ALTER TABLE public.extracciones_leche ADD COLUMN litros_cria real NOT NULL DEFAULT 0;
ALTER TABLE preview.extracciones_leche ADD COLUMN litros_cria real NOT NULL DEFAULT 0;

-- === 2. gastos.source: marca el gasto auto-generado, igual que ingresos.source ===
-- NULL = gasto manual; 'leche_cria' = generado desde una extracción.
ALTER TABLE public.gastos ADD COLUMN source text;
ALTER TABLE preview.gastos ADD COLUMN source text;

-- === 3. Subconcepto destino del gasto, uno por tenant ===
-- Va bajo "Alimentación animal": la leche de cría es alimento para los terneros.
-- `tenant_id` se pasa explícito porque el DEFAULT `tenant_actual()` no aplica ejecutando
-- la migración como service role (no hay sesión de usuario).
INSERT INTO public.subconceptos_gasto (concepto_id, nombre, tenant_id)
SELECT c.id, 'Leche para crías', c.tenant_id
FROM public.conceptos_gasto c
WHERE c.nombre = 'Alimentación animal'
  AND NOT EXISTS (
    SELECT 1 FROM public.subconceptos_gasto s
    WHERE s.concepto_id = c.id AND s.nombre = 'Leche para crías'
  );

INSERT INTO preview.subconceptos_gasto (concepto_id, nombre, tenant_id)
SELECT c.id, 'Leche para crías', c.tenant_id
FROM preview.conceptos_gasto c
WHERE c.nombre = 'Alimentación animal'
  AND NOT EXISTS (
    SELECT 1 FROM preview.subconceptos_gasto s
    WHERE s.concepto_id = c.id AND s.nombre = 'Leche para crías'
  );

-- === ROLLBACK (no ejecutar salvo que se necesite revertir) ===
-- DELETE FROM public.gastos WHERE source = 'leche_cria';
-- DELETE FROM preview.gastos WHERE source = 'leche_cria';
-- DELETE FROM public.subconceptos_gasto WHERE nombre = 'Leche para crías';
-- DELETE FROM preview.subconceptos_gasto WHERE nombre = 'Leche para crías';
-- ALTER TABLE public.gastos DROP COLUMN source;
-- ALTER TABLE preview.gastos DROP COLUMN source;
-- ALTER TABLE public.extracciones_leche DROP COLUMN litros_cria;
-- ALTER TABLE preview.extracciones_leche DROP COLUMN litros_cria;
-- ALTER TABLE public.extracciones_leche RENAME COLUMN litros_cantina TO litros;
-- ALTER TABLE preview.extracciones_leche RENAME COLUMN litros_cantina TO litros;
