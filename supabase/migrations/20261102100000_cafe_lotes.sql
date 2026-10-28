-- Vertical café: modelo de datos de lotes y bultos (FIN-105 · CO-24).
--
--  1. Tipos `linea_lote`, `tipo_proceso` y `nivel_tueste`.
--  2. `cafe.lotes`: la unidad de trazabilidad. Nace de una compra de marca propia (MP-…) o de la recepción de
--     un servicio de un cliente (MQ-…); nunca se mezcla café propio con el de un cliente.
--  3. `cafe.lote_bultos`: los bultos del lote; sus pesos suman el del lote (constraint trigger diferido).
--  4. Funciones: `orden_proceso()`, `servicios_requeridos()` y las que usan los triggers.
--  5. Triggers: servicios coherentes y ordenados, campos bloqueados tras el primer proceso, anulación.
--  6. RLS y privilegios (plantilla de FIN-90 + exigencia del módulo `cafe.recepcion`).
--  7. Auditoría.
--
-- Solo crea objetos nuevos (más dos índices únicos de apoyo sobre tablas existentes): segura en bases con
-- datos. Las RPC que escriben aquí (`registrar_compra`, `registrar_recepcion`) y la tabla `cafe.procesos`
-- llegan en CO-25, CO-26 y CO-27; los triggers de este fichero ya las esperan (`to_regclass`).

-- 1. Tipos ---------------------------------------------------------------------------------------------

create type cafe.linea_lote   as enum ('marca_propia', 'servicio');
create type cafe.tipo_proceso as enum ('trilla', 'tostion', 'molienda', 'empaque');
create type cafe.nivel_tueste as enum ('bajo', 'medio', 'alto');

-- 2. Apoyo para las FK compuestas ------------------------------------------------------------------------
-- `(tenant_id, id)` único en las tablas a las que apunta un lote: así una FK compuesta impide por
-- construcción que un lote del cliente A cuelgue de un tercero o un tipo de café del cliente B (la
-- comprobación de una FK salta el RLS). Mismo patrón que `movimientos_inventario` → `articulos`.

create unique index terceros_tenant_id_uk   on public.terceros  (tenant_id, id);
create unique index tipos_cafe_tenant_id_uk on cafe.tipos_cafe  (tenant_id, id);

-- 3. Tablas -----------------------------------------------------------------------------------------------

create table cafe.lotes (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null default public.tenant_actual() references public.tenants,
  codigo             text not null check (btrim(codigo) <> ''),          -- MP-2026-0001 / MQ-2026-0001 (siguiente_consecutivo)
  linea              cafe.linea_lote not null,
  tercero_id         uuid not null,                                      -- proveedor (marca propia) o cliente (servicio)
  tipo_cafe_id       uuid,                                               -- obligatorio en marca propia
  fecha_recepcion    date not null,
  peso_recibido_kg   numeric(10,3) not null check (peso_recibido_kg > 0),
  num_bultos         smallint not null check (num_bultos between 1 and 200),
  humedad_pct        numeric(5,2) check (humedad_pct between 0 and 100),
  densidad           numeric(8,2) check (densidad > 0),
  alertas_calidad    text[] not null default '{}',                       -- snapshot al guardar: {'humedad_alta','densidad_baja',…}
  rangos_calidad     jsonb,                                              -- snapshot de los rangos usados al guardar
  servicios          cafe.tipo_proceso[] not null default '{}',          -- solo servicio: los contratados (el trigger los ordena)
  nivel_tueste       cafe.nivel_tueste,
  precio_compra_kg   numeric(12,2) check (precio_compra_kg >= 0),        -- solo marca propia (snapshot)
  valor_compra       numeric(14,2) generated always as (round(peso_recibido_kg * precio_compra_kg, 0)) stored,
  factura_proveedor  text,
  observaciones      text,
  anulado_at         timestamptz,
  anulado_por        uuid references auth.users,
  motivo_anulacion   text check (motivo_anulacion is null or btrim(motivo_anulacion) <> ''),
  created_at         timestamptz not null default now(),
  created_by         uuid default auth.uid() references auth.users,
  updated_at         timestamptz,
  updated_by         uuid references auth.users,
  constraint lotes_codigo_uk unique (tenant_id, codigo),
  constraint lotes_tenant_id_uk unique (tenant_id, id),
  constraint lotes_tercero_fk foreign key (tenant_id, tercero_id)
    references public.terceros (tenant_id, id) on delete restrict,
  constraint lotes_tipo_cafe_fk foreign key (tenant_id, tipo_cafe_id)
    references cafe.tipos_cafe (tenant_id, id) on delete restrict,
  constraint lote_marca_propia_ck check (
    linea <> 'marca_propia'
    or (tipo_cafe_id is not null and precio_compra_kg is not null and servicios = '{}' and nivel_tueste is null)),
  constraint lote_servicio_ck check (
    linea <> 'servicio' or (cardinality(servicios) > 0 and precio_compra_kg is null)),
  constraint lote_tueste_ck check (
    (('tostion' = any(servicios)) = (nivel_tueste is not null)) or linea = 'marca_propia'),
  constraint lote_anulacion_ck check ((anulado_at is null) = (motivo_anulacion is null))
);

create index on cafe.lotes (tenant_id, fecha_recepcion desc);
create index on cafe.lotes (tenant_id, linea);
create index on cafe.lotes (tercero_id);

create table cafe.lote_bultos (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default public.tenant_actual() references public.tenants,
  lote_id    uuid not null,
  numero     smallint not null check (numero >= 1),
  peso_kg    numeric(10,3) not null check (peso_kg > 0),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at timestamptz,
  updated_by uuid references auth.users,
  constraint lote_bultos_numero_uk unique (lote_id, numero),
  constraint lote_bultos_lote_fk foreign key (tenant_id, lote_id)
    references cafe.lotes (tenant_id, id) on delete restrict
);

create index on cafe.lote_bultos (tenant_id, lote_id);

-- 4. Funciones ------------------------------------------------------------------------------------------------

-- Orden de los procesos: trilla → tostión → molienda → empaque. Misma regla que `ORDEN_PROCESO` de
-- `modules/cafe/lotes/lib/servicios.ts`.
create or replace function cafe.orden_proceso(t cafe.tipo_proceso)
returns smallint
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case t when 'trilla' then 1 when 'tostion' then 2 when 'molienda' then 3 when 'empaque' then 4 end::smallint
$$;

-- Orden del último proceso registrado (no anulado) del lote; NULL si no tiene ninguno. `cafe.procesos` llega
-- con CO-27: mientras no exista, ningún lote tiene procesos y los bloqueos no actúan. SECURITY INVOKER: ve lo
-- que el RLS del usuario le deje ver (los procesos de su cliente).
create or replace function cafe.orden_ultimo_proceso(p_lote uuid)
returns smallint
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_orden smallint;
begin
  if to_regclass('cafe.procesos') is null then
    return null;
  end if;
  execute 'select max(cafe.orden_proceso(tipo)) from cafe.procesos where lote_id = $1 and anulado_at is null'
    into v_orden using p_lote;
  return v_orden;
end $$;

-- Pasos contra los que se mide el avance del lote. Servicio: los contratados. Marca propia no tiene
-- «contrato»: se mide contra tostión + empaque, y la molienda cuenta solo si ya se hizo (es opcional).
create or replace function cafe.servicios_requeridos(l cafe.lotes)
returns cafe.tipo_proceso[]
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_molienda boolean := false;
begin
  if l.linea = 'servicio' then
    return l.servicios;
  end if;

  if to_regclass('cafe.procesos') is not null then
    execute 'select exists (select 1 from cafe.procesos where lote_id = $1 and tipo = ''molienda'' and anulado_at is null)'
      into v_molienda using l.id;
  end if;

  return case when v_molienda
              then array['tostion', 'molienda', 'empaque']::cafe.tipo_proceso[]
              else array['tostion', 'empaque']::cafe.tipo_proceso[] end;
end $$;

-- Comprueba que los bultos del lote cuadran con él: tantos como `num_bultos`, numerados 1..n y que suman
-- `peso_recibido_kg` (tolerancia de 1 g). Error de negocio `bultos_no_cuadran`.
create or replace function cafe.verificar_bultos_lote(p_lote uuid)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_peso   numeric;
  v_num    integer;
  v_cuenta integer;
  v_suma   numeric;
  v_max    integer;
begin
  select l.peso_recibido_kg, l.num_bultos into v_peso, v_num from cafe.lotes l where l.id = p_lote;
  if not found then
    return;
  end if;

  select count(*), coalesce(sum(b.peso_kg), 0), coalesce(max(b.numero), 0)
    into v_cuenta, v_suma, v_max
    from cafe.lote_bultos b
   where b.lote_id = p_lote;

  if v_cuenta <> v_num or v_max <> v_num or abs(v_suma - v_peso) > 0.001 then
    raise exception using errcode = 'P0001', message = 'bultos_no_cuadran',
      detail = format('El lote debe tener %s bultos (numerados del 1 al %s) que sumen %s kg; tiene %s que suman %s kg.',
                      v_num, v_num, v_peso, v_cuenta, v_suma);
  end if;
end $$;

-- 5. Triggers --------------------------------------------------------------------------------------------------

-- 5.1 Servicios coherentes (antes de los CHECK, que ven el valor ya normalizado). Sin duplicados (se quitan),
-- `molienda` exige `tostion`, `tostion` incluye `empaque` (va sin coste, decisión 5 de CO-20) y se guardan
-- ordenados por `orden_proceso()`.
create or replace function cafe.lotes_normalizar_servicios()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_servicios cafe.tipo_proceso[] := coalesce(new.servicios, '{}');
begin
  if 'molienda' = any(v_servicios) and not 'tostion' = any(v_servicios) then
    raise exception using errcode = 'P0001', message = 'servicios_invalidos',
      detail = 'La molienda requiere tostión.';
  end if;

  if 'tostion' = any(v_servicios) then
    v_servicios := v_servicios || array['empaque']::cafe.tipo_proceso[];
  end if;

  new.servicios := coalesce(
    (select array_agg(s.t order by cafe.orden_proceso(s.t))
       from (select distinct x as t from unnest(v_servicios) x) s),
    '{}');
  return new;
end $$;

create trigger lotes_1_normalizar_servicios before insert or update on cafe.lotes
  for each row execute function cafe.lotes_normalizar_servicios();

-- 5.2 Protección: un lote anulado no se toca; la anulación la hace un UPDATE de `owner`/`admin` (RLS) y solo
-- si el lote no tiene procesos; tras el primer proceso se bloquean los datos de los que depende lo ya hecho.
create or replace function cafe.lotes_proteger()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ultimo smallint;
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  if old.anulado_at is not null then
    raise exception using errcode = 'P0001', message = 'lote_anulado',
      detail = 'El lote está anulado: ya no se puede modificar.';
  end if;

  v_ultimo := cafe.orden_ultimo_proceso(old.id);

  if new.anulado_at is not null then
    if v_ultimo is not null then
      raise exception using errcode = 'P0001', message = 'lote_con_procesos',
        detail = 'El lote ya tiene procesos registrados: anula primero los procesos para poder anularlo.';
    end if;
    -- Quién y cuándo anula lo fija la base, no el cliente.
    new.anulado_at  := now();
    new.anulado_por := coalesce(auth.uid(), new.anulado_por);
    return new;
  end if;

  if v_ultimo is not null then
    if new.linea            is distinct from old.linea
       or new.tercero_id       is distinct from old.tercero_id
       or new.peso_recibido_kg is distinct from old.peso_recibido_kg
       or new.num_bultos       is distinct from old.num_bultos then
      raise exception using errcode = 'P0001', message = 'lote_bloqueado',
        detail = 'El lote ya tiene procesos: no se pueden cambiar la línea, el tercero, el peso ni los bultos.';
    end if;

    -- Los servicios solo admiten AÑADIR pasos posteriores al último registrado.
    if not (old.servicios <@ new.servicios)
       or exists (select 1 from unnest(new.servicios) s
                   where s <> all (old.servicios) and cafe.orden_proceso(s) <= v_ultimo) then
      raise exception using errcode = 'P0001', message = 'lote_bloqueado',
        detail = 'El lote ya tiene procesos: solo se pueden añadir servicios posteriores al último registrado.';
    end if;
  end if;

  return new;
end $$;

create trigger lotes_2_proteger before insert or update on cafe.lotes
  for each row execute function cafe.lotes_proteger();

create trigger set_updated before update on cafe.lotes
  for each row execute function public.set_updated();

-- 5.3 Los bultos de un lote anulado o ya procesado no cambian.
create or replace function cafe.lote_bultos_proteger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from cafe.lotes l where l.id = new.lote_id and l.anulado_at is not null) then
    raise exception using errcode = 'P0001', message = 'lote_anulado',
      detail = 'El lote está anulado: ya no se puede modificar.';
  end if;

  if cafe.orden_ultimo_proceso(new.lote_id) is not null then
    raise exception using errcode = 'P0001', message = 'lote_bloqueado',
      detail = 'El lote ya tiene procesos: no se pueden cambiar sus bultos.';
  end if;
  return new;
end $$;

create trigger lote_bultos_proteger before insert or update on cafe.lote_bultos
  for each row execute function cafe.lote_bultos_proteger();

create trigger set_updated before update on cafe.lote_bultos
  for each row execute function public.set_updated();

-- 5.4 Los bultos suman el peso del lote: al FINAL de la transacción (el lote y sus bultos se insertan en
-- instrucciones distintas, así que no se puede comprobar fila a fila). Dispara desde ambas tablas: un lote
-- sin bultos también falla.
create or replace function cafe.lotes_verificar_bultos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'lotes' then
    perform cafe.verificar_bultos_lote(new.id);
  else
    if tg_op <> 'INSERT' then
      perform cafe.verificar_bultos_lote(old.lote_id);
    end if;
    if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.lote_id <> old.lote_id) then
      perform cafe.verificar_bultos_lote(new.lote_id);
    end if;
  end if;
  return null;
end $$;

create constraint trigger lotes_bultos_cuadran
  after insert or update of peso_recibido_kg, num_bultos on cafe.lotes
  deferrable initially deferred
  for each row execute function cafe.lotes_verificar_bultos();

create constraint trigger lote_bultos_cuadran
  after insert or update of peso_kg, numero, lote_id or delete on cafe.lote_bultos
  deferrable initially deferred
  for each row execute function cafe.lotes_verificar_bultos();

-- Privilegios de las funciones: las de negocio las llaman los usuarios (RPC futuras); las de los triggers,
-- nadie a mano.
revoke all on function cafe.orden_proceso(cafe.tipo_proceso) from public, anon;
grant execute on function cafe.orden_proceso(cafe.tipo_proceso) to authenticated, service_role;
revoke all on function cafe.orden_ultimo_proceso(uuid) from public, anon;
grant execute on function cafe.orden_ultimo_proceso(uuid) to authenticated, service_role;
revoke all on function cafe.servicios_requeridos(cafe.lotes) from public, anon;
grant execute on function cafe.servicios_requeridos(cafe.lotes) to authenticated, service_role;
revoke all on function cafe.verificar_bultos_lote(uuid) from public, anon;
grant execute on function cafe.verificar_bultos_lote(uuid) to authenticated, service_role;
revoke all on function cafe.lotes_normalizar_servicios() from public, anon, authenticated;
revoke all on function cafe.lotes_proteger() from public, anon, authenticated;
revoke all on function cafe.lote_bultos_proteger() from public, anon, authenticated;
revoke all on function cafe.lotes_verificar_bultos() from public, anon, authenticated;

-- 6. RLS y privilegios ------------------------------------------------------------------------------------------
-- El módulo `cafe.recepcion` se exige en todas las políticas. Lectura: cualquier miembro. INSERT: owner,
-- admin y operativo (lo usan las RPC SECURITY INVOKER; la app nunca inserta directo). UPDATE (correcciones y
-- anulación): owner y admin. Nadie borra: un lote se anula.

alter table cafe.lotes       enable row level security;
alter table cafe.lote_bultos enable row level security;

create policy lotes_select on cafe.lotes for select to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.recepcion')));

create policy lotes_insert on cafe.lotes for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.recepcion'))
              and (select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'));

create policy lotes_update on cafe.lotes for update to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.recepcion'))
         and (select public.rol_en_tenant()) in ('owner', 'admin'))
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.recepcion'))
              and (select public.rol_en_tenant()) in ('owner', 'admin'));

create policy lote_bultos_select on cafe.lote_bultos for select to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.recepcion')));

create policy lote_bultos_insert on cafe.lote_bultos for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.recepcion'))
              and (select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'));

create policy lote_bultos_update on cafe.lote_bultos for update to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.recepcion'))
         and (select public.rol_en_tenant()) in ('owner', 'admin'))
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.recepcion'))
              and (select public.rol_en_tenant()) in ('owner', 'admin'));

-- Los privilegios por defecto del schema `cafe` dan también DELETE: se quitan y se da solo lo necesario.
-- INSERT por columnas: `id`, `anulado_*`, `created_*` y `updated_*` los pone la base. UPDATE por columnas:
-- `tenant_id`, `codigo` y `linea` no cambian nunca (el prefijo del código depende de la línea); la anulación
-- se hace con `anulado_at` + `motivo_anulacion` (quién y cuándo los fija el trigger).
revoke all on table cafe.lotes       from public, anon, authenticated, service_role;
revoke all on table cafe.lote_bultos from public, anon, authenticated, service_role;

grant select on table cafe.lotes, cafe.lote_bultos to authenticated;
grant insert (tenant_id, codigo, linea, tercero_id, tipo_cafe_id, fecha_recepcion, peso_recibido_kg, num_bultos,
              humedad_pct, densidad, alertas_calidad, rangos_calidad, servicios, nivel_tueste, precio_compra_kg,
              factura_proveedor, observaciones)
  on table cafe.lotes to authenticated;
grant update (tercero_id, tipo_cafe_id, fecha_recepcion, peso_recibido_kg, num_bultos, humedad_pct, densidad,
              alertas_calidad, rangos_calidad, servicios, nivel_tueste, precio_compra_kg, factura_proveedor,
              observaciones, anulado_at, motivo_anulacion)
  on table cafe.lotes to authenticated;
grant insert (tenant_id, lote_id, numero, peso_kg) on table cafe.lote_bultos to authenticated;
grant update (peso_kg) on table cafe.lote_bultos to authenticated;

grant select, insert, update on table cafe.lotes, cafe.lote_bultos to service_role;

-- 7. Auditoría ----------------------------------------------------------------------------------------------------

select audit.activar('cafe.lotes');
select audit.activar('cafe.lote_bultos');
