-- A-05 (FIN-124 · HU-F1-17) · Costo de producir una libra (500 g) por lote y en el panel. NO hay tablas ni columnas
-- nuevas: todo se deriva de lo que ya existe (lotes, tostiones/moliendas, compras de insumos, ventas).
--
--  1. `cafe.costo_insumo(clase, gramos)`: costo unitario de la bolsa o etiqueta de una presentación = PROMEDIO
--     PONDERADO de sus compras (`Σ cantidad × costo_unitario / Σ cantidad`, motivos `compra` y `saldo_inicial` con
--     costo). Las compras sin costo (anteriores a A-05) no cuentan; sin ninguna con costo → NULL.
--  2. `cafe.costo_libra_lote(lote, gramos = 500)` → jsonb con las entradas y el resultado:
--        merma_tostion = Σ(entrada − salida) / Σ entrada de las tostiones vigentes del lote (fracción 0..1)
--        costo_kg_tostado = precio_compra_kg / (1 − merma_tostion)      [/ (1 − merma_molienda) si el lote se molió]
--        costo_libra = round(costo_kg_tostado × gramos/1000 + costo_bolsa + costo_etiqueta)
--        margen = precio_venta − costo_libra     margen_pct = margen / precio_venta × 100
--     Costo directo: energía, gas, mano de obra y arriendo no entran. NADA se inventa: sin tostión, sin bolsa o etiqueta
--     con costo, o sin precio de venta, el campo que dependería de ello es NULL y `completo` es false.
--     `precio_venta` = el precio unitario de la última venta (no anulada, no cortesía) del producto terminado de ese tipo
--     de café y presentación; sin ventas, NULL (aún no hay una lista de precios en el sistema).
--  3. `cafe.costo_libra_panel(desde, hasta, gramos = 500)` → una fila por lote de marca propia empacado en el periodo, con
--     los kg de esa presentación que se empacaron (el peso del promedio ponderado) y el mismo detalle de (2).
--
-- STABLE y SECURITY INVOKER: el RLS de lotes/procesos/ventas/inventario aísla por cliente y módulo. (2) exige miembro; (3)
-- además el módulo `cafe.dashboard`, como el resto del panel. Solo crea funciones: segura en bases con datos (expand).
-- Reversión: drop function cafe.costo_libra_panel(date, date, integer), cafe.costo_libra_lote(uuid, integer),
-- cafe.costo_insumo(text, integer).

create or replace function cafe.costo_insumo(p_clase text, p_gramos integer)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select round(sum(m.cantidad * m.costo_unitario) / nullif(sum(m.cantidad), 0), 2)
    from public.articulos a
    join public.movimientos_inventario m on m.tenant_id = a.tenant_id and m.articulo_id = a.id
   where a.tipo = 'insumo'
     and a.atributos ->> 'clase' = p_clase
     and jsonb_typeof(a.atributos -> 'presentacion_g') = 'number'
     and (a.atributos ->> 'presentacion_g')::numeric = p_gramos
     and m.motivo in ('compra', 'saldo_inicial')
     and m.cantidad > 0
     and m.costo_unitario is not null
$$;

create or replace function cafe.costo_libra_lote(p_lote uuid, p_gramos integer default 500)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_lote     cafe.lotes;
  v_t_ent    numeric;
  v_t_sal    numeric;
  v_t_n      integer;
  v_m_ent    numeric;
  v_m_sal    numeric;
  v_m_n      integer;
  v_merma_t  numeric;
  v_merma_m  numeric;
  v_kg_tost  numeric;
  v_bolsa    numeric;
  v_etiq     numeric;
  v_cafe     numeric;
  v_costo    numeric;
  v_precio   numeric;
  v_margen   numeric;
begin
  if (select public.rol_en_tenant()) is null then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;
  if p_gramos is null or p_gramos <= 0 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La presentación debe ser mayor que cero.';
  end if;

  select * into v_lote from cafe.lotes l where l.id = p_lote;
  if not found then
    raise exception using errcode = 'P0001', message = 'lote_no_encontrado',
      detail = 'El lote no existe o no pertenece a tu cliente.';
  end if;
  if v_lote.linea <> 'marca_propia' then
    return jsonb_build_object('lote_id', p_lote, 'gramos', p_gramos, 'aplica', false);
  end if;

  select coalesce(sum(p.peso_entrada_kg), 0), coalesce(sum(p.peso_salida_kg), 0), count(*)
    into v_t_ent, v_t_sal, v_t_n
    from cafe.procesos p where p.lote_id = p_lote and p.tipo = 'tostion' and p.anulado_at is null;
  select coalesce(sum(p.peso_entrada_kg), 0), coalesce(sum(p.peso_salida_kg), 0), count(*)
    into v_m_ent, v_m_sal, v_m_n
    from cafe.procesos p where p.lote_id = p_lote and p.tipo = 'molienda' and p.anulado_at is null;

  v_merma_t := case when v_t_ent > 0 then (v_t_ent - v_t_sal) / v_t_ent end;
  v_merma_m := case when v_m_ent > 0 then (v_m_ent - v_m_sal) / v_m_ent end;

  v_bolsa := cafe.costo_insumo('bolsa', p_gramos);
  v_etiq  := cafe.costo_insumo('etiqueta', p_gramos);

  select vl.precio_unitario into v_precio
    from cafe.venta_lineas vl
    join cafe.ventas v on v.tenant_id = vl.tenant_id and v.id = vl.venta_id
    join public.articulos a on a.tenant_id = vl.tenant_id and a.id = vl.articulo_pt_id
   where v.anulada_at is null and v.tipo = 'venta' and vl.precio_unitario > 0
     and a.tipo = 'producto_terminado'
     and a.atributos ->> 'tipo_cafe_id' = v_lote.tipo_cafe_id::text
     and jsonb_typeof(a.atributos -> 'presentacion_g') = 'number'
     and (a.atributos ->> 'presentacion_g')::numeric = p_gramos
   order by v.fecha desc, vl.created_at desc
   limit 1;

  -- Sin tostión (o una merma del 100 %) no hay costo del kilo tostado: no se inventa.
  if v_merma_t is not null and v_merma_t < 1 and v_lote.precio_compra_kg is not null then
    v_kg_tost := v_lote.precio_compra_kg / (1 - v_merma_t);
    if v_merma_m is not null then
      v_kg_tost := case when v_merma_m < 1 then v_kg_tost / (1 - v_merma_m) end;
    end if;
  end if;
  v_cafe := v_kg_tost * p_gramos / 1000;
  if v_cafe is not null and v_bolsa is not null and v_etiq is not null then
    v_costo := round(v_cafe + v_bolsa + v_etiq);
  end if;
  if v_costo is not null and v_precio is not null then
    v_margen := v_precio - v_costo;
  end if;

  return jsonb_build_object(
    'lote_id', p_lote, 'gramos', p_gramos, 'aplica', true,
    'tipo_cafe_id', v_lote.tipo_cafe_id,
    'precio_compra_kg', v_lote.precio_compra_kg,
    'tostion', jsonb_build_object('procesos', v_t_n, 'kg_entrada', v_t_ent, 'kg_salida', v_t_sal),
    'molienda', jsonb_build_object('procesos', v_m_n, 'kg_entrada', v_m_ent, 'kg_salida', v_m_sal),
    'merma_tostion', v_merma_t,
    'merma_molienda', v_merma_m,
    'costo_kg_tostado', round(v_kg_tost, 2),
    'costo_cafe', round(v_cafe, 2),
    'costo_bolsa', v_bolsa,
    'costo_etiqueta', v_etiq,
    'costo_libra', v_costo,
    'precio_venta', v_precio,
    'margen', v_margen,
    'margen_pct', case when v_margen is not null then round(v_margen / v_precio * 100, 1) end,
    'completo', v_costo is not null and v_precio is not null
  );
end;
$$;

create or replace function cafe.costo_libra_panel(p_desde date default null, p_hasta date default null, p_gramos integer default 500)
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
  select r.o_desde, r.o_hasta into v_desde, v_hasta from cafe.rango_panel(p_desde, p_hasta, null) r;

  return coalesce((
    select jsonb_agg(
             jsonb_build_object(
               'lote_id', l.id, 'codigo', l.codigo,
               'tipo_cafe_id', l.tipo_cafe_id, 'tipo_cafe', t.nombre,
               'kg_empacados', e.kg) || cafe.costo_libra_lote(l.id, p_gramos)
             order by t.orden, t.nombre, l.codigo)
      from cafe.lotes l
      join cafe.tipos_cafe t on t.tenant_id = l.tenant_id and t.id = l.tipo_cafe_id
      join lateral (
        select round(sum(el.unidades * el.presentacion_g / 1000.0), 3) as kg
          from cafe.empaque_lineas el
          join cafe.procesos p on p.tenant_id = el.tenant_id and p.id = el.proceso_id
         where p.lote_id = l.id and p.anulado_at is null and p.fecha between v_desde and v_hasta
           and el.presentacion_g = p_gramos
      ) e on e.kg > 0
     where l.linea = 'marca_propia' and l.anulado_at is null
  ), '[]'::jsonb);
end;
$$;

revoke all on function cafe.costo_insumo(text, integer) from public, anon;
revoke all on function cafe.costo_libra_lote(uuid, integer) from public, anon;
revoke all on function cafe.costo_libra_panel(date, date, integer) from public, anon;
grant execute on function cafe.costo_insumo(text, integer) to authenticated;
grant execute on function cafe.costo_libra_lote(uuid, integer) to authenticated;
grant execute on function cafe.costo_libra_panel(date, date, integer) to authenticated;
