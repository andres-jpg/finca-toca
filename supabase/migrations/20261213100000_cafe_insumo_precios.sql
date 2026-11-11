-- B-13 (FIN-160) · Insumos con precio real y costo por libra por presentación (500 g y 2.500 g).
--
--  1. `cafe.insumo_precios`: precio unitario VIGENTE de cada bolsa o etiqueta, con historial (cada cambio es una fila nueva:
--     no se actualiza ni se borra ninguna). Lo fija owner/admin desde Insumos. Reemplaza al promedio de compras de A-05:
--     el costo del insumo es el precio vigente (sin precio → NULL, nada se inventa). Los precios concretos de cada cliente
--     NO viajan en migraciones: se cargan desde la pantalla (o los seeds de desarrollo).
--  2. `cafe.precio_insumo(articulo, instante)` y `cafe.costo_insumo(clase, gramos)` (precio vigente del insumo activo).
--  3. Snapshot en el empaque: `empaque_lineas.costo_bolsa/costo_etiqueta` se estampan al insertar la línea (trigger) con el
--     precio vigente de ese momento. Cambiar el precio después NO toca empaques ya registrados.
--     `cafe.costo_insumos_empaque(proceso)` devuelve el costo de insumos de un empaque (ejemplo B-08: 68 × 1.570 + 4 × 4.070
--     = $123.040).
--  4. `cafe.costo_libra_lote(lote, gramos)` generalizado a cualquier presentación:
--        café por libra  = precio_compra_kg / (1 − merma de tostión ACUMULADA) × 0,5     (no depende de la presentación)
--        empaque por libra = (bolsa + etiqueta) / (gramos / 500)       [snapshot de los empaques del lote si los hay]
--        costo por libra = café + empaque (redondeo a pesos solo al final)
--        precio por libra = precio de la unidad / (gramos / 500)   [tarifa vigente del producto; sin tarifa, última venta]
--        margen = precio por libra − costo;  margen_pct = margen / precio por libra
--     La merma de molienda ya no entra (B-07: la molienda no tiene merma).
--
-- Solo crea objetos nuevos (columnas nulas) y redefine funciones: segura en bases con datos (expand).
-- Reversión: drop trigger/función de snapshot, columnas de empaque_lineas, funciones nuevas y la tabla.

-- 1. Precios -------------------------------------------------------------------------------------------------------

create table cafe.insumo_precios (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default public.tenant_actual() references public.tenants,
  articulo_id   uuid not null,
  precio        numeric(14,2) not null check (precio > 0 and precio < 100000000),
  vigente_desde timestamptz not null default clock_timestamp(),
  created_at    timestamptz not null default now(),
  created_by    uuid default auth.uid() references auth.users,
  updated_at    timestamptz,
  updated_by    uuid references auth.users,
  constraint insumo_precios_articulo_fk foreign key (tenant_id, articulo_id)
    references public.articulos (tenant_id, id) on delete restrict
);

create index insumo_precios_vigente_idx on cafe.insumo_precios (tenant_id, articulo_id, vigente_desde desc);

create trigger set_updated before update on cafe.insumo_precios
  for each row execute function public.set_updated();

alter table cafe.insumo_precios enable row level security;

create policy insumo_precios_select on cafe.insumo_precios for select to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.inventario')));

create policy insumo_precios_insert on cafe.insumo_precios for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.inventario'))
              and (select public.rol_en_tenant()) in ('owner', 'admin')
              and exists (select 1 from public.articulos a where a.id = articulo_id and a.tipo = 'insumo'));

-- Sin UPDATE ni DELETE: un cambio de precio es una fila nueva.
revoke all on table cafe.insumo_precios from public, anon, authenticated, service_role;
grant select, insert on table cafe.insumo_precios to authenticated;
grant select, insert on table cafe.insumo_precios to service_role;

select audit.activar('cafe.insumo_precios');

-- Precio vigente por insumo (security_invoker: el RLS limita al cliente actual).
create view cafe.v_insumo_precio_vigente with (security_invoker = true) as
select distinct on (p.articulo_id) p.articulo_id, p.tenant_id, p.precio, p.vigente_desde
  from cafe.insumo_precios p
 where p.vigente_desde <= clock_timestamp()
 order by p.articulo_id, p.vigente_desde desc, p.created_at desc;

revoke all on cafe.v_insumo_precio_vigente from public, anon;
grant select on cafe.v_insumo_precio_vigente to authenticated;

-- 2. Precio y costo del insumo ---------------------------------------------------------------------------------------

create or replace function cafe.precio_insumo(p_articulo uuid, p_at timestamptz default null)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select p.precio
    from cafe.insumo_precios p
   where p.articulo_id = p_articulo
     and p.vigente_desde <= coalesce(p_at, clock_timestamp())
   order by p.vigente_desde desc, p.created_at desc
   limit 1
$$;

-- Costo unitario de la bolsa o etiqueta ACTIVA de una presentación = su precio vigente (NULL si no tiene precio).
create or replace function cafe.costo_insumo(p_clase text, p_gramos integer)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select cafe.precio_insumo(a.id)
    from public.articulos a
   where a.tipo = 'insumo' and a.activo
     and a.atributos ->> 'clase' = p_clase
     and jsonb_typeof(a.atributos -> 'presentacion_g') = 'number'
     and (a.atributos ->> 'presentacion_g')::numeric = p_gramos
   order by a.created_at, a.id
   limit 1
$$;

-- 3. Snapshot del costo de insumos en el empaque ------------------------------------------------------------------------

alter table cafe.empaque_lineas
  add column costo_bolsa numeric(14,2),
  add column costo_etiqueta numeric(14,2);

create or replace function cafe.empaque_lineas_costo()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.bolsa_cliente or new.costo_bolsa is not null or new.costo_etiqueta is not null then
    return new;
  end if;
  if not exists (select 1 from cafe.procesos p join cafe.lotes l on l.tenant_id = p.tenant_id and l.id = p.lote_id
                  where p.id = new.proceso_id and l.linea = 'marca_propia') then
    return new;
  end if;
  new.costo_bolsa := cafe.costo_insumo('bolsa', new.presentacion_g);
  new.costo_etiqueta := cafe.costo_insumo('etiqueta', new.presentacion_g);
  return new;
end $$;

create trigger empaque_lineas_costo before insert on cafe.empaque_lineas
  for each row execute function cafe.empaque_lineas_costo();

create or replace function cafe.costo_insumos_empaque(p_proceso uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_lineas jsonb;
  v_total  numeric;
  v_n      integer;
  v_sin    integer;
begin
  if (select public.rol_en_tenant()) is null then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;
  if not exists (select 1 from cafe.procesos p where p.id = p_proceso and p.tipo = 'empaque') then
    raise exception using errcode = 'P0001', message = 'proceso_no_encontrado',
      detail = 'El empaque no existe o no pertenece a tu cliente.';
  end if;

  select jsonb_agg(jsonb_build_object(
           'presentacion_g', el.presentacion_g, 'forma', el.forma, 'unidades', el.unidades,
           'costo_bolsa', el.costo_bolsa, 'costo_etiqueta', el.costo_etiqueta,
           'costo', case when el.costo_bolsa is not null and el.costo_etiqueta is not null
                         then round(el.unidades * (el.costo_bolsa + el.costo_etiqueta)) end)
         order by el.presentacion_g, el.forma),
         round(sum(el.unidades * (el.costo_bolsa + el.costo_etiqueta))),
         count(*) filter (where not el.bolsa_cliente),
         count(*) filter (where not el.bolsa_cliente and (el.costo_bolsa is null or el.costo_etiqueta is null))
    into v_lineas, v_total, v_n, v_sin
    from cafe.empaque_lineas el
   where el.proceso_id = p_proceso;

  return jsonb_build_object(
    'proceso_id', p_proceso,
    'lineas', coalesce(v_lineas, '[]'::jsonb),
    'total', coalesce(v_total, 0),
    'completo', v_n > 0 and v_sin = 0,
    'aplica', v_n > 0);
end $$;

-- 4. Costo por libra por lote y presentación ----------------------------------------------------------------------------

create or replace function cafe.costo_libra_lote(p_lote uuid, p_gramos integer default 500)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_lote      cafe.lotes;
  v_t_ent     numeric;
  v_t_sal     numeric;
  v_t_n       integer;
  v_merma_t   numeric;
  v_lb        numeric;      -- libras por unidad de la presentación
  v_cafe_lb   numeric;
  v_bolsa     numeric;
  v_etiq      numeric;
  v_fuente    text;
  v_emp_lb    numeric;
  v_costo     numeric;
  v_precio_u  numeric;
  v_precio_lb numeric;
  v_margen    numeric;
  v_pt        uuid;
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

  v_lb := p_gramos / 500.0;

  -- Merma de tostión ACUMULADA del lote: Σ entrada vs Σ báscula de las tandas cerradas.
  select coalesce(sum(p.peso_entrada_kg), 0), coalesce(sum(p.peso_salida_kg), 0), count(*)
    into v_t_ent, v_t_sal, v_t_n
    from cafe.procesos p
   where p.lote_id = p_lote and p.tipo = 'tostion' and p.anulado_at is null and p.peso_salida_kg is not null;
  v_merma_t := case when v_t_ent > 0 then (v_t_ent - v_t_sal) / v_t_ent end;

  if v_merma_t is not null and v_merma_t < 1 and v_lote.precio_compra_kg is not null then
    v_cafe_lb := v_lote.precio_compra_kg / (1 - v_merma_t) * 0.5;
  end if;

  -- Insumos: lo registrado en los empaques del lote (snapshot, ponderado por unidades); si aún no hay, el precio vigente.
  select sum(el.unidades * el.costo_bolsa) / nullif(sum(el.unidades), 0),
         sum(el.unidades * el.costo_etiqueta) / nullif(sum(el.unidades), 0)
    into v_bolsa, v_etiq
    from cafe.empaque_lineas el
    join cafe.procesos p on p.tenant_id = el.tenant_id and p.id = el.proceso_id
   where p.lote_id = p_lote and p.anulado_at is null and el.presentacion_g = p_gramos
     and el.costo_bolsa is not null and el.costo_etiqueta is not null;
  if v_bolsa is not null then
    v_fuente := 'registrado';
  else
    v_bolsa := cafe.costo_insumo('bolsa', p_gramos);
    v_etiq  := cafe.costo_insumo('etiqueta', p_gramos);
    v_fuente := 'vigente';
  end if;
  if v_bolsa is not null and v_etiq is not null then
    v_emp_lb := (v_bolsa + v_etiq) / v_lb;
  end if;

  if v_cafe_lb is not null and v_emp_lb is not null then
    v_costo := round(v_cafe_lb + v_emp_lb);
  end if;

  -- Precio de la unidad: tarifa vigente del producto (grano primero); sin tarifa, el de la última venta.
  select a.id into v_pt
    from public.articulos a
    join public.tarifas t on t.tenant_id = a.tenant_id and t.concepto = cafe.concepto_precio(a.id)
   where a.tipo = 'producto_terminado'
     and a.atributos ->> 'tipo_cafe_id' = v_lote.tipo_cafe_id::text
     and jsonb_typeof(a.atributos -> 'presentacion_g') = 'number'
     and (a.atributos ->> 'presentacion_g')::numeric = p_gramos
     and t.vigente_desde <= now()
   order by (coalesce(a.atributos ->> 'forma', 'grano') = 'grano') desc, a.created_at, a.id
   limit 1;
  if v_pt is not null then
    select t.valor into v_precio_u from public.tarifas t
     where t.tenant_id = v_lote.tenant_id and t.concepto = cafe.concepto_precio(v_pt) and t.vigente_desde <= now()
     order by t.vigente_desde desc limit 1;
  end if;
  if v_precio_u is null then
    select vl.precio_unitario into v_precio_u
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
  end if;
  v_precio_lb := v_precio_u / v_lb;

  if v_costo is not null and v_precio_lb is not null then
    v_margen := v_precio_lb - v_costo;
  end if;

  return jsonb_build_object(
    'lote_id', p_lote, 'gramos', p_gramos, 'aplica', true,
    'tipo_cafe_id', v_lote.tipo_cafe_id,
    'precio_compra_kg', v_lote.precio_compra_kg,
    'tostion', jsonb_build_object('procesos', v_t_n, 'kg_entrada', v_t_ent, 'kg_salida', v_t_sal),
    'molienda', jsonb_build_object('procesos', 0, 'kg_entrada', 0, 'kg_salida', 0),
    'merma_tostion', v_merma_t,
    'merma_molienda', null,
    'libras_por_unidad', v_lb,
    'costo_cafe', round(v_cafe_lb, 2),
    'costo_bolsa', round(v_bolsa, 2),
    'costo_etiqueta', round(v_etiq, 2),
    'costo_empaque', round(v_emp_lb, 2),
    'fuente_empaque', v_fuente,
    'costo_libra', v_costo,
    'precio_unidad', v_precio_u,
    'precio_venta', round(v_precio_lb, 2),
    'precio_libra', round(v_precio_lb, 2),
    'margen', case when v_margen is not null then round(v_margen) end,
    'margen_pct', case when v_margen is not null and v_precio_lb > 0 then round(v_margen / v_precio_lb * 100, 1) end,
    'completo', v_costo is not null and v_precio_lb is not null
  );
end;
$$;

revoke all on function cafe.precio_insumo(uuid, timestamptz) from public, anon;
revoke all on function cafe.costo_insumo(text, integer) from public, anon;
revoke all on function cafe.empaque_lineas_costo() from public, anon;
revoke all on function cafe.costo_insumos_empaque(uuid) from public, anon;
revoke all on function cafe.costo_libra_lote(uuid, integer) from public, anon;
grant execute on function cafe.precio_insumo(uuid, timestamptz) to authenticated;
grant execute on function cafe.costo_insumo(text, integer) to authenticated;
grant execute on function cafe.costo_insumos_empaque(uuid) to authenticated;
grant execute on function cafe.costo_libra_lote(uuid, integer) to authenticated;
