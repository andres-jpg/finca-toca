-- B-15 · Ajustar inventario con motivo y auditoría, y carga inicial (FIN-157).
--
--  1. `cafe.inventario_ajustes`: registro inmutable (append-only, auditado) de cada ajuste y de cada carga inicial:
--     quién, cuándo, antes → después, motivo y observación. Clases: `producto` (producto terminado, unidades),
--     `tostado` (tostado sin empacar) y `verde` (café verde por tostar), estas dos en kg y por tipo de café.
--  2. `cafe.ajustar_inventario(p jsonb)` (solo owner/admin): ajusta un producto terminado a una cantidad nueva o por
--     una diferencia, con motivo obligatorio (conteo físico, daño, muestra, corrección). Escribe el registro y el
--     movimiento `ajuste` del kardex en UNA transacción y rechaza dejar el stock en negativo.
--  3. `cafe.carga_inicial(p jsonb)` (solo owner/admin, UNA vez por producto o tipo de café): carga lo que el cliente
--     ya tiene, con costo unitario estimado y sin compra ni factura. En el producto terminado es un movimiento
--     `saldo_inicial` (`ref_tipo = 'cafe.arranque'`, que el trigger del producto terminado ya admite). El tostado
--     sin empacar y el café verde no tienen artículo ni lote: su carga inicial es un SALDO APARTE por tipo de café
--     (la fila de este registro) que la pantalla de inventario suma a lo que dan los lotes.
-- RLS: lectura para cualquier miembro con el módulo `cafe.inventario` (la pantalla suma las cargas iniciales);
-- escritura solo owner/admin y solo por estas RPC (`SECURITY INVOKER`). Sin UPDATE ni DELETE.
-- Solo crea objetos nuevos: segura en bases con datos. Rollback manual: drop function cafe.carga_inicial(jsonb),
-- cafe.ajustar_inventario(jsonb); drop table cafe.inventario_ajustes.

create table cafe.inventario_ajustes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default public.tenant_actual() references public.tenants,
  tipo             text not null check (tipo in ('ajuste', 'carga_inicial')),
  clase            text not null check (clase in ('producto', 'tostado', 'verde')),
  articulo_id      uuid,
  tipo_cafe_id     uuid references cafe.tipos_cafe (id) on delete restrict,
  cantidad_antes   numeric(14,3) not null,
  cantidad_despues numeric(14,3) not null check (cantidad_despues >= 0),
  delta            numeric(14,3) generated always as (cantidad_despues - cantidad_antes) stored,
  motivo           text not null check (motivo in ('conteo_fisico', 'dano', 'muestra', 'correccion', 'carga_inicial')),
  observacion      text check (observacion is null or (btrim(observacion) <> '' and char_length(observacion) <= 500)),
  costo_unitario   numeric(14,2) check (costo_unitario is null or costo_unitario >= 0),
  created_at       timestamptz not null default now(),
  created_by       uuid default auth.uid() references auth.users,
  updated_at       timestamptz,
  updated_by       uuid references auth.users,
  constraint inventario_ajustes_articulo_fk foreign key (tenant_id, articulo_id) references public.articulos (tenant_id, id) on delete restrict,
  constraint inventario_ajustes_objeto_ck check (
    (clase = 'producto' and articulo_id is not null and tipo_cafe_id is null)
    or (clase <> 'producto' and articulo_id is null and tipo_cafe_id is not null)),
  constraint inventario_ajustes_tipo_ck check (
    (tipo = 'carga_inicial' and motivo = 'carga_inicial' and costo_unitario is not null)
    or (tipo = 'ajuste' and motivo <> 'carga_inicial' and clase = 'producto' and cantidad_antes <> cantidad_despues))
);

create index on cafe.inventario_ajustes (tenant_id, articulo_id, created_at desc);
create index on cafe.inventario_ajustes (tenant_id, created_at desc);
create index on cafe.inventario_ajustes (tipo_cafe_id);
-- Una sola carga inicial por producto (o por tipo de café y clase).
create unique index inventario_ajustes_carga_producto_uk on cafe.inventario_ajustes (tenant_id, articulo_id)
  where tipo = 'carga_inicial' and clase = 'producto';
create unique index inventario_ajustes_carga_tipo_uk on cafe.inventario_ajustes (tenant_id, clase, tipo_cafe_id)
  where tipo = 'carga_inicial' and clase <> 'producto';

create trigger set_updated before update on cafe.inventario_ajustes
  for each row execute function public.set_updated();

alter table cafe.inventario_ajustes enable row level security;

create policy inventario_ajustes_select on cafe.inventario_ajustes for select to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.inventario')));

create policy inventario_ajustes_insert on cafe.inventario_ajustes for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.inventario'))
              and (select public.rol_en_tenant()) in ('owner', 'admin'));

revoke all on table cafe.inventario_ajustes from public, anon, authenticated, service_role;
grant select on table cafe.inventario_ajustes to authenticated, service_role;
grant insert (tipo, clase, articulo_id, tipo_cafe_id, cantidad_antes, cantidad_despues, motivo, observacion, costo_unitario)
  on table cafe.inventario_ajustes to authenticated;
grant insert on table cafe.inventario_ajustes to service_role;

select audit.activar('cafe.inventario_ajustes');

-- 2. Ajustar inventario -----------------------------------------------------------------------------------------------------
-- Entrada: { articulo_id, modo: 'nueva' | 'diferencia', cantidad, motivo, observacion? }
--   · modo `nueva`: `cantidad` es el stock que debe quedar (entero ≥ 0); `diferencia`: entero con signo distinto de 0.
--   · motivo: conteo_fisico | dano | muestra | correccion.
-- Salida: { id, antes, despues, delta }
create or replace function cafe.ajustar_inventario(p jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_articulo uuid;
  v_modo     text;
  v_cant     numeric;
  v_motivo   text;
  v_obs      text;
  v_art      public.articulos%rowtype;
  v_antes    numeric;
  v_despues  numeric;
  v_id       uuid;
  v_etiqueta text;
begin
  if not coalesce((select public.rol_en_tenant()) in ('owner', 'admin'), false)
     or not coalesce((select public.tenant_tiene_modulo('cafe.inventario')), false) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El ajuste no tiene el formato esperado.';
  end if;
  begin
    if jsonb_typeof(p -> 'articulo_id') is distinct from 'string'
       or jsonb_typeof(p -> 'modo') is distinct from 'string'
       or jsonb_typeof(p -> 'cantidad') is distinct from 'number'
       or jsonb_typeof(p -> 'motivo') is distinct from 'string' then
      raise exception using errcode = '22023';
    end if;
    v_articulo := (p ->> 'articulo_id')::uuid;
    v_modo     := p ->> 'modo';
    v_cant     := (p ->> 'cantidad')::numeric;
    v_motivo   := p ->> 'motivo';
    if jsonb_typeof(p -> 'observacion') = 'string' then
      v_obs := nullif(btrim(p ->> 'observacion'), '');
    elsif p ? 'observacion' and jsonb_typeof(p -> 'observacion') <> 'null' then
      raise exception using errcode = '22023';
    end if;
  exception when others then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El ajuste no tiene el formato esperado.';
  end;

  if v_motivo not in ('conteo_fisico', 'dano', 'muestra', 'correccion') then
    raise exception using errcode = 'P0001', message = 'motivo_requerido', detail = 'Elegir el motivo del ajuste.';
  end if;
  if v_modo not in ('nueva', 'diferencia') or v_cant <> trunc(v_cant) or abs(v_cant) > 999999
     or (v_modo = 'nueva' and v_cant < 0) or (v_modo = 'diferencia' and v_cant = 0) then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = case v_modo when 'nueva' then 'La cantidad nueva es un entero de cero en adelante.'
                           else 'La diferencia es un entero distinto de cero.' end;
  end if;
  if char_length(coalesce(v_obs, '')) > 500 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La observación admite hasta 500 caracteres.';
  end if;

  select * into v_art from public.articulos a where a.id = v_articulo and a.tipo = 'producto_terminado';
  if not found then
    raise exception using errcode = 'P0001', message = 'articulo_no_encontrado',
      detail = 'El producto terminado no existe o no pertenece a tu cliente.';
  end if;

  -- Mismo candado que `registrar_movimientos`: el stock «antes» no cambia hasta que termine esta transacción.
  perform pg_advisory_xact_lock(hashtextextended('inventario:' || v_articulo::text, 0));
  select coalesce(sum(m.cantidad), 0) into v_antes from public.movimientos_inventario m where m.articulo_id = v_articulo;

  v_despues := case v_modo when 'nueva' then v_cant else v_antes + v_cant end;
  if v_despues < 0 then
    raise exception using errcode = 'P0001', message = 'ajuste_deja_negativo',
      detail = format('El ajuste dejaría %s en %s. El stock no puede quedar negativo.', v_art.nombre, trim_scale(v_despues)::text);
  end if;
  if v_despues = v_antes then
    raise exception using errcode = 'P0001', message = 'sin_cambios', detail = 'El ajuste no cambia el stock actual.';
  end if;

  insert into cafe.inventario_ajustes (tipo, clase, articulo_id, cantidad_antes, cantidad_despues, motivo, observacion)
  values ('ajuste', 'producto', v_articulo, v_antes, v_despues, v_motivo, v_obs)
  returning id into v_id;

  v_etiqueta := case v_motivo when 'conteo_fisico' then 'Conteo físico' when 'dano' then 'Daño' when 'muestra' then 'Muestra'
                              else 'Corrección' end
                || format(' · %s → %s', trim_scale(v_antes)::text, trim_scale(v_despues)::text)
                || coalesce(' · ' || v_obs, '');

  perform public.registrar_movimientos(
    jsonb_build_array(jsonb_build_object(
      'articulo_id', v_articulo, 'cantidad', v_despues - v_antes, 'motivo', 'ajuste',
      'ref_tipo', 'cafe.ajuste', 'ref_id', v_id, 'observaciones', v_etiqueta)),
    false);

  return jsonb_build_object('id', v_id, 'antes', v_antes, 'despues', v_despues, 'delta', v_despues - v_antes);
end $$;

revoke all on function cafe.ajustar_inventario(jsonb) from public, anon;
grant execute on function cafe.ajustar_inventario(jsonb) to authenticated;

-- 3. Carga inicial ----------------------------------------------------------------------------------------------------------
-- Entrada: { clase: 'producto' | 'tostado' | 'verde', articulo_id (producto) | tipo_cafe_id (tostado, verde),
--            cantidad, costo_unitario, observacion? }
--   · producto: unidades enteras > 0 y costo por unidad; tostado y verde: kg (hasta 3 decimales) > 0 y costo por kg.
-- Salida: { id, antes, despues }
create or replace function cafe.carga_inicial(p jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_clase    text;
  v_articulo uuid;
  v_tipo     uuid;
  v_cant     numeric;
  v_costo    numeric;
  v_obs      text;
  v_art      public.articulos%rowtype;
  v_antes    numeric := 0;
  v_id       uuid;
begin
  if not coalesce((select public.rol_en_tenant()) in ('owner', 'admin'), false)
     or not coalesce((select public.tenant_tiene_modulo('cafe.inventario')), false) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La carga inicial no tiene el formato esperado.';
  end if;
  begin
    if jsonb_typeof(p -> 'clase') is distinct from 'string'
       or jsonb_typeof(p -> 'cantidad') is distinct from 'number'
       or jsonb_typeof(p -> 'costo_unitario') is distinct from 'number' then
      raise exception using errcode = '22023';
    end if;
    v_clase := p ->> 'clase';
    v_cant  := (p ->> 'cantidad')::numeric;
    v_costo := (p ->> 'costo_unitario')::numeric;
    if jsonb_typeof(p -> 'articulo_id') = 'string' then v_articulo := (p ->> 'articulo_id')::uuid; end if;
    if jsonb_typeof(p -> 'tipo_cafe_id') = 'string' then v_tipo := (p ->> 'tipo_cafe_id')::uuid; end if;
    if jsonb_typeof(p -> 'observacion') = 'string' then
      v_obs := nullif(btrim(p ->> 'observacion'), '');
    elsif p ? 'observacion' and jsonb_typeof(p -> 'observacion') <> 'null' then
      raise exception using errcode = '22023';
    end if;
  exception when others then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La carga inicial no tiene el formato esperado.';
  end;

  if v_clase not in ('producto', 'tostado', 'verde')
     or (v_clase = 'producto' and (v_articulo is null or v_tipo is not null))
     or (v_clase <> 'producto' and (v_tipo is null or v_articulo is not null)) then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Elegir el producto o el tipo de café de la carga inicial.';
  end if;
  if v_cant <= 0 or v_cant >= 1000000 or v_cant <> round(v_cant, case v_clase when 'producto' then 0 else 3 end) then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = case v_clase when 'producto' then 'Las unidades son un entero mayor que cero.'
                            else 'Los kilos son un número mayor que cero, con hasta 3 decimales.' end;
  end if;
  if v_costo < 0 or v_costo >= 1000000000 or v_costo <> round(v_costo, 2) then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'El costo unitario es un valor de cero en adelante, con hasta 2 decimales.';
  end if;
  if char_length(coalesce(v_obs, '')) > 500 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La observación admite hasta 500 caracteres.';
  end if;

  if v_clase = 'producto' then
    select * into v_art from public.articulos a where a.id = v_articulo and a.tipo = 'producto_terminado';
    if not found then
      raise exception using errcode = 'P0001', message = 'articulo_no_encontrado',
        detail = 'El producto terminado no existe o no pertenece a tu cliente.';
    end if;
    if not v_art.activo then
      raise exception using errcode = 'P0001', message = 'articulo_inactivo',
        detail = format('El producto está desactivado: %s. Activarlo para cargar su inventario.', v_art.nombre);
    end if;
    perform pg_advisory_xact_lock(hashtextextended('inventario:' || v_articulo::text, 0));
    if exists (select 1 from cafe.inventario_ajustes i where i.tipo = 'carga_inicial' and i.clase = 'producto' and i.articulo_id = v_articulo) then
      raise exception using errcode = 'P0001', message = 'carga_inicial_existente',
        detail = 'Este producto ya tiene carga inicial. Usar "Ajustar inventario".';
    end if;
    select coalesce(sum(m.cantidad), 0) into v_antes from public.movimientos_inventario m where m.articulo_id = v_articulo;
  else
    if not exists (select 1 from cafe.tipos_cafe t where t.id = v_tipo and t.activo) then
      raise exception using errcode = 'P0001', message = 'tipo_cafe_no_encontrado',
        detail = 'El tipo de café no existe, está inactivo o no pertenece a tu cliente.';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('carga_inicial:' || v_clase || ':' || v_tipo::text, 0));
    if exists (select 1 from cafe.inventario_ajustes i where i.tipo = 'carga_inicial' and i.clase = v_clase and i.tipo_cafe_id = v_tipo) then
      raise exception using errcode = 'P0001', message = 'carga_inicial_existente',
        detail = 'Este tipo de café ya tiene carga inicial en esta etapa.';
    end if;
  end if;

  insert into cafe.inventario_ajustes (tipo, clase, articulo_id, tipo_cafe_id, cantidad_antes, cantidad_despues, motivo, observacion, costo_unitario)
  values ('carga_inicial', v_clase, v_articulo, v_tipo, v_antes, v_antes + v_cant, 'carga_inicial', v_obs, v_costo)
  returning id into v_id;

  if v_clase = 'producto' then
    perform public.registrar_movimientos(
      jsonb_build_array(jsonb_build_object(
        'articulo_id', v_articulo, 'cantidad', v_cant, 'motivo', 'saldo_inicial', 'costo_unitario', v_costo,
        'ref_tipo', 'cafe.arranque', 'ref_id', v_id,
        'observaciones', 'Carga inicial' || coalesce(' · ' || v_obs, ''))),
      false);
  end if;

  return jsonb_build_object('id', v_id, 'antes', v_antes, 'despues', v_antes + v_cant);
end $$;

revoke all on function cafe.carga_inicial(jsonb) from public, anon;
grant execute on function cafe.carga_inicial(jsonb) to authenticated;
