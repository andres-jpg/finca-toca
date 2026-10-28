-- Vertical café: compra de café para marca propia (FIN-106 · CO-25, HU-F1-01).
--
--  1. `cafe.repartir_peso(total, n)`: reparte un peso entre n bultos (misma regla que `repartirPeso()` de
--     TypeScript). Lo reutilizan las RPC de compra y de recepción.
--  2. `cafe.registrar_compra(p jsonb)`: crea el lote `MP-…` de una compra a un proveedor, con sus bultos y el
--     precio como snapshot. Una sola transacción: si algo falla no queda nada y el consecutivo no se consume.
--  3. `cafe.ultimo_precio_compra(tercero, tipo)`: el precio sugerido para la siguiente compra.
--
-- Solo crea funciones y un índice nuevos: segura en bases con datos. Ambas RPC son SECURITY INVOKER (RLS de
-- `cafe.lotes`, `cafe.lote_bultos`, `cafe.tipos_cafe` y `public.terceros` sigue aplicando con el usuario real);
-- la única pieza SECURITY DEFINER que toca es `public.siguiente_consecutivo()`, que comprueba tenant y rol.

-- 1. Reparto del peso entre bultos -----------------------------------------------------------------------------
-- Trabaja en gramos enteros: partes iguales hacia abajo y el ÚLTIMO bulto absorbe el resto
-- (375 kg / 6 → 62,500 ×6; 100 kg / 3 → 33,333 · 33,333 · 33,334).
create or replace function cafe.repartir_peso(p_total numeric, p_n integer)
returns numeric[]
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  v_g    bigint;
  v_base bigint;
begin
  if p_n is null or p_n < 1 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'El número de bultos debe ser un entero de 1 en adelante.';
  end if;
  if p_total is null or p_total <= 0 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'El peso total debe ser mayor que cero.';
  end if;

  v_g    := round(p_total * 1000);
  v_base := v_g / p_n;                       -- división entera: hacia abajo
  if v_base < 1 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'El peso es demasiado pequeño para repartirlo en tantos bultos.';
  end if;

  return array(select (v_base::numeric / 1000) from generate_series(1, p_n - 1))
         || array[(v_g - v_base * (p_n - 1))::numeric / 1000];
end $$;

revoke all on function cafe.repartir_peso(numeric, integer) from public, anon;
grant execute on function cafe.repartir_peso(numeric, integer) to authenticated, service_role;

-- 2. Precio sugerido -------------------------------------------------------------------------------------------
-- Precio por kilo del último lote de marca propia NO anulado de ese proveedor y ese tipo; NULL si no hay.
-- Ordena por fecha de la compra y, si empatan, por creación y código (dos compras del mismo día en la misma
-- transacción comparten `created_at`). Cada lote guarda SU precio: esto solo propone, no ata nada.
create or replace function cafe.ultimo_precio_compra(p_tercero uuid, p_tipo uuid)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select l.precio_compra_kg
    from cafe.lotes l
   where l.tenant_id    = (select public.tenant_actual())
     and l.linea        = 'marca_propia'
     and l.anulado_at is null
     and l.tercero_id   = p_tercero
     and l.tipo_cafe_id = p_tipo
   order by l.fecha_recepcion desc, l.created_at desc, l.codigo desc
   limit 1
$$;

revoke all on function cafe.ultimo_precio_compra(uuid, uuid) from public, anon;
grant execute on function cafe.ultimo_precio_compra(uuid, uuid) to authenticated, service_role;

create index lotes_precio_sugerido_idx
  on cafe.lotes (tenant_id, tercero_id, tipo_cafe_id, fecha_recepcion desc, created_at desc)
  where linea = 'marca_propia' and anulado_at is null;

-- 3. Registrar compra ------------------------------------------------------------------------------------------
-- Entrada (jsonb):
--   { "tercero_id": uuid, "tipo_cafe_id": uuid, "fecha": "2026-11-05", "peso_kg": 375, "num_bultos": 6,
--     "pesos_bultos": [62.5, …] | null, "precio_kg": 18500, "factura_proveedor": "FV-1234" | null,
--     "observaciones": null }
-- Salida: { id, codigo, valor_compra }.
-- Errores de negocio (P0001): datos_invalidos, tipo_cafe_invalido, tercero_no_encontrado,
-- tercero_no_es_proveedor, bultos_no_cuadran, serie_no_configurada (del generador). Sin permiso: 42501.
create or replace function cafe.registrar_compra(p jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_tercero  uuid;
  v_tipo     uuid;
  v_fecha    date;
  v_peso     numeric;
  v_n        integer;
  v_precio   numeric;
  v_pesos    numeric[];
  v_elem     jsonb;
  v_x        numeric;
  v_factura  text;
  v_obs      text;
  v_activo   boolean;
  v_roles    text[];
  v_codigo   text;
  v_id       uuid;
  v_valor    numeric;
begin
  -- 1) Permisos: rol operativo en el cliente y módulo de recepción activo.
  if (select public.tenant_actual()) is null
     or (select public.rol_en_tenant()) is null
     or (select public.rol_en_tenant()) not in ('owner', 'admin', 'operativo')
     or not (select public.tenant_tiene_modulo('cafe.recepcion')) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  -- 2) Forma de la entrada (los tipos erróneos no deben acabar como un error inesperado de cast).
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La compra no tiene el formato esperado.';
  end if;

  begin
    v_tercero := (p ->> 'tercero_id')::uuid;
  exception when invalid_text_representation then
    v_tercero := null;
  end;
  if v_tercero is null or jsonb_typeof(p -> 'tercero_id') <> 'string' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Elige el proveedor.';
  end if;

  begin
    v_tipo := (p ->> 'tipo_cafe_id')::uuid;
  exception when invalid_text_representation then
    v_tipo := null;
  end;
  if v_tipo is null or jsonb_typeof(p -> 'tipo_cafe_id') <> 'string' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Elige el tipo de café.';
  end if;

  begin
    v_fecha := (p ->> 'fecha')::date;
  exception when others then
    v_fecha := null;
  end;
  if v_fecha is null or jsonb_typeof(p -> 'fecha') <> 'string' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La fecha de la compra no es válida.';
  end if;

  if jsonb_typeof(p -> 'peso_kg') is distinct from 'number' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Indica el peso total en kilos.';
  end if;
  v_peso := (p ->> 'peso_kg')::numeric;
  if v_peso <= 0 or v_peso >= 10000000 or v_peso <> round(v_peso, 3) then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'El peso debe ser mayor que cero y tener como máximo 3 decimales.';
  end if;

  if jsonb_typeof(p -> 'num_bultos') is distinct from 'number'
     or (p ->> 'num_bultos')::numeric <> trunc((p ->> 'num_bultos')::numeric)
     or (p ->> 'num_bultos')::numeric not between 1 and 200 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'El número de bultos debe ser un entero entre 1 y 200.';
  end if;
  v_n := (p ->> 'num_bultos')::integer;

  if jsonb_typeof(p -> 'precio_kg') is distinct from 'number' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Indica el precio por kilo.';
  end if;
  v_precio := (p ->> 'precio_kg')::numeric;
  if v_precio < 0 or v_precio >= 10000000000 or v_precio <> round(v_precio, 2) then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'El precio por kilo no puede ser negativo y tiene como máximo 2 decimales.';
  end if;

  v_factura := nullif(btrim(p ->> 'factura_proveedor'), '');
  v_obs     := nullif(btrim(p ->> 'observaciones'), '');

  -- 3) Reglas de negocio contra la base (RLS acota todo al cliente actual).
  select t.activo into v_activo from cafe.tipos_cafe t where t.id = v_tipo;
  if not found or not v_activo then
    raise exception using errcode = 'P0001', message = 'tipo_cafe_invalido',
      detail = 'El tipo de café no existe, no es de tu cliente o está inactivo.';
  end if;

  select t.activo, t.roles into v_activo, v_roles from public.terceros t where t.id = v_tercero;
  if not found then
    raise exception using errcode = 'P0001', message = 'tercero_no_encontrado';
  end if;
  if not v_activo or not ('proveedor' = any(v_roles)) then
    raise exception using errcode = 'P0001', message = 'tercero_no_es_proveedor',
      detail = 'El tercero elegido no está activo como proveedor de café.';
  end if;

  -- 4) Pesos por bulto: los enviados (deben ser n y sumar el total) o el reparto en partes iguales.
  if jsonb_typeof(p -> 'pesos_bultos') = 'array' then
    v_pesos := '{}';
    for v_elem in select e from jsonb_array_elements(p -> 'pesos_bultos') e loop
      if jsonb_typeof(v_elem) <> 'number' then
        raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Los pesos por bulto deben ser números.';
      end if;
      v_x := (v_elem #>> '{}')::numeric;
      if v_x <= 0 or v_x >= 10000000 or v_x <> round(v_x, 3) then
        raise exception using errcode = 'P0001', message = 'datos_invalidos',
          detail = 'Cada bulto debe pesar más de cero y tener como máximo 3 decimales.';
      end if;
      v_pesos := v_pesos || v_x;
    end loop;

    if coalesce(cardinality(v_pesos), 0) <> v_n or abs((select sum(x) from unnest(v_pesos) x) - v_peso) > 0.001 then
      raise exception using errcode = 'P0001', message = 'bultos_no_cuadran',
        detail = format('Debe haber %s bultos que sumen %s kg; hay %s que suman %s kg.',
                        v_n, v_peso, coalesce(cardinality(v_pesos), 0), coalesce((select sum(x) from unnest(v_pesos) x), 0));
    end if;
  elsif p -> 'pesos_bultos' is not null and jsonb_typeof(p -> 'pesos_bultos') <> 'null' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Los pesos por bulto deben ser una lista.';
  else
    v_pesos := cafe.repartir_peso(v_peso, v_n);
  end if;

  -- 5) Escrituras. El número se pide lo más tarde posible: si algo de abajo falla, el rollback también
  -- revierte el contador y el consecutivo no se consume.
  v_codigo := public.siguiente_consecutivo('MP', v_fecha);

  insert into cafe.lotes (codigo, linea, tercero_id, tipo_cafe_id, fecha_recepcion, peso_recibido_kg, num_bultos,
                          precio_compra_kg, factura_proveedor, observaciones)
  values (v_codigo, 'marca_propia', v_tercero, v_tipo, v_fecha, v_peso, v_n, v_precio, v_factura, v_obs)
  returning id, valor_compra into v_id, v_valor;

  insert into cafe.lote_bultos (lote_id, numero, peso_kg)
  select v_id, g, v_pesos[g] from generate_series(1, v_n) g;

  return jsonb_build_object('id', v_id, 'codigo', v_codigo, 'valor_compra', v_valor);
end $$;

revoke all on function cafe.registrar_compra(jsonb) from public, anon;
grant execute on function cafe.registrar_compra(jsonb) to authenticated;
