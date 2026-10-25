-- 2026-10-07 — Nuevo valor 'servida' en el enum `estado_reproductivo`.
--
-- Flujo: inseminación/monta deja la vaca en `servida` hasta el día 39 posterior y el cron
-- diario `/api/cron/animales-estados` la pasa a `por_confirmar` cumplidos
-- `DIAS_PASE_A_POR_CONFIRMAR` (40) días desde ese evento.
--
-- El enum vive solo en `public`; `preview` lo referencia cualificado.

-- === POR APLICAR ===
ALTER TYPE public.estado_reproductivo ADD VALUE 'servida' AFTER 'servicio';

-- Opcional (datos): vacas ya en `por_confirmar` cuyo último servicio tiene menos de 40 días
-- pueden pasarse a `servida`; el cron nunca retrocede, así que se hace a mano si se desea.

-- === ROLLBACK ===
-- UPDATE public.animales SET estado_reproductivo = 'por_confirmar' WHERE estado_reproductivo = 'servida';
-- y recrear el tipo sin el valor (ver 2026-08-05-estado-reproductivo-servicio.sql).
