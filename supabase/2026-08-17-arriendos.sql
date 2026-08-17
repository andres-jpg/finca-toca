-- 2026-08-17 — Módulo de arriendos (solo Villa Blanca).
--
-- Aplicada en 2 migraciones: arriendos_1_tablas_public y arriendos_2_tablas_preview.
--
-- ============================================================================
-- DECISIONES
-- ============================================================================
--
-- 1. Dos tablas: `arriendos` (contrato: arrendatario, finca, período y canon) y
--    `arriendos_abonos` (pagos parciales contra ese canon). El **saldo no se guarda**:
--    se deriva en cada lectura como `canon - SUM(abonos.valor)`, igual que las alertas
--    y los días en leche. Guardarlo obligaría a mantenerlo sincronizado en cada alta,
--    edición y borrado de abono.
--
-- 2. Cada abono tiene un **gasto espejo** en `gastos` con `source = 'arriendo_abono'`,
--    fechado el día del abono, para que cuente como gasto real del mes en que se paga.
--    El vínculo es `arriendos_abonos.gasto_id`, con ON DELETE SET NULL: si alguien borra
--    el gasto a mano desde el módulo de gastos, el abono (que es el registro primario)
--    sobrevive y la siguiente edición le regenera el apunte. El índice único parcial
--    impide que dos abonos apunten al mismo gasto.
--
-- 3. El subconcepto de destino es "Arriendos" (bajo "Operación y mantenimiento"), que ya
--    existía en la taxonomía de Villa Blanca — no hace falta sembrarlo.
--
-- 4. Multi-tenancy idéntica al resto del lado finca: `tenant_id NOT NULL DEFAULT
--    tenant_actual()`, RLS filtrando por `tenant_id = tenant_actual()` y la misma matriz
--    de roles que las tablas operativas (SELECT admin/user/viewer, escritura admin/user).
--    Que el módulo sea exclusivo de Villa Blanca **no** se codifica en RLS: se decide en
--    `src/lib/tenants/modulos.ts` (barra lateral, página y Server Actions). RLS ya impide
--    que un cliente vea los arriendos de otro; la lista de módulos solo decide a quién se
--    le enseña la opción, y así dar de alta el módulo a otro cliente no toca la base.
--
-- ============================================================================
-- 1) TABLAS Y POLÍTICAS EN `public`
-- ============================================================================
create table public.arriendos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.tenant_actual() references public.tenants(id),
  arrendatario text not null,
  finca_nombre text not null,
  fecha_inicio date not null,
  fecha_fin date not null,
  canon bigint not null,
  observaciones text,
  created_at timestamptz not null default now(),
  constraint arriendos_canon_positivo check (canon > 0),
  constraint arriendos_periodo_valido check (fecha_fin >= fecha_inicio)
);

create index arriendos_tenant_id_idx on public.arriendos (tenant_id);

create table public.arriendos_abonos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.tenant_actual() references public.tenants(id),
  arriendo_id uuid not null references public.arriendos(id) on delete cascade,
  fecha date not null,
  valor bigint not null,
  observaciones text,
  gasto_id bigint references public.gastos(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint arriendos_abonos_valor_positivo check (valor > 0)
);

create index arriendos_abonos_tenant_id_idx on public.arriendos_abonos (tenant_id);
create index arriendos_abonos_arriendo_id_idx on public.arriendos_abonos (arriendo_id);
create unique index arriendos_abonos_gasto_id_key on public.arriendos_abonos (gasto_id)
  where gasto_id is not null;

alter table public.arriendos enable row level security;
alter table public.arriendos_abonos enable row level security;

do $$
declare
  t text;
  tablas text[] := array['arriendos', 'arriendos_abonos'];
  lectores text := '(SELECT public.rol_actual()) = ANY (ARRAY[''admin'',''user'',''viewer'']::public.rol[])';
  escritores text := '(SELECT public.rol_actual()) = ANY (ARRAY[''admin'',''user'']::public.rol[])';
  mismo_cliente text := 'tenant_id = (SELECT public.tenant_actual())';
begin
  foreach t in array tablas loop
    execute format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (%s AND %s)',
                   t || '_select', t, mismo_cliente, lectores);
    execute format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (%s AND %s)',
                   t || '_insert', t, mismo_cliente, escritores);
    execute format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (%s AND %s) WITH CHECK (%s AND %s)',
                   t || '_update', t, mismo_cliente, escritores, mismo_cliente, escritores);
    execute format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s AND %s)',
                   t || '_delete', t, mismo_cliente, escritores);
  end loop;
end $$;

-- ============================================================================
-- 2) MISMO BLOQUE EN `preview`  (migración arriendos_2_tablas_preview)
-- ============================================================================
-- El deploy de `develop` usa NEXT_PUBLIC_SUPABASE_SCHEMA=preview, así que necesita las dos
-- tablas o la página revienta ahí. Es el mismo bloque cambiando public → preview en tablas,
-- FKs y helpers (`preview.tenant_actual()`, `preview.rol_actual()`); el enum `public.rol`
-- sigue referenciándose cualificado porque los enums viven solo en `public`.

-- ============================================================================
-- ROLLBACK (no ejecutar salvo necesidad)
-- ============================================================================
-- Los gastos generados por los abonos NO se borran en cascada: hay que quitarlos aparte.
--   DELETE FROM public.gastos WHERE source = 'arriendo_abono';
--   DROP TABLE public.arriendos_abonos;
--   DROP TABLE public.arriendos;
-- (y lo mismo en `preview`)
