-- 2026-08-17 — Control de revacunación en el evento de vacunación.
--
-- Aplicada en 2 migraciones: eventos_animal_revacunacion_public y
-- eventos_animal_revacunacion_preview.
--
-- ============================================================================
-- DECISIONES
-- ============================================================================
--
-- 1. Tres columnas en `eventos_animal`, no una tabla aparte: la revacunación es un atributo
--    del evento de vacunación (cuándo toca la siguiente), no una entidad propia.
--      - `requiere_revacunacion` — Sí/No. Se guarda también el "No" explícito, que es
--        distinto de NULL: NULL son las vacunaciones registradas antes de este control.
--      - `periodo_revacunacion`  — el plazo elegido ('1_mes' | '6_meses' | '1_anio' |
--        'personalizada'). Se guarda además de la fecha para poder **recalcularla** si
--        luego se corrige la fecha de la vacunación.
--      - `fecha_revacunacion`    — la fecha resuelta; es la que dispara la alerta, así que
--        el cálculo de alertas no tiene que repetir la aritmética de plazos.
--
-- 2. La fecha la calcula **el Server Action**, no el cliente (`filasRevacunacion` en
--    `eventos.actions.ts`, con `calcularFechaRevacunacion()` de `lib/animales/revacunacion.ts`).
--    El formulario usa la misma función pura solo para previsualizarla.
--
-- 3. La alerta se deriva, como todas: no hay tabla de alertas. La emite `calcularAlertas()`
--    8 días antes de `fecha_revacunacion` (`DIAS_AVISO_REVACUNACION`) y solo a partir de la
--    **última** vacunación del animal, de modo que registrar la siguiente cierra la anterior.
--
-- ============================================================================
-- 1) COLUMNAS Y CHECKS EN `public`
-- ============================================================================
alter table public.eventos_animal
  add column requiere_revacunacion boolean,
  add column periodo_revacunacion text,
  add column fecha_revacunacion date;

alter table public.eventos_animal
  add constraint eventos_animal_periodo_revacunacion_check
  check (
    periodo_revacunacion is null
    or periodo_revacunacion in ('1_mes', '6_meses', '1_anio', 'personalizada')
  );

-- Coherencia: los tres campos solo tienen sentido en una vacunación, y si se pide
-- revacunar tiene que quedar la fecha concreta (es de donde sale la alerta).
-- `is not true` cubre a la vez NULL y false.
alter table public.eventos_animal
  add constraint eventos_animal_revacunacion_check
  check (
    requiere_revacunacion is not true
    or (
      tipo_evento = 'vacunacion'
      and periodo_revacunacion is not null
      and fecha_revacunacion is not null
    )
  );

-- ============================================================================
-- 2) MISMO BLOQUE EN `preview`  (migración eventos_animal_revacunacion_preview)
-- ============================================================================
-- El deploy de `develop` usa NEXT_PUBLIC_SUPABASE_SCHEMA=preview. Idéntico cambiando
-- public → preview.

-- ============================================================================
-- ROLLBACK (no ejecutar salvo necesidad)
-- ============================================================================
--   ALTER TABLE public.eventos_animal
--     DROP CONSTRAINT eventos_animal_revacunacion_check,
--     DROP CONSTRAINT eventos_animal_periodo_revacunacion_check,
--     DROP COLUMN fecha_revacunacion,
--     DROP COLUMN periodo_revacunacion,
--     DROP COLUMN requiere_revacunacion;
-- (y lo mismo en `preview`)
