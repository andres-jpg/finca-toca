-- Vertical café: tipos de café y productos terminados automáticos (FIN-102 · CO-21).
--
--  1. `cafe.tipos_cafe`: catálogo por cliente (Consumo, Excelso y los que se agreguen). Solo nombre y
--     activo/inactivo: sin costo ni presentación.
--  2. RLS y privilegios (plantilla de FIN-90: membresías) + exigencia del módulo `cafe.recepcion`.
--  3. `cafe.etiqueta_presentacion()` y `cafe.asegurar_productos_terminados()`: el producto terminado se
--     lleva por tipo de café × presentación, y la presentación la define el peso nominal de la bolsa
--     (`articulos.atributos.presentacion_g` de los insumos `clase = 'bolsa'`).
--  4. Triggers: un tipo nuevo/activado o una bolsa nueva generan los productos que faltan.
--  5. Auditoría.
--  6. `platform.seed_vertical`: la rama `cafe` siembra Consumo y Excelso y sus 4 productos terminados.
--  7. Backfill de los clientes de café que ya existan.
--
-- Solo crea objetos nuevos y redefine `platform.seed_vertical` (idempotente): segura en bases con datos.
-- Los productos creados son artículos de `public.articulos` (CO-16): su stock sale de los movimientos.

-- 1. Tabla ---------------------------------------------------------------------------------------------

create table cafe.tipos_cafe (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default public.tenant_actual() references public.tenants,
  nombre     text not null check (length(btrim(nombre)) > 1),
  activo     boolean not null default true,
  orden      smallint not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  updated_at timestamptz,
  updated_by uuid references auth.users
);

-- Un nombre por cliente sin distinguir mayúsculas («Excelso» = «excelso»). Empieza por `tenant_id`, así que
-- también sirve a las consultas por cliente.
create unique index tipos_cafe_nombre_uk on cafe.tipos_cafe (tenant_id, lower(nombre));

-- Guarda el nombre con espacios colapsados («  Excelso   Premium » → «Excelso Premium»): la unicidad se
-- comprueba sobre el valor ya normalizado.
create or replace function cafe.tipos_cafe_normalizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nombre := public.normalizar_nombre(new.nombre);
  return new;
end $$;

create trigger tipos_cafe_normalizar before insert or update on cafe.tipos_cafe
  for each row execute function cafe.tipos_cafe_normalizar();

create trigger set_updated before update on cafe.tipos_cafe
  for each row execute function public.set_updated();

-- 2. RLS y privilegios ------------------------------------------------------------------------------------
-- El módulo `cafe.recepcion` se exige en todas las políticas: un cliente sin él no ve ni escribe nada aunque
-- llame a la API. Lectura: cualquier miembro. Alta y edición (maestro): owner/admin. Nadie borra: se desactiva
-- (un tipo usado por lotes y productos no desaparece).

alter table cafe.tipos_cafe enable row level security;

create policy tipos_cafe_select on cafe.tipos_cafe for select to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.recepcion')));

create policy tipos_cafe_insert on cafe.tipos_cafe for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.recepcion'))
              and (select public.rol_en_tenant()) in ('owner', 'admin'));

create policy tipos_cafe_update on cafe.tipos_cafe for update to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.recepcion'))
         and (select public.rol_en_tenant()) in ('owner', 'admin'))
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.recepcion'))
              and (select public.rol_en_tenant()) in ('owner', 'admin'));

-- Los privilegios por defecto del schema `cafe` dan también DELETE: se quitan y se da solo lo necesario.
-- UPDATE por columnas: `tenant_id` y `created_*` no cambian nunca.
revoke all on table cafe.tipos_cafe from public, anon, authenticated, service_role;
grant select, insert on table cafe.tipos_cafe to authenticated;
grant update (nombre, activo, orden) on table cafe.tipos_cafe to authenticated;
grant select, insert, update on table cafe.tipos_cafe to service_role;

-- 3. Funciones -----------------------------------------------------------------------------------------------

-- «500 g», «2.500 g», «1.000 g»: separador de miles con punto. La misma salida que `etiquetaPresentacion()`
-- de TypeScript (los dos tests comparten casos). `,` en `to_char` es el separador de grupo independiente del
-- idioma; se cambia por punto a mano.
create or replace function cafe.etiqueta_presentacion(p_gramos numeric)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select replace(to_char(p_gramos, 'FM999,999,999,999'), ',', '.') || ' g'
$$;

-- Crea en `public.articulos` un producto terminado (`tipo = 'producto_terminado'`, unidad `unidad`) por cada
-- tipo de café ACTIVO × cada presentación de las bolsas ACTIVAS del cliente. Nombre: «<Tipo> <presentación>»
-- (p. ej. «Excelso 500 g»); `atributos = {"tipo_cafe_id": …, "presentacion_g": …}`. Devuelve cuántos creó.
--
-- Idempotente: `articulos_atributos_uk` (tenant, tipo, atributos) hace que repetirla no duplique nada. Nunca
-- borra ni desactiva: un tipo desactivado conserva sus artículos (y su stock). Dos bolsas con el mismo peso
-- (p. ej. de dos proveedores) dan una sola presentación.
--
-- SECURITY INVOKER: con sesión usa `tenant_actual()` y el RLS de `articulos` decide quién puede escribir
-- (owner/admin); pasar el id de otro cliente falla. El alta de clientes (`platform.seed_vertical`, que corre
-- sin sesión) pasa `p_tenant` y escribe como el dueño de la función.
create or replace function cafe.asegurar_productos_terminados(p_tenant uuid default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_tenant  uuid := coalesce(p_tenant, public.tenant_actual());
  v_creados integer;
begin
  if v_tenant is null then
    raise exception using errcode = 'P0001', message = 'tenant_no_encontrado',
      detail = 'No hay un cliente activo para crear los productos terminados.';
  end if;

  insert into public.articulos (tenant_id, nombre, tipo, unidad, atributos)
  select v_tenant,
         t.nombre || ' ' || cafe.etiqueta_presentacion(p.gramos),
         'producto_terminado',
         'unidad',
         jsonb_build_object('tipo_cafe_id', t.id, 'presentacion_g', p.gramos)
    from cafe.tipos_cafe t
   cross join (
          select distinct b.gramos
            from (select case when jsonb_typeof(a.atributos -> 'presentacion_g') = 'number'
                              then (a.atributos ->> 'presentacion_g')::numeric end as gramos
                    from public.articulos a
                   where a.tenant_id = v_tenant
                     and a.tipo = 'insumo'
                     and a.activo
                     and a.atributos ->> 'clase' = 'bolsa') b
           where b.gramos > 0) p
   where t.tenant_id = v_tenant
     and t.activo
  on conflict do nothing;

  get diagnostics v_creados = row_count;
  return v_creados;
end;
$$;

revoke all on function cafe.etiqueta_presentacion(numeric) from public, anon;
grant execute on function cafe.etiqueta_presentacion(numeric) to authenticated, service_role;
revoke all on function cafe.asegurar_productos_terminados(uuid) from public, anon;
grant execute on function cafe.asegurar_productos_terminados(uuid) to authenticated, service_role;

-- 4. Triggers -------------------------------------------------------------------------------------------------

-- Un tipo nuevo o reactivado crea sus productos; si cambia el nombre, los productos ya creados lo siguen
-- (su nombre se deriva del tipo). Desactivarlo no toca nada.
create or replace function cafe.tipos_cafe_sincronizar_productos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.nombre is distinct from old.nombre then
    update public.articulos a
       set nombre = new.nombre || ' ' || cafe.etiqueta_presentacion((a.atributos ->> 'presentacion_g')::numeric)
     where a.tenant_id = new.tenant_id
       and a.tipo = 'producto_terminado'
       and a.atributos ->> 'tipo_cafe_id' = new.id::text;
  end if;

  if new.activo then
    perform cafe.asegurar_productos_terminados(new.tenant_id);
  end if;
  return new;
end $$;

create trigger tipos_cafe_sincronizar_productos after insert or update of nombre, activo on cafe.tipos_cafe
  for each row execute function cafe.tipos_cafe_sincronizar_productos();

-- Una bolsa nueva (o reactivada) crea los productos de su presentación para cada tipo activo: una bolsa de
-- 1.000 g da «Consumo 1.000 g» y «Excelso 1.000 g». El trigger vive en `public.articulos` pero solo actúa si
-- el cliente es de café.
create or replace function cafe.bolsa_sincronizar_productos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.activo and exists (select 1 from public.tenants t where t.id = new.tenant_id and t.vertical = 'cafe') then
    perform cafe.asegurar_productos_terminados(new.tenant_id);
  end if;
  return new;
end $$;

create trigger articulos_bolsa_sincronizar_productos after insert or update of activo, atributos on public.articulos
  for each row
  when (new.tipo = 'insumo' and new.atributos ->> 'clase' = 'bolsa')
  execute function cafe.bolsa_sincronizar_productos();

-- Las funciones de los triggers no las ejecuta nadie a mano.
revoke all on function cafe.tipos_cafe_normalizar() from public, anon, authenticated;
revoke all on function cafe.tipos_cafe_sincronizar_productos() from public, anon, authenticated;
revoke all on function cafe.bolsa_sincronizar_productos() from public, anon, authenticated;

-- 5. Auditoría ----------------------------------------------------------------------------------------------------

select audit.activar('cafe.tipos_cafe');

-- 6. seed_vertical ---------------------------------------------------------------------------------------------------
-- Misma función que en `20261031110000_platform_alta_tenants.sql`; solo cambia el final de la rama `cafe`
-- (tipos de café y productos terminados, que antes eran un TODO). Conserva sus privilegios: `create or replace`.

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

    -- Series de consecutivos (CO-15).
    insert into public.series_consecutivo (tenant_id, serie, descripcion)
    values
      (p_tenant, 'MP',  'Lotes marca propia'),
      (p_tenant, 'MQ',  'Lotes de servicio (trilla/maquila)'),
      (p_tenant, 'REM', 'Remisiones de entrega')
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

  end if;
  -- cooperativa: nada todavía (Fase 2).
end;
$$;

-- 7. Backfill ----------------------------------------------------------------------------------------------------------
-- Clientes de café que ya existían (p. ej. «Cofradía (demo)» en staging): reciben Consumo y Excelso si no
-- tienen ningún tipo, y los productos terminados de cada tipo activo × bolsa activa. Idempotente. Corre como
-- dueño (sin sesión), con `tenant_id` explícito.

insert into cafe.tipos_cafe (tenant_id, nombre, orden)
select t.id, s.nombre, s.orden
  from public.tenants t
 cross join (values ('Consumo', 1), ('Excelso', 2)) as s(nombre, orden)
 where t.vertical = 'cafe'
   and not exists (select 1 from cafe.tipos_cafe x where x.tenant_id = t.id);

select cafe.asegurar_productos_terminados(t.id) from public.tenants t where t.vertical = 'cafe';
