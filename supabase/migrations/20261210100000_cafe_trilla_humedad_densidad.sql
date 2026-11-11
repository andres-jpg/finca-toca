-- B-04 (FIN-150) · Trilla: peso final, humedad y densidad al finalizar.
--
-- * `cafe.procesos.humedad_pct` y `densidad_gl` (nullable, solo trilla): lo que mide el operario al terminar la trilla. No tocan
--   `lotes.humedad_pct`/`densidad`, que son la medición de la RECEPCIÓN (con sus alertas de calidad): sobrescribirlas perdería ese dato.
-- * `_insertar_proceso` (+2 parámetros) y `registrar_proceso` los reciben; un peso final mayor que la entrada se rechaza con
--   `peso_final_supera_entrada` («El peso final supera la entrada. Revisar el peso.»).
-- * `entregar_lotes` copia humedad y densidad de la trilla al `detalle` de la remisión.
-- Compatible hacia atrás: columnas nuevas nullable; las RPC aceptan los mismos campos de antes.

alter table cafe.procesos
  add column humedad_pct numeric(5,2) check (humedad_pct is null or humedad_pct between 0 and 100),
  add column densidad_gl numeric(7,2) check (densidad_gl is null or densidad_gl > 0),
  add constraint procesos_humedad_densidad_trilla check (tipo = 'trilla' or (humedad_pct is null and densidad_gl is null));

grant insert (humedad_pct, densidad_gl) on table cafe.procesos to authenticated;

drop function cafe._insertar_proceso(uuid, cafe.tipo_proceso, date, uuid, numeric, numeric, cafe.nivel_tueste, jsonb, text, text, numeric);

CREATE OR REPLACE FUNCTION cafe._insertar_proceso(p_lote uuid, p_tipo cafe.tipo_proceso, p_fecha date, p_origen uuid, p_entrada numeric, p_salida numeric, p_nivel cafe.nivel_tueste, p_baches jsonb, p_observaciones text, p_diferencia_destino text DEFAULT NULL::text, p_incluido numeric DEFAULT NULL::numeric, p_humedad numeric DEFAULT NULL::numeric, p_densidad numeric DEFAULT NULL::numeric)
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
  v_humedad   numeric;
  v_densidad  numeric;
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
    if v_salida > v_entrada and p_tipo = 'trilla' then
      raise exception using errcode = 'P0001', message = 'peso_final_supera_entrada',
        detail = format('El peso final (%s kg) supera la entrada (%s kg). Revisar el peso.', v_salida, v_entrada);
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

  -- 6b) Humedad y densidad del café al terminar la trilla (B-04): opcionales, solo de la trilla.
  if p_tipo = 'trilla' then
    v_humedad := round(p_humedad, 2);
    v_densidad := round(p_densidad, 2);
    if v_humedad is not null and v_humedad not between 0 and 100 then
      raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La humedad debe estar entre 0 y 100 %.';
    end if;
    if v_densidad is not null and (v_densidad <= 0 or v_densidad > 99999) then
      raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La densidad debe ser mayor que cero.';
    end if;
  elsif p_humedad is not null or p_densidad is not null then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Solo la trilla registra humedad y densidad.';
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
                             origen_proceso_id, origen_tipo, tostado_incluido_kg, humedad_pct, densidad_gl)
  values (p_lote, p_tipo, p_fecha, v_entrada, v_salida, v_tarifa, v_ref, v_tol, v_nivel,
          nullif(btrim(coalesce(p_observaciones, '')), ''),
          case when p_tipo = 'empaque' and v_entrada > v_salida then p_diferencia_destino end,
          v_origen, cafe.paso_origen(p_lote, p_tipo), case when p_tipo = 'empaque' then p_incluido end, v_humedad, v_densidad)
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
    'humedad_pct', v_proc.humedad_pct,
    'densidad_gl', v_proc.densidad_gl,
    'tarifa_kg', v_proc.tarifa_kg,
    'avance_texto', v_estado.avance_texto);
end $function$;

revoke execute on function cafe._insertar_proceso(uuid, cafe.tipo_proceso, date, uuid, numeric, numeric, cafe.nivel_tueste, jsonb, text, text, numeric, numeric, numeric) from public, anon;
grant execute on function cafe._insertar_proceso(uuid, cafe.tipo_proceso, date, uuid, numeric, numeric, cafe.nivel_tueste, jsonb, text, text, numeric, numeric, numeric) to authenticated;

CREATE OR REPLACE FUNCTION cafe.registrar_proceso(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_lote    uuid;
  v_tipo    cafe.tipo_proceso;
  v_fecha   date;
  v_origen  uuid;
  v_entrada numeric;
  v_salida  numeric;
  v_nivel   cafe.nivel_tueste;
  v_baches  jsonb;
  v_obs     text;
  v_reap    uuid;
  v_reap_lote uuid;
  v_humedad numeric;
  v_densidad numeric;
begin
  -- Permisos antes que nada: un viewer recibe 42501 aunque mande un formato erróneo.
  if not coalesce((select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'), false)
     or not coalesce((select public.tenant_tiene_modulo('cafe.procesos')), false) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El proceso no tiene el formato esperado.';
  end if;

  -- Los tipos erróneos no deben acabar como un error inesperado de cast.
  begin
    if jsonb_typeof(p -> 'lote_id') is distinct from 'string'
       or jsonb_typeof(p -> 'tipo') is distinct from 'string'
       or jsonb_typeof(p -> 'fecha') is distinct from 'string' then
      raise exception using errcode = '22023';
    end if;
    v_lote  := (p ->> 'lote_id')::uuid;
    v_tipo  := (p ->> 'tipo')::cafe.tipo_proceso;
    v_fecha := (p ->> 'fecha')::date;

    if jsonb_typeof(p -> 'peso_entrada_kg') = 'number' then
      v_entrada := (p ->> 'peso_entrada_kg')::numeric;
    elsif p ? 'peso_entrada_kg' and jsonb_typeof(p -> 'peso_entrada_kg') <> 'null' then
      raise exception using errcode = '22023';
    end if;
    if jsonb_typeof(p -> 'peso_salida_kg') = 'number' then
      v_salida := (p ->> 'peso_salida_kg')::numeric;
    elsif p ? 'peso_salida_kg' and jsonb_typeof(p -> 'peso_salida_kg') <> 'null' then
      raise exception using errcode = '22023';
    end if;

    -- `bultos` (versión anterior) se acepta y se ignora durante un release.
    if jsonb_typeof(p -> 'origen_proceso_id') = 'string' then
      v_origen := (p ->> 'origen_proceso_id')::uuid;
    elsif p ? 'origen_proceso_id' and jsonb_typeof(p -> 'origen_proceso_id') <> 'null' then
      raise exception using errcode = '22023';
    end if;

    if jsonb_typeof(p -> 'baches') = 'array' then
      v_baches := p -> 'baches';
    elsif p ? 'baches' and jsonb_typeof(p -> 'baches') <> 'null' then
      raise exception using errcode = '22023';
    end if;

    if jsonb_typeof(p -> 'nivel_tueste') = 'string' then
      v_nivel := nullif(p ->> 'nivel_tueste', '')::cafe.nivel_tueste;
    elsif p ? 'nivel_tueste' and jsonb_typeof(p -> 'nivel_tueste') <> 'null' then
      raise exception using errcode = '22023';
    end if;

    if jsonb_typeof(p -> 'observaciones') = 'string' then
      v_obs := nullif(btrim(p ->> 'observaciones'), '');
    elsif p ? 'observaciones' and jsonb_typeof(p -> 'observaciones') <> 'null' then
      raise exception using errcode = '22023';
    end if;

    if jsonb_typeof(p -> 'humedad_pct') = 'number' then
      v_humedad := (p ->> 'humedad_pct')::numeric;
    elsif p ? 'humedad_pct' and jsonb_typeof(p -> 'humedad_pct') <> 'null' then
      raise exception using errcode = '22023';
    end if;
    if jsonb_typeof(p -> 'densidad_gl') = 'number' then
      v_densidad := (p ->> 'densidad_gl')::numeric;
    elsif p ? 'densidad_gl' and jsonb_typeof(p -> 'densidad_gl') <> 'null' then
      raise exception using errcode = '22023';
    end if;

    if jsonb_typeof(p -> 'reapertura_id') = 'string' then
      v_reap := (p ->> 'reapertura_id')::uuid;
    elsif p ? 'reapertura_id' and jsonb_typeof(p -> 'reapertura_id') <> 'null' then
      raise exception using errcode = '22023';
    end if;
  exception when others then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El proceso no tiene el formato esperado.';
  end;

  -- Proceso sobre un café reabierto (HU-16): solo molienda o empaque, sin origen ni baches ni tueste.
  if v_reap is not null then
    if v_tipo not in ('molienda', 'empaque') then
      raise exception using errcode = 'P0001', message = 'reapertura_solo_molienda_empaque',
        detail = 'El café reabierto ya está tostado: solo se muele o se empaca, sin repetir trilla ni tostión.';
    end if;
    if v_origen is not null or v_nivel is not null
       or (v_baches is not null and jsonb_array_length(v_baches) > 0) then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'Un proceso de reapertura no lleva origen, baches ni nivel de tueste.';
    end if;
    select r.lote_id into v_reap_lote from cafe.reaperturas r where r.id = v_reap;
    if not found then
      raise exception using errcode = 'P0001', message = 'reapertura_no_encontrada',
        detail = 'La reapertura no existe o no pertenece a tu cliente.';
    end if;
    if v_reap_lote <> v_lote then
      raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La reapertura no es de este lote.';
    end if;
  end if;

  -- El empaque de marca propia mueve inventario (bolsas, etiquetas, producto terminado): su RPC es otra.
  if v_tipo = 'empaque' and (exists (select 1 from cafe.lotes l where l.id = v_lote and l.linea = 'marca_propia')
                          or cafe.paso_origen(v_lote, 'empaque') = 'tostion') then
    raise exception using errcode = 'P0001', message = 'usar_registrar_empaque',
      detail = 'El empaque de una tanda se registra con su peso en báscula y sus bolsas: usar el formulario de empaque.';
  end if;

  if v_reap is not null then
    return cafe._insertar_proceso_reapertura(v_reap, v_tipo, v_fecha, v_entrada, v_salida, v_obs);
  end if;
  return cafe._insertar_proceso(v_lote, v_tipo, v_fecha, v_origen, v_entrada, v_salida, v_nivel, v_baches, v_obs, null, null, v_humedad, v_densidad);
end $function$;

create or replace function cafe.entregar_lotes(p jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_ids      uuid[];
  v_id       uuid;
  v_fecha    date;
  v_nombre   text;
  v_doc      text;
  v_obs      text;
  v_forzar   boolean := false;
  v_rol      public.rol_tenant;
  v_l        cafe.v_lotes%rowtype;
  v_tercero  uuid;
  v_faltan   text;
  v_detalle  jsonb;
  v_det_tot  jsonb := '[]'::jsonb;
  v_links    jsonb := '[]'::jsonb;
  v_codigos  text[] := '{}';
  v_primero  uuid;
  v_recibido numeric := 0;
  v_entregado numeric := 0;
  v_valor    numeric := 0;
  v_numero   text;
  v_rem      uuid;
  v_forzada  boolean := false;
  v_cod      text;
begin
  v_rol := (select public.rol_en_tenant());
  if not coalesce(v_rol in ('owner', 'admin', 'operativo'), false)
     or not coalesce((select public.tenant_tiene_modulo('cafe.remisiones')), false) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La entrega no tiene el formato esperado.';
  end if;

  begin
    if jsonb_typeof(p -> 'lote_ids') is distinct from 'array'
       or jsonb_typeof(p -> 'fecha') is distinct from 'string' then
      raise exception using errcode = '22023';
    end if;
    select array_agg(distinct x::uuid order by x::uuid) into v_ids from jsonb_array_elements_text(p -> 'lote_ids') x;
    v_fecha := (p ->> 'fecha')::date;

    if jsonb_typeof(p -> 'recibe_nombre') = 'string' then
      v_nombre := nullif(btrim(p ->> 'recibe_nombre'), '');
    end if;
    if jsonb_typeof(p -> 'recibe_documento') = 'string' then
      v_doc := nullif(btrim(p ->> 'recibe_documento'), '');
    end if;
    if jsonb_typeof(p -> 'observaciones') = 'string' then
      v_obs := nullif(btrim(p ->> 'observaciones'), '');
    elsif p ? 'observaciones' and jsonb_typeof(p -> 'observaciones') <> 'null' then
      raise exception using errcode = '22023';
    end if;
    if jsonb_typeof(p -> 'forzar') = 'boolean' then
      v_forzar := (p ->> 'forzar')::boolean;
    elsif p ? 'forzar' and jsonb_typeof(p -> 'forzar') <> 'null' then
      raise exception using errcode = '22023';
    end if;
  exception when others then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La entrega no tiene el formato esperado.';
  end;

  if v_ids is null or cardinality(v_ids) < 1 or cardinality(v_ids) > 20 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Elige entre 1 y 20 lotes para entregar.';
  end if;
  if v_nombre is null then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Escribe el nombre de quien recibe.';
  end if;
  if v_doc is null then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Escribe la cédula de quien recibe.';
  end if;
  if length(v_nombre) > 120 or length(v_doc) > 30 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El nombre o la cédula de quien recibe son demasiado largos.';
  end if;
  if v_fecha < date '2000-01-01' or v_fecha > date '2100-12-31' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La fecha de entrega no es válida.';
  end if;
  if v_forzar and v_rol not in ('owner', 'admin') then
    raise exception using errcode = 'P0001', message = 'remision_forzar_no_permitido',
      detail = 'Solo un administrador puede entregar un lote con servicios pendientes.';
  end if;

  -- Serializa con registrar_proceso / anular_proceso de cada lote (misma clave), siempre en el mismo orden (por id)
  -- para que dos entregas cruzadas no se bloqueen entre sí.
  foreach v_id in array v_ids loop
    perform pg_advisory_xact_lock(hashtextextended('cafe.lote:' || v_id::text, 0));
  end loop;

  if (select count(*) from cafe.v_lotes v where v.id = any(v_ids)) <> cardinality(v_ids) then
    raise exception using errcode = 'P0001', message = 'lote_no_encontrado',
      detail = 'Algún lote no existe o no pertenece a tu cliente.';
  end if;

  for v_l in select * from cafe.v_lotes v where v.id = any(v_ids) order by v.codigo loop
    -- Con varios lotes los mensajes dicen de cuál se trata.
    v_cod := case when cardinality(v_ids) > 1 then ' ' || v_l.codigo else '' end;
    if v_tercero is null then
      v_tercero := v_l.tercero_id;
      v_primero := v_l.id;
    elsif v_l.tercero_id is distinct from v_tercero then
      raise exception using errcode = 'P0001', message = 'remision_clientes_distintos',
        detail = 'Los lotes de una remisión deben ser de un mismo cliente.';
    end if;

    if v_l.estado = 'anulado' then
      raise exception using errcode = 'P0001', message = 'lote_anulado',
        detail = format('El lote%s está anulado: ya no se puede modificar.', v_cod);
    end if;
    if v_l.linea <> 'servicio' then
      raise exception using errcode = 'P0001', message = 'remision_solo_servicios',
        detail = 'La remisión de entrega es solo para lotes de trilla y maquila de clientes.';
    end if;
    if v_l.estado = 'entregado' then
      raise exception using errcode = 'P0001', message = 'remision_duplicada',
        detail = format('El lote%s ya tiene una remisión vigente: anúlala si necesitas generar otra.', v_cod);
    end if;
    if v_fecha < v_l.fecha_recepcion then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = format('La fecha de entrega no puede ser anterior a la recepción del lote%s.', v_cod);
    end if;
    if v_l.estado = 'recibido' then
      raise exception using errcode = 'P0001', message = 'remision_sin_procesos',
        detail = format('El lote%s aún no tiene ningún proceso registrado: no hay nada que entregar.', v_cod);
    end if;

    if v_l.estado <> 'listo' then
      select string_agg(case s when 'tostion' then 'tostión' else s::text end, ', ' order by cafe.orden_proceso(s))
        into v_faltan
        from unnest(v_l.servicios_requeridos) s
       where not exists (select 1 from cafe.v_lote_etapas e where e.lote_id = v_l.id and e.tipo = s and e.completo);
      if not v_forzar then
        raise exception using errcode = 'P0001', message = 'servicios_incompletos',
          detail = format('Faltan servicios por completar%s: %s.', case when v_cod = '' then '' else ' (lote' || v_cod || ')' end, coalesce(v_faltan, '—'));
      end if;
      if v_obs is null then
        raise exception using errcode = 'P0001', message = 'datos_invalidos',
          detail = 'Para entregar con servicios pendientes escribe la observación (por qué se entrega así).';
      end if;
      v_forzada := true;
    end if;

    -- Detalle por servicio de ESTE lote, en el orden de la planta (contratados sin hacer = pendientes, sin cifras).
    select coalesce(jsonb_agg(x.fila order by cafe.orden_proceso(x.servicio)), '[]'::jsonb) into v_detalle
      from (
        select s as servicio,
               case
                 when e.tipo is null then
                   jsonb_build_object('servicio', s, 'pendiente', true, 'incluido', s = 'empaque')
                 else
                   jsonb_build_object(
                     'servicio', s,
                     'kg_entrada', e.peso_entrada,
                     'kg_salida', e.peso_salida,
                     'merma_kg', e.merma_kg,
                     'merma_pct', e.merma_pct,
                     'tarifa_kg', case when e.peso_entrada > 0 then round(e.valor / e.peso_entrada, 2) else 0 end,
                     'valor', e.valor,
                     'nivel_tueste', case when s = 'tostion' then
                       (select p2.nivel_tueste from cafe.procesos p2
                         where p2.lote_id = v_l.id and p2.tipo = 'tostion' and p2.anulado_at is null
                         order by p2.created_at desc limit 1) end,
                     'humedad_pct', case when s = 'trilla' then
                       (select p3.humedad_pct from cafe.procesos p3
                         where p3.lote_id = v_l.id and p3.tipo = 'trilla' and p3.anulado_at is null
                         order by p3.created_at desc limit 1) end,
                     'densidad_gl', case when s = 'trilla' then
                       (select p3.densidad_gl from cafe.procesos p3
                         where p3.lote_id = v_l.id and p3.tipo = 'trilla' and p3.anulado_at is null
                         order by p3.created_at desc limit 1) end,
                     'incluido', s = 'empaque',
                     'pendiente', not e.completo)
               end as fila
          from unnest(v_l.servicios_requeridos) s
          left join cafe.v_lote_etapas e on e.lote_id = v_l.id and e.tipo = s
      ) x;

    v_codigos := v_codigos || v_l.codigo;
    v_recibido := v_recibido + v_l.peso_recibido_kg;
    v_entregado := v_entregado + v_l.peso_actual_kg;
    v_valor := v_valor + v_l.valor_servicios;
    v_det_tot := v_det_tot || coalesce((select jsonb_agg(d || jsonb_build_object('lote_codigo', v_l.codigo))
                                          from jsonb_array_elements(v_detalle) d), '[]'::jsonb);
    v_links := v_links || jsonb_build_array(jsonb_build_object(
      'lote_id', v_l.id, 'lote_codigo', v_l.codigo, 'peso_recibido_kg', v_l.peso_recibido_kg,
      'peso_entregado_kg', v_l.peso_actual_kg, 'detalle', v_detalle, 'valor_servicios', v_l.valor_servicios));
  end loop;

  v_numero := public.siguiente_consecutivo('REM', v_fecha);

  insert into cafe.remisiones (numero, lote_id, lote_codigo, fecha, tercero_id, cliente_nombre, cliente_identificacion,
                               peso_recibido_kg, peso_entregado_kg, detalle, valor_servicios, recibido_por,
                               recibe_nombre, recibe_documento, observaciones, forzada)
  select v_numero, v_primero, array_to_string(v_codigos, ', '), v_fecha, v_tercero, coalesce(t.nombre, '—'),
         t.identificacion, v_recibido, v_entregado, v_det_tot, v_valor, v_nombre, v_nombre, v_doc, v_obs, v_forzada
    from public.terceros t where t.id = v_tercero
  returning id into v_rem;

  insert into cafe.remisiones_lotes (remision_id, lote_id, lote_codigo, peso_recibido_kg, peso_entregado_kg, detalle,
                                     valor_servicios)
  select v_rem, x.lote_id, x.lote_codigo, x.peso_recibido_kg, x.peso_entregado_kg, x.detalle, x.valor_servicios
    from jsonb_to_recordset(v_links) as x(lote_id uuid, lote_codigo text, peso_recibido_kg numeric,
                                          peso_entregado_kg numeric, detalle jsonb, valor_servicios numeric);

  return jsonb_build_object('id', v_rem, 'numero', v_numero, 'forzada', v_forzada, 'lote_ids', to_jsonb(v_ids));
end $$;
