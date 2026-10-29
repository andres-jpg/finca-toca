-- Vertical café: ventas de marca propia y cortesías con lista de precios y nº de factura de Aliados
-- (FIN-112 · CO-31, HU-F1-07).
--
--  1. `cafe.ventas` y `cafe.venta_lineas`: una venta (o cortesía) de café ya empacado con su cliente y una o varias
--     líneas (producto terminado × cantidad × precio). El precio es un SNAPSHOT: cambiar la lista de precios no
--     altera ventas anteriores. Las líneas son inmutables. La venta no emite factura: `requiere_factura` con
--     `numero_factura_aliados` vacío significa «pendiente» y el número se completa después (es lo único editable).
--  2. `cafe.v_ventas` (listado: cliente, nº de líneas, estado y estado de la factura, derivados) y
--     `cafe.v_ventas_factura_pendiente`; `cafe.resumen_ventas()` (totales del periodo filtrado, sin cortesías).
--  3. `cafe.registrar_venta(p jsonb)` y `cafe.anular_venta(id, motivo)`: RPC `SECURITY INVOKER`. Registrar saca el
--     consecutivo `VT`, inserta venta y líneas y mueve el inventario con `public.registrar_movimientos(…, true)`
--     (`venta` o `cortesia`, `ref_tipo = 'cafe.venta'`): AVISA y no bloquea si no hay stock (decisión de la tarea).
--     Anular repone el stock con movimientos `devolucion` (que el trigger del producto terminado deja pasar).
--  4. Lista de precios: son filas de `public.tarifas` con concepto `cafe.precio_<uuid del producto sin guiones>`
--     (`cafe.concepto_precio()`). El CHECK de `tarifas.concepto` solo admite UN punto, así que no puede ser
--     `cafe.precio.<uuid>` como proponía la tarea. `seed_vertical('cafe')` siembra Consumo 500 g = 23.000 y
--     Excelso 500 g = 29.000 (2.500 g sin precio: decisión 8 de CO-20) y la serie `VT`; el backfill hace lo mismo
--     con los clientes de café que ya existían y les activa el módulo `cafe.ventas`.
--  5. RLS (plantilla de FIN-90 + módulo `cafe.ventas`), privilegios y auditoría.
--
-- Solo crea objetos nuevos y redefine `platform.seed_vertical` (idempotente): segura en bases con datos. Las funciones
-- de negocio son SECURITY INVOKER: el RLS de las tablas, de los movimientos y de los terceros sigue aplicando.

-- 1. Tablas ---------------------------------------------------------------------------------------------------------

create type cafe.tipo_venta as enum ('venta', 'cortesia');

create table cafe.ventas (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null default public.tenant_actual() references public.tenants,
  numero                  text not null check (btrim(numero) <> ''),               -- VT-2026-0001
  tipo                    cafe.tipo_venta not null default 'venta',
  fecha                   date not null,
  tercero_id              uuid not null,                                            -- Consumidor final si no se identifica
  -- «Requiere factura» sin número = pendiente (la lista `v_ventas_factura_pendiente`); el número se completa luego.
  requiere_factura        boolean not null default false,
  numero_factura_aliados  text check (numero_factura_aliados is null or btrim(numero_factura_aliados) <> ''),
  total                   numeric(14,2) not null default 0 check (total >= 0),     -- = Σ subtotales (lo exige un trigger)
  observaciones           text check (observaciones is null or btrim(observaciones) <> ''),
  anulada_at              timestamptz,
  anulada_por             uuid references auth.users,
  motivo_anulacion        text check (motivo_anulacion is null or btrim(motivo_anulacion) <> ''),
  created_at              timestamptz not null default now(),
  created_by              uuid default auth.uid() references auth.users,
  updated_at              timestamptz,
  updated_by              uuid references auth.users,
  constraint ventas_numero_uk unique (tenant_id, numero),
  -- Para que las líneas se aten a una venta DEL MISMO cliente (la comprobación de una FK salta el RLS).
  constraint ventas_tenant_id_uk unique (tenant_id, id),
  constraint ventas_tercero_fk foreign key (tenant_id, tercero_id)
    references public.terceros (tenant_id, id) on delete restrict,
  constraint cortesia_sin_valor_ck check (tipo <> 'cortesia' or total = 0),
  -- Una cortesía no se factura, y el número de factura solo existe si la venta la requiere.
  constraint cortesia_sin_factura_ck check (tipo <> 'cortesia' or not requiere_factura),
  constraint factura_requerida_ck check (numero_factura_aliados is null or requiere_factura),
  constraint venta_anulacion_ck check ((anulada_at is null) = (motivo_anulacion is null))
);

create index on cafe.ventas (tenant_id, fecha desc);
create index on cafe.ventas (tenant_id, tercero_id);
-- La lista de «factura pendiente» es pequeña: índice parcial.
create index ventas_factura_pendiente on cafe.ventas (tenant_id, fecha desc)
  where requiere_factura and numero_factura_aliados is null and anulada_at is null;

create table cafe.venta_lineas (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default public.tenant_actual() references public.tenants,
  venta_id         uuid not null,
  articulo_pt_id   uuid not null,                                                   -- producto terminado tipo × presentación
  cantidad         integer not null check (cantidad > 0),
  precio_unitario  numeric(14,2) not null check (precio_unitario >= 0),            -- snapshot; 0 en una cortesía
  subtotal         numeric(14,2) generated always as (cantidad * precio_unitario) stored,
  created_at       timestamptz not null default now(),
  created_by       uuid default auth.uid() references auth.users,
  constraint venta_lineas_producto_uk unique (venta_id, articulo_pt_id),
  constraint venta_lineas_venta_fk foreign key (tenant_id, venta_id)
    references cafe.ventas (tenant_id, id) on delete restrict,
  constraint venta_lineas_articulo_fk foreign key (tenant_id, articulo_pt_id)
    references public.articulos (tenant_id, id) on delete restrict
);

create index on cafe.venta_lineas (tenant_id, venta_id);
create index on cafe.venta_lineas (tenant_id, articulo_pt_id);

create trigger set_updated before update on cafe.ventas
  for each row execute function public.set_updated();

-- 2. Reglas de la venta ------------------------------------------------------------------------------------------------

-- Lo único que cambia de una venta ya guardada es el nº de factura de Aliados y su anulación. Una anulada es
-- definitiva. Anular es de owner/admin (el RLS de UPDATE deja pasar también al operativo, que completa facturas): lo
-- exige este trigger, que vale también para un UPDATE directo. Al anular, la base fija quién y cuándo.
create or replace function cafe.ventas_proteger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.anulada_at       := null;
    new.anulada_por      := null;
    new.motivo_anulacion := null;
    return new;
  end if;

  if old.anulada_at is not null then
    raise exception using errcode = 'P0001', message = 'venta_anulada',
      detail = 'La venta está anulada: ya no se puede modificar.';
  end if;

  if new.anulada_at is not null then
    -- Sin sesión (postgres / service role) no hay rol que comprobar.
    if auth.uid() is not null and coalesce((select public.rol_en_tenant()) not in ('owner', 'admin'), true) then
      raise exception using errcode = '42501', message = 'no_autorizado';
    end if;
    new.anulada_at  := now();
    new.anulada_por := coalesce(auth.uid(), new.anulada_por);
    return new;
  end if;

  if new.numero_factura_aliados is distinct from old.numero_factura_aliados and not new.requiere_factura then
    raise exception using errcode = 'P0001', message = 'factura_no_requerida',
      detail = 'La venta no requiere factura electrónica: no tiene número de Aliados.';
  end if;
  return new;
end $$;

create trigger ventas_proteger before insert or update on cafe.ventas
  for each row execute function cafe.ventas_proteger();

-- El total es siempre Σ subtotales y toda venta tiene al menos una línea. Se comprueba al CIERRE de la transacción
-- (constraint trigger diferido): la venta se inserta antes que sus líneas. Así un INSERT directo con un total falso no
-- pasa, aunque se salte la RPC.
create or replace function cafe.ventas_verificar_total()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_venta uuid;
  v_total numeric;
  v_n     integer;
begin
  if tg_table_name = 'ventas' then
    v_venta := new.id;
  else
    v_venta := new.venta_id;
  end if;
  select coalesce(sum(l.subtotal), 0), count(*) into v_total, v_n from cafe.venta_lineas l where l.venta_id = v_venta;
  if v_n = 0 or v_total is distinct from (select v.total from cafe.ventas v where v.id = v_venta) then
    raise exception using errcode = 'P0001', message = 'venta_total_incoherente',
      detail = 'El total de la venta debe ser la suma de sus líneas, y la venta debe tener al menos una.';
  end if;
  return null;
end $$;

create constraint trigger ventas_verificar_total after insert on cafe.ventas
  deferrable initially deferred for each row execute function cafe.ventas_verificar_total();
create constraint trigger venta_lineas_verificar_total after insert on cafe.venta_lineas
  deferrable initially deferred for each row execute function cafe.ventas_verificar_total();

-- 3. Vistas y resumen -----------------------------------------------------------------------------------------------------
-- Todo derivado, nunca columnas editables. `security_invoker`: el RLS de las tablas filtra por cliente.

create view cafe.v_ventas with (security_invoker = true) as
select
  v.id,
  v.tenant_id,
  v.numero,
  v.tipo,
  v.fecha,
  v.tercero_id,
  t.nombre                                              as tercero_nombre,
  t.identificacion                                      as tercero_identificacion,
  coalesce(t.es_consumidor_final, false)                as es_consumidor_final,
  v.requiere_factura,
  v.numero_factura_aliados,
  v.total,
  v.observaciones,
  v.anulada_at,
  v.anulada_por,
  v.motivo_anulacion,
  v.created_at,
  v.created_by,
  coalesce(l.n_lineas, 0)                               as n_lineas,
  coalesce(l.unidades, 0)                               as unidades,
  case when v.anulada_at is not null then 'anulada' else 'vigente' end                       as estado,
  case when not v.requiere_factura then 'no_requerida'
       when v.numero_factura_aliados is not null then 'emitida'
       else 'pendiente' end                                                                  as factura_estado,
  (v.requiere_factura and v.numero_factura_aliados is null
     and v.anulada_at is null and v.tipo = 'venta')                                          as factura_pendiente
from cafe.ventas v
left join public.terceros t on t.id = v.tercero_id
left join lateral (
  select count(*)::integer as n_lineas, sum(x.cantidad)::integer as unidades
    from cafe.venta_lineas x
   where x.venta_id = v.id
) l on true;

-- Las ventas que dijeron «requiere factura» y aún no tienen el número de Aliados (no anuladas).
create view cafe.v_ventas_factura_pendiente with (security_invoker = true) as
select * from cafe.v_ventas v where v.factura_pendiente;

-- Totales del periodo filtrado (mismos filtros que el listado). Las anuladas nunca suman; las cortesías valen 0 y se
-- cuentan aparte en unidades. `p_tipo` / `p_estado` null = todos.
create or replace function cafe.resumen_ventas(
  p_desde             date    default null,
  p_hasta             date    default null,
  p_tercero           uuid    default null,
  p_tipo              text    default null,
  p_factura_pendiente boolean default false,
  p_estado            text    default null,
  p_q                 text    default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'total_ventas',      coalesce(sum(v.total) filter (where v.tipo = 'venta' and v.anulada_at is null), 0),
    'n_ventas',          count(*) filter (where v.tipo = 'venta' and v.anulada_at is null),
    'n_cortesias',       count(*) filter (where v.tipo = 'cortesia' and v.anulada_at is null),
    'unidades_cortesia', coalesce(sum(v.unidades) filter (where v.tipo = 'cortesia' and v.anulada_at is null), 0),
    'n_anuladas',        count(*) filter (where v.anulada_at is not null),
    'n_factura_pendiente', count(*) filter (where v.factura_pendiente))
  from cafe.v_ventas v
  where (p_desde is null or v.fecha >= p_desde)
    and (p_hasta is null or v.fecha <= p_hasta)
    and (p_tercero is null or v.tercero_id = p_tercero)
    and (p_tipo is null or v.tipo::text = p_tipo)
    and (p_estado is null or v.estado = p_estado)
    and (not coalesce(p_factura_pendiente, false) or v.factura_pendiente)
    and (nullif(btrim(coalesce(p_q, '')), '') is null
         or position(lower(btrim(p_q)) in lower(v.numero)) > 0);
$$;

-- 4. Lista de precios ---------------------------------------------------------------------------------------------------------
-- Concepto de tarifa del precio de venta de un producto terminado: `cafe.precio_` + el uuid sin guiones (32 hex).
-- Debe dar lo mismo que `conceptoPrecio()` en `src/modules/cafe/ventas/lib/precios.ts`.

create or replace function cafe.concepto_precio(p_articulo uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'cafe.precio_' || replace(p_articulo::text, '-', '');
$$;

-- 5. Registrar una venta o cortesía -----------------------------------------------------------------------------------------
-- Entrada (jsonb; todo lo demás se ignora):
--   { "tipo": "venta" | "cortesia", "fecha": "2026-11-08", "tercero_id": uuid,
--     "requiere_factura": false, "numero_factura_aliados": null, "observaciones": null,
--     "lineas": [{ "articulo_id": uuid, "cantidad": 3, "precio_unitario": 23000 }, …] }
--
--   · Permisos y módulo `cafe.ventas`; tercero activo con rol `cliente` (o el Consumidor final); 1 a 50 líneas de
--     productos terminados activos del cliente, sin repetir producto; cantidad entera 1–99.999.
--   · Venta: el precio de cada línea es obligatorio (> 0, máx. 2 decimales). Cortesía: el precio se fuerza a 0 (se
--     ignora el enviado), no lleva factura y el total es 0.
--   · Número `VT-<año>-<n>` al FINAL de las validaciones: si algo falla antes, el rollback no consume número.
--   · Movimientos con `p_permitir_negativo = true`: vender más de lo que hay se registra y vuelve en `advertencias`
--     (avisar, no bloquear). Todo o nada: si algo falla no queda nada escrito.
-- Salida: { id, numero, total, advertencias: [{ articulo_id, articulo, stock_resultante }] }

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
  v_a         jsonb;
  v_adv       jsonb := '[]'::jsonb;
  v_nombre    text;
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

  v_mov := public.registrar_movimientos(v_movs, true);

  -- Las advertencias con el nombre del producto, para que la pantalla no tenga que buscarlo.
  for v_a in select x from jsonb_array_elements(v_mov -> 'advertencias') x loop
    select a.nombre into v_nombre from public.articulos a where a.id = (v_a ->> 'articulo_id')::uuid;
    v_adv := v_adv || jsonb_build_array(v_a || jsonb_build_object('articulo', v_nombre));
  end loop;

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'total', v_total, 'advertencias', v_adv);
end $$;

-- 6. Anular una venta ---------------------------------------------------------------------------------------------------------
-- Solo `owner`/`admin`, con motivo. Marca la venta anulada (el trigger fija quién y cuándo) y repone el stock con un
-- movimiento `devolucion` por línea (`ref_tipo = 'cafe.venta'`, que el trigger del producto terminado admite). El
-- número no se reutiliza. Devuelve { id, numero, stocks }.

create or replace function cafe.anular_venta(p_venta uuid, p_motivo text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_v      cafe.ventas%rowtype;
  v_movs   jsonb;
  v_mov    jsonb;
begin
  if not coalesce((select public.rol_en_tenant()) in ('owner', 'admin'), false)
     or not coalesce((select public.tenant_tiene_modulo('cafe.ventas')), false) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Indica el motivo de la anulación.';
  end if;
  if char_length(btrim(p_motivo)) > 500 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El motivo admite hasta 500 caracteres.';
  end if;

  select * into v_v from cafe.ventas v where v.id = p_venta;
  if not found then
    raise exception using errcode = 'P0001', message = 'venta_no_encontrada',
      detail = 'La venta no existe o no pertenece a tu cliente.';
  end if;

  -- Dos anulaciones a la vez no deben reponer el stock dos veces.
  perform pg_advisory_xact_lock(hashtextextended('cafe.venta:' || p_venta::text, 0));
  select v.anulada_at into v_v.anulada_at from cafe.ventas v where v.id = p_venta;
  if v_v.anulada_at is not null then
    raise exception using errcode = 'P0001', message = 'venta_anulada', detail = 'La venta ya está anulada.';
  end if;

  update cafe.ventas set anulada_at = now(), motivo_anulacion = btrim(p_motivo) where id = p_venta;

  select jsonb_agg(jsonb_build_object(
           'articulo_id', l.articulo_pt_id,
           'cantidad', l.cantidad,
           'motivo', 'devolucion',
           'ref_tipo', 'cafe.venta',
           'ref_id', p_venta,
           'observaciones', 'Anulación ' || v_v.numero) order by l.created_at, l.id)
    into v_movs
    from cafe.venta_lineas l
   where l.venta_id = p_venta;

  v_mov := public.registrar_movimientos(v_movs, false);

  return jsonb_build_object('id', v_v.id, 'numero', v_v.numero, 'stocks', v_mov -> 'stocks');
end $$;

-- 7. Privilegios, RLS y auditoría ------------------------------------------------------------------------------------------------

revoke all on function cafe.registrar_venta(jsonb) from public, anon;
grant execute on function cafe.registrar_venta(jsonb) to authenticated;
revoke all on function cafe.anular_venta(uuid, text) from public, anon;
grant execute on function cafe.anular_venta(uuid, text) to authenticated;
revoke all on function cafe.resumen_ventas(date, date, uuid, text, boolean, text, text) from public, anon;
grant execute on function cafe.resumen_ventas(date, date, uuid, text, boolean, text, text) to authenticated;
revoke all on function cafe.concepto_precio(uuid) from public, anon;
grant execute on function cafe.concepto_precio(uuid) to authenticated, service_role;
revoke all on function cafe.ventas_proteger() from public, anon, authenticated;
revoke all on function cafe.ventas_verificar_total() from public, anon, authenticated;

alter table cafe.ventas enable row level security;
alter table cafe.venta_lineas enable row level security;

-- El módulo `cafe.ventas` se exige en todas las políticas. Lectura: cualquier miembro. INSERT: owner, admin y operativo
-- (lo usa la RPC SECURITY INVOKER). UPDATE (nº de factura y anulación): owner, admin y operativo; que solo
-- owner/admin anulen lo exige el trigger `ventas_proteger`. DELETE: nadie. Las líneas no se modifican ni se borran.
create policy ventas_select on cafe.ventas for select to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.ventas')));

create policy ventas_insert on cafe.ventas for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.ventas'))
              and (select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'));

create policy ventas_update on cafe.ventas for update to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.ventas'))
         and (select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'))
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.ventas'))
              and (select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'));

create policy venta_lineas_select on cafe.venta_lineas for select to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.ventas')));

create policy venta_lineas_insert on cafe.venta_lineas for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.ventas'))
              and (select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'));

-- Los privilegios por defecto del schema `cafe` dan también DELETE: se quitan y se da solo lo necesario. De una venta
-- solo se completa el nº de factura o se anula; lo calculado (subtotal) y quién/cuándo anula no se insertan.
revoke all on table cafe.ventas from public, anon, authenticated, service_role;
grant select on table cafe.ventas to authenticated;
grant insert (tenant_id, numero, tipo, fecha, tercero_id, requiere_factura, numero_factura_aliados, total, observaciones)
  on table cafe.ventas to authenticated;
grant update (numero_factura_aliados, anulada_at, motivo_anulacion) on table cafe.ventas to authenticated;
grant select, insert, update on table cafe.ventas to service_role;

revoke all on table cafe.venta_lineas from public, anon, authenticated, service_role;
grant select on table cafe.venta_lineas to authenticated, service_role;
grant insert (tenant_id, venta_id, articulo_pt_id, cantidad, precio_unitario) on table cafe.venta_lineas to authenticated;
grant insert on table cafe.venta_lineas to service_role;

grant select on cafe.v_ventas, cafe.v_ventas_factura_pendiente to authenticated, service_role;

select audit.activar('cafe.ventas');
select audit.activar('cafe.venta_lineas');

-- 8. seed_vertical ---------------------------------------------------------------------------------------------------------
-- Misma función que en `20261101100000_cafe_tipos.sql`; solo cambia el final de la rama `cafe`: la serie `VT` y los
-- precios iniciales de 500 g (Consumo 23.000 y Excelso 29.000; 2.500 g sin precio hasta que Cofradía lo dé,
-- decisión 8 de CO-20). Conserva sus privilegios: `create or replace`.

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

    -- Series de consecutivos (CO-15; `VT` = ventas y cortesías, CO-31).
    insert into public.series_consecutivo (tenant_id, serie, descripcion)
    values
      (p_tenant, 'MP',  'Lotes marca propia'),
      (p_tenant, 'MQ',  'Lotes de servicio (trilla/maquila)'),
      (p_tenant, 'REM', 'Remisiones de entrega'),
      (p_tenant, 'VT',  'Ventas y cortesías')
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

    -- Lista de precios de venta (CO-31): Consumo 500 g y Excelso 500 g. NOT EXISTS por concepto: no pisa un precio
    -- que el cliente ya fijó ni añade otra versión en una segunda ejecución.
    insert into public.tarifas (tenant_id, concepto, valor, unidad, vigente_desde, observaciones)
    select p_tenant, cafe.concepto_precio(a.id), pr.valor, 'unidad', now(), 'Precio inicial del alta'
      from public.articulos a
      join cafe.tipos_cafe tc on tc.tenant_id = a.tenant_id and tc.id = (a.atributos ->> 'tipo_cafe_id')::uuid
      join (values ('consumo', 23000), ('excelso', 29000)) as pr(tipo, valor) on lower(tc.nombre) = pr.tipo
     where a.tenant_id = p_tenant
       and a.tipo = 'producto_terminado'
       and (a.atributos ->> 'presentacion_g') = '500'
       and not exists (
             select 1 from public.tarifas x where x.tenant_id = p_tenant and x.concepto = cafe.concepto_precio(a.id));

  end if;
  -- cooperativa: nada todavía (Fase 2).
end;
$$;

-- 9. Backfill ---------------------------------------------------------------------------------------------------------------
-- Clientes de café que ya existían (p. ej. «Cofradía (demo)» en staging): serie `VT`, precios de 500 g y el módulo
-- `cafe.ventas` (que no es base: se activa por cliente). Idempotente; corre como dueño, con `tenant_id` explícito.
-- Un cliente que ya tuviera el módulo desactivado (`activo = false`) conserva esa decisión.

insert into public.series_consecutivo (tenant_id, serie, descripcion)
select t.id, 'VT', 'Ventas y cortesías'
  from public.tenants t
 where t.vertical = 'cafe'
on conflict (tenant_id, serie) do nothing;

insert into public.tarifas (tenant_id, concepto, valor, unidad, vigente_desde, observaciones)
select a.tenant_id, cafe.concepto_precio(a.id), pr.valor, 'unidad', now(), 'Precio inicial'
  from public.articulos a
  join public.tenants t on t.id = a.tenant_id and t.vertical = 'cafe'
  join cafe.tipos_cafe tc on tc.tenant_id = a.tenant_id and tc.id = (a.atributos ->> 'tipo_cafe_id')::uuid
  join (values ('consumo', 23000), ('excelso', 29000)) as pr(tipo, valor) on lower(tc.nombre) = pr.tipo
 where a.tipo = 'producto_terminado'
   and (a.atributos ->> 'presentacion_g') = '500'
   and not exists (
         select 1 from public.tarifas x where x.tenant_id = a.tenant_id and x.concepto = cafe.concepto_precio(a.id));

insert into public.tenant_modulos (tenant_id, modulo_id)
select t.id, 'cafe.ventas'
  from public.tenants t
 where t.vertical = 'cafe'
on conflict (tenant_id, modulo_id) do nothing;
