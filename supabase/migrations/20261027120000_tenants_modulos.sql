-- Tenants con vertical, plan y marca + catálogo de módulos (FIN-89 · CO-09).
--
--  1. Enums `vertical` y `tenant_estado`.
--  2. Columnas nuevas en `public.tenants` (vertical, estado, plan, marca, zona horaria, moneda).
--  3. `public.modulos` (catálogo global, sin tenant_id) y `public.tenant_modulos` (qué tiene cada cliente).
--  4. Seed idempotente del catálogo.
--  5. Backfill: villa-blanca y el-velero → ganadería con sus módulos base; arriendos SOLO villa-blanca
--     (replica `TENANTS_POR_MODULO` de `src/lib/tenants/modulos.ts`, que desaparece); nuevo tenant
--     `toca-lacteos` (cooperativa) sin tocar sus tablas ni sus roles (Fase 2).
--  6. RLS y privilegios (incluido GRANT UPDATE por columnas para la marca).
--  7. `public.tenant_tiene_modulo(text)` para políticas RLS de tablas de módulos opcionales.
--  8. Auditoría de `tenant_modulos` y `set_updated` en `tenants`.
--
-- Pensada para bases CON DATOS (staging/producción): las columnas nuevas llevan DEFAULT constante
-- (no reescriben la tabla) y todo lo que inserta usa ON CONFLICT DO NOTHING, así que se puede reaplicar.
-- Cualquier tenant que ya existiera y no sea villa-blanca/el-velero queda como `ganaderia` con los
-- módulos base de ganadería (es el único vertical que ha existido hasta hoy).

-- 1. Enums ----------------------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'vertical') then
    create type public.vertical as enum ('ganaderia', 'cooperativa', 'cafe');
  end if;
  if not exists (select 1 from pg_type where typnamespace = 'public'::regnamespace and typname = 'tenant_estado') then
    create type public.tenant_estado as enum ('activo', 'prueba', 'suspendido', 'baja');
  end if;
end $$;

-- 2. Columnas de `tenants` ------------------------------------------------------------------------
-- `vertical` arranca con DEFAULT 'ganaderia' para que las filas existentes (todas fincas) queden
-- bien sin reescribirlas; el DEFAULT se quita al final (sección 5): un cliente nuevo debe declarar
-- su vertical, no heredar uno por descuido.

alter table public.tenants
  add column if not exists vertical public.vertical not null default 'ganaderia',
  add column if not exists estado public.tenant_estado not null default 'activo',
  add column if not exists plan text not null default 'pro',
  add column if not exists nit text,
  add column if not exists logo_url text,
  add column if not exists color_primario text,
  add column if not exists zona_horaria text not null default 'America/Bogota',
  add column if not exists moneda char(3) not null default 'COP',
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tenants_color_primario_check') then
    alter table public.tenants
      add constraint tenants_color_primario_check check (color_primario ~ '^#[0-9a-fA-F]{6}$');
  end if;
end $$;

drop trigger if exists set_updated on public.tenants;
create trigger set_updated before update on public.tenants
  for each row execute function public.set_updated();

-- 3. Catálogo y activación -----------------------------------------------------------------------

-- Catálogo global: lo mantiene la plataforma, no tiene tenant_id.
create table if not exists public.modulos (
  id          text primary key,            -- 'ganaderia.arriendos', 'cafe.ventas'
  vertical    public.vertical,             -- NULL = módulo del núcleo, usable por cualquiera
  nombre      text not null,
  descripcion text,
  base        boolean not null default false  -- incluido siempre en su vertical
);

-- `id` existe solo para `audit.activar()` (exige una columna `id` como registro_id del log); la
-- clave primaria sigue siendo (tenant_id, modulo_id).
create table if not exists public.tenant_modulos (
  id           uuid not null default gen_random_uuid() unique,
  tenant_id    uuid not null references public.tenants on delete cascade,
  modulo_id    text not null references public.modulos on delete restrict,
  activo       boolean not null default true,
  config       jsonb not null default '{}',
  activado_at  timestamptz not null default now(),
  activado_por uuid default auth.uid(),
  primary key (tenant_id, modulo_id)
);

-- La PK cubre las consultas por tenant; este índice cubre "qué clientes tienen el módulo X".
create index if not exists tenant_modulos_modulo_idx on public.tenant_modulos (modulo_id);

-- 4. Seed del catálogo ----------------------------------------------------------------------------
-- Un módulo nuevo se añade aquí (migración nueva) Y a `MODULOS` en
-- `src/modules/core/tenants/modulos.ts`; un test de Vitest compara ambos contra la base local.

insert into public.modulos (id, vertical, nombre, descripcion, base) values
  ('ganaderia.animales',        'ganaderia',   'Animales',            'Hato, fichas, eventos y alertas',                       true),
  ('ganaderia.extracciones',    'ganaderia',   'Extracciones',        'Litros de leche por día y sus apuntes automáticos',     true),
  ('ganaderia.finanzas',        'ganaderia',   'Finanzas',            'Gastos e ingresos',                                     true),
  ('ganaderia.inventario',      'ganaderia',   'Inventario',          'Pajillas y su stock',                                   true),
  ('ganaderia.arriendos',       'ganaderia',   'Arriendos',           'Contratos de arriendo y abonos',                        false),
  ('ganaderia.control_lechero', 'ganaderia',   'Control lechero',     'Control de producción lechera por animal',              false),
  ('cooperativa.rutas',         'cooperativa', 'Rutas e itinerarios', 'Fincas proveedoras, rutas e itinerarios',               true),
  ('cooperativa.recolecciones', 'cooperativa', 'Recolecciones',       'Recolección diaria de leche (incluye modo sin conexión)', true),
  ('cooperativa.pagos',         'cooperativa', 'Pagos',               'Pagos por finca y período',                             false),
  ('cooperativa.informes',      'cooperativa', 'Informes',            'Informes Excel y comprobantes de pago',                 false),
  ('cafe.recepcion',            'cafe',        'Recepción',           'Recepción de café',                                     true),
  ('cafe.procesos',             'cafe',        'Procesos',            'Procesos de beneficio',                                 true),
  ('cafe.inventario',           'cafe',        'Inventario',          'Inventario de café',                                    true),
  ('cafe.remisiones',           'cafe',        'Remisiones',          'Remisiones de despacho',                                true),
  ('cafe.ventas',               'cafe',        'Ventas',              'Ventas de café',                                        false),
  ('cafe.dashboard',            'cafe',        'Panel',               'Panel de indicadores de café',                          false),
  ('cafe.exportacion',          'cafe',        'Exportación',         'Documentación de exportación',                          false),
  ('core.terceros',             null,          'Terceros',            'Clientes, proveedores y demás terceros',                false),
  ('core.auditoria',            null,          'Auditoría',           'Historial de cambios',                                  false)
on conflict (id) do nothing;

-- 5. Backfill -------------------------------------------------------------------------------------

-- 5.1 Los dos clientes de finca existentes (por slug; ya son 'ganaderia' por el DEFAULT).
update public.tenants set vertical = 'ganaderia' where slug in ('villa-blanca', 'el-velero');

-- 5.2 Toca Lácteos: la cooperativa pasa a tener fila de cliente. Solo la fila: sus tablas siguen sin
--     tenant_id y sus roles con tenant_id NULL (Fase 2). La usarán las membresías (CO-10) y la marca.
insert into public.tenants (nombre, slug, vertical)
values ('Toca Lácteos', 'toca-lacteos', 'cooperativa')
on conflict (slug) do nothing;

-- 5.3 Ya no hay filas que dependan del DEFAULT: desde aquí `vertical` es obligatorio al insertar.
alter table public.tenants alter column vertical drop default;

-- 5.4 Módulos base de ganadería para todo cliente ganadero (villa-blanca y el-velero, y cualquier otro
--     que ya existiera).
insert into public.tenant_modulos (tenant_id, modulo_id)
select t.id, m.id
  from public.tenants t
  join public.modulos m on m.vertical = t.vertical and m.base
 where t.vertical = 'ganaderia'
on conflict do nothing;

-- 5.5 Arriendos: SOLO villa-blanca (replica el comportamiento actual).
insert into public.tenant_modulos (tenant_id, modulo_id)
select t.id, 'ganaderia.arriendos'
  from public.tenants t
 where t.slug = 'villa-blanca'
on conflict do nothing;

-- 5.6 Toca Lácteos: base de cooperativa + pagos + informes.
insert into public.tenant_modulos (tenant_id, modulo_id)
select t.id, m.id
  from public.tenants t
  join public.modulos m on m.id in (
         'cooperativa.rutas', 'cooperativa.recolecciones', 'cooperativa.pagos', 'cooperativa.informes')
 where t.slug = 'toca-lacteos'
on conflict do nothing;

-- 6. RLS y privilegios ----------------------------------------------------------------------------
-- Lectura: el catálogo lo ve cualquier usuario con sesión; `tenant_modulos` solo el propio cliente.
-- Escritura: nadie desde la API. Solo el service_role (que salta RLS) o SQL como dueño; la futura
-- consola de plataforma (CO-10) escribirá por ahí. No hay políticas de INSERT/UPDATE/DELETE y,
-- además, se retiran los privilegios: un fallo en una política no puede abrir la escritura.

alter table public.modulos enable row level security;
alter table public.tenant_modulos enable row level security;

drop policy if exists modulos_select on public.modulos;
create policy modulos_select on public.modulos
  for select to authenticated
  using (true);

drop policy if exists tenant_modulos_select on public.tenant_modulos;
create policy tenant_modulos_select on public.tenant_modulos
  for select to authenticated
  using (tenant_id = (select public.tenant_actual()));

revoke all on table public.modulos from public, anon, authenticated;
revoke all on table public.tenant_modulos from public, anon, authenticated;
grant select on table public.modulos to authenticated;
grant select on table public.tenant_modulos to authenticated;
grant all on table public.modulos to service_role;
grant all on table public.tenant_modulos to service_role;

-- `tenants`: el admin del cliente puede cambiar SOLO la marca. Son dos candados a propósito: la
-- política decide QUÉ FILA (la suya, y siendo admin) y el GRANT por columnas decide QUÉ CAMPOS.
-- Sin el GRANT, la política le dejaría tocar `plan`, `estado` o `vertical`.
drop policy if exists tenants_update_marca on public.tenants;
create policy tenants_update_marca on public.tenants
  for update to authenticated
  using (id = (select public.tenant_actual()) and (select public.rol_actual()) = 'admin')
  with check (id = (select public.tenant_actual()) and (select public.rol_actual()) = 'admin');

revoke insert, update, delete, truncate on table public.tenants from anon, authenticated;
grant update (nombre, logo_url, color_primario) on table public.tenants to authenticated;

-- 7. Función para políticas RLS ----------------------------------------------------------------------
-- SECURITY INVOKER: lee `tenant_modulos` con el RLS del usuario, que ya limita a su cliente. Para las
-- políticas de tablas de módulos opcionales:  using (public.tenant_tiene_modulo('ganaderia.arriendos')).

create or replace function public.tenant_tiene_modulo(p_modulo text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
      from public.tenant_modulos tm
     where tm.tenant_id = (select public.tenant_actual())
       and tm.modulo_id = p_modulo
       and tm.activo
  )
$$;

revoke all on function public.tenant_tiene_modulo(text) from public, anon;
grant execute on function public.tenant_tiene_modulo(text) to authenticated, service_role;

-- 8. Auditoría -------------------------------------------------------------------------------------
-- (`public.tenants` ya estaba auditada desde FIN-88.) Se activa al final para que el backfill de
-- arriba, que es la migración y no un cambio de usuario, no llene el log.

select audit.activar('public.tenant_modulos');
