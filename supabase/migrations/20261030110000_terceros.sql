-- Núcleo: maestro único de terceros (FIN-93 · CO-13).
--
--  1. `pg_trgm` (esquema `extensions`) y el enum `tipo_identificacion`.
--  2. Normalización compartida: `normalizar_identificacion()` y `normalizar_nombre()`.
--  3. `terceros`: un solo maestro; los roles (proveedor / cliente / cliente_servicio) se combinan.
--  4. Triggers: normalización, protección del "Consumidor final" y `set_updated`.
--  5. RLS y privilegios (plantilla de FIN-90: membresías) + exigencia del módulo `core.terceros`.
--  6. `asegurar_consumidor_final()` y `buscar_terceros_similares()`.
--  7. Auditoría.
--
-- Solo crea objetos nuevos (no toca filas ni tablas existentes): segura en bases con datos.
-- `gastos.proveedor` y `pajillas.proveedor` NO se migran aquí (Fase 2).
--
-- Todos los clientes existentes tienen `core.terceros` DESACTIVADO, así que la RLS (que exige el módulo)
-- los deja fuera hasta que la plataforma les inserte la fila en `tenant_modulos`.

-- 1. Extensión y tipos ---------------------------------------------------------------------------------

create extension if not exists pg_trgm with schema extensions;

create type public.tipo_identificacion as enum ('NIT', 'CC', 'CE', 'PAS', 'OTRO');

-- 2. Normalización ---------------------------------------------------------------------------------------
-- Una sola definición para el trigger y para la búsqueda de similares, y la misma que `normalizar.ts`
-- (el test de Vitest y el pgTAP comparten casos): `900.123.456-7`, `900 123 456 7` y `9001234567` son
-- la misma identificación. Se quitan espacios, puntos y guiones y se pasa a mayúsculas (pasaportes y
-- cédulas de extranjería llevan letras).

create or replace function public.normalizar_identificacion(p_texto text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_texto, ''), '[\s.\-]', '', 'g'))
$$;

-- `trim` y espacios internos colapsados ("  Café   Pepe " → "Café Pepe"). No cambia mayúsculas ni tildes.
create or replace function public.normalizar_nombre(p_texto text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select btrim(regexp_replace(coalesce(p_texto, ''), '\s+', ' ', 'g'))
$$;

revoke all on function public.normalizar_identificacion(text) from public, anon;
revoke all on function public.normalizar_nombre(text) from public, anon;
grant execute on function public.normalizar_identificacion(text) to authenticated, service_role;
grant execute on function public.normalizar_nombre(text) to authenticated, service_role;

-- 3. Tabla -----------------------------------------------------------------------------------------------

create table public.terceros (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null default public.tenant_actual() references public.tenants,
  tipo_identificacion public.tipo_identificacion not null default 'CC',
  identificacion      text not null check (identificacion <> ''),
  digito_verificacion smallint check (digito_verificacion between 0 and 9),   -- solo NIT
  nombre              text not null check (length(btrim(nombre)) > 1),
  direccion           text not null check (btrim(direccion) <> ''),
  telefono            text not null check (btrim(telefono) <> ''),
  email               text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  roles               text[] not null default '{}'
                        check (roles <@ array['proveedor', 'cliente', 'cliente_servicio']::text[]),
  es_consumidor_final boolean not null default false,
  activo              boolean not null default true,
  observaciones       text,
  created_at          timestamptz not null default now(),
  created_by          uuid default auth.uid(),
  updated_at          timestamptz,
  updated_by          uuid
);

-- La identificación es única por cliente y tipo; los triggers la guardan ya normalizada.
create unique index terceros_tenant_identificacion_uk
  on public.terceros (tenant_id, tipo_identificacion, identificacion);
-- Un solo "Consumidor final" por cliente.
create unique index terceros_un_consumidor_final on public.terceros (tenant_id) where es_consumidor_final;
create index terceros_tenant_roles_idx on public.terceros using gin (roles);
create index terceros_nombre_trgm on public.terceros using gin (nombre extensions.gin_trgm_ops);
create index terceros_tenant_idx on public.terceros (tenant_id);

-- 4. Triggers ---------------------------------------------------------------------------------------------

-- Normaliza antes de comprobar la unicidad: el índice único ve el valor ya normalizado.
create or replace function public.terceros_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.identificacion := public.normalizar_identificacion(new.identificacion);
  new.nombre         := public.normalizar_nombre(new.nombre);
  new.direccion      := public.normalizar_nombre(new.direccion);
  new.telefono       := public.normalizar_nombre(new.telefono);
  new.email          := nullif(lower(btrim(new.email)), '');
  new.observaciones  := nullif(btrim(new.observaciones), '');
  return new;
end $$;

-- El "Consumidor final" es un registro del sistema:
--  · al crearlo, sus datos son siempre los canónicos (nadie se inventa uno con otro nombre o rol);
--  · una vez creado no se edita, no se desactiva y no se convierte ni se desmarca (`es_consumidor_final`
--    no cambia nunca). Para tocarlo hay que deshabilitar el trigger desde SQL, a propósito.
-- Se dispara después de `terceros_normalizar` (orden alfabético de nombres de trigger).
create or replace function public.terceros_proteger_consumidor_final()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.es_consumidor_final then
      new.tipo_identificacion := 'OTRO';
      new.identificacion      := '222222222222';
      new.digito_verificacion := null;
      new.nombre              := 'Consumidor final';
      new.direccion           := 'N/A';
      new.telefono            := 'N/A';
      new.email               := null;
      new.roles               := array['cliente'];
      new.activo              := true;
    end if;
    return new;
  end if;

  if old.es_consumidor_final or new.es_consumidor_final then
    raise exception using errcode = 'P0001', message = 'consumidor_final_protegido',
      detail = 'El tercero "Consumidor final" es un registro del sistema: no se edita ni se desactiva.';
  end if;
  return new;
end $$;

create trigger terceros_normalizar before insert or update on public.terceros
  for each row execute function public.terceros_normalizar();

create trigger terceros_proteger_consumidor_final before insert or update on public.terceros
  for each row execute function public.terceros_proteger_consumidor_final();

create trigger set_updated before update on public.terceros
  for each row execute function public.set_updated();

-- Las funciones de los triggers no las ejecuta nadie a mano.
revoke all on function public.terceros_normalizar() from public, anon, authenticated;
revoke all on function public.terceros_proteger_consumidor_final() from public, anon, authenticated;

-- 5. RLS y privilegios ---------------------------------------------------------------------------------------
-- El módulo `core.terceros` se exige en TODAS las políticas: un cliente sin él no ve ni escribe nada
-- aunque llame a la API con su sesión (la barra lateral y `requireModulo()` son solo capas por encima).
-- Lectura: cualquier miembro. Alta: owner/admin/operativo (la HU permite crear en línea desde una
-- recepción o una venta). Edición de datos maestros: owner/admin. Borrado: nadie, se desactiva.

alter table public.terceros enable row level security;

drop policy if exists terceros_select on public.terceros;
create policy terceros_select on public.terceros for select to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('core.terceros')));

drop policy if exists terceros_insert on public.terceros;
create policy terceros_insert on public.terceros for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('core.terceros'))
              and (select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'));

drop policy if exists terceros_update on public.terceros;
create policy terceros_update on public.terceros for update to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('core.terceros'))
         and (select public.rol_en_tenant()) in ('owner', 'admin'))
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('core.terceros'))
              and (select public.rol_en_tenant()) in ('owner', 'admin'));

-- Supabase concede ALL a `anon`, `authenticated` y `service_role` por defecto: se quita a los tres y se
-- da solo lo necesario. Sin DELETE ni TRUNCATE para nadie. UPDATE por columnas: `tenant_id`,
-- `es_consumidor_final` y `created_*` no cambian nunca (`updated_*` los pone el trigger).
revoke all on table public.terceros from public, anon, authenticated, service_role;
grant select, insert on table public.terceros to authenticated;
grant update (tipo_identificacion, identificacion, digito_verificacion, nombre, direccion, telefono,
              email, roles, activo, observaciones) on table public.terceros to authenticated;
grant select, insert, update on table public.terceros to service_role;

-- 6. Funciones ---------------------------------------------------------------------------------------------

-- Crea el "Consumidor final" del cliente si no existe y devuelve su id (idempotente). La llama el alta de
-- clientes / el seed de vertical (FIN-98, CO-18), que corren sin sesión: por eso admite `p_tenant`
-- (con sesión, `tenant_actual()`). SECURITY INVOKER: con sesión, el RLS de `terceros` decide quién puede
-- (owner/admin/operativo con el módulo activo); pasar el id de otro cliente falla con 42501. El
-- trigger fija los datos canónicos.
-- 222222222222 es la identificación habitual de consumidor final en la facturación electrónica de
-- Colombia (confirmar con Cofradía).
create or replace function public.asegurar_consumidor_final(p_tenant uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tenant uuid := coalesce(p_tenant, (select public.tenant_actual()));
  v_id     uuid;
begin
  if v_tenant is null then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  select t.id into v_id from public.terceros t where t.tenant_id = v_tenant and t.es_consumidor_final;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.terceros
    (tenant_id, tipo_identificacion, identificacion, nombre, direccion, telefono, roles, es_consumidor_final)
  values
    (v_tenant, 'OTRO', '222222222222', 'Consumidor final', 'N/A', 'N/A', array['cliente'], true)
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    -- Otro proceso lo creó entre el select y el insert, o la identificación 222222222222 ya es de otro
    -- tercero (en cuyo caso no hay consumidor final y no se puede crear sin pisarlo).
    select t.id into v_id from public.terceros t where t.tenant_id = v_tenant and t.es_consumidor_final;
    if v_id is null then
      raise exception using errcode = 'P0001', message = 'consumidor_final_no_disponible',
        detail = 'La identificación 222222222222 ya pertenece a otro tercero: no se puede crear el Consumidor final.';
    end if;
  end if;
  return v_id;
end $$;

revoke execute on function public.asegurar_consumidor_final(uuid) from public, anon;
grant execute on function public.asegurar_consumidor_final(uuid) to authenticated, service_role;

-- Terceros que podrían ser el que se está dando de alta: misma identificación normalizada (de cualquier
-- tipo) **o** nombre parecido (trigramas, umbral 0.4). Máximo 5, primero la coincidencia de
-- identificación y luego los más parecidos. Incluye inactivos (conviene reactivarlos, no duplicarlos).
-- STABLE + SECURITY INVOKER: el RLS limita la búsqueda al cliente actual y exige el módulo.
-- Los operadores de pg_trgm viven en `extensions`: con `search_path = ''` hay que calificarlos.
create or replace function public.buscar_terceros_similares(p_nombre text, p_identificacion text default null)
returns setof public.terceros
language sql
stable
security invoker
set search_path = ''
as $$
  select t.*
    from public.terceros t
   where (public.normalizar_identificacion(p_identificacion) <> ''
          and t.identificacion = public.normalizar_identificacion(p_identificacion))
      or (public.normalizar_nombre(p_nombre) <> ''
          and extensions.similarity(t.nombre, public.normalizar_nombre(p_nombre)) > 0.4)
   order by (public.normalizar_identificacion(p_identificacion) <> ''
             and t.identificacion = public.normalizar_identificacion(p_identificacion)) desc,
            extensions.similarity(t.nombre, public.normalizar_nombre(p_nombre)) desc,
            t.nombre
   limit 5
$$;

revoke execute on function public.buscar_terceros_similares(text, text) from public, anon;
grant execute on function public.buscar_terceros_similares(text, text) to authenticated;

-- 7. Auditoría -----------------------------------------------------------------------------------------------

select audit.activar('public.terceros');
