-- Panel operativo de gerencia de café (FIN-115 · CO-34, HU-F1-14): las cifras del día, de la semana, del mes o de un rango,
-- por línea de negocio, en una sola llamada. NO hay tablas nuevas: todo se deriva de lotes, procesos, ventas, bultos e
-- inventario (nada de totales guardados).
--
--  1. `cafe.kpis_periodo(p_desde, p_hasta, p_linea)` → jsonb con TODAS las tarjetas: café recibido por línea, merma
--     ponderada por tipo de proceso, procesos con desvío, ingreso de marca propia (ventas), ingreso de servicios (procesos
--     de lotes de servicio), inventario propio, inventario de terceros e insumos bajo mínimo.
--  2. `cafe.produccion_diaria(p_desde, p_hasta, p_linea)` → una fila por día, línea y tipo de proceso (kg, merma, valor):
--     alimenta los gráficos y el resumen por rango (c3). `cafe.ventas_diarias(...)` → ventas de marca propia por día
--     (la serie «marca propia» del gráfico de ingreso: sale de ventas, no de procesos).
--  3. Utilidades: `cafe.hoy_local()` (la fecha de hoy en la zona del cliente, no en UTC), `cafe.linea_panel()` (a qué línea
--     del panel pertenece un lote) y `cafe.rango_panel()` (valida y completa el rango).
--
-- LÍNEAS DEL PANEL (partición: un lote cae en exactamente una; nunca se mezcla propio con terceros):
--   marca_propia → lotes `linea = 'marca_propia'`
--   trilla       → lotes de servicio cuyo ÚNICO servicio es la trilla
--   maquila      → lotes de servicio con tostión (molienda y empaque exigen tostión, así que «con tostión» = «con algo más
--                  que trilla»). Un lote «Trilla + maquila» cuenta como maquila.
--   Difiere del filtro `tipo=trilla` del listado de lotes (CO-29), donde «Trilla + maquila» sale en trilla y en maquila:
--   en un panel con totales eso contaría dos veces. El Excel de CO-35 acepta `tipo=solo_trilla` (lo añade esta tarea).
--
-- Funciones STABLE y SECURITY INVOKER: el RLS de lotes (`cafe.recepcion`), procesos (`cafe.procesos`), ventas
-- (`cafe.ventas`) e inventario aísla por cliente y por módulo. Además exigen miembro del cliente y el módulo
-- `cafe.dashboard` (si no, 42501 → `no_autorizado`): el panel no sirve cifras a quien no lo tiene.
--
-- Solo crea funciones nuevas: segura en bases con datos y compatible hacia atrás (expand).

-- 1. Utilidades ---------------------------------------------------------------------------------------------------------------

-- La fecha de hoy en la zona horaria del cliente (`tenants.zona_horaria`): a las 20:00 del 31/12 en Bogotá ya es 01/01 en
-- UTC, y «hoy» para Cofradía sigue siendo el 31/12. Sin cliente (o zona vacía) cae a America/Bogota.
create or replace function cafe.hoy_local()
returns date
language sql
stable
security invoker
set search_path = ''
as $$
  select (now() at time zone coalesce(
            (select nullif(t.zona_horaria, '') from public.tenants t where t.id = public.tenant_actual()),
            'America/Bogota'))::date
$$;

-- Línea del panel de un lote (ver la cabecera). Pura: misma regla que `lineaPanel()` de TypeScript.
create or replace function cafe.linea_panel(p_linea cafe.linea_lote, p_servicios cafe.tipo_proceso[])
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_linea = 'marca_propia'                              then 'marca_propia'
    when 'tostion'::cafe.tipo_proceso = any(p_servicios)       then 'maquila'
    else 'trilla'
  end
$$;

-- Permisos, línea válida y rango del periodo. `p_desde` nulo = hoy (zona del cliente); `p_hasta` nulo = `p_desde`.
-- Un rango invertido o de más de dos años se rechaza (`datos_invalidos`) en vez de recorrer media base de datos.
create or replace function cafe.rango_panel(p_desde date, p_hasta date, p_linea text, out o_desde date, out o_hasta date)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not coalesce((select public.rol_en_tenant()) is not null, false)
     or not coalesce((select public.tenant_tiene_modulo('cafe.dashboard')), false) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;
  if p_linea is not null and p_linea not in ('marca_propia', 'trilla', 'maquila') then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'La línea debe ser marca_propia, trilla o maquila.';
  end if;
  o_desde := coalesce(p_desde, cafe.hoy_local());
  o_hasta := coalesce(p_hasta, o_desde);
  if o_desde > o_hasta then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La fecha inicial es posterior a la final.';
  end if;
  if o_hasta - o_desde > 731 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El rango máximo es de dos años.';
  end if;
end;
$$;

-- 2. kpis_periodo -------------------------------------------------------------------------------------------------------------
-- Salida (jsonb). `null` en una sección = «no aplica con la línea elegida» (no es cero):
--   desde, hasta, hoy, linea
--   recibido[]            {linea, kg, lotes}  una por línea (la elegida, o las tres): Σ peso_recibido_kg de lotes NO
--                         anulados con fecha_recepcion en el periodo
--   mermas[]              {tipo, procesos, kg_entrada, kg_salida, merma_kg, merma_pct, desvios}  siempre los 4 tipos, en
--                         orden de proceso: merma PONDERADA Σ merma_kg / Σ peso_entrada_kg de los procesos no anulados
--                         del periodo (nunca un promedio de porcentajes); `merma_pct` es null sin procesos
--   desvios               procesos con `desvio = true` en el periodo
--   ingreso_marca_propia  {total, ventas, cortesias, unidades_cortesia}: Σ total de ventas (tipo venta, no anuladas) del
--                         periodo; las cortesías NO suman y se cuentan aparte en unidades. Null con trilla o maquila.
--   ingreso_servicios     {total, por_linea[{linea, valor}]}: Σ procesos.valor (congelado con la tarifa de su fecha) de los
--                         procesos de lotes de servicio. Null con marca propia.
--   inventario_propio     {cafe_en_planta_kg, lotes_en_planta, producto_terminado_kg}: foto de AHORA (no depende del periodo).
--                         Café de marca propia que aún no se empacó (kg de bultos cuyo último paso no es el empaque, más el
--                         reabierto pendiente) y kg que equivale el producto terminado en existencia. Null con servicios.
--   inventario_terceros   {kg_en_planta, lotes, clientes, por_cliente[{tercero_id, nombre, kg, lotes}] (top 5)}: foto de
--                         AHORA. kg de café de clientes en planta (lotes de servicio sin remisión de entrega vigente).
--                         Null con marca propia.
--   insumos_bajo_minimo   cuántos insumos activos están bajo su mínimo (no depende de la línea ni del periodo)
create or replace function cafe.kpis_periodo(p_desde date default null, p_hasta date default null, p_linea text default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_desde     date;
  v_hasta     date;
  v_recibido  jsonb;
  v_mermas    jsonb;
  v_desvios   bigint;
  v_marca     jsonb;
  v_servicios jsonb;
  v_propio    jsonb;
  v_terceros  jsonb;
  v_insumos   bigint;
begin
  select r.o_desde, r.o_hasta into v_desde, v_hasta from cafe.rango_panel(p_desde, p_hasta, p_linea) r;

  -- Café recibido por línea.
  select jsonb_agg(jsonb_build_object('linea', x.linea, 'kg', coalesce(s.kg, 0), 'lotes', coalesce(s.n, 0)) order by x.orden)
    into v_recibido
    from (values ('marca_propia', 1), ('trilla', 2), ('maquila', 3)) as x(linea, orden)
    left join (
      select cafe.linea_panel(l.linea, l.servicios) as linea, sum(l.peso_recibido_kg) as kg, count(*) as n
        from cafe.lotes l
       where l.anulado_at is null and l.fecha_recepcion between v_desde and v_hasta
       group by 1
    ) s on s.linea = x.linea
   where p_linea is null or x.linea = p_linea;

  -- Merma ponderada y desvíos por tipo de proceso (los 4 tipos, aunque no tengan procesos).
  select jsonb_agg(jsonb_build_object(
           'tipo', t.tipo, 'procesos', coalesce(s.n, 0), 'kg_entrada', coalesce(s.entrada, 0), 'kg_salida', coalesce(s.salida, 0),
           'merma_kg', coalesce(s.merma, 0), 'merma_pct', s.pct, 'desvios', coalesce(s.desvios, 0))
         order by cafe.orden_proceso(t.tipo)),
         coalesce(sum(s.desvios), 0)
    into v_mermas, v_desvios
    from unnest(enum_range(null::cafe.tipo_proceso)) as t(tipo)
    left join (
      select p.tipo,
             count(*)                                                                as n,
             sum(p.peso_entrada_kg)                                                  as entrada,
             sum(p.peso_salida_kg)                                                   as salida,
             sum(p.merma_kg)                                                         as merma,
             round(sum(p.merma_kg) / nullif(sum(p.peso_entrada_kg), 0) * 100, 3)     as pct,
             count(*) filter (where p.desvio)                                        as desvios
        from cafe.procesos p
        join cafe.lotes l on l.tenant_id = p.tenant_id and l.id = p.lote_id
       where p.anulado_at is null and p.fecha between v_desde and v_hasta
         and (p_linea is null or cafe.linea_panel(l.linea, l.servicios) = p_linea)
       group by p.tipo
    ) s on s.tipo = t.tipo;

  -- Ingreso de marca propia: ventas vigentes; las cortesías valen 0 y se cuentan aparte.
  if p_linea is null or p_linea = 'marca_propia' then
    select jsonb_build_object(
             'total',             coalesce(sum(v.total) filter (where v.tipo = 'venta'), 0),
             'ventas',            count(*) filter (where v.tipo = 'venta'),
             'cortesias',         count(*) filter (where v.tipo = 'cortesia'),
             'unidades_cortesia', coalesce(sum(v.unidades) filter (where v.tipo = 'cortesia'), 0))
      into v_marca
      from cafe.v_ventas v
     where v.anulada_at is null and v.fecha between v_desde and v_hasta;
  end if;

  -- Ingreso de servicios: el valor congelado de cada proceso de un lote de servicio.
  if p_linea is null or p_linea in ('trilla', 'maquila') then
    with s as (
      select cafe.linea_panel(l.linea, l.servicios) as linea, sum(p.valor) as valor
        from cafe.procesos p
        join cafe.lotes l on l.tenant_id = p.tenant_id and l.id = p.lote_id
       where l.linea = 'servicio' and p.anulado_at is null and p.fecha between v_desde and v_hasta
         and (p_linea is null or cafe.linea_panel(l.linea, l.servicios) = p_linea)
       group by 1
    )
    select jsonb_build_object(
             'total', coalesce((select sum(s.valor) from s), 0),
             'por_linea', (select jsonb_agg(jsonb_build_object('linea', x.linea, 'valor', coalesce(s.valor, 0)) order by x.orden)
                             from (values ('trilla', 1), ('maquila', 2)) as x(linea, orden)
                             left join s on s.linea = x.linea
                            where p_linea is null or x.linea = p_linea))
      into v_servicios;
  end if;

  -- Inventario propio (foto de ahora): café de marca propia sin empacar + equivalente en kg del producto terminado.
  if p_linea is null or p_linea = 'marca_propia' then
    select jsonb_build_object(
             'cafe_en_planta_kg', round(coalesce(b.kg, 0) + coalesce(r.kg, 0), 3),
             'lotes_en_planta',   coalesce(b.n, 0),
             'producto_terminado_kg', round(coalesce(pt.kg, 0), 3))
      into v_propio
      from (select 1) d
      left join lateral (
        select sum(be.peso_actual_exacto_kg) as kg, count(distinct l.id) as n
          from cafe.lotes l
          join cafe.v_bultos_estado be on be.tenant_id = l.tenant_id and be.lote_id = l.id
         where l.linea = 'marca_propia' and l.anulado_at is null and be.ultimo_tipo is distinct from 'empaque'
      ) b on true
      left join lateral (
        select sum(rp.peso_disponible_kg) as kg from cafe.v_reaperturas rp where rp.estado <> 'completada'
      ) r on true
      left join lateral (
        select sum(greatest(s.stock, 0) * (s.atributos ->> 'presentacion_g')::numeric / 1000) as kg
          from public.v_stock s
         where s.tipo = 'producto_terminado' and jsonb_typeof(s.atributos -> 'presentacion_g') = 'number'
      ) pt on true;
  end if;

  -- Inventario de terceros (foto de ahora): lotes de servicio sin remisión de entrega vigente, por cliente.
  if p_linea is null or p_linea in ('trilla', 'maquila') then
    with por_lote as (
      select l.tercero_id, l.id as lote_id, pl.kg
        from cafe.lotes l
        cross join lateral (
          select sum(be.peso_actual_exacto_kg) as kg from cafe.v_bultos_estado be where be.tenant_id = l.tenant_id and be.lote_id = l.id
        ) pl
       where l.linea = 'servicio' and l.anulado_at is null and coalesce(pl.kg, 0) > 0
         and (p_linea is null or cafe.linea_panel(l.linea, l.servicios) = p_linea)
         and not exists (select 1 from cafe.remisiones rm where rm.tenant_id = l.tenant_id and rm.lote_id = l.id and rm.anulada_at is null)
    ), por_cliente as (
      select pl.tercero_id, te.nombre, sum(pl.kg) as kg, count(*) as lotes
        from por_lote pl
        left join public.terceros te on te.id = pl.tercero_id
       group by pl.tercero_id, te.nombre
    )
    select jsonb_build_object(
             'kg_en_planta', round(coalesce((select sum(c.kg) from por_cliente c), 0), 3),
             'lotes',        coalesce((select sum(c.lotes) from por_cliente c), 0),
             'clientes',     (select count(*) from por_cliente),
             'por_cliente',  coalesce((select jsonb_agg(jsonb_build_object('tercero_id', c.tercero_id, 'nombre', c.nombre,
                                                                          'kg', round(c.kg, 3), 'lotes', c.lotes)
                                                        order by c.kg desc, c.nombre)
                                         from (select * from por_cliente order by kg desc, nombre limit 5) c), '[]'::jsonb))
      into v_terceros;
  end if;

  select count(*) into v_insumos
    from public.v_stock s
   where s.tipo = 'insumo' and s.activo and s.bajo_minimo;

  return jsonb_build_object(
    'desde', v_desde, 'hasta', v_hasta, 'hoy', cafe.hoy_local(), 'linea', p_linea,
    'recibido', coalesce(v_recibido, '[]'::jsonb),
    'mermas', coalesce(v_mermas, '[]'::jsonb),
    'desvios', v_desvios,
    'ingreso_marca_propia', v_marca,
    'ingreso_servicios', v_servicios,
    'inventario_propio', v_propio,
    'inventario_terceros', v_terceros,
    'insumos_bajo_minimo', v_insumos);
end;
$$;

-- 3. Series diarias -----------------------------------------------------------------------------------------------------------
-- Una fila por día, línea del panel y tipo de proceso con al menos un proceso no anulado ese día. `merma_pct` es la
-- ponderada del grupo (3 decimales, como la columna de la tabla); `valor` es Σ procesos.valor (0 en marca propia, que no
-- se cobra). Es la fuente de los gráficos y del resumen por rango: sumar sus filas da lo mismo que `kpis_periodo`.
create or replace function cafe.produccion_diaria(p_desde date default null, p_hasta date default null, p_linea text default null)
returns table (fecha date, linea text, tipo cafe.tipo_proceso, kg_entrada numeric, kg_salida numeric, merma_pct numeric, valor numeric)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_desde date;
  v_hasta date;
begin
  select r.o_desde, r.o_hasta into v_desde, v_hasta from cafe.rango_panel(p_desde, p_hasta, p_linea) r;

  return query
  select p.fecha,
         cafe.linea_panel(l.linea, l.servicios),
         p.tipo,
         sum(p.peso_entrada_kg)::numeric,
         sum(p.peso_salida_kg)::numeric,
         round(sum(p.merma_kg) / nullif(sum(p.peso_entrada_kg), 0) * 100, 3),
         sum(p.valor)::numeric
    from cafe.procesos p
    join cafe.lotes l on l.tenant_id = p.tenant_id and l.id = p.lote_id
   where p.anulado_at is null and p.fecha between v_desde and v_hasta
     and (p_linea is null or cafe.linea_panel(l.linea, l.servicios) = p_linea)
   group by p.fecha, cafe.linea_panel(l.linea, l.servicios), p.tipo
   order by p.fecha, cafe.linea_panel(l.linea, l.servicios), cafe.orden_proceso(p.tipo);
end;
$$;

-- Ventas de marca propia por día (vigentes; la cortesía no suma al total y se cuenta en unidades). Sin filas con trilla o
-- maquila: las ventas son solo de marca propia.
create or replace function cafe.ventas_diarias(p_desde date default null, p_hasta date default null, p_linea text default null)
returns table (fecha date, total numeric, n_ventas bigint, unidades_cortesia numeric)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_desde date;
  v_hasta date;
begin
  select r.o_desde, r.o_hasta into v_desde, v_hasta from cafe.rango_panel(p_desde, p_hasta, p_linea) r;
  if p_linea in ('trilla', 'maquila') then
    return;
  end if;

  return query
  select v.fecha,
         coalesce(sum(v.total) filter (where v.tipo = 'venta'), 0)::numeric,
         count(*) filter (where v.tipo = 'venta'),
         coalesce(sum(v.unidades) filter (where v.tipo = 'cortesia'), 0)::numeric
    from cafe.v_ventas v
   where v.anulada_at is null and v.fecha between v_desde and v_hasta
   group by v.fecha
   order by v.fecha;
end;
$$;

-- 4. Privilegios --------------------------------------------------------------------------------------------------------------
-- Postgres da EXECUTE a PUBLIC al crear una función: se quita y se concede a quien corresponde. Las funciones son
-- SECURITY INVOKER y comprueban rol y módulo ellas mismas; `anon` no ejecuta nada.

revoke all on function cafe.hoy_local() from public, anon;
revoke all on function cafe.linea_panel(cafe.linea_lote, cafe.tipo_proceso[]) from public, anon;
revoke all on function cafe.rango_panel(date, date, text) from public, anon;
revoke all on function cafe.kpis_periodo(date, date, text) from public, anon;
revoke all on function cafe.produccion_diaria(date, date, text) from public, anon;
revoke all on function cafe.ventas_diarias(date, date, text) from public, anon;

grant execute on function cafe.hoy_local() to authenticated, service_role;
grant execute on function cafe.linea_panel(cafe.linea_lote, cafe.tipo_proceso[]) to authenticated, service_role;
grant execute on function cafe.rango_panel(date, date, text) to authenticated;
grant execute on function cafe.kpis_periodo(date, date, text) to authenticated;
grant execute on function cafe.produccion_diaria(date, date, text) to authenticated;
grant execute on function cafe.ventas_diarias(date, date, text) to authenticated;
