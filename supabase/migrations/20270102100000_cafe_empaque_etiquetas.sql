-- Empaque de marca propia: etiquetas por línea (sí / no / cuántas).
--
-- `cafe.empaque_lineas.etiquetas` = cuántas de las bolsas de la línea llevan etiqueta (NULL = todas: empaques anteriores y
-- terceros). El empaque descuenta del inventario solo esas etiquetas, y el costo de insumos usa bolsas × precio de bolsa +
-- etiquetas × precio de etiqueta. Redefine `registrar_empaque` (parte de `20261130150000`), `costo_insumos_empaque` y
-- `costo_libra_lote` (parten de `20261213100000`). Sin cambios de privilegios salvo el INSERT de la columna nueva.

alter table cafe.empaque_lineas
  add column etiquetas integer,
  add constraint empaque_lineas_etiquetas_ck check (etiquetas is null or (etiquetas >= 0 and etiquetas <= unidades));
grant insert (etiquetas) on table cafe.empaque_lineas to authenticated;

CREATE OR REPLACE FUNCTION cafe.registrar_empaque(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_lote_id   uuid;
  v_fecha     date;
  v_origen    uuid;
  v_bascula   numeric;
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
  v_grano_kg  numeric := 0;
  v_molido_kg numeric := 0;
  v_hay_molido boolean := false;
  v_org       uuid;
  v_tipo_org  cafe.tipo_proceso;
  v_t         cafe.procesos;
  v_sobrante  numeric := 0;
  v_sob_forma text := 'grano';
  v_acum_e    numeric;
  v_acum_s    numeric;
  v_incluir   jsonb := '[]';
  v_incl_kg   numeric := 0;
  v_inc       record;
  v_saldo_t   numeric;
  v_et        numeric;
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

    -- Peso total en báscula de la tanda (B-08): incluye el sobrante.
    if jsonb_typeof(p -> 'peso_bascula_kg') = 'number' then
      v_bascula := (p ->> 'peso_bascula_kg')::numeric;
    elsif p ? 'peso_bascula_kg' and jsonb_typeof(p -> 'peso_bascula_kg') <> 'null' then
      raise exception using errcode = '22023';
    end if;
    -- Solo para el empaque de un café reabierto (que aún no pasa por báscula).
    if jsonb_typeof(p -> 'peso_entrada_kg') = 'number' then
      v_entrada := (p ->> 'peso_entrada_kg')::numeric;
    elsif p ? 'peso_entrada_kg' and jsonb_typeof(p -> 'peso_entrada_kg') <> 'null' then
      raise exception using errcode = '22023';
    end if;

    -- `bultos` y `molienda` de la versión anterior: `bultos` se acepta y se ignora; la molienda ya no se registra aquí.
    if jsonb_typeof(p -> 'origen_proceso_id') = 'string' then
      v_origen := (p ->> 'origen_proceso_id')::uuid;
    elsif p ? 'origen_proceso_id' and jsonb_typeof(p -> 'origen_proceso_id') <> 'null' then
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

    -- Destino de la diferencia: solo lo usa el empaque de reapertura; en el flujo normal el sobrante va solo a «tostado sin
    -- empacar» (marca propia) o se entrega a granel (terceros).
    if jsonb_typeof(p -> 'diferencia_destino') = 'string' then
      v_destino := p ->> 'diferencia_destino';
    elsif p ? 'diferencia_destino' and jsonb_typeof(p -> 'diferencia_destino') <> 'null' then
      raise exception using errcode = '22023';
    end if;

    -- Tostado sin empacar de tandas anteriores que se incluye en este empaque (B-09).
    if jsonb_typeof(p -> 'incluir_tostado') = 'array' then
      v_incluir := p -> 'incluir_tostado';
    elsif p ? 'incluir_tostado' and jsonb_typeof(p -> 'incluir_tostado') <> 'null' then
      raise exception using errcode = '22023';
    end if;

    if jsonb_typeof(p -> 'sobrante_forma') = 'string' then
      v_sob_forma := p ->> 'sobrante_forma';
    elsif p ? 'sobrante_forma' and jsonb_typeof(p -> 'sobrante_forma') <> 'null' then
      raise exception using errcode = '22023';
    end if;
  exception when others then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El empaque no tiene el formato esperado.';
  end;

  if jsonb_typeof(p -> 'molienda') = 'object' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'La molienda se registra en su propio paso: el empaque no la lleva.';
  end if;
  if v_sob_forma not in ('grano', 'molido') then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La forma del sobrante es grano o molido.';
  end if;

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
    -- Etiquetas de la línea: sin dato = todas las bolsas llevan etiqueta; 0 = ninguna; n = solo n de las bolsas.
    if v_elem ? 'etiquetas' and jsonb_typeof(v_elem -> 'etiquetas') not in ('number', 'null') then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'Las etiquetas son un número entero de bolsas.';
    end if;
    if jsonb_typeof(v_elem -> 'etiquetas') = 'number' then
      v_et := (v_elem ->> 'etiquetas')::numeric;
      if v_et <> trunc(v_et) or v_et < 0 or v_et > v_u then
        raise exception using errcode = 'P0001', message = 'etiquetas_invalidas',
          detail = format('Las etiquetas de %s g deben ser un número entre 0 y %s (las bolsas de esa línea).', v_g::integer, v_u::integer);
      end if;
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

  -- El lote.
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
  -- líneas (peso por bolsa × cantidad), sin inventario propio.
  v_mp := v_lote.linea = 'marca_propia';

  -- Tostado incluido (B-09): de lotes del MISMO tipo de café y con saldo; no más que las bolsas de esa forma.
  if jsonb_array_length(v_incluir) > 0 then
    if not v_mp or v_reap is not null then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'El tostado sin empacar solo se incluye en el empaque de marca propia.';
    end if;
    for v_inc in
      select (e ->> 'lote_origen_id')::uuid as lote_id, e ->> 'forma' as forma, (e ->> 'kg')::numeric as kg
        from jsonb_array_elements(v_incluir) e
    loop
      if v_inc.lote_id is null or v_inc.forma not in ('grano', 'molido') or v_inc.kg is null or v_inc.kg <= 0
         or v_inc.kg <> round(v_inc.kg, 3) then
        raise exception using errcode = 'P0001', message = 'datos_invalidos',
          detail = 'Cada inclusión necesita su lote, su forma y unos kilos mayores que cero.';
      end if;
      if not exists (select 1 from cafe.lotes x where x.id = v_inc.lote_id and x.tipo_cafe_id is not distinct from v_lote.tipo_cafe_id and x.linea = 'marca_propia') then
        raise exception using errcode = 'P0001', message = 'datos_invalidos',
          detail = 'Solo se incluye tostado del mismo tipo de café.';
      end if;
      select coalesce(sum(m.delta_kg), 0) into v_saldo_t
        from cafe.tostado_movimientos m where m.lote_id = v_inc.lote_id and m.forma = v_inc.forma;
      if v_inc.kg > v_saldo_t + 0.0005 then
        raise exception using errcode = 'P0001', message = 'tostado_insuficiente',
          detail = format('Solo hay %s kg de tostado sin empacar de ese lote.', trim_scale(round(v_saldo_t, 3)));
      end if;
      v_incl_kg := v_incl_kg + v_inc.kg;
    end loop;
    if (select coalesce(sum((e ->> 'kg')::numeric), 0) from jsonb_array_elements(v_incluir) e where e ->> 'forma' = 'grano') > v_grano_kg + 0.0005
       or (select coalesce(sum((e ->> 'kg')::numeric), 0) from jsonb_array_elements(v_incluir) e where e ->> 'forma' = 'molido') > v_molido_kg + 0.0005 then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'El tostado incluido no puede superar las bolsas de esa forma.';
    end if;
  end if;

  -- Empaque de un café reabierto: es de ESTE lote y no lleva origen.
  if v_reap is not null then
    if not v_mp then
      raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Solo se reabre café de marca propia.';
    end if;
    if v_origen is not null then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'Un empaque de reapertura no lleva origen: empaca el café reabierto.';
    end if;
    select r.lote_id into v_reap_lote from cafe.reaperturas r where r.id = v_reap;
    if not found then
      raise exception using errcode = 'P0001', message = 'reapertura_no_encontrada',
        detail = 'La reapertura no existe o no pertenece a tu cliente.';
    end if;
    if v_reap_lote <> v_lote_id then
      raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La reapertura no es de este lote.';
    end if;
    if v_destino is not null and v_destino not in ('muestra', 'perdida', 'granel') then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'Ese destino de la diferencia no aplica a este lote.';
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
        'forma', coalesce(nullif(v_elem ->> 'forma', ''), 'grano'), 'bolsa_cliente', true, 'etiquetas', null);
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
    v_et := case when jsonb_typeof(v_elem -> 'etiquetas') = 'number' then (v_elem ->> 'etiquetas')::numeric end;
    if v_bolsa.id is null or (v_etiq.id is null and coalesce(v_et, 1) > 0) then
      raise exception using errcode = 'P0001', message = 'insumo_no_configurado',
        detail = format('Falta %s activa de %s en el inventario de insumos.',
                        case when v_bolsa.id is null and v_etiq.id is null and coalesce(v_et, 1) > 0 then 'la bolsa y la etiqueta'
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
      'etiquetas', coalesce(v_et, v_u)::integer,
      'producto_id', v_pt.id, 'producto', v_pt.nombre,
      'bolsa_id', v_bolsa.id, 'bolsa', v_bolsa.nombre, 'etiqueta_id', v_etiq.id, 'etiqueta', v_etiq.nombre);
  end loop;

  -- El proceso. Un café reabierto sigue su propia ruta (sin báscula ni tanda). El flujo normal:
  --   * origen = la tostión de la tanda (o la trilla / el café recibido si el lote no lleva tostión);
  --   * `peso_entrada_kg` del empaque = peso total en báscula (incluye el sobrante); `peso_salida_kg` = kg en bolsas;
  --     `diferencia_kg` (columna generada) = sobrante;
  --   * la merma de tostión de la tanda se calcula al fijar la salida de la tostión con la báscula (`_asignar_salida_tostion`).
  if v_reap is not null then
    begin
      if v_hay_molido and not exists (
           select 1 from cafe.procesos pm where pm.reapertura_id = v_reap and pm.tipo = 'molienda' and pm.anulado_at is null) then
        raise exception using errcode = 'P0001', message = 'molienda_requerida',
          detail = 'El café molido necesita la molienda de la reapertura: regístrala antes de empacar.';
      end if;
      v_res := cafe._insertar_proceso_reapertura(v_reap, 'empaque', v_fecha, v_entrada, v_salida, v_obs, v_destino);
    exception when sqlstate 'P0001' then
      get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
      if v_msg = 'salida_supera_entrada' then
        v_disp := coalesce(v_entrada, cafe.peso_disponible_reapertura(v_reap, 'empaque'));
        raise exception using errcode = 'P0001', message = 'empaque_supera_peso',
          detail = format('Las bolsas suman %s kg y a empaque solo llegan %s kg (el café reabierto).', trim_scale(v_salida), trim_scale(v_disp));
      end if;
      raise exception using errcode = 'P0001', message = v_msg, detail = v_det;
    end;
    v_proc := (v_res ->> 'id')::uuid;
    if (v_res ->> 'merma_kg')::numeric > 0 and v_destino is null then
      raise exception using errcode = 'P0001', message = 'diferencia_sin_destino',
        detail = 'Sobra café de lo que llega a empaque: indica si queda a granel, es muestra o es pérdida.';
    end if;
  else
    begin
      v_org := cafe._resolver_origen(v_lote_id, 'empaque', v_origen);
      v_tipo_org := cafe.paso_origen(v_lote_id, 'empaque');

      if v_tipo_org = 'tostion' then
        if v_bascula is null then
          raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Indica el peso total en báscula.';
        end if;
        if v_bascula <= 0 or v_bascula >= 10000000 or v_bascula <> round(v_bascula, 3) then
          raise exception using errcode = 'P0001', message = 'datos_invalidos',
            detail = 'El peso en báscula debe ser mayor que cero y tener como máximo 3 decimales.';
        end if;
        select * into v_t from cafe.procesos t where t.id = v_org;
        if v_bascula > v_t.peso_entrada_kg + 0.0005 then
          raise exception using errcode = 'P0001', message = 'bascula_supera_entrada',
            detail = format('El peso en báscula (%s kg) supera lo que entró a tostión (%s kg). Revisar cantidades.',
                            trim_scale(v_bascula), trim_scale(v_t.peso_entrada_kg));
        end if;
        if exists (select 1 from cafe.procesos e where e.origen_proceso_id = v_org and e.tipo = 'empaque' and e.anulado_at is null) then
          raise exception using errcode = 'P0001', message = 'tanda_con_empaque', detail = 'Esta tanda ya tiene su empaque.';
        end if;
        -- El café molido de marca propia necesita la molienda de esta tanda (en terceros, la bolsa es del cliente).
        if v_hay_molido and v_mp and not exists (
             select 1 from cafe.procesos pm
              where pm.origen_proceso_id = v_org and pm.tipo = 'molienda' and pm.anulado_at is null) then
          raise exception using errcode = 'P0001', message = 'molienda_requerida',
            detail = 'El café molido necesita la molienda de esta tanda: regístrala antes de empacar.';
        end if;
      else
        -- Sin tostión (trilla + empaque, o solo empaque): la báscula es opcional y por defecto es lo que llega a empaque.
        v_bascula := coalesce(v_bascula, cafe.peso_disponible(v_lote_id, 'empaque'));
      end if;

      -- Las bolsas no pueden pesar más que lo que marcó la báscula.
      -- B-09: lo incluido de tandas anteriores va a las bolsas pero no es báscula de esta tanda.
      if v_salida - v_incl_kg > v_bascula + 0.0005 then
        raise exception using errcode = 'P0001', message = 'empaque_supera_peso',
          detail = 'Las bolsas suman más que el peso en báscula. Revisar cantidades.';
      end if;
      v_sobrante := greatest(round(v_bascula + v_incl_kg - v_salida, 3), 0);

      -- Marca propia: el sobrante queda como tostado sin empacar. Terceros: se entrega a granel al cliente (aquí «suelto»).
      v_res := cafe._insertar_proceso(v_lote_id, 'empaque', v_fecha, v_org, v_bascula, v_salida - v_incl_kg, null, null, v_obs,
                                      case when v_sobrante > 0 then case when v_mp then 'granel' else 'suelto' end end, nullif(v_incl_kg, 0));
    exception when sqlstate 'P0001' then
      get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
      if v_msg = 'salida_supera_entrada' then
        v_msg := 'empaque_supera_peso';
        v_det := 'Las bolsas suman más que el peso en báscula. Revisar cantidades.';
      elsif v_msg = 'peso_supera_disponible' and v_tipo_org = 'tostion' then
        v_msg := 'bascula_supera_entrada';
        v_det := 'El peso en báscula supera lo que entró a tostión. Revisar cantidades.';
      end if;
      raise exception using errcode = 'P0001', message = v_msg, detail = v_det;
    end;
    v_proc := (v_res ->> 'id')::uuid;

    -- La merma de la tanda se asigna a su tostión: su salida pasa a ser el peso en báscula (una sola vez).
    if v_tipo_org = 'tostion' then
      perform cafe._asignar_salida_tostion(v_proc);
      select * into v_t from cafe.procesos t where t.id = v_org;
      select sum(t.peso_entrada_kg), sum(t.peso_salida_kg) into v_acum_e, v_acum_s
        from cafe.procesos t
       where t.lote_id = v_lote_id and t.tipo = 'tostion' and t.anulado_at is null and t.reapertura_id is null
         and t.peso_salida_kg is not null;
    end if;
  end if;

  -- Las líneas van ANTES de los movimientos: el trigger de producto terminado comprueba que existan.
  insert into cafe.empaque_lineas (proceso_id, presentacion_g, unidades, articulo_pt_id, bolsa_cliente, forma, etiquetas)
  select v_proc, (l ->> 'presentacion_g')::integer, (l ->> 'unidades')::integer, (l ->> 'producto_id')::uuid,
         coalesce((l ->> 'bolsa_cliente')::boolean, false), l ->> 'forma',
         case when v_mp then (l ->> 'etiquetas')::integer end
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
           jsonb_build_object('articulo_id', v_elem ->> 'producto_id', 'cantidad', (v_elem ->> 'unidades')::integer,
                              'motivo', 'produccion', 'fecha', v_fecha_mov, 'ref_tipo', 'cafe.proceso', 'ref_id', v_proc,
                              'observaciones', 'Empaque ' || v_lote.codigo));
  end loop;

  -- Etiquetas: solo se descuentan las de las bolsas que llevan etiqueta (todas, ninguna o algunas).
  for v_elem in select l from jsonb_array_elements(v_det_lin) l where v_mp and (l ->> 'etiquetas')::integer > 0 loop
    v_movs := v_movs
      || jsonb_build_array(
           jsonb_build_object('articulo_id', v_elem ->> 'etiqueta_id', 'cantidad', -(v_elem ->> 'etiquetas')::integer,
                              'motivo', 'consumo', 'fecha', v_fecha_mov, 'ref_tipo', 'cafe.proceso', 'ref_id', v_proc,
                              'observaciones', 'Empaque ' || v_lote.codigo));
  end loop;

  if v_mp then
    v_mov := public.registrar_movimientos(v_movs, true);
  else
    v_mov := jsonb_build_object('stocks', '[]'::jsonb, 'advertencias', '[]'::jsonb);
  end if;

  -- Tostado sin empacar (B-09): el sobrante suma, lo incluido resta. Un libro de movimientos: el saldo nunca queda negativo.
  if v_mp and v_reap is null then
    if v_sobrante > 0 then
      insert into cafe.tostado_movimientos (lote_id, tipo_cafe_id, forma, delta_kg, origen, proceso_id)
      values (v_lote_id, v_lote.tipo_cafe_id, v_sob_forma, v_sobrante, 'empaque_sobrante', v_proc);
    end if;
    if v_incl_kg > 0 then
      insert into cafe.tostado_movimientos (lote_id, tipo_cafe_id, forma, delta_kg, origen, proceso_id)
      select (e ->> 'lote_origen_id')::uuid, v_lote.tipo_cafe_id, e ->> 'forma', -(e ->> 'kg')::numeric, 'empaque_inclusion', v_proc
        from jsonb_array_elements(v_incluir) e;
    end if;
  end if;

  -- Las advertencias con el nombre del artículo, para que la pantalla no tenga que buscarlo.
  for v_a in select x from jsonb_array_elements(v_mov -> 'advertencias') x loop
    select a.nombre into v_nombre from public.articulos a where a.id = (v_a ->> 'articulo_id')::uuid;
    v_adv := v_adv || jsonb_build_array(v_a || jsonb_build_object('articulo', v_nombre));
  end loop;

  return jsonb_build_object(
    'proceso_id', v_proc,
    -- Merma de TOSTIÓN de esta tanda (el empaque no tiene merma propia). Un empaque de reapertura devuelve la diferencia.
    'merma_kg', case when v_reap is null then to_jsonb(v_t.merma_kg) else v_res -> 'merma_kg' end,
    'merma_pct', case when v_reap is null then to_jsonb(v_t.merma_pct) else v_res -> 'merma_pct' end,
    'merma_tostion', case when v_reap is null and v_tipo_org = 'tostion' then jsonb_build_object(
                        'proceso_id', v_t.id, 'entrada_kg', v_t.peso_entrada_kg, 'bascula_kg', v_t.peso_salida_kg,
                        'merma_kg', v_t.merma_kg, 'merma_pct', v_t.merma_pct, 'desvio', v_t.desvio,
                        'desvio_sentido', v_t.desvio_sentido) else 'null'::jsonb end,
    'acumulado', case when v_reap is null and v_tipo_org = 'tostion' then jsonb_build_object(
                   'entrada_kg', v_acum_e, 'bascula_kg', v_acum_s,
                   'merma_pct', round((v_acum_e - v_acum_s) / nullif(v_acum_e, 0) * 100, 3)) else 'null'::jsonb end,
    'peso_bascula_kg', v_res -> 'peso_entrada_kg',
    'tostado_incluido_kg', to_jsonb(v_incl_kg),
    'en_bolsas_kg', to_jsonb(round(v_salida, 3)),
    'sobrante_kg', case when v_reap is null then to_jsonb(v_sobrante) else v_res -> 'merma_kg' end,
    'sobrante_forma', case when v_reap is null and v_mp and v_sobrante > 0 then to_jsonb(v_sob_forma) else 'null'::jsonb end,
    'diferencia_kg', case when v_reap is null then to_jsonb(v_sobrante) else v_res -> 'merma_kg' end,
    'diferencia_destino', case when v_reap is null then (case when v_sobrante > 0 then to_jsonb(case when v_mp then 'granel' else 'suelto' end) else 'null'::jsonb end)
                               else to_jsonb(v_destino) end,
    'peso_entrada_kg', v_res -> 'peso_entrada_kg',
    'peso_salida_kg', v_res -> 'peso_salida_kg',
    -- Estado FRESCO: la salida de la tostión se fijó después de insertar el empaque.
    'lote_estado', (select v.estado from cafe.v_lotes v where v.id = v_lote_id),
    'avance_texto', (select v.avance_texto from cafe.v_lotes v where v.id = v_lote_id),
    'lineas', (select jsonb_agg(l - 'bolsa_id' - 'etiqueta_id' - 'bolsa' - 'etiqueta' - 'bolsa_cliente') from jsonb_array_elements(v_det_lin) l),
    'stocks', v_mov -> 'stocks',
    'advertencias', v_adv);
end $function$;

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
           'etiquetas', coalesce(el.etiquetas, el.unidades),
           'costo', case when el.costo_bolsa is not null and (el.costo_etiqueta is not null or coalesce(el.etiquetas, el.unidades) = 0)
                         then round(el.unidades * el.costo_bolsa + coalesce(el.etiquetas, el.unidades) * coalesce(el.costo_etiqueta, 0)) end)
         order by el.presentacion_g, el.forma),
         round(sum(el.unidades * el.costo_bolsa + coalesce(el.etiquetas, el.unidades) * coalesce(el.costo_etiqueta, 0))),
         count(*) filter (where not el.bolsa_cliente),
         count(*) filter (where not el.bolsa_cliente and (el.costo_bolsa is null or (el.costo_etiqueta is null and coalesce(el.etiquetas, el.unidades) > 0)))
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
         sum(coalesce(el.etiquetas, el.unidades) * coalesce(el.costo_etiqueta, 0)) / nullif(sum(el.unidades), 0)
    into v_bolsa, v_etiq
    from cafe.empaque_lineas el
    join cafe.procesos p on p.tenant_id = el.tenant_id and p.id = el.proceso_id
   where p.lote_id = p_lote and p.anulado_at is null and el.presentacion_g = p_gramos
     and el.costo_bolsa is not null and (el.costo_etiqueta is not null or coalesce(el.etiquetas, el.unidades) = 0);
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
