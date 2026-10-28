-- Núcleo: inventario tipo kardex (FIN-96 · CO-16).
--
--  1. Tipos `tipo_articulo` y `motivo_movimiento`.
--  2. `articulos` (catálogo; el stock NO es una columna) y `movimientos_inventario` (log append-only).
--  3. Vistas `v_stock` (stock derivado + alerta de mínimo) y `v_kardex` (saldo acumulado por artículo).
--  4. RPC `registrar_movimientos()`: la ÚNICA vía de escritura de movimientos desde la app.
--  5. RLS y privilegios (plantilla de FIN-90: membresías, no `roles`).
--  6. Auditoría de `articulos` (los movimientos ya son un log).
--
-- Principio: el stock es SIEMPRE la suma de movimientos; nadie edita un número de stock. Corregir un
-- error = otro movimiento `ajuste` con observación obligatoria. Por eso `movimientos_inventario` no
-- tiene UPDATE ni DELETE para nadie (ni siquiera `service_role`).
--
-- Solo crea objetos nuevos (no toca filas ni tablas existentes): segura en bases con datos.
-- `pajillas.cantidad_disponible` (ganadería) NO se migra aquí.

-- 1. Tipos ----------------------------------------------------------------------------------------

create type public.tipo_articulo as enum ('insumo', 'producto_terminado', 'materia_prima', 'otro');

create type public.motivo_movimiento as enum (
  'saldo_inicial', 'compra', 'produccion', 'consumo', 'venta', 'cortesia',
  'muestra', 'perdida', 'ajuste', 'devolucion', 'reapertura'
);

-- Coherencia signo/motivo, en un solo sitio: la usan el CHECK de la tabla y la RPC (para dar un
-- mensaje claro antes de que salte el CHECK). Entradas: cantidad > 0; salidas: cantidad < 0;
-- `ajuste` admite cualquier signo.
create or replace function public.movimiento_signo_valido(p_motivo public.motivo_movimiento, p_cantidad numeric)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when p_motivo in ('saldo_inicial', 'compra', 'produccion', 'devolucion') then p_cantidad > 0
    when p_motivo in ('consumo', 'venta', 'cortesia', 'muestra', 'perdida', 'reapertura') then p_cantidad < 0
    else true -- 'ajuste'
  end
$$;

revoke all on function public.movimiento_signo_valido(public.motivo_movimiento, numeric) from public, anon;
grant execute on function public.movimiento_signo_valido(public.motivo_movimiento, numeric) to authenticated, service_role;

-- 2. Tablas ---------------------------------------------------------------------------------------

create table public.articulos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default public.tenant_actual() references public.tenants,
  codigo      text check (codigo is null or btrim(codigo) <> ''),       -- opcional, único por tenant si existe
  nombre      text not null check (btrim(nombre) <> ''),
  tipo        public.tipo_articulo not null,
  unidad      text not null default 'unidad' check (unidad in ('unidad', 'kg', 'g', 'litro')),
  atributos   jsonb not null default '{}' check (jsonb_typeof(atributos) = 'object'), -- {"clase":"bolsa","presentacion_g":500}
  stock_minimo numeric(14,3) check (stock_minimo >= 0),                  -- NULL = sin mínimo (no alerta)
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  updated_at  timestamptz,
  updated_by  uuid,
  -- Existe para la FK compuesta de los movimientos: un movimiento no puede apuntar a un artículo de otro cliente.
  unique (tenant_id, id)
);

create unique index articulos_codigo_uk on public.articulos (tenant_id, codigo) where codigo is not null;

-- Evita dos "Excelso 500 g" en un mismo cliente. Solo cuenta cuando hay atributos: sin ellos (`{}`)
-- el índice dejaría un único artículo por tipo y cliente, que no es el propósito.
create unique index articulos_atributos_uk on public.articulos (tenant_id, tipo, atributos)
  where atributos <> '{}'::jsonb;

create trigger set_updated before update on public.articulos
  for each row execute function public.set_updated();

create table public.movimientos_inventario (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default public.tenant_actual() references public.tenants,
  articulo_id    uuid not null,
  fecha          timestamptz not null default now(),
  cantidad       numeric(14,3) not null check (cantidad <> 0),            -- + entrada, − salida
  motivo         public.motivo_movimiento not null,
  costo_unitario numeric(14,2) check (costo_unitario is null or costo_unitario >= 0),
  ref_tipo       text,                                                    -- 'cafe.lote', 'cafe.venta', 'cafe.proceso'
  ref_id         uuid,
  observaciones  text,
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid(),
  -- Orden de inserción: desempata movimientos con la misma `fecha` y `created_at` (los de una misma
  -- llamada a la RPC comparten ambos), para que el saldo del kardex sea determinista.
  seq            bigint generated always as identity,
  -- Mismo cliente que el artículo, garantizado por la base. `on delete restrict`: un artículo con
  -- movimientos no se borra (y de todos modos nadie tiene DELETE sobre `articulos`).
  constraint movimientos_articulo_fk foreign key (tenant_id, articulo_id)
    references public.articulos (tenant_id, id) on delete restrict,
  constraint movimientos_signo_motivo_check check (public.movimiento_signo_valido(motivo, cantidad)),
  -- Corregir un error = un `ajuste` explicado.
  constraint movimientos_ajuste_observacion_check
    check (motivo <> 'ajuste' or nullif(btrim(observaciones), '') is not null)
);

create index on public.movimientos_inventario (tenant_id, articulo_id, fecha);
create index on public.movimientos_inventario (ref_tipo, ref_id);

-- 3. Vistas ----------------------------------------------------------------------------------------
-- `security_invoker = true`: se leen con el RLS del usuario (sin ella, la vista correría como su
-- dueño y mostraría artículos de todos los clientes).

create view public.v_stock with (security_invoker = true) as
select
  a.id as articulo_id,
  a.tenant_id,
  a.nombre,
  a.tipo,
  a.atributos,
  coalesce(sum(m.cantidad), 0)::numeric(14,3) as stock,
  a.stock_minimo,
  (a.stock_minimo is not null and coalesce(sum(m.cantidad), 0) < a.stock_minimo) as bajo_minimo,
  a.unidad,
  a.activo,
  a.codigo
from public.articulos a
left join public.movimientos_inventario m
       on m.tenant_id = a.tenant_id and m.articulo_id = a.id
group by a.id;

-- El saldo se calcula sobre TODOS los movimientos del artículo, no sobre el rango que luego filtre la
-- consulta (los filtros por `fecha` se aplican después de la ventana).
create view public.v_kardex with (security_invoker = true) as
select
  m.id,
  m.tenant_id,
  m.articulo_id,
  a.nombre as articulo_nombre,
  m.fecha,
  m.motivo,
  m.cantidad,
  sum(m.cantidad) over (
    partition by m.articulo_id
    order by m.fecha, m.created_at, m.seq
    rows between unbounded preceding and current row
  )::numeric(14,3) as saldo,
  m.costo_unitario,
  m.ref_tipo,
  m.ref_id,
  m.observaciones,
  m.created_at,
  m.created_by,
  m.seq
from public.movimientos_inventario m
join public.articulos a on a.tenant_id = m.tenant_id and a.id = m.articulo_id;

-- 4. RPC ---------------------------------------------------------------------------------------------
-- Única vía de escritura de movimientos: varios movimientos en UNA transacción (empacar =
-- −bolsa −etiqueta +producto terminado) y comprobación de stock.
--
-- p_movs: [{ articulo_id, cantidad, motivo, fecha?, costo_unitario?, ref_tipo?, ref_id?, observaciones? }]
-- Una salida que deja el stock de un artículo por debajo de cero:
--   · p_permitir_negativo = false → falla con `stock_insuficiente` (no queda nada escrito);
--   · p_permitir_negativo = true  → se registra y se devuelve en `advertencias` (caso venta).
-- "Salida" = el neto de la llamada para ese artículo es negativo: un artículo que ya estaba en
-- negativo no bloquea una entrada que lo deja igual o mejor.
--
-- Concurrencia: se serializa por artículo con un advisory lock transaccional (en orden de id, para
-- no provocar interbloqueos) en vez de `select … for update`. Con `FOR UPDATE` el RLS exige además
-- la política de UPDATE de `articulos` (solo owner/admin), y un `operativo`, que sí registra
-- movimientos, no vería filas que bloquear. Funciona porque toda escritura de movimientos pasa por
-- esta función.
--
-- SECURITY INVOKER: el RLS de `movimientos_inventario` decide quién escribe (owner/admin/operativo);
-- un `viewer` falla con 42501 (`no_autorizado`).

create or replace function public.registrar_movimientos(
  p_movs              jsonb,
  p_permitir_negativo boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_permitir      boolean := coalesce(p_permitir_negativo, false);
  v_articulos     uuid[];
  v_articulo      uuid;
  v_elem          jsonb;
  v_ord           integer := 0;
  v_cantidad      numeric;
  v_motivo        public.motivo_movimiento;
  v_obs           text;
  v_id            uuid;
  v_ids           uuid[] := '{}';
  v_texto         text;
  v_fila          record;
  v_stocks        jsonb := '[]'::jsonb;
  v_advertencias  jsonb := '[]'::jsonb;
  v_faltantes     text[] := '{}';
begin
  -- 1) validación de forma, antes de escribir nada
  if p_movs is null or jsonb_typeof(p_movs) <> 'array' or jsonb_array_length(p_movs) not between 1 and 100 then
    raise exception using errcode = 'P0001', message = 'movimientos_invalidos',
      detail = 'Envía entre 1 y 100 movimientos.';
  end if;

  begin
    select array_agg(distinct (e ->> 'articulo_id')::uuid order by (e ->> 'articulo_id')::uuid)
             filter (where e ->> 'articulo_id' is not null)
      into v_articulos
      from jsonb_array_elements(p_movs) as e;
  exception when data_exception then
    raise exception using errcode = 'P0001', message = 'movimientos_invalidos',
      detail = 'Algún artículo no tiene un identificador válido.';
  end;

  if v_articulos is null then
    raise exception using errcode = 'P0001', message = 'movimientos_invalidos',
      detail = 'Indica el artículo de cada movimiento.';
  end if;

  -- 2) los artículos existen (RLS: solo los del cliente actual) y están activos
  select string_agg(x::text, ', ') into v_texto
    from unnest(v_articulos) as x
   where not exists (select 1 from public.articulos a where a.id = x);
  if v_texto is not null then
    raise exception using errcode = 'P0001', message = 'articulo_no_encontrado',
      detail = 'No existe el artículo ' || v_texto || '.';
  end if;

  select string_agg(a.nombre, ', ' order by a.nombre) into v_texto
    from public.articulos a
   where a.id = any (v_articulos) and not a.activo;
  if v_texto is not null then
    raise exception using errcode = 'P0001', message = 'articulo_inactivo',
      detail = 'El artículo está desactivado: ' || v_texto || '. Actívalo para registrar movimientos.';
  end if;

  -- 3) serializa los movimientos de estos artículos hasta el final de la transacción
  foreach v_articulo in array v_articulos loop
    perform pg_advisory_xact_lock(hashtextextended('inventario:' || v_articulo::text, 0));
  end loop;

  -- 4) escrituras (un error a mitad aborta toda la función: no queda ninguna)
  begin
    for v_elem in select e from jsonb_array_elements(p_movs) as e loop
      v_ord := v_ord + 1;
      v_articulo := (v_elem ->> 'articulo_id')::uuid;
      v_cantidad := (v_elem ->> 'cantidad')::numeric;
      v_motivo := (v_elem ->> 'motivo')::public.motivo_movimiento;
      v_obs := nullif(btrim(v_elem ->> 'observaciones'), '');

      if v_articulo is null or v_cantidad is null or v_motivo is null then
        raise exception using errcode = 'P0001', message = 'movimiento_invalido',
          detail = format('Movimiento %s: faltan el artículo, la cantidad o el motivo.', v_ord);
      end if;
      if v_cantidad = 0 then
        raise exception using errcode = 'P0001', message = 'movimiento_invalido',
          detail = format('Movimiento %s: la cantidad no puede ser cero.', v_ord);
      end if;
      if not public.movimiento_signo_valido(v_motivo, v_cantidad) then
        raise exception using errcode = 'P0001', message = 'movimiento_invalido',
          detail = format('Movimiento %s: el motivo "%s" no admite una cantidad %s.',
                          v_ord, v_motivo, case when v_cantidad > 0 then 'positiva' else 'negativa' end);
      end if;
      if v_motivo = 'ajuste' and v_obs is null then
        raise exception using errcode = 'P0001', message = 'movimiento_invalido',
          detail = format('Movimiento %s: un ajuste exige una observación que lo explique.', v_ord);
      end if;

      insert into public.movimientos_inventario
        (articulo_id, fecha, cantidad, motivo, costo_unitario, ref_tipo, ref_id, observaciones)
      values (
        v_articulo,
        coalesce((v_elem ->> 'fecha')::timestamptz, now()),
        v_cantidad,
        v_motivo,
        (v_elem ->> 'costo_unitario')::numeric,
        nullif(btrim(v_elem ->> 'ref_tipo'), ''),
        (v_elem ->> 'ref_id')::uuid,
        v_obs
      )
      returning id into v_id;

      v_ids := v_ids || v_id;
    end loop;
  exception when data_exception then
    raise exception using errcode = 'P0001', message = 'movimientos_invalidos',
      detail = format('Movimiento %s: algún valor (cantidad, motivo, fecha o identificador) no es válido.', v_ord);
  end;

  -- 5) stock resultante de cada artículo tocado y comprobación de negativos
  for v_fila in
    select d.articulo_id, d.delta, a.nombre, a.stock_minimo,
           (select coalesce(sum(m.cantidad), 0) from public.movimientos_inventario m
             where m.articulo_id = d.articulo_id) as stock
      from (select m.articulo_id, sum(m.cantidad) as delta
              from public.movimientos_inventario m
             where m.id = any (v_ids)
             group by m.articulo_id) d
      join public.articulos a on a.id = d.articulo_id
     order by d.articulo_id
  loop
    v_stocks := v_stocks || jsonb_build_object(
      'articulo_id', v_fila.articulo_id,
      'stock', v_fila.stock,
      'bajo_minimo', v_fila.stock_minimo is not null and v_fila.stock < v_fila.stock_minimo
    );
    if v_fila.stock < 0 and v_fila.delta < 0 then
      v_advertencias := v_advertencias || jsonb_build_object(
        'articulo_id', v_fila.articulo_id,
        'stock_resultante', v_fila.stock
      );
      v_faltantes := v_faltantes || format('%s (quedaría en %s)', v_fila.nombre, trim_scale(v_fila.stock)::text);
    end if;
  end loop;

  if cardinality(v_faltantes) > 0 and not v_permitir then
    raise exception using errcode = 'P0001', message = 'stock_insuficiente',
      detail = 'No hay existencias suficientes de: ' || array_to_string(v_faltantes, ', ') || '.';
  end if;

  return jsonb_build_object(
    'movimientos', to_jsonb(v_ids),
    'stocks', v_stocks,
    'advertencias', v_advertencias
  );
end $$;

revoke execute on function public.registrar_movimientos(jsonb, boolean) from public, anon;
grant execute on function public.registrar_movimientos(jsonb, boolean) to authenticated;

-- 5. RLS y privilegios -------------------------------------------------------------------------------

alter table public.articulos enable row level security;
alter table public.movimientos_inventario enable row level security;

-- articulos: lectura para cualquier miembro; escritura (alta y edición) solo owner/admin; nadie borra.
drop policy if exists articulos_select on public.articulos;
create policy articulos_select on public.articulos for select to authenticated
  using (tenant_id = (select public.tenant_actual()));

drop policy if exists articulos_insert on public.articulos;
create policy articulos_insert on public.articulos for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.rol_en_tenant()) in ('owner', 'admin'));

drop policy if exists articulos_update on public.articulos;
create policy articulos_update on public.articulos for update to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.rol_en_tenant()) in ('owner', 'admin'))
  with check (tenant_id = (select public.tenant_actual())
              and (select public.rol_en_tenant()) in ('owner', 'admin'));

-- Supabase concede ALL a `anon`, `authenticated` y `service_role` por defecto en tablas nuevas: se
-- quita a los tres (también a `service_role`, que se salta el RLS pero no los privilegios) y se da solo lo necesario.
revoke all on table public.articulos from public, anon, authenticated, service_role;
grant select, insert on table public.articulos to authenticated;
-- UPDATE por columnas: `tipo` y `unidad` no cambian una vez creado el artículo (los movimientos
-- existentes perderían su sentido); `tenant_id` y `created_*` nunca. Para "corregirlos" se crea otro
-- artículo y se desactiva el anterior.
grant update (codigo, nombre, atributos, stock_minimo, activo) on table public.articulos to authenticated;
grant select, insert, update on table public.articulos to service_role;

-- movimientos_inventario: lectura para cualquier miembro; INSERT para owner/admin/operativo (la RPC es
-- SECURITY INVOKER, así que el RLS tiene que dejarles insertar; la app NUNCA hace `.insert()` directo,
-- siempre `registrar_movimientos()`). Sin UPDATE ni DELETE para nadie: ni política ni privilegio.
drop policy if exists movimientos_inventario_select on public.movimientos_inventario;
create policy movimientos_inventario_select on public.movimientos_inventario for select to authenticated
  using (tenant_id = (select public.tenant_actual()));

drop policy if exists movimientos_inventario_insert on public.movimientos_inventario;
create policy movimientos_inventario_insert on public.movimientos_inventario for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'));

revoke all on table public.movimientos_inventario from public, anon, authenticated, service_role;
grant select, insert on table public.movimientos_inventario to authenticated;
grant select, insert on table public.movimientos_inventario to service_role;

-- Vistas: solo lectura, solo con sesión (el RLS de las tablas filtra por cliente).
revoke all on table public.v_stock from public, anon, authenticated, service_role;
revoke all on table public.v_kardex from public, anon, authenticated, service_role;
grant select on table public.v_stock to authenticated, service_role;
grant select on table public.v_kardex to authenticated, service_role;

-- 6. Auditoría --------------------------------------------------------------------------------------
-- Solo `articulos`: los movimientos ya son un log inmutable.

select audit.activar('public.articulos');
