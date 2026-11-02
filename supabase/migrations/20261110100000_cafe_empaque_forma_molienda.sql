-- Vertical café: bolsas de terceros de peso libre y presentaciones de marca propia en grano o molido (FIN-120 · A-02).
--
--   1. `cafe.empaque_lineas.forma` ('grano' | 'molido', por defecto 'grano'): el inventario de marca propia se lleva
--      por calidad × presentación × forma. La unicidad de la línea pasa a (proceso, presentación, forma).
--   2. Servicios a terceros: toda línea de empaque es bolsa del cliente (`bolsa_cliente = true`, nunca descuenta
--      insumos) y de forma grano; el peso de la bolsa es libre (gramos enteros).
--   3. Productos terminados molidos: mismos `atributos` que el grano más `"forma": "molido"` y nombre «<Tipo> <presentación>
--      molido». Los de grano NO cambian (sin `forma`, nombre «<Tipo> <presentación>»). Los molidos se crean al empacar
--      el primero (`cafe._asegurar_producto_molido`), no con `asegurar_productos_terminados`, para no alterar el
--      conteo de productos de los clientes existentes.
--   4. `cafe.registrar_empaque`: líneas con `forma` y, en marca propia, bloque opcional `molienda`
--      `{peso_entrada_kg, peso_salida_kg}` que crea el proceso de molienda del lote en la misma transacción y sigue con el
--      empaque. La molienda procesa `peso_entrada_kg` de lo que llega; lo que no se muele (el grano) sigue llegando
--      a empaque: entrada del empaque = (llega − molido) + salida de la molienda. Las líneas molidas no pueden pasar de lo
--      molido ni las de grano de lo no molido. Un molido sin ese bloque exige que los bultos ya hayan pasado por la
--      molienda (`molienda_requerida`).
--   5. `cafe.v_saldo_reabrible` solo cuenta líneas de grano (reabrir paquetes molidos no tiene sentido).
--
-- Reversión (a mano): restaurar `registrar_empaque` y `v_saldo_reabrible` de 20261109120000 / 20261107110000; borrar las
-- líneas con forma 'molido' (o pasarlas a 'grano'); `drop function cafe._asegurar_producto_molido(uuid, numeric)`;
-- `alter table cafe.empaque_lineas drop constraint empaque_lineas_presentacion_forma_uk, add constraint
-- empaque_lineas_presentacion_uk unique (proceso_id, presentacion_g), drop column forma;` y restaurar
-- `cafe.tipos_cafe_sincronizar_productos` de 20261101100000.

-- 1. Forma de la línea -------------------------------------------------------------------------------------------------

alter table cafe.empaque_lineas
  add column forma text not null default 'grano',
  add constraint empaque_lineas_forma_ck check (forma in ('grano', 'molido')),
  drop constraint empaque_lineas_presentacion_uk,
  add constraint empaque_lineas_presentacion_forma_uk unique (proceso_id, presentacion_g, forma);

grant insert (forma) on table cafe.empaque_lineas to authenticated;

-- 2. Productos terminados molidos -------------------------------------------------------------------------------------------
-- SECURITY DEFINER acotado (como `siguiente_consecutivo`): un operativo registra empaques pero no puede insertar
-- artículos. Comprueba por sí misma cliente actual, rol, módulo, que el tipo sea del cliente y que exista una bolsa
-- activa de esa presentación; el tenant nunca viene por parámetro. Idempotente.
create or replace function cafe._asegurar_producto_molido(p_tipo_cafe uuid, p_presentacion_g numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := public.tenant_actual();
  v_tipo   record;
  v_id     uuid;
begin
  if v_tenant is null
     or not coalesce(public.rol_en_tenant() in ('owner', 'admin', 'operativo'), false)
     or not coalesce(public.tenant_tiene_modulo('cafe.inventario'), false) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  select t.id, t.nombre into v_tipo from cafe.tipos_cafe t where t.id = p_tipo_cafe and t.tenant_id = v_tenant;
  if v_tipo.id is null or p_presentacion_g is null or p_presentacion_g <= 0
     or not exists (select 1 from public.articulos a
                     where a.tenant_id = v_tenant and a.tipo = 'insumo' and a.activo
                       and a.atributos ->> 'clase' = 'bolsa'
                       and jsonb_typeof(a.atributos -> 'presentacion_g') = 'number'
                       and (a.atributos ->> 'presentacion_g')::numeric = p_presentacion_g) then
    raise exception using errcode = 'P0001', message = 'producto_no_configurado',
      detail = 'No se puede crear el producto molido: el tipo de café o la bolsa de esa presentación no existen.';
  end if;

  insert into public.articulos (tenant_id, nombre, tipo, unidad, atributos)
  values (v_tenant, v_tipo.nombre || ' ' || cafe.etiqueta_presentacion(p_presentacion_g) || ' molido',
          'producto_terminado', 'unidad',
          jsonb_build_object('tipo_cafe_id', v_tipo.id, 'presentacion_g', p_presentacion_g, 'forma', 'molido'))
  on conflict do nothing;

  select a.id into v_id from public.articulos a
   where a.tenant_id = v_tenant and a.tipo = 'producto_terminado'
     and a.atributos = jsonb_build_object('tipo_cafe_id', v_tipo.id, 'presentacion_g', p_presentacion_g, 'forma', 'molido');
  return v_id;
end $$;

revoke all on function cafe._asegurar_producto_molido(uuid, numeric) from public, anon;
grant execute on function cafe._asegurar_producto_molido(uuid, numeric) to authenticated;

-- Si el tipo cambia de nombre, los productos siguen su nombre (el molido lleva el sufijo).
create or replace function cafe.tipos_cafe_sincronizar_productos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.nombre is distinct from old.nombre then
    update public.articulos a
       set nombre = new.nombre || ' ' || cafe.etiqueta_presentacion((a.atributos ->> 'presentacion_g')::numeric)
                    || case when a.atributos ->> 'forma' = 'molido' then ' molido' else '' end
     where a.tenant_id = new.tenant_id
       and a.tipo = 'producto_terminado'
       and a.atributos ->> 'tipo_cafe_id' = new.id::text;
  end if;

  if new.activo then
    perform cafe.asegurar_productos_terminados(new.tenant_id);
  end if;
  return new;
end $$;

-- 3. Saldo reabrible: solo grano -----------------------------------------------------------------------------------------------

create or replace view cafe.v_saldo_reabrible with (security_invoker = true) as
select
  e.tenant_id,
  e.lote_id,
  e.presentacion_g,
  e.articulo_pt_id,
  e.unidades_empacadas,
  coalesce(r.unidades, 0)::integer                           as unidades_reabiertas,
  (e.unidades_empacadas - coalesce(r.unidades, 0))::integer  as saldo
from (
  select
    p.tenant_id, p.lote_id, el.presentacion_g,
    (array_agg(el.articulo_pt_id order by p.created_at desc))[1] as articulo_pt_id,
    sum(el.unidades)::integer                                    as unidades_empacadas
  from cafe.empaque_lineas el
  join cafe.procesos p on p.id = el.proceso_id and p.anulado_at is null
  where el.forma = 'grano'
  group by p.tenant_id, p.lote_id, el.presentacion_g
) e
left join (
  select r.tenant_id, r.lote_id, r.presentacion_g, sum(r.unidades) as unidades
    from cafe.reaperturas r
   group by r.tenant_id, r.lote_id, r.presentacion_g
) r on r.tenant_id = e.tenant_id and r.lote_id = e.lote_id and r.presentacion_g = e.presentacion_g;

-- 4. Registrar un empaque ------------------------------------------------------------------------------------------------------
-- Entrada (jsonb): como antes, más
--   lineas[].forma: 'grano' (por defecto) | 'molido' (solo marca propia)
--   "molienda": { "peso_entrada_kg": 22, "peso_salida_kg": 20.5 }  (solo marca propia, con líneas molidas)
-- Servicios a terceros: toda línea es bolsa del cliente (no mueve inventario). Salida: la de antes + `molienda`
-- ({proceso_id, merma_kg, merma_pct, peso_entrada_kg, peso_salida_kg} o null) y `forma` en cada línea.

create or replace function cafe.registrar_empaque(p jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_lote_id   uuid;
  v_fecha     date;
  v_bultos    uuid[];
  v_entrada   numeric;
  v_obs       text;
  v_lineas    jsonb;
  v_reap      uuid;
  v_reap_lote uuid;
  v_lote      cafe.lotes;
  v_elem      jsonb;
  v_g         numeric;
  v_u         numeric;
  v_bolsa     record;
  v_etiq      record;
  v_pt        record;
  v_res       jsonb;
  v_salida    numeric := 0;
  v_disp      numeric;
  v_msg       text;
  v_det       text;
  v_proc      uuid;
  v_movs      jsonb := '[]';
  v_fecha_mov timestamptz;
  v_det_lin   jsonb := '[]';
  v_mov       jsonb;
  v_adv       jsonb := '[]';
  v_a         jsonb;
  v_nombre    text;
  v_destino   text;
  v_mp        boolean;
  v_forma     text;
  v_claves    text[] := '{}';
  v_mol       jsonb;
  v_mol_e     numeric;
  v_mol_s     numeric;
  v_mol_res   jsonb;
  v_bs        uuid[];
  v_disp0     numeric;
  v_ent_emp   numeric;
  v_grano_kg  numeric := 0;
  v_molido_kg numeric := 0;
  v_hay_molido boolean := false;
  v_p         cafe.procesos;
  v_est       record;
begin
  -- Permisos antes que nada: un viewer recibe 42501 aunque mande un formato erróneo. El empaque escribe un
  -- proceso (módulo de procesos) y mueve inventario (módulo de inventario).
  if not coalesce((select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'), false)
     or not coalesce((select public.tenant_tiene_modulo('cafe.procesos')), false)
     or not coalesce((select public.tenant_tiene_modulo('cafe.inventario')), false) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El empaque no tiene el formato esperado.';
  end if;

  -- Los tipos erróneos no deben acabar como un error inesperado de cast.
  begin
    if jsonb_typeof(p -> 'lote_id') is distinct from 'string'
       or jsonb_typeof(p -> 'fecha') is distinct from 'string'
       or jsonb_typeof(p -> 'lineas') is distinct from 'array' then
      raise exception using errcode = '22023';
    end if;
    v_lote_id := (p ->> 'lote_id')::uuid;
    v_fecha   := (p ->> 'fecha')::date;
    v_lineas  := p -> 'lineas';

    if jsonb_typeof(p -> 'peso_entrada_kg') = 'number' then
      v_entrada := (p ->> 'peso_entrada_kg')::numeric;
    elsif p ? 'peso_entrada_kg' and jsonb_typeof(p -> 'peso_entrada_kg') <> 'null' then
      raise exception using errcode = '22023';
    end if;

    if jsonb_typeof(p -> 'bultos') = 'array' then
      if exists (select 1 from jsonb_array_elements(p -> 'bultos') e where jsonb_typeof(e) <> 'string') then
        raise exception using errcode = '22023';
      end if;
      v_bultos := array(select (e #>> '{}')::uuid from jsonb_array_elements(p -> 'bultos') e);
    elsif p ? 'bultos' and jsonb_typeof(p -> 'bultos') <> 'null' then
      raise exception using errcode = '22023';
    end if;

    if jsonb_typeof(p -> 'observaciones') = 'string' then
      v_obs := nullif(btrim(p ->> 'observaciones'), '');
    elsif p ? 'observaciones' and jsonb_typeof(p -> 'observaciones') <> 'null' then
      raise exception using errcode = '22023';
    end if;

    if jsonb_typeof(p -> 'reapertura_id') = 'string' then
      v_reap := (p ->> 'reapertura_id')::uuid;
    elsif p ? 'reapertura_id' and jsonb_typeof(p -> 'reapertura_id') <> 'null' then
      raise exception using errcode = '22023';
    end if;

    if jsonb_typeof(p -> 'diferencia_destino') = 'string' then
      v_destino := p ->> 'diferencia_destino';
    elsif p ? 'diferencia_destino' and jsonb_typeof(p -> 'diferencia_destino') <> 'null' then
      raise exception using errcode = '22023';
    end if;

    if jsonb_typeof(p -> 'molienda') = 'object' then
      v_mol := p -> 'molienda';
      if jsonb_typeof(v_mol -> 'peso_entrada_kg') is distinct from 'number'
         or jsonb_typeof(v_mol -> 'peso_salida_kg') is distinct from 'number' then
        raise exception using errcode = '22023';
      end if;
      v_mol_e := (v_mol ->> 'peso_entrada_kg')::numeric;
      v_mol_s := (v_mol ->> 'peso_salida_kg')::numeric;
    elsif p ? 'molienda' and jsonb_typeof(p -> 'molienda') <> 'null' then
      raise exception using errcode = '22023';
    end if;
  exception when others then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El empaque no tiene el formato esperado.';
  end;

  -- Presentaciones: de 1 a 20, enteros positivos y sin repetir.
  if jsonb_array_length(v_lineas) not between 1 and 20 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'Indica cuántas unidades empacaste de al menos una presentación.';
  end if;
  for v_elem in select e from jsonb_array_elements(v_lineas) e loop
    if jsonb_typeof(v_elem) <> 'object'
       or jsonb_typeof(v_elem -> 'presentacion_g') is distinct from 'number'
       or jsonb_typeof(v_elem -> 'unidades') is distinct from 'number' then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'Cada presentación necesita su peso (g) y sus unidades.';
    end if;
    v_g := (v_elem ->> 'presentacion_g')::numeric;
    v_u := (v_elem ->> 'unidades')::numeric;
    if v_g <> trunc(v_g) or v_g < 1 or v_g > 99999 or v_u <> trunc(v_u) or v_u < 1 or v_u > 99999 then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'La presentación y las unidades son números enteros mayores que cero.';
    end if;
    v_forma := coalesce(nullif(v_elem ->> 'forma', ''), 'grano');
    if jsonb_typeof(v_elem -> 'forma') not in ('string', 'null') and v_elem ? 'forma' then
      v_forma := 'invalida';
    end if;
    if v_forma not in ('grano', 'molido') then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'La forma del café es grano o molido.';
    end if;
    if (v_g::integer)::text || ':' || v_forma = any(v_claves) then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = format('La presentación de %s g (%s) está repetida.', v_g::integer, v_forma);
    end if;
    if v_elem ? 'bolsa_cliente' and jsonb_typeof(v_elem -> 'bolsa_cliente') not in ('boolean', 'null') then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'Indica si la bolsa es del cliente con sí o no.';
    end if;
    v_claves := v_claves || ((v_g::integer)::text || ':' || v_forma);
    if v_forma = 'molido' then
      v_hay_molido := true;
      v_molido_kg := v_molido_kg + v_u * v_g / 1000;
    else
      v_grano_kg := v_grano_kg + v_u * v_g / 1000;
    end if;
    v_salida := v_salida + v_u * v_g / 1000;
  end loop;

  -- El lote: de marca propia. (El de servicio se empaca con `registrar_proceso`, sin insumos.)
  select * into v_lote from cafe.lotes l where l.id = v_lote_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'lote_no_encontrado',
      detail = 'El lote no existe o no pertenece a tu cliente.';
  end if;
  if v_lote.anulado_at is not null then
    raise exception using errcode = 'P0001', message = 'lote_anulado',
      detail = 'El lote está anulado: ya no se puede modificar.';
  end if;
  -- Marca propia: mueve inventario (bolsas, etiquetas, producto terminado). Servicios a terceros: solo registra las
  -- líneas (tamaño × cantidad), sin inventario propio.
  v_mp := v_lote.linea = 'marca_propia';

  -- Molido y molienda son de marca propia: en servicios a terceros la bolsa es del cliente y la molienda es un proceso aparte.
  if not v_mp and (v_hay_molido or v_mol is not null) then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'El café molido y la molienda de este bloque son de marca propia.';
  end if;
  if v_mol is not null and not v_hay_molido then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'La molienda se registra junto con líneas de café molido.';
  end if;

  -- Lo que sobra de lo que llega a empaque (la diferencia NO es merma): muestra y pérdida en las dos líneas; «queda a
  -- granel» solo en marca propia y «se entrega suelto al cliente» solo en servicios.
  if v_destino is not null
     and not (v_destino in ('muestra', 'perdida') or (v_mp and v_destino = 'granel') or (not v_mp and v_destino = 'suelto')) then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'Ese destino de la diferencia no aplica a este lote.';
  end if;

  -- Empaque de un café reabierto: es de ESTE lote y no lleva bultos.
  if v_reap is not null then
    if not v_mp then
      raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Solo se reabre café de marca propia.';
    end if;
    if coalesce(cardinality(v_bultos), 0) > 0 then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'Un empaque de reapertura no lleva bultos: empaca el café reabierto.';
    end if;
    if v_mol is not null then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'La molienda de un café reabierto se registra en la reapertura.';
    end if;
    select r.lote_id into v_reap_lote from cafe.reaperturas r where r.id = v_reap;
    if not found then
      raise exception using errcode = 'P0001', message = 'reapertura_no_encontrada',
        detail = 'La reapertura no existe o no pertenece a tu cliente.';
    end if;
    if v_reap_lote <> v_lote_id then
      raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La reapertura no es de este lote.';
    end if;
  end if;

  -- Bolsa, etiqueta y producto terminado de cada presentación, ANTES de escribir nada. Se resuelven aquí (y no
  -- dentro del bucle de escritura) para que un insumo sin configurar falle sin tocar el proceso.
  for v_elem in select e from jsonb_array_elements(v_lineas) e loop
    v_g := (v_elem ->> 'presentacion_g')::numeric;

    if not v_mp then
      v_det_lin := v_det_lin || jsonb_build_object(
        'presentacion_g', v_g::integer, 'unidades', (v_elem ->> 'unidades')::integer,
        'kg', (v_elem ->> 'unidades')::numeric * v_g / 1000, 'producto_id', null, 'producto', null,
        'forma', 'grano', 'bolsa_cliente', true);
      continue;
    end if;

    select a.id, a.nombre into v_bolsa
      from public.articulos a
     where a.tenant_id = v_lote.tenant_id and a.tipo = 'insumo' and a.activo
       and a.atributos ->> 'clase' = 'bolsa'
       and jsonb_typeof(a.atributos -> 'presentacion_g') = 'number'
       and (a.atributos ->> 'presentacion_g')::numeric = v_g
     order by a.created_at, a.id limit 1;
    select a.id, a.nombre into v_etiq
      from public.articulos a
     where a.tenant_id = v_lote.tenant_id and a.tipo = 'insumo' and a.activo
       and a.atributos ->> 'clase' = 'etiqueta'
       and jsonb_typeof(a.atributos -> 'presentacion_g') = 'number'
       and (a.atributos ->> 'presentacion_g')::numeric = v_g
     order by a.created_at, a.id limit 1;
    if v_bolsa.id is null or v_etiq.id is null then
      raise exception using errcode = 'P0001', message = 'insumo_no_configurado',
        detail = format('Falta %s activa de %s en el inventario de insumos.',
                        case when v_bolsa.id is null and v_etiq.id is null then 'la bolsa y la etiqueta'
                             when v_bolsa.id is null then 'la bolsa' else 'la etiqueta' end,
                        cafe.etiqueta_presentacion(v_g));
    end if;

    v_forma := coalesce(nullif(v_elem ->> 'forma', ''), 'grano');
    v_pt := null;
    for i in 1..2 loop
      select a.id, a.nombre into v_pt
        from public.articulos a
       where a.tenant_id = v_lote.tenant_id and a.tipo = 'producto_terminado' and a.activo
         and a.atributos ->> 'tipo_cafe_id' = v_lote.tipo_cafe_id::text
         and jsonb_typeof(a.atributos -> 'presentacion_g') = 'number'
         and (a.atributos ->> 'presentacion_g')::numeric = v_g
         and coalesce(a.atributos ->> 'forma', 'grano') = v_forma
       order by a.created_at, a.id limit 1;
      exit when v_pt.id is not null or i = 2;
      if v_forma = 'molido' then
        perform cafe._asegurar_producto_molido(v_lote.tipo_cafe_id, v_g);
        continue;
      end if;
      -- Lo normal es que ya exista (lo crean los triggers de CO-21); si no, se intenta crearlo (solo owner/admin
      -- pueden insertar artículos: para un operativo el intento no hace nada).
      perform cafe.asegurar_productos_terminados(v_lote.tenant_id);
    end loop;
    if v_pt.id is null then
      raise exception using errcode = 'P0001', message = 'producto_no_configurado',
        detail = format('No hay un producto terminado activo para este tipo de café en %s. Pide a un administrador que lo revise.',
                        cafe.etiqueta_presentacion(v_g));
    end if;

    v_u := (v_elem ->> 'unidades')::numeric;
    v_det_lin := v_det_lin || jsonb_build_object(
      'presentacion_g', v_g::integer, 'unidades', v_u::integer, 'kg', v_u * v_g / 1000, 'forma', v_forma,
      'producto_id', v_pt.id, 'producto', v_pt.nombre,
      'bolsa_id', v_bolsa.id, 'bolsa', v_bolsa.nombre, 'etiqueta_id', v_etiq.id, 'etiqueta', v_etiq.nombre);
  end loop;

  -- El proceso: toda la lógica de pasos, bultos y pesos vive en `_insertar_proceso` (o, con reapertura, en
  -- `_insertar_proceso_reapertura`). Una salida mayor que la entrada es, para el empaque, `empaque_supera_peso`
  -- (no se puede empacar más café del que hay).
  begin
    if v_mol is not null then
      -- Molienda en el mismo paso: se registra primero (misma transacción) y el empaque recibe lo que NO se molió
      -- más lo que salió de la molienda.
      v_bs := array(select distinct x from unnest(v_bultos) x where x is not null);
      if cardinality(v_bs) = 0 then
        if v_lote.num_bultos = 1 then
          v_bs := array(select b.id from cafe.lote_bultos b where b.lote_id = v_lote_id);
        else
          raise exception using errcode = 'P0001', message = 'bulto_invalido', detail = 'Elige los bultos que se muelen y se empacan.';
        end if;
      end if;
      v_disp0 := cafe.peso_disponible(v_lote_id, 'molienda', v_bs);
      if v_disp0 is null then
        raise exception using errcode = 'P0001', message = 'orden_proceso_invalido',
          detail = 'Primero registra la tostión de estos bultos: la molienda parte del café tostado.';
      end if;
      v_mol_res := cafe._insertar_proceso(v_lote_id, 'molienda', v_fecha, v_bs, v_mol_e, v_mol_s, null, null, null);
      v_ent_emp := round(v_disp0 - v_mol_e + v_mol_s, 3);
      if v_molido_kg > v_mol_s + 0.0005 or v_grano_kg > greatest(v_disp0 - v_mol_e, 0) + v_disp0 * 0.005 then
        raise exception using errcode = 'P0001', message = 'empaque_supera_peso',
          detail = format('El molido suma %s kg y la molienda dio %s kg; el grano suma %s kg y quedan %s kg sin moler.',
                          trim_scale(v_molido_kg), trim_scale(v_mol_s), trim_scale(v_grano_kg),
                          trim_scale(greatest(v_disp0 - v_mol_e, 0)));
      end if;
      if v_salida > v_ent_emp + 0.0005 then
        raise exception using errcode = 'P0001', message = 'empaque_supera_peso',
          detail = format('Las bolsas suman %s kg y a empaque solo llegan %s kg.', trim_scale(v_salida), trim_scale(v_ent_emp));
      end if;
      insert into cafe.procesos (lote_id, tipo, fecha, peso_entrada_kg, peso_salida_kg, tarifa_kg,
                                 merma_referencia_pct, tolerancia_pts, observaciones, diferencia_destino)
      values (v_lote_id, 'empaque', v_fecha, v_ent_emp, v_salida, 0, null,
              cafe.parametro_numero('cafe.merma_tolerancia_pts', 2), v_obs,
              case when v_ent_emp > v_salida then v_destino end)
      returning * into v_p;
      insert into cafe.proceso_bultos (proceso_id, bulto_id, tipo, lote_id)
      select v_p.id, b, 'empaque', v_lote_id from unnest(v_bs) b;
      select v.estado, v.avance_texto into v_est from cafe.v_lotes v where v.id = v_lote_id;
      v_res := jsonb_build_object('id', v_p.id, 'merma_kg', v_p.merma_kg, 'merma_pct', v_p.merma_pct,
                                  'peso_entrada_kg', v_p.peso_entrada_kg, 'peso_salida_kg', v_p.peso_salida_kg,
                                  'lote_estado', v_est.estado, 'avance_texto', v_est.avance_texto);
    elsif v_hay_molido and v_reap is null and exists (
            select 1 from unnest(coalesce(nullif(v_bultos, '{}'), array(select b.id from cafe.lote_bultos b where b.lote_id = v_lote_id))) x
             where not exists (select 1 from cafe.proceso_bultos pb where pb.bulto_id = x and pb.tipo = 'molienda')) then
      raise exception using errcode = 'P0001', message = 'molienda_requerida',
        detail = 'El café molido necesita la molienda: registra cuánto entró y cuánto salió, o muele primero estos bultos.';
    elsif v_hay_molido and v_reap is not null and not exists (
            select 1 from cafe.procesos pm where pm.reapertura_id = v_reap and pm.tipo = 'molienda' and pm.anulado_at is null) then
      raise exception using errcode = 'P0001', message = 'molienda_requerida',
        detail = 'El café molido necesita la molienda de la reapertura: regístrala antes de empacar.';
    elsif v_reap is null then
      v_res := cafe._insertar_proceso(v_lote_id, 'empaque', v_fecha, v_bultos, v_entrada, v_salida, null, null, v_obs, v_destino);
    else
      v_res := cafe._insertar_proceso_reapertura(v_reap, 'empaque', v_fecha, v_entrada, v_salida, v_obs, v_destino);
    end if;
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
    if v_msg = 'salida_supera_entrada' then
      v_disp := coalesce(v_entrada,
                  case when v_reap is null
                       then cafe.peso_disponible(v_lote_id, 'empaque',
                              coalesce(v_bultos, array(select b.id from cafe.lote_bultos b where b.lote_id = v_lote_id)))
                       else cafe.peso_disponible_reapertura(v_reap, 'empaque') end);
      raise exception using errcode = 'P0001', message = 'empaque_supera_peso',
        detail = format('Las bolsas suman %s kg y a empaque solo llegan %s kg (%s)%s.',
                        trim_scale(v_salida), trim_scale(v_disp),
                        case when v_reap is null then 'los bultos elegidos' else 'el café reabierto' end,
                        '');
    end if;
    raise exception using errcode = 'P0001', message = v_msg, detail = v_det;
  end;
  v_proc := (v_res ->> 'id')::uuid;

  -- Si sobró café hay que decir adónde fue: la diferencia nunca desaparece sin explicación. Todo es una sola
  -- transacción: al lanzar aquí no queda el proceso escrito.
  if (v_res ->> 'merma_kg')::numeric > 0 and v_destino is null then
    raise exception using errcode = 'P0001', message = 'diferencia_sin_destino',
      detail = 'Sobra café de lo que llega a empaque: indica si se entrega suelto, queda a granel, es muestra o es pérdida.';
  end if;

  -- Las líneas van ANTES de los movimientos: el trigger de producto terminado comprueba que existan.
  insert into cafe.empaque_lineas (proceso_id, presentacion_g, unidades, articulo_pt_id, bolsa_cliente, forma)
  select v_proc, (l ->> 'presentacion_g')::integer, (l ->> 'unidades')::integer, (l ->> 'producto_id')::uuid,
         coalesce((l ->> 'bolsa_cliente')::boolean, false), l ->> 'forma'
    from jsonb_array_elements(v_det_lin) l;

  -- Movimientos: −bolsa, −etiqueta y +producto terminado por línea. Un día pasado se registra al final de ese
  -- día en la zona del cliente; hoy, ahora.
  v_fecha_mov := cafe.instante_fecha(v_fecha);
  for v_elem in select l from jsonb_array_elements(v_det_lin) l where v_mp loop
    v_movs := v_movs
      || jsonb_build_array(
           jsonb_build_object('articulo_id', v_elem ->> 'bolsa_id', 'cantidad', -(v_elem ->> 'unidades')::integer,
                              'motivo', 'consumo', 'fecha', v_fecha_mov, 'ref_tipo', 'cafe.proceso', 'ref_id', v_proc,
                              'observaciones', 'Empaque ' || v_lote.codigo),
           jsonb_build_object('articulo_id', v_elem ->> 'etiqueta_id', 'cantidad', -(v_elem ->> 'unidades')::integer,
                              'motivo', 'consumo', 'fecha', v_fecha_mov, 'ref_tipo', 'cafe.proceso', 'ref_id', v_proc,
                              'observaciones', 'Empaque ' || v_lote.codigo),
           jsonb_build_object('articulo_id', v_elem ->> 'producto_id', 'cantidad', (v_elem ->> 'unidades')::integer,
                              'motivo', 'produccion', 'fecha', v_fecha_mov, 'ref_tipo', 'cafe.proceso', 'ref_id', v_proc,
                              'observaciones', 'Empaque ' || v_lote.codigo));
  end loop;

  if v_mp then
    v_mov := public.registrar_movimientos(v_movs, true);
  else
    v_mov := jsonb_build_object('stocks', '[]'::jsonb, 'advertencias', '[]'::jsonb);
  end if;

  -- Las advertencias con el nombre del artículo, para que la pantalla no tenga que buscarlo.
  for v_a in select x from jsonb_array_elements(v_mov -> 'advertencias') x loop
    select a.nombre into v_nombre from public.articulos a where a.id = (v_a ->> 'articulo_id')::uuid;
    v_adv := v_adv || jsonb_build_array(v_a || jsonb_build_object('articulo', v_nombre));
  end loop;

  return jsonb_build_object(
    'proceso_id', v_proc,
    'merma_kg', v_res -> 'merma_kg',
    'merma_pct', v_res -> 'merma_pct',
    'diferencia_kg', case when (v_res ->> 'merma_kg')::numeric > 0 then v_res -> 'merma_kg' else to_jsonb(0) end,
    'diferencia_destino', case when (v_res ->> 'merma_kg')::numeric > 0 then to_jsonb(v_destino) else 'null'::jsonb end,
    'peso_entrada_kg', v_res -> 'peso_entrada_kg',
    'peso_salida_kg', v_res -> 'peso_salida_kg',
    'lote_estado', v_res -> 'lote_estado',
    'avance_texto', v_res -> 'avance_texto',
    'lineas', (select jsonb_agg(l - 'bolsa_id' - 'etiqueta_id' - 'bolsa' - 'etiqueta' - 'bolsa_cliente') from jsonb_array_elements(v_det_lin) l),
    'molienda', case when v_mol_res is null then 'null'::jsonb else jsonb_build_object(
                  'proceso_id', v_mol_res -> 'id', 'merma_kg', v_mol_res -> 'merma_kg', 'merma_pct', v_mol_res -> 'merma_pct',
                  'peso_entrada_kg', v_mol_res -> 'peso_entrada_kg', 'peso_salida_kg', v_mol_res -> 'peso_salida_kg') end,
    'stocks', v_mov -> 'stocks',
    'advertencias', v_adv);
end $$;

revoke all on function cafe.registrar_empaque(jsonb) from public, anon;
grant execute on function cafe.registrar_empaque(jsonb) to authenticated;
