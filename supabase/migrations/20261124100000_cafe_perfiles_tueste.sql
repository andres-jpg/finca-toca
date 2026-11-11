-- Perfiles de tueste por tipo de café, con vigencia (FIN-147 · B-18).
--
--  1. `cafe.perfil_tueste_tipo`: nivel de tueste + temperatura + tiempo por tipo de café (o `tipo_cafe_id` NULL =
--     perfil predeterminado de maquila), con «vigente desde». Cada cambio es una fila nueva: no se actualiza ni se
--     borra ninguna (el historial queda). El lote guarda su propio perfil al recibirse (snapshot, B-02): cambiar
--     el perfil después no altera lotes ya recibidos.
--  2. `cafe.perfil_tueste_vigente(tipo, fecha)`: la fila vigente a una fecha (maquila con `p_tipo = null`).
--  3. RLS: lectura de cualquier miembro; alta solo owner/admin; módulo `cafe.recepcion` en todo.
--  4. Auditoría y `platform.seed_vertical` (rama `cafe`): Excelso Medio 216 °C 17 min, Consumo Medio 222 °C 17 min
--     y maquila Medio 222 °C 17 min, vigentes desde 2000-01-01 (valen para cualquier fecha). También se dan a los
--     clientes de café que ya existan y no tengan ninguno. Son valores iniciales de plantilla, no datos de un cliente.
--
-- Solo crea objetos nuevos y redefine `platform.seed_vertical` (idempotente): segura en bases con datos.

-- 1. Tabla ---------------------------------------------------------------------------------------------------

create table cafe.perfil_tueste_tipo (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default public.tenant_actual() references public.tenants,
  tipo_cafe_id  uuid references cafe.tipos_cafe on delete cascade,        -- NULL = maquila (predeterminado de terceros)
  nivel         cafe.nivel_tueste not null,
  temp_c        numeric(5,1) not null check (temp_c > 0 and temp_c <= 400),
  tiempo_min    numeric(5,1) not null check (tiempo_min > 0 and tiempo_min <= 120),
  vigente_desde date not null check (vigente_desde between date '2000-01-01' and date '2100-12-31'),
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users,
  updated_at    timestamptz,
  updated_by    uuid references auth.users
);

-- Una versión por tipo (o por maquila) y fecha. Empieza por `tenant_id`: sirve a las consultas por cliente.
create unique index perfil_tueste_tipo_uk
  on cafe.perfil_tueste_tipo (tenant_id, coalesce(tipo_cafe_id, '00000000-0000-0000-0000-000000000000'::uuid), vigente_desde);
create index perfil_tueste_tipo_tipo_idx on cafe.perfil_tueste_tipo (tipo_cafe_id);

create trigger set_updated before update on cafe.perfil_tueste_tipo
  for each row execute function public.set_updated();

-- 2. RLS y privilegios ------------------------------------------------------------------------------------
-- El tipo de café, si lo hay, debe ser visible para quien escribe (su RLS lo limita al cliente actual): así no se
-- puede colgar un perfil de un tipo de otro cliente.

alter table cafe.perfil_tueste_tipo enable row level security;

create policy perfil_tueste_tipo_select on cafe.perfil_tueste_tipo for select to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.recepcion')));

create policy perfil_tueste_tipo_insert on cafe.perfil_tueste_tipo for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.recepcion'))
              and (select public.rol_en_tenant()) in ('owner', 'admin')
              and (tipo_cafe_id is null
                   or exists (select 1 from cafe.tipos_cafe t where t.id = tipo_cafe_id)));

-- Sin UPDATE ni DELETE para nadie: una corrección es una versión nueva con otra fecha.
revoke all on table cafe.perfil_tueste_tipo from public, anon, authenticated, service_role;
grant select, insert on table cafe.perfil_tueste_tipo to authenticated;
grant select, insert on table cafe.perfil_tueste_tipo to service_role;

-- 3. Perfil vigente ----------------------------------------------------------------------------------------------
-- 0 o 1 fila: la versión más reciente con `vigente_desde <= p_fecha`. Security invoker: el RLS limita al cliente
-- actual. `p_tipo = null` = maquila. Sin perfil para ese tipo no hay fallback: quien consume decide.

create or replace function cafe.perfil_tueste_vigente(p_tipo uuid, p_fecha date)
returns setof cafe.perfil_tueste_tipo
language sql
stable
security invoker
set search_path = ''
as $$
  select p.*
    from cafe.perfil_tueste_tipo p
   where p.tipo_cafe_id is not distinct from p_tipo
     and p.vigente_desde <= p_fecha
   order by p.vigente_desde desc
   limit 1
$$;

revoke execute on function cafe.perfil_tueste_vigente(uuid, date) from public, anon;
grant execute on function cafe.perfil_tueste_vigente(uuid, date) to authenticated;

-- 4. Auditoría -------------------------------------------------------------------------------------------------------

select audit.activar('cafe.perfil_tueste_tipo');

-- 5. Siembra -----------------------------------------------------------------------------------------------------------
-- Idempotente: no añade nada a un cliente que ya tenga perfiles. Excelso y Consumo se buscan por nombre; si el
-- cliente los renombró o no existen, esa fila no se crea (los tipos nuevos configuran el suyo en pantalla).

create or replace function cafe.sembrar_perfiles_tueste(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from cafe.perfil_tueste_tipo x where x.tenant_id = p_tenant) then
    return;
  end if;

  insert into cafe.perfil_tueste_tipo (tenant_id, tipo_cafe_id, nivel, temp_c, tiempo_min, vigente_desde)
  select p_tenant, tc.id, 'medio', v.temp_c, v.tiempo_min, date '2000-01-01'
    from (values ('excelso', 216, 17), ('consumo', 222, 17)) as v(tipo, temp_c, tiempo_min)
    join cafe.tipos_cafe tc on tc.tenant_id = p_tenant and lower(tc.nombre) = v.tipo;

  insert into cafe.perfil_tueste_tipo (tenant_id, tipo_cafe_id, nivel, temp_c, tiempo_min, vigente_desde)
  values (p_tenant, null, 'medio', 222, 17, date '2000-01-01');
end $$;

revoke all on function cafe.sembrar_perfiles_tueste(uuid) from public, anon, authenticated;

-- Misma función que en `20261107100000_cafe_ventas.sql`; solo añade la llamada de los perfiles al final de la rama `cafe`.
-- Conserva sus privilegios: `create or replace`.

create or replace function platform.seed_vertical(p_tenant uuid, p_vertical public.vertical)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform platform.exigir_operador();

  if not exists (select 1 from public.tenants t where t.id = p_tenant) then
    raise exception using errcode = 'P0001', message = 'tenant_no_encontrado',
      detail = 'El cliente indicado no existe.';
  end if;

  if p_vertical = 'ganaderia' then
    -- Catálogo mínimo de finanzas: el que el código da por hecho (subconcepto «Leche para crías» y un
    -- ingreso de leche) más los habituales. El precio del litro queda pendiente a propósito: sin él no se
    -- generan los apuntes automáticos de la leche, y lo fija el cliente.
    insert into public.conceptos_gasto (nombre, tenant_id)
    select c.nombre, p_tenant
      from (values ('Alimentación animal'), ('Operación y mantenimiento'), ('Sanidad')) as c(nombre)
    on conflict (tenant_id, nombre) do nothing;

    insert into public.subconceptos_gasto (concepto_id, nombre, tenant_id)
    select cg.id, s.nombre, p_tenant
      from (values
             ('Alimentación animal', 'Concentrado'),
             ('Alimentación animal', 'Leche para crías'),
             ('Alimentación animal', 'Sal mineralizada'),
             ('Operación y mantenimiento', 'Mano de obra'),
             ('Operación y mantenimiento', 'Combustible'),
             ('Sanidad', 'Medicamentos'),
             ('Sanidad', 'Vacunas')
           ) as s(concepto, nombre)
      join public.conceptos_gasto cg on cg.tenant_id = p_tenant and cg.nombre = s.concepto
    on conflict (concepto_id, nombre) do nothing;

    insert into public.conceptos_ingreso (nombre, tenant_id)
    values ('Ventas', p_tenant)
    on conflict (tenant_id, nombre) do nothing;

    insert into public.subconceptos_ingreso (concepto_id, nombre, tenant_id)
    select ci.id, s.nombre, p_tenant
      from (values ('Ventas', 'Venta de leche'), ('Ventas', 'Venta de animales')) as s(concepto, nombre)
      join public.conceptos_ingreso ci on ci.tenant_id = p_tenant and ci.nombre = s.concepto
    on conflict (concepto_id, nombre) do nothing;

  elsif p_vertical = 'cafe' then
    -- Tarifas (CO-14), vigentes desde el alta. Sin tarifa de empaque: no es un concepto cobrable.
    -- NOT EXISTS por concepto (no por `vigente_desde`): una segunda ejecución no añade otra versión.
    insert into public.tarifas (tenant_id, concepto, valor, unidad, vigente_desde, observaciones)
    select p_tenant, t.concepto, t.valor, 'kg', now(), 'Tarifa inicial del alta'
      from (values ('cafe.trilla', 1400), ('cafe.tostion', 2200), ('cafe.molienda', 1000)) as t(concepto, valor)
     where not exists (
             select 1 from public.tarifas x where x.tenant_id = p_tenant and x.concepto = t.concepto);

    -- Parámetros (CO-14). Humedad y densidad quedan SIN configurar (sin fila) hasta que el cliente dé los
    -- rangos; la tolerancia de merma tampoco se siembra: rige el valor por defecto del código.
    insert into public.parametros (tenant_id, clave, valor)
    values
      (p_tenant, 'cafe.capacidad_tostadora_kg',     to_jsonb(13.5::numeric)),
      (p_tenant, 'cafe.merma_referencia_trilla_pct', to_jsonb(19::numeric)),
      (p_tenant, 'cafe.merma_referencia_tostion_pct', to_jsonb(18::numeric)),
      (p_tenant, 'cafe.peso_bulto_kg',              to_jsonb(62.5::numeric))
    on conflict (tenant_id, clave) do nothing;

    -- Series de consecutivos (CO-15; `VT` = ventas y cortesías, CO-31).
    insert into public.series_consecutivo (tenant_id, serie, descripcion)
    values
      (p_tenant, 'MP',  'Lotes marca propia'),
      (p_tenant, 'MQ',  'Lotes de servicio (trilla/maquila)'),
      (p_tenant, 'REM', 'Remisiones de entrega'),
      (p_tenant, 'VT',  'Ventas y cortesías')
    on conflict (tenant_id, serie) do nothing;

    -- Consumidor final (CO-13): idempotente por sí misma; con `p_tenant` explícito no depende de la sesión.
    perform public.asegurar_consumidor_final(p_tenant);

    -- Insumos de empaque (CO-16), sin stock mínimo.
    insert into public.articulos (tenant_id, nombre, tipo, unidad, atributos)
    select p_tenant, a.nombre, 'insumo', 'unidad', a.atributos
      from (values
             ('Bolsa 500 g',      '{"clase":"bolsa","presentacion_g":500}'::jsonb),
             ('Bolsa 2.500 g',    '{"clase":"bolsa","presentacion_g":2500}'::jsonb),
             ('Etiqueta 500 g',   '{"clase":"etiqueta","presentacion_g":500}'::jsonb),
             ('Etiqueta 2.500 g', '{"clase":"etiqueta","presentacion_g":2500}'::jsonb)
           ) as a(nombre, atributos)
     where not exists (
             select 1 from public.articulos x where x.tenant_id = p_tenant and x.nombre = a.nombre);

    -- Tipos de café (CO-21): solo si el cliente no tiene ninguno, para no volver a sembrar «Consumo» si lo
    -- renombró o desactivó. Después, un producto terminado por tipo activo × bolsa activa (los triggers ya
    -- los habrían creado; la llamada explícita deja el resultado independiente del orden de los inserts).
    insert into cafe.tipos_cafe (tenant_id, nombre, orden)
    select p_tenant, t.nombre, t.orden
      from (values ('Consumo', 1), ('Excelso', 2)) as t(nombre, orden)
     where not exists (select 1 from cafe.tipos_cafe x where x.tenant_id = p_tenant);

    perform cafe.asegurar_productos_terminados(p_tenant);

    -- Lista de precios de venta (CO-31): Consumo 500 g y Excelso 500 g. NOT EXISTS por concepto: no pisa un precio
    -- que el cliente ya fijó ni añade otra versión en una segunda ejecución.
    insert into public.tarifas (tenant_id, concepto, valor, unidad, vigente_desde, observaciones)
    select p_tenant, cafe.concepto_precio(a.id), pr.valor, 'unidad', now(), 'Precio inicial del alta'
      from public.articulos a
      join cafe.tipos_cafe tc on tc.tenant_id = a.tenant_id and tc.id = (a.atributos ->> 'tipo_cafe_id')::uuid
      join (values ('consumo', 23000), ('excelso', 29000)) as pr(tipo, valor) on lower(tc.nombre) = pr.tipo
     where a.tenant_id = p_tenant
       and a.tipo = 'producto_terminado'
       and (a.atributos ->> 'presentacion_g') = '500'
       and not exists (
             select 1 from public.tarifas x where x.tenant_id = p_tenant and x.concepto = cafe.concepto_precio(a.id));

    -- Perfiles de tueste iniciales (B-18).
    perform cafe.sembrar_perfiles_tueste(p_tenant);

  end if;
  -- cooperativa: nada todavía (Fase 2).
end;
$$;

-- 6. Backfill ------------------------------------------------------------------------------------------------------------
-- Clientes de café que ya existían: reciben los perfiles iniciales si no tienen ninguno. Idempotente.

select cafe.sembrar_perfiles_tueste(t.id) from public.tenants t where t.vertical = 'cafe';
