-- Panel de gerencia · proveedores de marca propia (FIN-137 · A-19). Solo funciones nuevas (sin tablas ni columnas).
--
-- `cafe.proveedores_marca_propia(p_desde, p_hasta)` → jsonb: una fila por proveedor con los lotes de MARCA PROPIA no
-- anulados RECIBIDOS en el periodo (la cohorte es la recepción: un café comprado hoy aún no se ha tostado, y se mide por lo
-- que ya pasó por la tostadora):
--   { desde, hasta, proveedores: [{ tercero_id, nombre, lotes, kg, valor_compra, precio_kg, humedad_pct,
--                                    kg_tostion_entrada, kg_tostion_salida, merma_tostion_pct, costo_kg_tostado }] }
--   precio_kg          Σ valor_compra / Σ kg (promedio ponderado por kg; el precio de cada lote es su snapshot de compra)
--   humedad_pct        promedio ponderado por kg de los lotes con humedad medida; null si ninguno la tiene
--   merma_tostion_pct  (Σ entrada − Σ salida) / Σ entrada de las tostiones vigentes de esos lotes (%); null sin tostión
--   costo_kg_tostado   precio_kg / (1 − merma de tostión): lo que cuesta un kilo YA tostado de ese proveedor; null sin
--                      tostión. Es el mismo criterio de `cafe.costo_libra_lote` (costo del café, sin bolsa ni etiqueta).
-- Mayor volumen primero. STABLE y SECURITY INVOKER: el RLS aísla por cliente y módulo; exige miembro y `cafe.dashboard`
-- (`cafe.rango_panel`). El nombre sale de `public.terceros` (RLS de `core.terceros`: sin ese módulo, «Sin nombre»).
--
-- Reversión: drop function cafe.proveedores_marca_propia(date, date).

create or replace function cafe.proveedores_marca_propia(p_desde date default null, p_hasta date default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_desde date;
  v_hasta date;
begin
  select r.o_desde, r.o_hasta into v_desde, v_hasta from cafe.rango_panel(p_desde, p_hasta, 'marca_propia') r;

  return jsonb_build_object(
    'desde', v_desde,
    'hasta', v_hasta,
    'proveedores', coalesce((
      with l as (
        select x.id, x.tercero_id, x.peso_recibido_kg, x.valor_compra, x.humedad_pct
          from cafe.lotes x
         where x.linea = 'marca_propia' and x.anulado_at is null
           and x.fecha_recepcion between v_desde and v_hasta
      ),
      t as (
        select p.lote_id, sum(p.peso_entrada_kg) as ent, sum(p.peso_salida_kg) as sal
          from cafe.procesos p
          join l on l.id = p.lote_id
         where p.tipo = 'tostion' and p.anulado_at is null
         group by p.lote_id
      ),
      g as (
        select l.tercero_id,
               count(*) as lotes,
               sum(l.peso_recibido_kg) as kg,
               sum(l.valor_compra) as valor,
               sum(l.humedad_pct * l.peso_recibido_kg) filter (where l.humedad_pct is not null) as hum_w,
               sum(l.peso_recibido_kg) filter (where l.humedad_pct is not null) as hum_kg,
               coalesce(sum(t.ent), 0) as t_ent,
               coalesce(sum(t.sal), 0) as t_sal
          from l
          left join t on t.lote_id = l.id
         group by l.tercero_id
      )
      select jsonb_agg(
               jsonb_build_object(
                 'tercero_id', g.tercero_id,
                 'nombre', coalesce(te.nombre, 'Sin nombre'),
                 'lotes', g.lotes,
                 'kg', g.kg,
                 'valor_compra', g.valor,
                 'precio_kg', round(g.valor / nullif(g.kg, 0), 2),
                 'humedad_pct', round(g.hum_w / nullif(g.hum_kg, 0), 2),
                 'kg_tostion_entrada', g.t_ent,
                 'kg_tostion_salida', g.t_sal,
                 'merma_tostion_pct', case when g.t_ent > 0 then round((g.t_ent - g.t_sal) / g.t_ent * 100, 3) end,
                 'costo_kg_tostado', case when g.t_ent > 0 and g.t_sal > 0
                                          then round((g.valor / nullif(g.kg, 0)) / (g.t_sal / g.t_ent), 2) end)
               order by g.kg desc, te.nombre)
        from g
        left join public.terceros te on te.id = g.tercero_id
    ), '[]'::jsonb));
end;
$$;

revoke all on function cafe.proveedores_marca_propia(date, date) from public, anon;
grant execute on function cafe.proveedores_marca_propia(date, date) to authenticated;
