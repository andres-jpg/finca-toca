-- Núcleo: tarifas versionadas con vigencia y parámetros configurables por cliente (FIN-94 · CO-14).
--
--  1. `public.tarifas`: valor por concepto con historia y vigencia (append-only). Cambiar una tarifa es
--     INSERTAR otra con `vigente_desde`; lo ya cobrado no cambia porque cada cobro guarda el valor que usó.
--  2. `public.tarifa_vigente(concepto, fecha)` y la vista `public.v_tarifas_vigentes`.
--  3. `public.tarifas_historial()`: lectura del historial con el email de quien creó cada tarifa.
--  4. `public.parametros` (clave → valor jsonb por cliente), `public.parametro()` y `public.guardar_parametro()`.
--     Las DEFINICIONES (etiqueta, schema, valor por defecto) viven en el código de cada módulo, no aquí.
--  5. RLS y privilegios (plantilla de FIN-90: membresías, no `roles`) y auditoría.
--
-- Solo crea objetos nuevos (no toca filas ni tablas existentes): segura en bases con datos.
-- `public.precios` (precio del litro de ganadería) NO se toca en Fase 0.

-- 1. tarifas ------------------------------------------------------------------------------------------

create table public.tarifas (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default public.tenant_actual() references public.tenants,
  concepto      text not null check (concepto ~ '^[a-z0-9_]+\.[a-z0-9_]+$'),   -- 'cafe.trilla', 'cafe.tostion'
  valor         numeric(14,2) not null check (valor >= 0),
  unidad        text not null default 'kg' check (unidad in ('kg', 'g', 'unidad', 'litro')),
  vigente_desde timestamptz not null default now(),
  observaciones text,
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid(),
  unique (tenant_id, concepto, vigente_desde)
);

create index on public.tarifas (tenant_id, concepto, vigente_desde desc);

-- 2. Consulta de tarifas ----------------------------------------------------------------------------------

-- La tarifa de `p_concepto` vigente en `p_at`: la última con `vigente_desde <= p_at`. Sin tarifa →
-- `tarifa_no_definida` (P0001, concepto en `detail`): un proceso no puede registrarse sin saber qué cobrar.
-- SECURITY INVOKER: el RLS limita a las tarifas del cliente actual; el filtro por `tenant_actual()` es
-- explícito porque quien llame con un rol que se salta el RLS (postgres, service_role) no debe ver las de todos.
create or replace function public.tarifa_vigente(p_concepto text, p_at timestamptz default now())
returns numeric
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_valor numeric;
begin
  select t.valor
    into v_valor
    from public.tarifas t
   where t.tenant_id = (select public.tenant_actual())
     and t.concepto = p_concepto
     and t.vigente_desde <= coalesce(p_at, now())
   order by t.vigente_desde desc
   limit 1;

  if not found then
    raise exception using errcode = 'P0001', message = 'tarifa_no_definida',
      detail = format('No hay una tarifa definida para %s en esa fecha.', p_concepto);
  end if;

  return v_valor;
end $$;

revoke execute on function public.tarifa_vigente(text, timestamptz) from public, anon;
grant execute on function public.tarifa_vigente(text, timestamptz) to authenticated;

-- Una fila por concepto con la tarifa que rige AHORA (las programadas a futuro no aparecen hasta su fecha).
-- `security_invoker = true`: se lee con el RLS del usuario.
create view public.v_tarifas_vigentes with (security_invoker = true) as
select distinct on (t.tenant_id, t.concepto)
  t.tenant_id,
  t.concepto,
  t.valor,
  t.unidad,
  t.vigente_desde
from public.tarifas t
where t.vigente_desde <= now()
order by t.tenant_id, t.concepto, t.vigente_desde desc;

-- Historial completo (vigentes, pasadas y programadas) con el email de quien la creó. El email sale de
-- `auth.users`, que un usuario no puede leer, de ahí el SECURITY DEFINER: solo `owner`/`admin` y solo las
-- tarifas del cliente actual (mismo criterio que `historial_cambios()`). Quien ya no es miembro, o actuó sin
-- sesión (seed, SQL editor), sale con email NULL.
create or replace function public.tarifas_historial(p_concepto text default null)
returns table (
  id            uuid,
  concepto      text,
  valor         numeric,
  unidad        text,
  vigente_desde timestamptz,
  observaciones text,
  created_at    timestamptz,
  created_by    uuid,
  email         text
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.concepto, t.valor, t.unidad, t.vigente_desde, t.observaciones, t.created_at, t.created_by,
         u.email::text
    from public.tarifas t
    left join public.tenant_members m
           on m.user_id = t.created_by
          and m.tenant_id = t.tenant_id
    left join auth.users u on u.id = m.user_id
   where (select public.rol_en_tenant()) in ('owner', 'admin')
     and t.tenant_id = (select public.tenant_actual())
     and (p_concepto is null or t.concepto = p_concepto)
   order by t.concepto, t.vigente_desde desc
$$;

revoke all on function public.tarifas_historial(text) from public, anon;
grant execute on function public.tarifas_historial(text) to authenticated;

-- 3. parametros ------------------------------------------------------------------------------------------

-- `id` existe solo para `audit.activar()` (exige una columna `id` como `registro_id` del log); la clave
-- primaria sigue siendo (tenant_id, clave), igual que en `series_consecutivo`.
create table public.parametros (
  id         uuid not null default gen_random_uuid() unique,
  tenant_id  uuid not null default public.tenant_actual() references public.tenants,
  clave      text not null check (clave ~ '^[a-z0-9_]+\.[a-z0-9_]+$'),   -- 'cafe.capacidad_tostadora_kg'
  valor      jsonb not null,                                              -- jsonb 'null' (valor "sin configurar") es válido
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz,
  updated_by uuid,
  primary key (tenant_id, clave)
);

create trigger set_updated before update on public.parametros
  for each row execute function public.set_updated();

-- El valor de `p_clave` para el cliente actual, o `p_default` si no está guardado. No valida contra el
-- schema de la definición (eso vive en el código: `getParametro()`); sirve a las RPC que necesitan un
-- parámetro dentro de su transacción (p. ej. la capacidad de bache).
create or replace function public.parametro(p_clave text, p_default jsonb default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select p.valor
       from public.parametros p
      where p.tenant_id = (select public.tenant_actual())
        and p.clave = p_clave),
    p_default
  )
$$;

revoke execute on function public.parametro(text, jsonb) from public, anon;
grant execute on function public.parametro(text, jsonb) to authenticated;

-- Guarda (inserta o actualiza) un parámetro del cliente actual. SECURITY INVOKER: el RLS decide quién escribe
-- (`owner`/`admin`); un operativo o un viewer falla con 42501 (`no_autorizado`). Existe como RPC para que la
-- app no dependa de las reglas de columnas del upsert de PostgREST.
create or replace function public.guardar_parametro(p_clave text, p_valor jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if p_clave is null or p_clave !~ '^[a-z0-9_]+\.[a-z0-9_]+$' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'La clave del parámetro no es válida.';
  end if;
  if p_valor is null then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'El valor del parámetro es obligatorio.';
  end if;

  insert into public.parametros (clave, valor)
  values (p_clave, p_valor)
  on conflict (tenant_id, clave) do update set valor = excluded.valor;

  return jsonb_build_object('clave', p_clave, 'valor', p_valor);
end $$;

revoke execute on function public.guardar_parametro(text, jsonb) from public, anon;
grant execute on function public.guardar_parametro(text, jsonb) to authenticated;

-- 4. RLS y privilegios ----------------------------------------------------------------------------------

alter table public.tarifas enable row level security;
alter table public.parametros enable row level security;

-- tarifas: lectura para cualquier miembro; INSERT y DELETE para owner/admin (o el permiso fino
-- `tarifas.editar`, que `tiene_permiso()` ya concede a owner/admin); sin UPDATE para nadie. DELETE solo
-- de tarifas programadas (aún no vigentes): corregir una ya vigente es insertar una nueva.
drop policy if exists tarifas_select on public.tarifas;
create policy tarifas_select on public.tarifas for select to authenticated
  using (tenant_id = (select public.tenant_actual()));

drop policy if exists tarifas_insert on public.tarifas;
create policy tarifas_insert on public.tarifas for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tiene_permiso('tarifas.editar')));

drop policy if exists tarifas_delete on public.tarifas;
create policy tarifas_delete on public.tarifas for delete to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tiene_permiso('tarifas.editar'))
         and vigente_desde > now());

-- Supabase concede ALL a `anon`, `authenticated` y `service_role` por defecto en tablas nuevas: se quita a
-- los tres (también a `service_role`, que se salta el RLS pero no los privilegios) y se da solo lo necesario.
-- Append-only: ni UPDATE ni TRUNCATE para nadie; `service_role` ni siquiera borra (borrar una tarifa
-- programada es cosa del admin desde la app).
revoke all on table public.tarifas from public, anon, authenticated, service_role;
grant select, insert, delete on table public.tarifas to authenticated;
grant select, insert on table public.tarifas to service_role;

-- parametros: lectura para cualquier miembro; alta y edición solo owner/admin; nadie borra (un parámetro
-- sin valor guardado cae en el defecto del código).
drop policy if exists parametros_select on public.parametros;
create policy parametros_select on public.parametros for select to authenticated
  using (tenant_id = (select public.tenant_actual()));

drop policy if exists parametros_insert on public.parametros;
create policy parametros_insert on public.parametros for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.rol_en_tenant()) in ('owner', 'admin'));

drop policy if exists parametros_update on public.parametros;
create policy parametros_update on public.parametros for update to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.rol_en_tenant()) in ('owner', 'admin'))
  with check (tenant_id = (select public.tenant_actual())
              and (select public.rol_en_tenant()) in ('owner', 'admin'));

revoke all on table public.parametros from public, anon, authenticated, service_role;
grant select, insert on table public.parametros to authenticated;
-- UPDATE por columnas: la clave y el cliente no cambian nunca; `updated_*` los pone el trigger.
grant update (valor) on table public.parametros to authenticated;
grant select, insert, update on table public.parametros to service_role;

revoke all on table public.v_tarifas_vigentes from public, anon, authenticated, service_role;
grant select on table public.v_tarifas_vigentes to authenticated, service_role;

-- 5. Auditoría --------------------------------------------------------------------------------------------

select audit.activar('public.tarifas');
select audit.activar('public.parametros');
