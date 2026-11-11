-- B-14 (FIN-162) · Panel de gerencia orientado al dueño («Cómo va el negocio»). Dos lecturas nuevas; nada de tablas:
--
--  1. `cafe.produccion_panel(p_desde, p_hasta)` → una fila por tipo de proceso (trilla, tostión, molienda) y línea del panel
--     (marca propia / trilla / maquila) con los kg que ENTRAN a cada proceso en el periodo. Incluye las tandas de tostión que
--     aún no tienen salida (B-05): el volumen producido no depende de que el empaque cierre la tanda. La merma de tostión se
--     mide solo sobre las tandas con salida (`kg_entrada_medida` y `kg_salida`), como `kpis_periodo`. Sin empaque.
--  2. `cafe.ventas_por_presentacion(p_desde, p_hasta)` → por producto terminado vendido: unidades, libras (1 lb = 500 g) e
--     ingreso. Solo ventas (no cortesías) no anuladas. Alimenta «Libras vendidas por presentación», el margen bruto y el ritmo
--     de venta de «Para decidir hoy».
--
-- SECURITY INVOKER: exigen miembro y módulo `cafe.dashboard` (42501 si no) vía `cafe.rango_panel`; el RLS de procesos
-- (`cafe.procesos`) y de ventas (`cafe.ventas`) aísla por cliente y módulo. Solo crea funciones: segura en bases con datos.
-- Reversión: drop function cafe.produccion_panel(date, date), cafe.ventas_por_presentacion(date, date).

create or replace function cafe.produccion_panel(p_desde date default null, p_hasta date default null)
returns table (tipo cafe.tipo_proceso, linea text, procesos bigint, kg_entrada numeric, kg_entrada_medida numeric, kg_salida numeric)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_desde date;
  v_hasta date;
begin
  select r.o_desde, r.o_hasta into v_desde, v_hasta from cafe.rango_panel(p_desde, p_hasta, null) r;

  return query
  select p.tipo,
         cafe.linea_panel(l.linea, l.servicios),
         count(*),
         coalesce(sum(p.peso_entrada_kg), 0)::numeric,
         coalesce(sum(p.peso_entrada_kg) filter (where p.peso_salida_kg is not null), 0)::numeric,
         coalesce(sum(p.peso_salida_kg), 0)::numeric
    from cafe.procesos p
    join cafe.lotes l on l.tenant_id = p.tenant_id and l.id = p.lote_id
   where p.anulado_at is null and p.fecha between v_desde and v_hasta
     and p.tipo in ('trilla', 'tostion', 'molienda')
   group by p.tipo, cafe.linea_panel(l.linea, l.servicios)
   order by cafe.orden_proceso(p.tipo), 2;
end;
$$;

create or replace function cafe.ventas_por_presentacion(p_desde date default null, p_hasta date default null)
returns table (articulo_pt_id uuid, nombre text, tipo_cafe_id uuid, presentacion_g integer, unidades bigint, libras numeric, ingreso numeric)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_desde date;
  v_hasta date;
begin
  select r.o_desde, r.o_hasta into v_desde, v_hasta from cafe.rango_panel(p_desde, p_hasta, null) r;

  return query
  select a.id,
         a.nombre::text,
         (a.atributos ->> 'tipo_cafe_id')::uuid,
         (a.atributos ->> 'presentacion_g')::integer,
         sum(vl.cantidad)::bigint,
         round(sum(vl.cantidad * (a.atributos ->> 'presentacion_g')::numeric / 500.0), 3),
         sum(vl.subtotal)::numeric
    from cafe.venta_lineas vl
    join cafe.ventas v on v.tenant_id = vl.tenant_id and v.id = vl.venta_id
    join public.articulos a on a.tenant_id = vl.tenant_id and a.id = vl.articulo_pt_id
   where v.anulada_at is null and v.tipo = 'venta' and v.fecha between v_desde and v_hasta
     and a.tipo = 'producto_terminado'
     and jsonb_typeof(a.atributos -> 'presentacion_g') = 'number'
     and a.atributos ->> 'tipo_cafe_id' is not null
   group by a.id, a.nombre, a.atributos
   order by 5 desc, a.nombre;
end;
$$;

revoke all on function cafe.produccion_panel(date, date) from public, anon;
revoke all on function cafe.ventas_por_presentacion(date, date) from public, anon;
grant execute on function cafe.produccion_panel(date, date) to authenticated;
grant execute on function cafe.ventas_por_presentacion(date, date) to authenticated;
