-- Consecutivos por serie y año, sin carreras (FIN-95 · CO-15): MP-2026-0001, MQ-2026-0001, REM-2026-0001…
--
--  1. `public.series_consecutivo` (qué series tiene cada cliente y su formato) y `public.consecutivos`
--     (el contador por tenant, serie y año).
--  2. `public.formatear_consecutivo()`: formato puro, la misma lógica que `formatearConsecutivo()` en
--     `src/modules/core/consecutivos/`.
--  3. `public.siguiente_consecutivo(serie, fecha)`: el generador atómico que llaman otras RPC.
--  4. RLS y privilegios; auditoría de `series_consecutivo`.
--
-- Por qué no `max(codigo) + 1`: con dos usuarios a la vez los dos leen el mismo máximo y generan el mismo
-- código, y tampoco reinicia por año. Aquí el número sale de un `INSERT ... ON CONFLICT DO UPDATE`: el
-- bloqueo de fila del upsert serializa a quien pida la misma (tenant, serie, año), así que cada número
-- se entrega una sola vez.
--
-- HUECOS: el contador se incrementa dentro de la transacción de quien llama. Si esa transacción hace
-- rollback (la RPC falla después de pedir número), el rollback REVIERTE también el contador: el número no
-- se consume y lo recibe la siguiente llamada; y quien pidió el mismo número a la vez esperaba al bloqueo
-- de fila, así que tampoco se salta ninguno. Los huecos que sí pueden existir son los de un número ya
-- confirmado cuyo documento se borra o se anula después: el número no se reutiliza, y es aceptable (un
-- consecutivo fiscal/operativo no se reasigna). No renumeres ni "rellenes" huecos.
--
-- Pensada para bases CON DATOS (staging/producción): solo crea objetos nuevos, no toca tablas existentes.

-- 1. Tablas -----------------------------------------------------------------------------------------------

-- Las series de cada cliente. `id` existe solo para `audit.activar()` (exige una columna `id` como
-- `registro_id` del log); la clave primaria sigue siendo (tenant_id, serie).
create table if not exists public.series_consecutivo (
  id             uuid not null default gen_random_uuid() unique,
  tenant_id      uuid not null default public.tenant_actual() references public.tenants,
  serie          text not null,                           -- 'MP', 'MQ', 'REM'
  descripcion    text not null,
  formato        text not null default '{serie}-{anio}-{n:4}',
  reinicia_anual boolean not null default true,
  activo         boolean not null default true,
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid(),
  updated_at     timestamptz,
  updated_by     uuid,
  primary key (tenant_id, serie),
  constraint series_consecutivo_serie_check check (serie ~ '^[A-Za-z0-9_]{1,10}$'),
  -- Todo formato lleva el número, y con un ancho de 1 o 2 cifras como mucho (`{n}`, `{n:4}`): sin ancho
  -- no hay nada que rellenar, y un ancho enorme sería una cadena enorme por cada llamada.
  constraint series_consecutivo_formato_check check (formato ~ '\{n(:[0-9]{1,2})?\}')
);

-- El contador. Solo lo escribe `siguiente_consecutivo()`. `anio` = 0 en las series que no reinician.
create table if not exists public.consecutivos (
  tenant_id uuid not null references public.tenants,
  serie     text not null,
  anio      smallint not null,
  ultimo    integer not null default 0 check (ultimo >= 0),
  primary key (tenant_id, serie, anio),
  foreign key (tenant_id, serie) references public.series_consecutivo on delete restrict
);

drop trigger if exists set_updated on public.series_consecutivo;
create trigger set_updated before update on public.series_consecutivo
  for each row execute function public.set_updated();

-- 2. Formato (puro) ---------------------------------------------------------------------------------------
-- `{serie}`, `{anio}` y `{n:4}` (número relleno con ceros hasta 4 cifras; `{n}` sin relleno). Si el
-- número supera el ancho sigue creciendo sin truncar: el consecutivo 10000 es `0000`+1 → `10000`.
-- Se sustituye primero `{n}` y al final `{serie}`, para que un texto de la serie no se vuelva a interpretar.
-- Debe dar lo mismo que `formatearConsecutivo()` (src/modules/core/consecutivos/formato.ts).

create or replace function public.formatear_consecutivo(
  p_formato text,
  p_serie   text,
  p_anio    integer,
  p_n       integer
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_res    text := p_formato;
  v_m      text[];
  v_ancho  integer;
  v_numero text;
begin
  loop
    v_m := regexp_match(v_res, '\{n(?::([0-9]{1,2}))?\}');
    exit when v_m is null;
    v_ancho  := coalesce(v_m[1]::integer, 0);
    v_numero := p_n::text;
    -- `lpad` TRUNCA si el texto ya es más largo que el ancho: solo se usa cuando falta relleno.
    if length(v_numero) < v_ancho then
      v_numero := lpad(v_numero, v_ancho, '0');
    end if;
    -- Sin el flag 'g': reemplaza solo la primera aparición (cada `{n}` conserva su propio ancho).
    v_res := regexp_replace(v_res, '\{n(?::[0-9]{1,2})?\}', v_numero);
  end loop;

  v_res := replace(v_res, '{anio}', p_anio::text);
  v_res := replace(v_res, '{serie}', p_serie);
  return v_res;
end;
$$;

revoke execute on function public.formatear_consecutivo(text, text, integer, integer) from public, anon;
grant execute on function public.formatear_consecutivo(text, text, integer, integer) to authenticated, service_role;

-- 3. Generador ----------------------------------------------------------------------------------------------
-- EXCEPCIÓN DOCUMENTADA a la regla de `SECURITY INVOKER` de las RPC (CLAUDE.md → Escrituras
-- transaccionales): esta función es `SECURITY DEFINER` porque los usuarios no deben poder editar los
-- contadores (`consecutivos` no tiene privilegios de escritura para nadie), y aun así tienen que poder
-- pedir número. A cambio comprueba ella misma lo que RLS comprobaría: sesión con tenant, rol operativo o
-- superior en ese tenant y serie del propio tenant. Nada de lo que recibe sirve para tocar otro cliente:
-- el tenant sale de `tenant_actual()`, nunca de un parámetro.
--
-- `p_fecha` null → la fecha LOCAL del tenant (`tenants.zona_horaria`), no la UTC del servidor: el 31/12 a
-- las 20:00 en Bogotá ya es 1/1 en UTC pero no es año nuevo para el cliente. Por eso el default es null y
-- no `current_date`. Una RPC que ya conoce la fecha del documento la pasa explícita.
--
-- Errores de negocio (convención de `callRpc`): P0001 con el código en `message` y el texto en `detail`;
-- los de permiso, 42501 (`callRpc` los traduce a `no_autorizado`).

create or replace function public.siguiente_consecutivo(p_serie text, p_fecha date default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tenant   uuid := (select public.tenant_actual());
  v_rol      public.rol_tenant := (select public.rol_en_tenant());
  v_formato  text;
  v_reinicia boolean;
  v_zona     text;
  v_fecha    date;
  v_anio     integer;   -- año calendario de la fecha: lo que se muestra en `{anio}`
  v_clave    smallint;  -- año con el que se guarda el contador (0 si la serie no reinicia)
  v_n        integer;
begin
  if v_tenant is null or v_rol is null or v_rol not in ('owner', 'admin', 'operativo') then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  select s.formato, s.reinicia_anual
    into v_formato, v_reinicia
    from public.series_consecutivo s
   where s.tenant_id = v_tenant and s.serie = p_serie and s.activo;

  if not found then
    raise exception using errcode = 'P0001', message = 'serie_no_configurada',
      detail = format('La serie %s no está configurada o está inactiva para este cliente.', coalesce(p_serie, '(vacía)'));
  end if;

  if p_fecha is null then
    select t.zona_horaria into v_zona from public.tenants t where t.id = v_tenant;
    v_fecha := (now() at time zone v_zona)::date;
  else
    v_fecha := p_fecha;
  end if;

  v_anio  := extract(year from v_fecha)::integer;
  v_clave := case when v_reinicia then v_anio else 0 end;

  -- El upsert es el candado: quien llega segundo espera al bloqueo de la fila hasta que la transacción del
  -- primero termina, y entonces incrementa el valor ya confirmado. Si esa transacción hace rollback, el
  -- incremento se deshace con ella.
  insert into public.consecutivos as c (tenant_id, serie, anio, ultimo)
  values (v_tenant, p_serie, v_clave, 1)
  on conflict (tenant_id, serie, anio) do update set ultimo = c.ultimo + 1
  returning c.ultimo into v_n;

  return public.formatear_consecutivo(v_formato, p_serie, v_anio, v_n);
end;
$$;

revoke execute on function public.siguiente_consecutivo(text, date) from public, anon;
grant execute on function public.siguiente_consecutivo(text, date) to authenticated;

-- 4. RLS y privilegios --------------------------------------------------------------------------------------

alter table public.series_consecutivo enable row level security;
alter table public.consecutivos enable row level security;

-- series_consecutivo: la lee cualquier miembro (para previsualizar "Próximo número") y la escriben
-- owner/admin (es configuración).
drop policy if exists series_consecutivo_select on public.series_consecutivo;
create policy series_consecutivo_select on public.series_consecutivo
  for select to authenticated
  using (tenant_id = (select public.tenant_actual()));

drop policy if exists series_consecutivo_insert on public.series_consecutivo;
create policy series_consecutivo_insert on public.series_consecutivo
  for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.rol_en_tenant()) in ('owner', 'admin'));

drop policy if exists series_consecutivo_update on public.series_consecutivo;
create policy series_consecutivo_update on public.series_consecutivo
  for update to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.rol_en_tenant()) in ('owner', 'admin'))
  with check (tenant_id = (select public.tenant_actual())
              and (select public.rol_en_tenant()) in ('owner', 'admin'));

drop policy if exists series_consecutivo_delete on public.series_consecutivo;
create policy series_consecutivo_delete on public.series_consecutivo
  for delete to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.rol_en_tenant()) in ('owner', 'admin'));

revoke all on table public.series_consecutivo from public, anon, authenticated;
grant select, insert, delete on table public.series_consecutivo to authenticated;
-- UPDATE por columnas: la clave (`tenant_id`, `serie`) no cambia nunca (la referencian los contadores).
-- Ojo: cambiar `reinicia_anual` con contadores ya creados no los migra; se cambia antes de usar la serie.
grant update (descripcion, formato, reinicia_anual, activo) on table public.series_consecutivo to authenticated;
grant all on table public.series_consecutivo to service_role;

-- consecutivos: los miembros del tenant solo LEEN (p. ej. para mostrar el último número). Sin política de
-- escritura y con los privilegios revocados: el único camino de escritura es `siguiente_consecutivo()`
-- (SECURITY DEFINER, corre como dueño de la tabla). Ni siquiera `service_role` escribe: un contador se
-- corrige a mano desde el SQL editor (rol `postgres`), con la intención explícita que eso exige.
drop policy if exists consecutivos_select on public.consecutivos;
create policy consecutivos_select on public.consecutivos
  for select to authenticated
  using (tenant_id = (select public.tenant_actual()));

revoke all on table public.consecutivos from public, anon, authenticated;
grant select on table public.consecutivos to authenticated;
revoke all on table public.consecutivos from service_role;
grant select on table public.consecutivos to service_role;

-- 5. Auditoría ------------------------------------------------------------------------------------------------
-- Solo la configuración de las series; `consecutivos` cambia en cada documento y sería ruido.

select audit.activar('public.series_consecutivo');
