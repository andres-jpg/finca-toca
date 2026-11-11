-- B-10 (FIN-156) · Libras vendidas por producto en una ventana de días: base de la cobertura del Inventario de marca propia
-- («alcanza para N días»). 1 lb = 500 g; una bolsa de 2.500 g son 5 lb. Cuentan ventas y cortesías NO anuladas.
--
-- `cafe.libras_vendidas(p_desde, p_hasta)` → jsonb [{articulo_pt_id, tipo_cafe_id, presentacion_g, libras}], un elemento por
-- producto terminado vendido en el rango (ambos extremos incluidos). SECURITY INVOKER: el RLS de ventas (módulo `cafe.ventas`)
-- aísla por cliente; sin ese módulo la lista sale vacía y la pantalla muestra «—». No hay tablas nuevas: segura en bases con datos.
-- Reversión: drop function cafe.libras_vendidas(date, date).

create or replace function cafe.libras_vendidas(p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if (select public.rol_en_tenant()) is null then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El rango de fechas no es válido.';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'articulo_pt_id', x.articulo_id, 'tipo_cafe_id', x.tipo_cafe_id,
             'presentacion_g', x.presentacion_g, 'libras', x.libras)
           order by x.articulo_id)
      from (
        select a.id as articulo_id,
               (a.atributos ->> 'tipo_cafe_id')::uuid as tipo_cafe_id,
               (a.atributos ->> 'presentacion_g')::integer as presentacion_g,
               round(sum(vl.cantidad * (a.atributos ->> 'presentacion_g')::numeric / 500.0), 3) as libras
          from cafe.venta_lineas vl
          join cafe.ventas v on v.tenant_id = vl.tenant_id and v.id = vl.venta_id
          join public.articulos a on a.tenant_id = vl.tenant_id and a.id = vl.articulo_pt_id
         where v.anulada_at is null and v.fecha between p_desde and p_hasta
           and a.tipo = 'producto_terminado'
           and jsonb_typeof(a.atributos -> 'presentacion_g') = 'number'
           and a.atributos ->> 'tipo_cafe_id' is not null
         group by a.id, a.atributos
      ) x
  ), '[]'::jsonb);
end;
$$;

revoke all on function cafe.libras_vendidas(date, date) from public, anon;
grant execute on function cafe.libras_vendidas(date, date) to authenticated;
