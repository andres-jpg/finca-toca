-- B-11 · Ventas de marca propia: bloquear la venta (y la cortesía) sin stock (FIN-158).
--
-- Revierte para las ventas la regla v1 «avisar, no bloquear» de 20261107100000_cafe_ventas.sql: `cafe.registrar_venta`
-- rechaza con `stock_insuficiente` («Stock insuficiente para Excelso 2.500 g molido. Disponible: 14.») una línea que
-- deje el stock del producto por debajo de cero. Serializa por artículo con el candado de `registrar_movimientos`
-- (concurrencia: una pasa y la otra se rechaza) y ya no devuelve `advertencias`. Anular sigue reponiendo el stock.
-- Solo redefine la función (misma firma y privilegios): segura en bases con datos. Rollback: recrear la versión de
-- 20261107100000_cafe_ventas.sql.

create or replace function cafe.registrar_venta(p jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_tipo      cafe.tipo_venta;
  v_fecha     date;
  v_tercero   uuid;
  v_requiere  boolean := false;
  v_factura   text;
  v_obs       text;
  v_lineas    jsonb;
  v_elem      jsonb;
  v_n         integer;
  v_cant      numeric;
  v_precio    numeric;
  v_articulo  uuid;
  v_ids       uuid[] := '{}';
  v_det       jsonb := '[]'::jsonb;
  v_total     numeric := 0;
  v_ter       public.terceros%rowtype;
  v_art       public.articulos%rowtype;
  v_numero    text;
  v_id        uuid;
  v_etiqueta  text;
  v_fecha_mov timestamptz;
  v_movs      jsonb := '[]'::jsonb;
  v_mov       jsonb;
  v_disp      numeric;
  v_lock      uuid;
begin
  -- Permisos antes que nada: un viewer recibe 42501 aunque mande un formato erróneo.
  if not coalesce((select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'), false)
     or not coalesce((select public.tenant_tiene_modulo('cafe.ventas')), false) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La venta no tiene el formato esperado.';
  end if;

  -- Los tipos erróneos no deben acabar como un error inesperado de cast.
  begin
    if jsonb_typeof(p -> 'tipo') is distinct from 'string'
       or jsonb_typeof(p -> 'fecha') is distinct from 'string'
       or jsonb_typeof(p -> 'tercero_id') is distinct from 'string'
       or jsonb_typeof(p -> 'lineas') is distinct from 'array' then
      raise exception using errcode = '22023';
    end if;
    v_tipo    := (p ->> 'tipo')::cafe.tipo_venta;
    v_fecha   := (p ->> 'fecha')::date;
    v_tercero := (p ->> 'tercero_id')::uuid;
    v_lineas  := p -> 'lineas';

    if jsonb_typeof(p -> 'requiere_factura') = 'boolean' then
      v_requiere := (p ->> 'requiere_factura')::boolean;
    elsif p ? 'requiere_factura' and jsonb_typeof(p -> 'requiere_factura') <> 'null' then
      raise exception using errcode = '22023';
    end if;
    if jsonb_typeof(p -> 'numero_factura_aliados') = 'string' then
      v_factura := nullif(btrim(p ->> 'numero_factura_aliados'), '');
    elsif p ? 'numero_factura_aliados' and jsonb_typeof(p -> 'numero_factura_aliados') <> 'null' then
      raise exception using errcode = '22023';
    end if;
    if jsonb_typeof(p -> 'observaciones') = 'string' then
      v_obs := nullif(btrim(p ->> 'observaciones'), '');
    elsif p ? 'observaciones' and jsonb_typeof(p -> 'observaciones') <> 'null' then
      raise exception using errcode = '22023';
    end if;
  exception when others then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La venta no tiene el formato esperado.';
  end;

  if v_fecha < date '2000-01-01' or v_fecha > date '2100-12-31' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La fecha no es válida.';
  end if;
  v_n := jsonb_array_length(v_lineas);
  if v_n not between 1 and 50 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Indica entre 1 y 50 productos.';
  end if;
  if char_length(coalesce(v_obs, '')) > 500 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Las observaciones admiten hasta 500 caracteres.';
  end if;

  -- Factura: solo una venta la requiere; el número es opcional (vacío = pendiente) y solo existe si la requiere.
  if v_tipo = 'cortesia' and v_requiere then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Una cortesía no lleva factura.';
  end if;
  if v_factura is not null and not v_requiere then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'Marca «requiere factura electrónica» para guardar el número de Aliados.';
  end if;
  if char_length(coalesce(v_factura, '')) > 40 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El número de factura admite hasta 40 caracteres.';
  end if;

  -- Cliente: activo y con rol `cliente` (o el Consumidor final). El RLS esconde el de otro cliente.
  select * into v_ter from public.terceros t where t.id = v_tercero;
  if not found then
    raise exception using errcode = 'P0001', message = 'tercero_no_encontrado',
      detail = 'El cliente no existe o no pertenece a tu cliente.';
  end if;
  if not v_ter.activo then
    raise exception using errcode = 'P0001', message = 'tercero_inactivo',
      detail = 'El cliente está desactivado: actívalo o elige otro.';
  end if;
  if not (v_ter.es_consumidor_final or 'cliente' = any (v_ter.roles)) then
    raise exception using errcode = 'P0001', message = 'tercero_no_cliente',
      detail = 'El tercero elegido no tiene el rol de cliente de marca propia.';
  end if;

  -- Líneas: validación completa ANTES de escribir.
  begin
    for v_elem in select e from jsonb_array_elements(v_lineas) e loop
      if jsonb_typeof(v_elem) <> 'object'
         or jsonb_typeof(v_elem -> 'articulo_id') is distinct from 'string'
         or jsonb_typeof(v_elem -> 'cantidad') is distinct from 'number' then
        raise exception using errcode = '22023';
      end if;
      v_articulo := (v_elem ->> 'articulo_id')::uuid;
      v_cant     := (v_elem ->> 'cantidad')::numeric;
      if v_tipo = 'venta' then
        if jsonb_typeof(v_elem -> 'precio_unitario') is distinct from 'number' then
          raise exception using errcode = '22023';
        end if;
        v_precio := (v_elem ->> 'precio_unitario')::numeric;
      else
        v_precio := 0;
      end if;
      v_ids := v_ids || v_articulo;
      v_det := v_det || jsonb_build_array(jsonb_build_object('articulo_id', v_articulo, 'cantidad', v_cant, 'precio', v_precio));
    end loop;
  exception when others then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Alguna línea de la venta no tiene el formato esperado.';
  end;

  if cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) x) then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'Un producto no puede repetirse: suma las unidades en una sola línea.';
  end if;

  for v_elem in select e from jsonb_array_elements(v_det) e loop
    v_articulo := (v_elem ->> 'articulo_id')::uuid;
    v_cant     := (v_elem ->> 'cantidad')::numeric;
    v_precio   := (v_elem ->> 'precio')::numeric;

    if v_cant <> trunc(v_cant) or v_cant < 1 or v_cant > 99999 then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'Las unidades de cada producto son un entero entre 1 y 99.999.';
    end if;
    if v_tipo = 'venta' and (v_precio <= 0 or v_precio >= 1000000000 or v_precio <> round(v_precio, 2)) then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'Indica el precio de cada producto (mayor que cero, con hasta 2 decimales).';
    end if;

    select * into v_art from public.articulos a where a.id = v_articulo and a.tipo = 'producto_terminado';
    if not found then
      raise exception using errcode = 'P0001', message = 'articulo_no_encontrado',
        detail = 'Algún producto no existe o no pertenece a tu cliente.';
    end if;
    if not v_art.activo then
      raise exception using errcode = 'P0001', message = 'articulo_inactivo',
        detail = format('El producto está desactivado: %s. Actívalo para venderlo.', v_art.nombre);
    end if;

    v_total := v_total + v_cant * v_precio;
  end loop;
  if v_total >= 1000000000000 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El total de la venta es demasiado grande.';
  end if;

  -- B-11: no se vende lo que no hay (ventas y cortesías). Se serializa por artículo con el MISMO candado que
  -- `public.registrar_movimientos` (ordenado, para no cruzarse), de modo que dos ventas concurrentes por la última
  -- unidad se turnan: la segunda ve el stock ya descontado y se rechaza. Va ANTES del consecutivo: un rechazo no
  -- consume número de venta.
  for v_lock in select x from unnest(v_ids) x order by x loop
    perform pg_advisory_xact_lock(hashtextextended('inventario:' || v_lock::text, 0));
  end loop;
  for v_elem in select e from jsonb_array_elements(v_det) e loop
    v_articulo := (v_elem ->> 'articulo_id')::uuid;
    v_cant     := (v_elem ->> 'cantidad')::numeric;
    select coalesce(sum(m.cantidad), 0) into v_disp from public.movimientos_inventario m where m.articulo_id = v_articulo;
    if v_disp < v_cant then
      select * into v_art from public.articulos a where a.id = v_articulo;
      raise exception using errcode = 'P0001', message = 'stock_insuficiente',
        detail = format('Stock insuficiente para %s. Disponible: %s.', v_art.nombre, trim_scale(greatest(v_disp, 0))::text);
    end if;
  end loop;

  -- Número y escrituras (lo más tarde posible: si algo falla antes, el rollback no consume número).
  v_numero := public.siguiente_consecutivo('VT', v_fecha);

  insert into cafe.ventas (numero, tipo, fecha, tercero_id, requiere_factura, numero_factura_aliados, total, observaciones)
  values (v_numero, v_tipo, v_fecha, v_tercero, v_requiere, v_factura, v_total, v_obs)
  returning id into v_id;

  insert into cafe.venta_lineas (venta_id, articulo_pt_id, cantidad, precio_unitario)
  select v_id, (e ->> 'articulo_id')::uuid, (e ->> 'cantidad')::integer, (e ->> 'precio')::numeric
    from jsonb_array_elements(v_det) e;

  -- Movimientos: una salida por línea. Un día pasado se registra al final de ese día en la zona del cliente; hoy, ahora.
  v_fecha_mov := cafe.instante_fecha(v_fecha);
  v_etiqueta  := case v_tipo when 'venta' then 'Venta ' else 'Cortesía ' end || v_numero;
  for v_elem in select e from jsonb_array_elements(v_det) e loop
    v_movs := v_movs || jsonb_build_array(jsonb_build_object(
      'articulo_id', v_elem ->> 'articulo_id',
      'cantidad', -((v_elem ->> 'cantidad')::integer),
      'motivo', v_tipo::text,                      -- 'venta' | 'cortesia' (mismos valores que el motivo del movimiento)
      'fecha', v_fecha_mov,
      'ref_tipo', 'cafe.venta',
      'ref_id', v_id,
      'observaciones', v_etiqueta));
  end loop;

  -- Respaldo: la comprobación de arriba ya garantiza el stock; si algo cambiara, `false` rechaza el negativo.
  v_mov := public.registrar_movimientos(v_movs, false);

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'total', v_total);
end $$;
revoke all on function cafe.registrar_venta(jsonb) from public, anon;
grant execute on function cafe.registrar_venta(jsonb) to authenticated;
