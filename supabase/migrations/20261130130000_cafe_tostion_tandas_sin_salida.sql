-- ADR 0002 (FIN-142 · T-01) · migración 5 de 9 · B-05 (FIN-151): tostión por tandas, SIN peso de salida.
--
-- La tostión se registra por tandas («kilos a tostar ahora») y sin peso de salida: la planta no pesa por bache. La salida de
-- la tostión (y con ella su merma) la fija el empaque que cierra la tanda con su peso total en báscula (B-08,
-- `..._empaque_bascula_merma_tanda`). DEBE SALIR EN EL MISMO RELEASE que esa migración: entre ambas, una tostión nueva no
-- tendría dónde recibir su salida.
--
-- * `_insertar_proceso`: tostión sin salida ni `grupo_pesaje` (se aceptan e ignoran); baches con solo entrada, temperatura y
--   tiempo; `peso_entrada_kg` = «kilos a tostar ahora» = Σ entradas de los baches. La molienda (B-07 la completa) tampoco lleva
--   salida: es una confirmación y no consume saldo.
-- * `verificar_baches_proceso` compara solo entradas.
-- * `kpis_periodo`, `produccion_diaria`, `costo_libra_lote` y `proveedores_marca_propia` ignoran las tostiones sin salida (tanda en
--   curso) y no calculan merma de molienda.
-- * `editar_lote`: una tostión sin salida se edita por sus baches; la salida de una tostión con empaque no se edita.

-- Nivel de tueste por bache: la tabla de baches de la tostión lo muestra y se puede ajustar por bache («Aplicar a los
-- seleccionados»). Por defecto, el de la tostión.
alter table cafe.baches add column nivel_tueste cafe.nivel_tueste;
grant insert (nivel_tueste) on table cafe.baches to authenticated;

CREATE OR REPLACE FUNCTION cafe._insertar_proceso(p_lote uuid, p_tipo cafe.tipo_proceso, p_fecha date, p_origen uuid, p_entrada numeric, p_salida numeric, p_nivel cafe.nivel_tueste, p_baches jsonb, p_observaciones text, p_diferencia_destino text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_lote      cafe.lotes;
  v_proc      cafe.procesos;
  v_origen    uuid;
  v_base      numeric;
  v_disp      numeric;
  v_entrada   numeric;
  v_salida    numeric;
  v_nivel     cafe.nivel_tueste;
  v_tarifa    numeric := 0;
  v_ref       numeric;
  v_tol       numeric;
  v_baches    jsonb;
  v_elem      jsonb;
  v_sum_e     numeric := 0;
  v_x         numeric;
  v_y         numeric;
  v_temp      numeric;
  v_tiempo    numeric;
  v_estado    record;
begin
  -- 1) Permisos: rol operativo en el cliente y módulo de procesos activo.
  if not coalesce((select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'), false)
     or not coalesce((select public.tenant_tiene_modulo('cafe.procesos')), false) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  -- 2) Serializa por lote: dos registros a la vez no pueden gastar el mismo saldo (`procesos_saldo_ok` lo respalda).
  perform pg_advisory_xact_lock(hashtextextended('cafe.lote:' || coalesce(p_lote::text, ''), 0));

  select * into v_lote from cafe.lotes l where l.id = p_lote;
  if not found then
    raise exception using errcode = 'P0001', message = 'lote_no_encontrado',
      detail = 'El lote no existe o no pertenece a tu cliente.';
  end if;
  if v_lote.anulado_at is not null then
    raise exception using errcode = 'P0001', message = 'lote_anulado',
      detail = 'El lote está anulado: ya no se puede modificar.';
  end if;

  if p_tipo is null or p_fecha is null or p_fecha not between date '2000-01-01' and date '2100-12-31' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'Indica el tipo de proceso y una fecha válida.';
  end if;
  if p_observaciones is not null and char_length(p_observaciones) > 500 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'Las observaciones admiten hasta 500 caracteres.';
  end if;

  -- 3) El paso tiene que existir para este lote.
  if v_lote.linea = 'marca_propia' and p_tipo = 'trilla' then
    raise exception using errcode = 'P0001', message = 'marca_propia_sin_trilla',
      detail = 'El café de marca propia se compra ya trillado: no admite trilla.';
  end if;
  if not p_tipo = any(cafe.pasos_del_lote(p_lote)) then
    raise exception using errcode = 'P0001', message = 'servicio_no_contratado',
      detail = format('El servicio de %s no está contratado en este lote.',
                      case p_tipo when 'trilla' then 'trilla' when 'tostion' then 'tostión'
                                  when 'molienda' then 'molienda' else 'empaque' end);
  end if;

  -- 4) Origen: el proceso previo del que consume (null = el café recibido). El paso de origen se salta la molienda.
  v_origen := cafe._resolver_origen(p_lote, p_tipo, p_origen);
  if v_origen is null then
    v_base := v_lote.peso_recibido_kg;
    select o.saldo_kg into v_disp from cafe.v_origenes_disponibles o where o.lote_id = p_lote and o.proceso_id is null;
  elsif p_tipo = 'molienda' then
    -- La molienda no consume saldo: parte de lo que dejó la tostión y no se ha molido ya.
    select coalesce(o.peso_salida_kg, o.peso_entrada_kg),
           coalesce(o.peso_salida_kg, o.peso_entrada_kg)
             - coalesce((select sum(m.peso_entrada_kg) from cafe.procesos m
                          where m.origen_proceso_id = o.id and m.tipo = 'molienda' and m.anulado_at is null), 0)
      into v_base, v_disp
      from cafe.procesos o where o.id = v_origen;
  else
    select o.base_kg, o.saldo_kg into v_base, v_disp from cafe.v_origenes_disponibles o where o.proceso_id = v_origen;
  end if;

  -- Servicios: si el lote contrata molienda, el empaque va después de la molienda de esa tanda.
  if p_tipo = 'empaque' and v_lote.linea = 'servicio' and 'molienda' = any(v_lote.servicios)
     and not exists (select 1 from cafe.procesos m
                      where m.lote_id = p_lote and m.tipo = 'molienda' and m.anulado_at is null and m.reapertura_id is null
                        and m.origen_proceso_id is not distinct from v_origen) then
    raise exception using errcode = 'P0001', message = 'orden_proceso_invalido',
      detail = 'Primero registra la molienda de este café.';
  end if;

  -- 5) Pesos. Entrada: la enviada o el disponible; salida: la enviada (o la suma de los baches).
  if p_entrada is not null then
    if p_entrada <= 0 or p_entrada >= 10000000 or p_entrada <> round(p_entrada, 3) then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'El peso de entrada debe ser mayor que cero y tener como máximo 3 decimales.';
    end if;
    if p_entrada > v_disp + cafe.saldo_tolerancia_kg(v_base) then
      raise exception using errcode = 'P0001', message = 'peso_supera_disponible',
        detail = format('El peso de entrada (%s kg) supera el disponible (%s kg).', p_entrada, trim_scale(round(v_disp, 3)));
    end if;
  end if;
  v_entrada := coalesce(p_entrada, v_disp);
  if v_entrada is null or v_entrada <= 0 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'No hay peso disponible para este proceso: indica el peso de entrada.';
  end if;

  -- 6) Baches (solo tostión): cada uno con su entrada, temperatura y tiempo. Sin peso de salida ni grupos de pesaje (B-05):
  -- la planta no pesa por bache; el peso final de la tanda lo da el peso en báscula del empaque (B-08). Si el cliente aún manda
  -- `peso_salida_kg` o `grupo_pesaje` (pestaña abierta con la versión anterior), se ignoran.
  if p_tipo = 'tostion' then
    if jsonb_typeof(p_baches) is distinct from 'array' or jsonb_array_length(p_baches) = 0 then
      raise exception using errcode = 'P0001', message = 'baches_no_cuadran',
        detail = 'La tostión se registra por baches: indica al menos uno.';
    end if;

    v_baches := '[]';
    for v_elem in select e from jsonb_array_elements(p_baches) e loop
      if jsonb_typeof(v_elem) <> 'object' or jsonb_typeof(v_elem -> 'peso_entrada_kg') is distinct from 'number' then
        raise exception using errcode = 'P0001', message = 'datos_invalidos',
          detail = 'Cada bache necesita su peso de entrada.';
      end if;
      v_x := (v_elem ->> 'peso_entrada_kg')::numeric;
      if v_x <= 0 or v_x >= 10000000 or v_x <> round(v_x, 3) then
        raise exception using errcode = 'P0001', message = 'datos_invalidos',
          detail = 'El peso de cada bache debe ser positivo y tener como máximo 3 decimales.';
      end if;

      v_temp := null;
      if jsonb_typeof(v_elem -> 'temperatura_c') = 'number' then
        v_temp := (v_elem ->> 'temperatura_c')::numeric;
        if v_temp < 0 or v_temp > 999 then
          raise exception using errcode = 'P0001', message = 'datos_invalidos',
            detail = 'La temperatura del bache no es válida.';
        end if;
      elsif v_elem ? 'temperatura_c' and jsonb_typeof(v_elem -> 'temperatura_c') <> 'null' then
        raise exception using errcode = 'P0001', message = 'datos_invalidos',
          detail = 'La temperatura del bache debe ser un número.';
      end if;

      v_tiempo := null;
      if jsonb_typeof(v_elem -> 'tiempo_min') = 'number' then
        v_tiempo := (v_elem ->> 'tiempo_min')::numeric;
        if v_tiempo <= 0 or v_tiempo > 999 then
          raise exception using errcode = 'P0001', message = 'datos_invalidos',
            detail = 'El tiempo del bache no es válido.';
        end if;
      elsif v_elem ? 'tiempo_min' and jsonb_typeof(v_elem -> 'tiempo_min') <> 'null' then
        raise exception using errcode = 'P0001', message = 'datos_invalidos',
          detail = 'El tiempo del bache debe ser un número.';
      end if;

      -- Nivel de tueste del bache (opcional: por defecto el de la tostión).
      if v_elem ? 'nivel_tueste' and jsonb_typeof(v_elem -> 'nivel_tueste') not in ('null', 'string')
         or jsonb_typeof(v_elem -> 'nivel_tueste') = 'string' and v_elem ->> 'nivel_tueste' not in ('bajo', 'medio', 'alto') then
        raise exception using errcode = 'P0001', message = 'datos_invalidos',
          detail = 'El nivel de tueste del bache no es válido.';
      end if;

      v_sum_e := v_sum_e + v_x;
      v_baches := v_baches || jsonb_build_object(
        'peso_entrada_kg', v_x,
        'temperatura_c', v_temp,
        'tiempo_min', v_tiempo,
        'nivel_tueste', v_elem -> 'nivel_tueste',
        'observaciones', nullif(btrim(coalesce(v_elem ->> 'observaciones', '')), ''));
    end loop;

    -- «Kilos a tostar ahora»: lo enviado o, sin él, lo que suman los baches; nunca más de lo que hay por tostar.
    if p_entrada is null then
      v_entrada := v_sum_e;
      if v_entrada > v_disp + cafe.saldo_tolerancia_kg(v_base) then
        raise exception using errcode = 'P0001', message = 'peso_supera_disponible',
          detail = format('Los baches suman %s kg y solo quedan %s kg por tostar.', v_entrada, trim_scale(round(v_disp, 3)));
      end if;
    end if;
  elsif p_baches is not null and jsonb_typeof(p_baches) not in ('null') then
    if jsonb_typeof(p_baches) <> 'array' or jsonb_array_length(p_baches) > 0 then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'Solo la tostión se registra por baches.';
    end if;
  end if;

  -- Salida: la tostión y la molienda no la llevan (la merma de tostión se calcula en el empaque). Trilla y empaque, sí.
  if p_tipo in ('tostion', 'molienda') then
    v_salida := null;
  else
    v_salida := p_salida;
    if v_salida is null then
      raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Indica el peso de salida.';
    end if;
    if v_salida < 0 or v_salida >= 10000000 or v_salida <> round(v_salida, 3) then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'El peso de salida no puede ser negativo y tiene como máximo 3 decimales.';
    end if;
    if v_salida > v_entrada then
      raise exception using errcode = 'P0001', message = 'salida_supera_entrada',
        detail = format('El peso de salida (%s kg) no puede superar el de entrada (%s kg).', v_salida, v_entrada);
    end if;
  end if;

  if p_tipo = 'tostion' and abs(v_sum_e - v_entrada) > 0.001 then
    raise exception using errcode = 'P0001', message = 'baches_no_cuadran',
      detail = format('Los baches suman %s kg y los kilos a tostar son %s kg.', v_sum_e, v_entrada);
  end if;

  -- 7) Nivel de tueste: la tostión lo exige (en servicio, por defecto el del lote); los demás pasos no lo llevan.
  if p_tipo = 'tostion' then
    v_nivel := coalesce(p_nivel, v_lote.nivel_tueste);
    if v_nivel is null then
      raise exception using errcode = 'P0001', message = 'falta_nivel_tueste',
        detail = 'Indica el nivel de tueste (bajo, medio o alto) de la tostión.';
    end if;
  end if;

  -- 8) Snapshots. Tarifa: solo servicios cobrables (el empaque va incluido y la marca propia no se cobra); la
  -- vigente en la fecha del proceso, y si no hay lanza `tarifa_no_definida`. Merma de referencia: solo trilla y
  -- tostión (decisión 3 de CO-20); la tolerancia, la del cliente (3 puntos por defecto).
  if v_lote.linea = 'servicio' and p_tipo <> 'empaque' then
    v_tarifa := public.tarifa_vigente('cafe.' || p_tipo::text, cafe.instante_fecha(p_fecha));
  end if;
  -- A-03: la referencia de tostión es por nivel de tueste (`..._tostion_<nivel>_pct`); si el cliente aún no la
  -- fijó por nivel, rige la clave general anterior y, sin ella, 18. La tolerancia por defecto es ±2 puntos.
  v_ref := case p_tipo
             when 'trilla'  then cafe.parametro_numero('cafe.merma_referencia_trilla_pct', 19)
             when 'tostion' then cafe.parametro_numero('cafe.merma_referencia_tostion_' || v_nivel::text || '_pct',
                                   cafe.parametro_numero('cafe.merma_referencia_tostion_pct', 18))
           end;
  v_tol := cafe.parametro_numero('cafe.merma_tolerancia_pts', 2);

  -- 9) Escrituras.
  insert into cafe.procesos (lote_id, tipo, fecha, peso_entrada_kg, peso_salida_kg, tarifa_kg,
                             merma_referencia_pct, tolerancia_pts, nivel_tueste, observaciones, diferencia_destino,
                             origen_proceso_id, origen_tipo)
  values (p_lote, p_tipo, p_fecha, v_entrada, v_salida, v_tarifa, v_ref, v_tol, v_nivel,
          nullif(btrim(coalesce(p_observaciones, '')), ''),
          case when p_tipo = 'empaque' and v_entrada > v_salida then p_diferencia_destino end,
          v_origen, cafe.paso_origen(p_lote, p_tipo))
  returning * into v_proc;

  if p_tipo = 'tostion' then
    insert into cafe.baches (proceso_id, numero, peso_entrada_kg, temperatura_c, tiempo_min, observaciones)
    select v_proc.id, x.n::smallint, (x.e ->> 'peso_entrada_kg')::numeric,
           (x.e ->> 'temperatura_c')::numeric, (x.e ->> 'tiempo_min')::numeric, x.e ->> 'observaciones'
      from jsonb_array_elements(v_baches) with ordinality as x(e, n);
  end if;

  select v.estado, v.avance_texto into v_estado from cafe.v_lotes v where v.id = p_lote;

  return jsonb_build_object(
    'id', v_proc.id,
    'merma_kg', v_proc.merma_kg,
    'merma_pct', v_proc.merma_pct,
    'desvio', v_proc.desvio,
    'desvio_sentido', v_proc.desvio_sentido,
    'valor', v_proc.valor,
    'lote_estado', v_estado.estado,
    'peso_entrada_kg', v_proc.peso_entrada_kg,
    'peso_salida_kg', v_proc.peso_salida_kg,
    'tarifa_kg', v_proc.tarifa_kg,
    'avance_texto', v_estado.avance_texto);
end $function$;

-- Los baches cuadran con la tostión solo por entradas (no tienen salida).
create or replace function cafe.verificar_baches_proceso(p_proceso uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tipo    cafe.tipo_proceso;
  v_entrada numeric;
  v_n       integer;
  v_sum_e   numeric;
begin
  select p.tipo, p.peso_entrada_kg into v_tipo, v_entrada from cafe.procesos p where p.id = p_proceso;
  if not found then
    return;
  end if;

  select count(*), coalesce(sum(b.peso_entrada_kg), 0) into v_n, v_sum_e from cafe.baches b where b.proceso_id = p_proceso;

  if v_tipo <> 'tostion' then
    if v_n > 0 then
      raise exception using errcode = 'P0001', message = 'baches_no_cuadran', detail = 'Solo la tostión se registra por baches.';
    end if;
    return;
  end if;

  if v_n = 0 then
    raise exception using errcode = 'P0001', message = 'baches_no_cuadran',
      detail = 'La tostión se registra por baches: indica al menos uno.';
  end if;
  if abs(v_sum_e - v_entrada) > 0.001 then
    raise exception using errcode = 'P0001', message = 'baches_no_cuadran',
      detail = format('Los baches suman %s kg y los kilos a tostar son %s kg.', v_sum_e, v_entrada);
  end if;
end $$;

CREATE OR REPLACE FUNCTION cafe.editar_lote(p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_lote_id   uuid;
  v_motivo    text;
  v_simular   boolean;
  v_lote      cafe.lotes;
  v_nuevo_l   cafe.lotes;
  v_edicion   uuid := gen_random_uuid();
  v_obj       jsonb;
  v_p         jsonb;
  v_b         jsonb;
  v_proc      cafe.procesos;
  v_nuevo_p   cafe.procesos;
  v_bache     cafe.baches;
  v_nuevo_b   cafe.baches;
  v_ref       text;
  v_bloqueo   text;
  v_n         integer := 0;
  v_editados  uuid[] := '{}';
  v_hay_baches boolean;
  v_antes     jsonb;
  v_despues   jsonb;
  v_cambios   jsonb;
  v_x         record;
  v_ent       numeric;
  v_sal       numeric;
  v_fecha     date;
  v_llegada   timestamptz;
begin
  -- 1) Permisos: solo owner/admin y módulo activo. Ningún operativo ni viewer.
  if not coalesce((select public.rol_en_tenant()) in ('owner', 'admin'), false)
     or not coalesce((select public.tenant_tiene_modulo('cafe.recepcion')), false) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_input -> 'lote_id') is distinct from 'string' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Indica el lote a editar.';
  end if;
  v_lote_id := (p_input ->> 'lote_id')::uuid;
  v_motivo  := btrim(coalesce(p_input ->> 'motivo', ''));
  v_simular := coalesce(p_input -> 'simular' = 'true'::jsonb, false);
  if length(v_motivo) < 3 then
    raise exception using errcode = 'P0001', message = 'motivo_requerido', detail = 'Escribe el motivo de la corrección.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cafe.lote:' || v_lote_id::text, 0));

  select * into v_lote from cafe.lotes l where l.id = v_lote_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'lote_no_encontrado',
      detail = 'El lote no existe o no pertenece a tu cliente.';
  end if;
  v_bloqueo := cafe.lote_bloqueo_edicion(v_lote_id);
  if v_bloqueo is not null then
    raise exception using errcode = 'P0001', message = v_bloqueo,
      detail = case v_bloqueo
        when 'lote_anulado' then 'El lote está anulado: ya no se puede modificar.'
        when 'lote_entregado' then 'Primero anula la remisión de entrega del lote.'
        else 'Primero anula las ventas de los productos de este lote.' end;
  end if;

  v_antes := cafe._metricas_edicion(v_lote_id);
  perform set_config('cafe.edicion_lote', 'on', true);

  begin
    -- 2) Datos del lote.
    v_obj := coalesce(p_input -> 'lote', '{}'::jsonb);
    if v_obj <> '{}'::jsonb then
      if v_obj ? 'fecha_recepcion' then
        begin
          v_fecha := (v_obj ->> 'fecha_recepcion')::date;
        exception when others then
          raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La fecha de recepción no es válida.';
        end;
        if v_fecha is null or v_fecha > current_date + 1 then
          raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La fecha de recepción no es válida.';
        end if;
      end if;
      if v_obj ? 'llegada_at' then
        begin
          v_llegada := (v_obj ->> 'llegada_at')::timestamptz;
        exception when others then
          raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La hora de llegada no es válida.';
        end;
        if v_llegada is null or v_llegada > now() + interval '1 day' then
          raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La hora de llegada no es válida.';
        end if;
      end if;
      if v_obj ? 'precio_compra_kg' then
        if v_lote.linea <> 'marca_propia' or cafe._edicion_num(v_obj, 'precio_compra_kg') is null
           or cafe._edicion_num(v_obj, 'precio_compra_kg') < 0 then
          raise exception using errcode = 'P0001', message = 'datos_invalidos',
            detail = 'El precio de compra solo aplica a marca propia y no puede ser negativo.';
        end if;
      end if;

      update cafe.lotes l set
        fecha_recepcion   = case when v_obj ? 'fecha_recepcion' then v_fecha else l.fecha_recepcion end,
        created_at        = case when v_obj ? 'llegada_at' then v_llegada else l.created_at end,
        precio_compra_kg  = case when v_obj ? 'precio_compra_kg' then cafe._edicion_num(v_obj, 'precio_compra_kg') else l.precio_compra_kg end,
        factura_proveedor = case when v_obj ? 'factura_proveedor' then cafe._edicion_texto(v_obj, 'factura_proveedor') else l.factura_proveedor end,
        observaciones     = case when v_obj ? 'observaciones' then cafe._edicion_texto(v_obj, 'observaciones') else l.observaciones end
       where l.id = v_lote_id
       returning * into v_nuevo_l;

      v_n := v_n
        + cafe._registrar_cambio_edicion(v_edicion, v_lote_id, 'lote', v_lote_id, v_lote.codigo, 'fecha_recepcion', v_lote.fecha_recepcion, v_nuevo_l.fecha_recepcion, v_motivo)
        + cafe._registrar_cambio_edicion(v_edicion, v_lote_id, 'lote', v_lote_id, v_lote.codigo, 'llegada_at', to_char(v_lote.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), to_char(v_nuevo_l.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), v_motivo)
        + cafe._registrar_cambio_edicion(v_edicion, v_lote_id, 'lote', v_lote_id, v_lote.codigo, 'precio_compra_kg', v_lote.precio_compra_kg, v_nuevo_l.precio_compra_kg, v_motivo)
        + cafe._registrar_cambio_edicion(v_edicion, v_lote_id, 'lote', v_lote_id, v_lote.codigo, 'factura_proveedor', v_lote.factura_proveedor, v_nuevo_l.factura_proveedor, v_motivo)
        + cafe._registrar_cambio_edicion(v_edicion, v_lote_id, 'lote', v_lote_id, v_lote.codigo, 'observaciones', v_lote.observaciones, v_nuevo_l.observaciones, v_motivo);
    end if;

    -- 3) Procesos y baches.
    if jsonb_typeof(p_input -> 'procesos') = 'array' then
      for v_p in select e from jsonb_array_elements(p_input -> 'procesos') e loop
        select * into v_proc from cafe.procesos p
         where p.id = (v_p ->> 'id')::uuid and p.lote_id = v_lote_id;
        if not found then
          raise exception using errcode = 'P0001', message = 'proceso_no_encontrado',
            detail = 'El proceso no existe o no pertenece a este lote.';
        end if;
        if v_proc.anulado_at is not null then
          raise exception using errcode = 'P0001', message = 'proceso_anulado',
            detail = 'El proceso está anulado: ya no se puede modificar.';
        end if;
        if v_proc.tipo = 'empaque' or v_proc.reapertura_id is not null then
          raise exception using errcode = 'P0001', message = 'proceso_no_editable',
            detail = 'El empaque no se edita: anúlalo y regístralo de nuevo.';
        end if;
        v_ref := initcap(v_proc.tipo::text);
        v_editados := v_editados || v_proc.id;

        -- Baches primero: sus pesos mandan sobre los del proceso.
        v_hay_baches := false;
        if jsonb_typeof(v_p -> 'baches') = 'array' then
          for v_b in select e from jsonb_array_elements(v_p -> 'baches') e loop
            select * into v_bache from cafe.baches b
             where b.id = (v_b ->> 'id')::uuid and b.proceso_id = v_proc.id;
            if not found then
              raise exception using errcode = 'P0001', message = 'bache_no_encontrado',
                detail = 'El bache no existe o no pertenece a ese proceso.';
            end if;
            if (v_b ? 'temperatura_c' and cafe._edicion_num(v_b, 'temperatura_c') is not null
                and (cafe._edicion_num(v_b, 'temperatura_c') <= 0 or cafe._edicion_num(v_b, 'temperatura_c') > 999))
               or (v_b ? 'tiempo_min' and cafe._edicion_num(v_b, 'tiempo_min') is not null
                   and (cafe._edicion_num(v_b, 'tiempo_min') <= 0 or cafe._edicion_num(v_b, 'tiempo_min') > 999)) then
              raise exception using errcode = 'P0001', message = 'datos_invalidos',
                detail = 'La temperatura o el tiempo del bache no son válidos.';
            end if;
            update cafe.baches b set
              peso_entrada_kg = case when v_b ? 'peso_entrada_kg' then cafe._edicion_num(v_b, 'peso_entrada_kg') else b.peso_entrada_kg end,
              peso_salida_kg  = case when v_b ? 'peso_salida_kg' then cafe._edicion_num(v_b, 'peso_salida_kg') else b.peso_salida_kg end,
              temperatura_c   = case when v_b ? 'temperatura_c' then cafe._edicion_num(v_b, 'temperatura_c') else b.temperatura_c end,
              tiempo_min      = case when v_b ? 'tiempo_min' then cafe._edicion_num(v_b, 'tiempo_min') else b.tiempo_min end
             where b.id = v_bache.id
             returning * into v_nuevo_b;
            v_ref := initcap(v_proc.tipo::text) || ' · bache ' || v_bache.numero;
            v_n := v_n
              + cafe._registrar_cambio_edicion(v_edicion, v_lote_id, 'bache', v_bache.id, v_ref, 'peso_entrada_kg', v_bache.peso_entrada_kg, v_nuevo_b.peso_entrada_kg, v_motivo)
              + cafe._registrar_cambio_edicion(v_edicion, v_lote_id, 'bache', v_bache.id, v_ref, 'peso_salida_kg', v_bache.peso_salida_kg, v_nuevo_b.peso_salida_kg, v_motivo)
              + cafe._registrar_cambio_edicion(v_edicion, v_lote_id, 'bache', v_bache.id, v_ref, 'temperatura_c', v_bache.temperatura_c, v_nuevo_b.temperatura_c, v_motivo)
              + cafe._registrar_cambio_edicion(v_edicion, v_lote_id, 'bache', v_bache.id, v_ref, 'tiempo_min', v_bache.tiempo_min, v_nuevo_b.tiempo_min, v_motivo);
            v_hay_baches := true;
          end loop;
        end if;
        v_ref := initcap(v_proc.tipo::text);

        v_ent := v_proc.peso_entrada_kg;
        v_sal := v_proc.peso_salida_kg;
        if v_hay_baches then
          -- La tostión no tiene salida propia (la fija su empaque, B-08): solo la entrada sale de los baches.
          select sum(b.peso_entrada_kg) into v_ent from cafe.baches b where b.proceso_id = v_proc.id;
          if v_p ? 'peso_entrada_kg' and abs(cafe._edicion_num(v_p, 'peso_entrada_kg') - v_ent) > 0.001 then
            raise exception using errcode = 'P0001', message = 'edicion_incoherente',
              detail = 'Los pesos de una tostión salen de sus baches: corrige los baches, no el total.';
          end if;
          if v_p ? 'peso_salida_kg'
             and cafe._edicion_num(v_p, 'peso_salida_kg') is distinct from v_proc.peso_salida_kg then
            raise exception using errcode = 'P0001',
              message = case when v_proc.peso_salida_kg is null then 'edicion_incoherente' else 'salida_asignada_por_empaque' end,
              detail = case when v_proc.peso_salida_kg is null
                            then 'La tostión no tiene peso de salida: se calcula con el peso en báscula del empaque.'
                            else 'La salida de esta tostión la fijó su empaque: corrígela desde el empaque.' end;
          end if;
        else
          if v_p ? 'peso_entrada_kg' then v_ent := cafe._edicion_num(v_p, 'peso_entrada_kg'); end if;
          if v_p ? 'peso_salida_kg' then v_sal := cafe._edicion_num(v_p, 'peso_salida_kg'); end if;
          if v_proc.tipo = 'tostion' and exists (select 1 from cafe.baches b where b.proceso_id = v_proc.id)
             and (v_p ? 'peso_entrada_kg' or v_p ? 'peso_salida_kg') then
            raise exception using errcode = 'P0001', message = 'edicion_incoherente',
              detail = 'Los pesos de una tostión salen de sus baches: corrige los baches, no el total.';
          end if;
        end if;
        if v_ent is null or (v_sal is null and v_proc.tipo in ('trilla', 'empaque')) or v_ent <= 0 or v_sal < 0 or v_sal > v_ent then
          raise exception using errcode = 'P0001', message = 'datos_invalidos',
            detail = 'Los pesos no son válidos: la entrada debe ser mayor que cero y la salida no puede superarla.';
        end if;
        if v_p ? 'fecha' then
          begin
            v_fecha := (v_p ->> 'fecha')::date;
          exception when others then
            raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La fecha del proceso no es válida.';
          end;
          if v_fecha is null or v_fecha < v_lote.fecha_recepcion and not (v_obj ? 'fecha_recepcion') or v_fecha > current_date + 1 then
            raise exception using errcode = 'P0001', message = 'datos_invalidos',
              detail = 'La fecha del proceso no puede ser anterior a la recepción del lote ni futura.';
          end if;
        else
          v_fecha := v_proc.fecha;
        end if;

        update cafe.procesos p set
          fecha           = v_fecha,
          peso_entrada_kg = v_ent,
          peso_salida_kg  = v_sal,
          observaciones   = case when v_p ? 'observaciones' then cafe._edicion_texto(v_p, 'observaciones') else p.observaciones end
         where p.id = v_proc.id
         returning * into v_nuevo_p;

        v_n := v_n
          + cafe._registrar_cambio_edicion(v_edicion, v_lote_id, 'proceso', v_proc.id, v_ref, 'fecha', v_proc.fecha, v_nuevo_p.fecha, v_motivo)
          + cafe._registrar_cambio_edicion(v_edicion, v_lote_id, 'proceso', v_proc.id, v_ref, 'peso_entrada_kg', v_proc.peso_entrada_kg, v_nuevo_p.peso_entrada_kg, v_motivo)
          + cafe._registrar_cambio_edicion(v_edicion, v_lote_id, 'proceso', v_proc.id, v_ref, 'peso_salida_kg', v_proc.peso_salida_kg, v_nuevo_p.peso_salida_kg, v_motivo)
          + cafe._registrar_cambio_edicion(v_edicion, v_lote_id, 'proceso', v_proc.id, v_ref, 'observaciones', v_proc.observaciones, v_nuevo_p.observaciones, v_motivo);
      end loop;
    end if;

    if v_n = 0 then
      raise exception using errcode = 'P0001', message = 'sin_cambios', detail = 'No cambiaste ningún dato.';
    end if;

    -- 4) Coherencia hacia adelante: lo editado y lo que cuelga de ello no puede consumir más de lo que entrega su origen (o
    -- que lo que se recibió, en el primer paso). Se comprueba por origen, con la tolerancia del saldo. Los pesos de baches ↔
    -- proceso se comprueban después (los constraint triggers son diferidos y en una simulación no llegarían a ejecutarse).
    for v_x in
      select o.tipo, o.base_kg, o.consumido_kg
        from cafe.v_origenes_disponibles o
       where o.lote_id = v_lote_id
         and o.saldo_kg < -cafe.saldo_tolerancia_kg(o.base_kg)
         and (o.proceso_id is null or o.proceso_id = any(v_editados)
              or exists (select 1 from cafe.procesos e where e.id = any(v_editados) and e.origen_proceso_id is not distinct from o.proceso_id))
    loop
      raise exception using errcode = 'P0001', message = 'edicion_incoherente',
        detail = format('Tras la corrección, los procesos que parten de %s consumirían %s kg y solo hay %s kg. Corrige también ese proceso.',
                        case v_x.tipo when 'trilla' then 'la trilla' when 'tostion' then 'la tostión'
                                      when 'empaque' then 'el empaque' else 'el café recibido' end,
                        round(v_x.consumido_kg, 3), round(v_x.base_kg, 3));
    end loop;
    set constraints all immediate;
    set constraints all deferred;

    v_despues := cafe._metricas_edicion(v_lote_id);
    select coalesce(jsonb_agg(jsonb_build_object(
             'entidad', e.entidad, 'entidad_id', e.entidad_id, 'referencia', e.referencia, 'campo', e.campo,
             'antes', e.valor_anterior, 'despues', e.valor_nuevo) order by e.created_at, e.entidad desc, e.referencia, e.campo), '[]'::jsonb)
      into v_cambios from cafe.lote_ediciones e where e.edicion_id = v_edicion;

    if v_simular then
      raise exception using errcode = 'SIM01', message = 'simulacion';
    end if;
  exception when sqlstate 'SIM01' then
    null;  -- previsualización: se deshace todo lo escrito en este bloque y se devuelve lo medido
  end;

  perform set_config('cafe.edicion_lote', 'off', true);
  return jsonb_build_object('simulado', v_simular, 'edicion_id', case when v_simular then null else v_edicion end,
                            'lote_id', v_lote_id, 'cambios', v_cambios, 'antes', v_antes, 'despues', v_despues);
end $function$;

CREATE OR REPLACE FUNCTION cafe.kpis_periodo(p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_linea text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_desde     date;
  v_hasta     date;
  v_recibido  jsonb;
  v_mermas    jsonb;
  v_desvios   bigint;
  v_marca     jsonb;
  v_servicios jsonb;
  v_propio    jsonb;
  v_terceros  jsonb;
  v_insumos   bigint;
begin
  select r.o_desde, r.o_hasta into v_desde, v_hasta from cafe.rango_panel(p_desde, p_hasta, p_linea) r;

  -- Café recibido por línea.
  select jsonb_agg(jsonb_build_object('linea', x.linea, 'kg', coalesce(s.kg, 0), 'lotes', coalesce(s.n, 0)) order by x.orden)
    into v_recibido
    from (values ('marca_propia', 1), ('trilla', 2), ('maquila', 3)) as x(linea, orden)
    left join (
      select cafe.linea_panel(l.linea, l.servicios) as linea, sum(l.peso_recibido_kg) as kg, count(*) as n
        from cafe.lotes l
       where l.anulado_at is null and l.fecha_recepcion between v_desde and v_hasta
       group by 1
    ) s on s.linea = x.linea
   where p_linea is null or x.linea = p_linea;

  -- Merma ponderada y desvíos por tipo de proceso (los 4 tipos, aunque no tengan procesos).
  select jsonb_agg(jsonb_build_object(
           'tipo', t.tipo, 'procesos', coalesce(s.n, 0), 'kg_entrada', coalesce(s.entrada, 0), 'kg_salida', coalesce(s.salida, 0),
           'merma_kg', coalesce(s.merma, 0), 'merma_pct', s.pct, 'desvios', coalesce(s.desvios, 0))
         order by cafe.orden_proceso(t.tipo)),
         coalesce(sum(s.desvios), 0)
    into v_mermas, v_desvios
    from unnest(enum_range(null::cafe.tipo_proceso)) as t(tipo)
    left join (
      select p.tipo,
             count(*)                                                                as n,
             sum(p.peso_entrada_kg) filter (where p.tipo <> 'tostion' or p.peso_salida_kg is not null) as entrada,
             sum(p.peso_salida_kg)                                                   as salida,
             -- Solo trilla y tostión tienen merma; la tostión cuenta cuando su empaque ya fijó la salida (B-05/B-08).
             sum(p.merma_kg) filter (where p.tipo in ('trilla', 'tostion'))          as merma,
             round(sum(p.merma_kg) filter (where p.tipo in ('trilla', 'tostion'))
                   / nullif(sum(p.peso_entrada_kg) filter (where p.tipo in ('trilla', 'tostion') and p.peso_salida_kg is not null), 0) * 100, 3) as pct,
             count(*) filter (where p.desvio)                                        as desvios
        from cafe.procesos p
        join cafe.lotes l on l.tenant_id = p.tenant_id and l.id = p.lote_id
       where p.anulado_at is null and p.fecha between v_desde and v_hasta
         and (p_linea is null or cafe.linea_panel(l.linea, l.servicios) = p_linea)
       group by p.tipo
    ) s on s.tipo = t.tipo;

  -- Ingreso de marca propia: ventas vigentes; las cortesías valen 0 y se cuentan aparte.
  if p_linea is null or p_linea = 'marca_propia' then
    select jsonb_build_object(
             'total',             coalesce(sum(v.total) filter (where v.tipo = 'venta'), 0),
             'ventas',            count(*) filter (where v.tipo = 'venta'),
             'cortesias',         count(*) filter (where v.tipo = 'cortesia'),
             'unidades_cortesia', coalesce(sum(v.unidades) filter (where v.tipo = 'cortesia'), 0))
      into v_marca
      from cafe.v_ventas v
     where v.anulada_at is null and v.fecha between v_desde and v_hasta;
  end if;

  -- Ingreso de servicios: el valor congelado de cada proceso de un lote de servicio.
  if p_linea is null or p_linea in ('trilla', 'maquila') then
    with s as (
      select cafe.linea_panel(l.linea, l.servicios) as linea, sum(p.valor) as valor
        from cafe.procesos p
        join cafe.lotes l on l.tenant_id = p.tenant_id and l.id = p.lote_id
       where l.linea = 'servicio' and p.anulado_at is null and p.fecha between v_desde and v_hasta
         and (p_linea is null or cafe.linea_panel(l.linea, l.servicios) = p_linea)
       group by 1
    )
    select jsonb_build_object(
             'total', coalesce((select sum(s.valor) from s), 0),
             'por_linea', (select jsonb_agg(jsonb_build_object('linea', x.linea, 'valor', coalesce(s.valor, 0)) order by x.orden)
                             from (values ('trilla', 1), ('maquila', 2)) as x(linea, orden)
                             left join s on s.linea = x.linea
                            where p_linea is null or x.linea = p_linea))
      into v_servicios;
  end if;

  -- Inventario propio (foto de ahora): café de marca propia sin empacar + equivalente en kg del producto terminado.
  if p_linea is null or p_linea = 'marca_propia' then
    select jsonb_build_object(
             'cafe_en_planta_kg', round(coalesce(b.kg, 0) + coalesce(r.kg, 0), 3),
             'lotes_en_planta',   coalesce(b.n, 0),
             'producto_terminado_kg', round(coalesce(pt.kg, 0), 3))
      into v_propio
      from (select 1) d
      left join lateral (
        select sum(lp.kg_en_planta) as kg, count(distinct l.id) filter (where lp.kg_en_planta > 0.05) as n
          from cafe.lotes l
          join cafe.v_lote_pesos lp on lp.tenant_id = l.tenant_id and lp.lote_id = l.id
         where l.linea = 'marca_propia' and l.anulado_at is null
      ) b on true
      left join lateral (
        select sum(rp.peso_disponible_kg) as kg from cafe.v_reaperturas rp where rp.estado <> 'completada'
      ) r on true
      left join lateral (
        select sum(greatest(s.stock, 0) * (s.atributos ->> 'presentacion_g')::numeric / 1000) as kg
          from public.v_stock s
         where s.tipo = 'producto_terminado' and jsonb_typeof(s.atributos -> 'presentacion_g') = 'number'
      ) pt on true;
  end if;

  -- Inventario de terceros (foto de ahora): lotes de servicio sin remisión de entrega vigente, por cliente.
  if p_linea is null or p_linea in ('trilla', 'maquila') then
    with por_lote as (
      select l.tercero_id, l.id as lote_id, pl.kg
        from cafe.lotes l
        cross join lateral (
          select sum(lp.peso_actual_kg) as kg from cafe.v_lote_pesos lp where lp.tenant_id = l.tenant_id and lp.lote_id = l.id
        ) pl
       where l.linea = 'servicio' and l.anulado_at is null and coalesce(pl.kg, 0) > 0
         and (p_linea is null or cafe.linea_panel(l.linea, l.servicios) = p_linea)
         and not exists (select 1 from cafe.remisiones_lotes rl where rl.tenant_id = l.tenant_id and rl.lote_id = l.id and rl.activa)
    ), por_cliente as (
      select pl.tercero_id, te.nombre, sum(pl.kg) as kg, count(*) as lotes
        from por_lote pl
        left join public.terceros te on te.id = pl.tercero_id
       group by pl.tercero_id, te.nombre
    )
    select jsonb_build_object(
             'kg_en_planta', round(coalesce((select sum(c.kg) from por_cliente c), 0), 3),
             'lotes',        coalesce((select sum(c.lotes) from por_cliente c), 0),
             'clientes',     (select count(*) from por_cliente),
             'por_cliente',  coalesce((select jsonb_agg(jsonb_build_object('tercero_id', c.tercero_id, 'nombre', c.nombre,
                                                                          'kg', round(c.kg, 3), 'lotes', c.lotes)
                                                        order by c.kg desc, c.nombre)
                                         from (select * from por_cliente order by kg desc, nombre limit 5) c), '[]'::jsonb))
      into v_terceros;
  end if;

  select count(*) into v_insumos
    from public.v_stock s
   where s.tipo = 'insumo' and s.activo and s.bajo_minimo;

  return jsonb_build_object(
    'desde', v_desde, 'hasta', v_hasta, 'hoy', cafe.hoy_local(), 'linea', p_linea,
    'recibido', coalesce(v_recibido, '[]'::jsonb),
    'mermas', coalesce(v_mermas, '[]'::jsonb),
    'desvios', v_desvios,
    'ingreso_marca_propia', v_marca,
    'ingreso_servicios', v_servicios,
    'inventario_propio', v_propio,
    'inventario_terceros', v_terceros,
    'insumos_bajo_minimo', v_insumos);
end;
$function$;

CREATE OR REPLACE FUNCTION cafe.produccion_diaria(p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date, p_linea text DEFAULT NULL::text)
 RETURNS TABLE(fecha date, linea text, tipo cafe.tipo_proceso, kg_entrada numeric, kg_salida numeric, merma_pct numeric, valor numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_desde date;
  v_hasta date;
begin
  select r.o_desde, r.o_hasta into v_desde, v_hasta from cafe.rango_panel(p_desde, p_hasta, p_linea) r;

  return query
  select p.fecha,
         cafe.linea_panel(l.linea, l.servicios),
         p.tipo,
         (sum(p.peso_entrada_kg) filter (where p.tipo <> 'tostion' or p.peso_salida_kg is not null))::numeric,
         sum(p.peso_salida_kg)::numeric,
         round(sum(p.merma_kg) filter (where p.tipo in ('trilla', 'tostion'))
               / nullif(sum(p.peso_entrada_kg) filter (where p.tipo in ('trilla', 'tostion') and p.peso_salida_kg is not null), 0) * 100, 3),
         sum(p.valor)::numeric
    from cafe.procesos p
    join cafe.lotes l on l.tenant_id = p.tenant_id and l.id = p.lote_id
   where p.anulado_at is null and p.fecha between v_desde and v_hasta
     and (p_linea is null or cafe.linea_panel(l.linea, l.servicios) = p_linea)
   group by p.fecha, cafe.linea_panel(l.linea, l.servicios), p.tipo
   order by p.fecha, cafe.linea_panel(l.linea, l.servicios), cafe.orden_proceso(p.tipo);
end;
$function$;

CREATE OR REPLACE FUNCTION cafe.costo_libra_lote(p_lote uuid, p_gramos integer DEFAULT 500)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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

  -- Solo tostiones con salida (su empaque ya cerró la tanda): la merma de una tanda en curso no existe.
  select coalesce(sum(p.peso_entrada_kg), 0), coalesce(sum(p.peso_salida_kg), 0), count(*)
    into v_t_ent, v_t_sal, v_t_n
    from cafe.procesos p where p.lote_id = p_lote and p.tipo = 'tostion' and p.anulado_at is null and p.peso_salida_kg is not null;
  select coalesce(sum(p.peso_entrada_kg), 0), coalesce(sum(p.peso_salida_kg), 0), count(*)
    into v_m_ent, v_m_sal, v_m_n
    from cafe.procesos p where p.lote_id = p_lote and p.tipo = 'molienda' and p.anulado_at is null and p.peso_salida_kg is not null;

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
$function$;

CREATE OR REPLACE FUNCTION cafe.proveedores_marca_propia(p_desde date DEFAULT NULL::date, p_hasta date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
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
         where p.tipo = 'tostion' and p.anulado_at is null and p.peso_salida_kg is not null
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
$function$;

