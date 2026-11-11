-- Reconciliación de la oleada 3 (B-02, B-03/B-06/B-07, B-04): las migraciones 20261210 (trilla con humedad y densidad),
-- 20261211 (molienda solicitada) y 20261212 (perfiles por kilos) nacieron en paralelo y redefinen las mismas funciones.
-- Esta migración deja la definición FINAL de las compartidas, con TODAS las capacidades:
--   * cafe._insertar_proceso(…, p_humedad, p_densidad, p_molienda_modo, p_molienda_kg): humedad/densidad de la trilla (B-04)
--     + decisión de molienda de la tanda (B-03/B-06).
--   * cafe.registrar_proceso(p): lee humedad_pct/densidad_gl (B-04) y molienda {modo, kg} (B-06) y llama a la anterior.
--   * cafe.registrar_recepcion(p): perfiles de tueste por kilos (B-02) + molienda solicitada (B-03); el tostado estimado
--     usa la merma de la tostión PONDERADA por kilos de los perfiles (misma cuenta que mermaTostionPonderada en TS).
-- (v_lote_etapas, servicios_requeridos, entregar_lotes y registrar_compra no se solapan: quedan como las dejaron sus migraciones.)
-- Debe ir DESPUÉS de las tres: ninguna está aplicada en un entorno, así que se pueden corregir sin romper expand → migrate → contract.

drop function if exists cafe._insertar_proceso(uuid, cafe.tipo_proceso, date, uuid, numeric, numeric, cafe.nivel_tueste, jsonb, text, text, numeric, text, numeric);

CREATE OR REPLACE FUNCTION cafe._insertar_proceso(p_lote uuid, p_tipo cafe.tipo_proceso, p_fecha date, p_origen uuid, p_entrada numeric, p_salida numeric, p_nivel cafe.nivel_tueste, p_baches jsonb, p_observaciones text, p_diferencia_destino text DEFAULT NULL::text, p_incluido numeric DEFAULT NULL::numeric, p_humedad numeric DEFAULT NULL::numeric, p_densidad numeric DEFAULT NULL::numeric, p_molienda_modo text DEFAULT NULL::text, p_molienda_kg numeric DEFAULT NULL::numeric)
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
  v_mol_modo  text;
  v_mol_kg    numeric;
  v_tostado   numeric;
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

  -- Molienda: solo si la tanda la pide (B-06). El empaque de una tanda que la pide va después de su molienda.
  if p_tipo = 'molienda' and v_origen is not null
     and exists (select 1 from cafe.procesos o where o.id = v_origen and o.molienda_modo = 'ninguna') then
    raise exception using errcode = 'P0001', message = 'molienda_no_solicitada',
      detail = 'Esta tanda se decidió sin molienda: modificar la cantidad antes de confirmar.';
  end if;
  if p_tipo = 'empaque' and v_origen is not null and coalesce(cafe.tanda_requiere_molienda(v_origen), false)
     and not exists (select 1 from cafe.procesos m
                      where m.lote_id = p_lote and m.tipo = 'molienda' and m.anulado_at is null and m.reapertura_id is null
                        and m.origen_proceso_id = v_origen) then
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

  -- 8b) Decisión de molienda de la tanda (B-06). El servidor recalcula los kilos: tostado estimado = entrada × (1 − merma de
  -- referencia del nivel), a 1 decimal; mitad = tostado / 2; «kg» = lo digitado (sin pasar del tostado). Sin dato, un lote de
  -- terceros hereda lo pedido en la recepción; marca propia queda sin decisión (null = comportamiento anterior).
  if p_tipo = 'tostion' then
    v_mol_modo := p_molienda_modo;
    v_mol_kg   := p_molienda_kg;
    if v_mol_modo is null and v_lote.linea = 'servicio' and 'molienda' = any (v_lote.servicios) then
      v_mol_modo := v_lote.molienda_solicitada_modo;
      v_mol_kg   := case when v_mol_modo = 'kg' then v_lote.molienda_solicitada_kg end;
    end if;
    if v_mol_modo is not null then
      if v_mol_modo not in ('todo', 'mitad', 'kg', 'ninguna') then
        raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La cantidad a moler no es válida.';
      end if;
      if v_mol_modo <> 'ninguna' and v_lote.linea = 'servicio' and not 'molienda' = any (v_lote.servicios) then
        raise exception using errcode = 'P0001', message = 'servicio_no_contratado',
          detail = 'El servicio de molienda no está contratado en este lote.';
      end if;
      v_tostado := round(v_entrada * (1 - v_ref / 100), 1);
      if v_mol_modo = 'ninguna' then
        v_mol_kg := null;
      elsif v_mol_modo = 'todo' then
        v_mol_kg := v_tostado;
      elsif v_mol_modo = 'mitad' then
        v_mol_kg := round(v_tostado / 2, 1);
      else
        if v_mol_kg is null or v_mol_kg <= 0 or v_mol_kg >= 10000000 or v_mol_kg <> round(v_mol_kg, 3) then
          raise exception using errcode = 'P0001', message = 'datos_invalidos',
            detail = 'Indica los kilos a moler (mayores que cero y con máximo 3 decimales).';
        end if;
        if v_mol_kg > v_tostado + 0.05 then
          raise exception using errcode = 'P0001', message = 'molienda_supera_tostado',
            detail = format('La cantidad a moler (%s kg) supera el tostado estimado (%s kg).', trim_scale(v_mol_kg), trim_scale(v_tostado));
        end if;
      end if;
    end if;
  end if;

  -- 9) Escrituras.
  insert into cafe.procesos (lote_id, tipo, fecha, peso_entrada_kg, peso_salida_kg, tarifa_kg,
                             merma_referencia_pct, tolerancia_pts, nivel_tueste, observaciones, diferencia_destino,
                             origen_proceso_id, origen_tipo, tostado_incluido_kg, humedad_pct, densidad_gl, molienda_modo, molienda_kg)
  values (p_lote, p_tipo, p_fecha, v_entrada, v_salida, v_tarifa, v_ref, v_tol, v_nivel,
          nullif(btrim(coalesce(p_observaciones, '')), ''),
          case when p_tipo = 'empaque' and v_entrada > v_salida then p_diferencia_destino end,
          v_origen, cafe.paso_origen(p_lote, p_tipo), case when p_tipo = 'empaque' then p_incluido end, v_humedad, v_densidad,
          case when p_tipo = 'tostion' then v_mol_modo end, case when p_tipo = 'tostion' then v_mol_kg end)
  returning * into v_proc;

  if p_tipo = 'tostion' then
    insert into cafe.baches (proceso_id, numero, peso_entrada_kg, temperatura_c, tiempo_min, observaciones)
    select v_proc.id, x.n::smallint, (x.e ->> 'peso_entrada_kg')::numeric,
           (x.e ->> 'temperatura_c')::numeric, (x.e ->> 'tiempo_min')::numeric, x.e ->> 'observaciones'
      from jsonb_array_elements(v_baches) with ordinality as x(e, n);
  end if;

  if p_tipo = 'tostion' and v_mol_modo is not null and v_lote.linea = 'servicio' then
    perform cafe._fijar_molienda(p_lote, null, v_mol_modo, v_mol_kg);
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
    'avance_texto', v_estado.avance_texto,
    'molienda_modo', v_proc.molienda_modo,
    'molienda_kg', v_proc.molienda_kg);
end $function$;

revoke execute on function cafe._insertar_proceso(uuid, cafe.tipo_proceso, date, uuid, numeric, numeric, cafe.nivel_tueste, jsonb, text, text, numeric, numeric, numeric, text, numeric) from public, anon;
grant execute on function cafe._insertar_proceso(uuid, cafe.tipo_proceso, date, uuid, numeric, numeric, cafe.nivel_tueste, jsonb, text, text, numeric, numeric, numeric, text, numeric) to authenticated;

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
  v_mol_modo text;
  v_mol_kg numeric;
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
    if jsonb_typeof(p -> 'molienda' ) = 'object' then
      if jsonb_typeof(p -> 'molienda' -> 'modo') = 'string' then
        v_mol_modo := p -> 'molienda' ->> 'modo';
      elsif p -> 'molienda' ? 'modo' and jsonb_typeof(p -> 'molienda' -> 'modo') <> 'null' then
        raise exception using errcode = '22023';
      end if;
      if jsonb_typeof(p -> 'molienda' -> 'kg') = 'number' then
        v_mol_kg := (p -> 'molienda' ->> 'kg')::numeric;
      elsif p -> 'molienda' ? 'kg' and jsonb_typeof(p -> 'molienda' -> 'kg') <> 'null' then
        raise exception using errcode = '22023';
      end if;
    elsif p ? 'molienda' and jsonb_typeof(p -> 'molienda') <> 'null' then
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
  return cafe._insertar_proceso(v_lote, v_tipo, v_fecha, v_origen, v_entrada, v_salida, v_nivel, v_baches, v_obs,
                                 null, null, v_humedad, v_densidad, v_mol_modo, v_mol_kg);
end $function$;

CREATE OR REPLACE FUNCTION cafe.registrar_recepcion(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_tercero_id   uuid;
  v_fecha        date;
  v_peso         numeric;
  v_num          integer;
  v_pesos        numeric[];
  v_humedad      numeric;
  v_densidad     numeric;
  v_servicios    cafe.tipo_proceso[];
  v_nivel        cafe.nivel_tueste;
  v_temp         numeric;
  v_tiempo       numeric;
  v_obs          text;
  v_ter          record;
  v_rango_h      jsonb;
  v_rango_d      jsonb;
  v_rangos       jsonb;
  v_alertas      text[] := '{}';
  v_id           uuid;
  v_codigo       text;
  v_zona         text;
  v_hoy          date;
  v_at           timestamptz;
  v_peso_paso    numeric;
  v_merma        numeric;
  v_s            cafe.tipo_proceso;
  v_tarifa       numeric;
  v_estimacion   jsonb := '[]';
  v_perfiles     jsonb;
  v_n_perfiles   integer;
  v_el           jsonb;
  v_i            integer;
  v_kg_tostion   numeric;
  v_merma_trilla numeric;
  v_suma_kg      numeric := 0;
  v_kg           numeric;
  v_p_nivel      cafe.nivel_tueste;
  v_p_temp       numeric;
  v_p_tiempo     numeric;
  v_filas        jsonb := '[]';
  v_mol_modo     text;
  v_mol_kg       numeric;
  v_tostado      numeric;
  v_mermas       numeric;
begin
  -- 1. Permisos y módulo ---------------------------------------------------------------------------------------
  if not coalesce((select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'), false)
     or not coalesce((select public.tenant_tiene_modulo('cafe.recepcion')), false) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  -- 2. Lectura y validación de la entrada ----------------------------------------------------------------------
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La recepción no es válida.';
  end if;

  begin
    if jsonb_typeof(p -> 'peso_kg') is distinct from 'number' then
      raise exception using errcode = '22023';
    end if;
    v_tercero_id := (p ->> 'tercero_id')::uuid;
    v_fecha      := (p ->> 'fecha')::date;
    v_peso       := round((p ->> 'peso_kg')::numeric, 3);

    if jsonb_typeof(p -> 'humedad_pct') = 'number' then
      v_humedad := round((p ->> 'humedad_pct')::numeric, 2);
    elsif jsonb_typeof(p -> 'humedad_pct') not in ('null') and p ? 'humedad_pct' then
      raise exception using errcode = '22023';
    end if;
    if jsonb_typeof(p -> 'densidad') = 'number' then
      v_densidad := round((p ->> 'densidad')::numeric, 2);
    elsif jsonb_typeof(p -> 'densidad') not in ('null') and p ? 'densidad' then
      raise exception using errcode = '22023';
    end if;

    -- `num_bultos` y `pesos_bultos` (versión anterior) se aceptan y se ignoran durante un release.
  exception when others then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La recepción no es válida.';
  end;

  v_obs := nullif(btrim(coalesce(p ->> 'observaciones', '')), '');

  if v_tercero_id is null or v_fecha is null
     or v_fecha not between date '2000-01-01' and date '2100-12-31'
     or v_peso is null or v_peso <= 0 or v_peso > 9999999
     or (v_humedad is not null and v_humedad not between 0 and 100)
     or (v_densidad is not null and (v_densidad <= 0 or v_densidad > 99999))
     or (v_obs is not null and char_length(v_obs) > 500) then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La recepción no es válida.';
  end if;

  -- Servicios: ≥ 1, de los cuatro tipos conocidos; la molienda y el empaque cuelgan de la tostión.
  begin
    if jsonb_typeof(p -> 'servicios') is distinct from 'array' then
      raise exception using errcode = '22023';
    end if;
    v_servicios := array(select s::cafe.tipo_proceso from jsonb_array_elements_text(p -> 'servicios') s);
  exception when others then
    raise exception using errcode = 'P0001', message = 'servicios_invalidos',
      detail = 'Alguno de los servicios no es válido.';
  end;
  if coalesce(cardinality(v_servicios), 0) = 0 then
    raise exception using errcode = 'P0001', message = 'sin_servicios',
      detail = 'Elige al menos un servicio.';
  end if;
  if ('molienda' = any(v_servicios) or 'empaque' = any(v_servicios)) and not 'tostion' = any(v_servicios) then
    raise exception using errcode = 'P0001', message = 'servicios_invalidos',
      detail = 'La molienda y el empaque requieren tostión.';
  end if;

  -- Nivel de tueste: obligatorio con tostión; sin tostión se ignora (el CHECK de la tabla lo exige nulo).
  if 'tostion' = any(v_servicios) then
    -- Perfiles de tueste (B-02): `perfiles: [{nivel, temp_c, tiempo_min, kg}]`, uno o varios por kilos. Sin `perfiles`
    -- (cliente anterior) vale el perfil único de `nivel_tueste`, `perfil_temp_c` y `perfil_tiempo_min`.
    -- Kilos que entran a la tostión: lo recibido, menos la merma de referencia de la trilla si se contrata.
    v_merma_trilla := case when jsonb_typeof(public.parametro('cafe.merma_referencia_trilla_pct')) = 'number'
                           then (public.parametro('cafe.merma_referencia_trilla_pct'))::text::numeric else 19 end;
    v_kg_tostion := case when 'trilla' = any(v_servicios)
                         then round(v_peso * (1 - v_merma_trilla / 100), 3) else v_peso end;

    begin
      v_perfiles := p -> 'perfiles';
      if v_perfiles is not null and jsonb_typeof(v_perfiles) = 'array' and jsonb_array_length(v_perfiles) > 0 then
        v_n_perfiles := jsonb_array_length(v_perfiles);
        if v_n_perfiles > 20 then
          raise exception using errcode = '22023';
        end if;
        for v_i in 0 .. v_n_perfiles - 1 loop
          v_el := v_perfiles -> v_i;
          if jsonb_typeof(v_el) <> 'object' then
            raise exception using errcode = '22023';
          end if;
          v_p_nivel := (v_el ->> 'nivel')::cafe.nivel_tueste;
          v_p_temp := null;
          v_p_tiempo := null;
          if jsonb_typeof(v_el -> 'temp_c') = 'number' then
            v_p_temp := round((v_el ->> 'temp_c')::numeric, 1);
          elsif v_el ? 'temp_c' and jsonb_typeof(v_el -> 'temp_c') <> 'null' then
            raise exception using errcode = '22023';
          end if;
          if jsonb_typeof(v_el -> 'tiempo_min') = 'number' then
            v_p_tiempo := round((v_el ->> 'tiempo_min')::numeric, 1);
          elsif v_el ? 'tiempo_min' and jsonb_typeof(v_el -> 'tiempo_min') <> 'null' then
            raise exception using errcode = '22023';
          end if;
          if jsonb_typeof(v_el -> 'kg') = 'number' then
            v_kg := round((v_el ->> 'kg')::numeric, 3);
          elsif v_n_perfiles = 1 and (not v_el ? 'kg' or jsonb_typeof(v_el -> 'kg') = 'null') then
            v_kg := v_kg_tostion;   -- un solo perfil: todo el lote
          else
            raise exception using errcode = '22023';
          end if;
          if v_p_nivel is null or v_kg <= 0 or v_kg > 9999999
             or (v_p_temp is not null and (v_p_temp <= 0 or v_p_temp > 400))
             or (v_p_tiempo is not null and (v_p_tiempo <= 0 or v_p_tiempo > 120)) then
            raise exception using errcode = '22023';
          end if;
          v_suma_kg := v_suma_kg + v_kg;
          v_filas := v_filas || jsonb_build_object('nivel', v_p_nivel, 'temp_c', v_p_temp, 'tiempo_min', v_p_tiempo, 'kg', v_kg);
        end loop;
      else
        -- Cliente anterior: perfil único.
        v_p_nivel := nullif(p ->> 'nivel_tueste', '')::cafe.nivel_tueste;
        if jsonb_typeof(p -> 'perfil_temp_c') = 'number' then
          v_p_temp := round((p ->> 'perfil_temp_c')::numeric, 1);
        elsif p ? 'perfil_temp_c' and jsonb_typeof(p -> 'perfil_temp_c') <> 'null' then
          raise exception using errcode = '22023';
        end if;
        if jsonb_typeof(p -> 'perfil_tiempo_min') = 'number' then
          v_p_tiempo := round((p ->> 'perfil_tiempo_min')::numeric, 1);
        elsif p ? 'perfil_tiempo_min' and jsonb_typeof(p -> 'perfil_tiempo_min') <> 'null' then
          raise exception using errcode = '22023';
        end if;
        if v_p_nivel is null then
          raise exception using errcode = 'P0001', message = 'falta_nivel_tueste',
            detail = 'Indica el nivel de tueste (bajo, medio o alto): la planta lo necesita para la tostión.';
        end if;
        if (v_p_temp is not null and (v_p_temp <= 0 or v_p_temp > 400))
           or (v_p_tiempo is not null and (v_p_tiempo <= 0 or v_p_tiempo > 120)) then
          raise exception using errcode = '22023';
        end if;
        v_suma_kg := v_kg_tostion;
        v_filas := jsonb_build_array(jsonb_build_object('nivel', v_p_nivel, 'temp_c', v_p_temp, 'tiempo_min', v_p_tiempo, 'kg', v_kg_tostion));
      end if;
    exception
      when sqlstate 'P0001' then raise;
      when others then
        raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El perfil de tueste no es válido.';
    end;

    -- La suma de kilos por perfil debe igualar lo que entra a la tostión (tolerancia de 0,05 kg).
    if abs(v_suma_kg - v_kg_tostion) > 0.05 then
      raise exception using errcode = 'P0001', message = 'perfiles_no_suman',
        detail = format('Los kilos por perfil deben sumar %s kg', replace(to_char(v_kg_tostion, 'FM999999990.0'), '.', ','));
    end if;

    -- Columnas del lote (compatibilidad): las del primer perfil.
    v_nivel  := (v_filas -> 0 ->> 'nivel')::cafe.nivel_tueste;
    v_temp   := (v_filas -> 0 ->> 'temp_c')::numeric;
    v_tiempo := (v_filas -> 0 ->> 'tiempo_min')::numeric;
  end if;

  -- Cantidad a moler (B-03): solo con molienda contratada; sin ella se guarda 'ninguna'. El servidor recalcula los kilos:
  -- tostado estimado = recibido × (1 − merma de trilla si se contrata) × (1 − merma de tostión del nivel), a 1 decimal.
  if 'molienda' = any(v_servicios) then
    v_mol_modo := coalesce(nullif(p ->> 'molienda_modo', ''), 'todo');
    if v_mol_modo not in ('todo', 'mitad', 'kg') then
      raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La cantidad a moler no es válida.';
    end if;
    v_tostado := v_peso;
    if 'trilla' = any(v_servicios) then
      v_tostado := v_tostado * (1 - cafe.parametro_numero('cafe.merma_referencia_trilla_pct', 19) / 100);
    end if;
    -- Merma de la tostión: con varios perfiles (B-02), la ponderada por los kilos de cada uno (Σ kg × merma(nivel) / Σ kg);
    -- con uno solo, la de su nivel. Misma cuenta que `mermaTostionPonderada` en estimar-servicios.ts.
    select sum((f ->> 'kg')::numeric * cafe.parametro_numero('cafe.merma_referencia_tostion_' || (f ->> 'nivel') || '_pct',
                                          cafe.parametro_numero('cafe.merma_referencia_tostion_pct', 18)))
           / nullif(sum((f ->> 'kg')::numeric), 0)
      into v_mermas
      from jsonb_array_elements(v_filas) as f;
    v_tostado := round(v_tostado * (1 - coalesce(v_mermas, cafe.parametro_numero('cafe.merma_referencia_tostion_' || coalesce(v_nivel::text, '') || '_pct',
                         cafe.parametro_numero('cafe.merma_referencia_tostion_pct', 18))) / 100), 1);
    if v_mol_modo = 'todo' then v_mol_kg := v_tostado;
    elsif v_mol_modo = 'mitad' then v_mol_kg := round(v_tostado / 2, 1);
    else
      begin
        if jsonb_typeof(p -> 'molienda_kg') is distinct from 'number' then raise exception using errcode = '22023'; end if;
        v_mol_kg := (p ->> 'molienda_kg')::numeric;
      exception when others then
        raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Indica los kilos a moler.';
      end;
      if v_mol_kg <= 0 or v_mol_kg <> round(v_mol_kg, 3) then
        raise exception using errcode = 'P0001', message = 'datos_invalidos',
          detail = 'Los kilos a moler deben ser mayores que cero y tener como máximo 3 decimales.';
      end if;
      if v_mol_kg > v_tostado + 0.05 then
        raise exception using errcode = 'P0001', message = 'molienda_supera_tostado',
          detail = format('La cantidad a moler (%s kg) supera el tostado estimado (%s kg).', trim_scale(v_mol_kg), trim_scale(v_tostado));
      end if;
    end if;
  else
    v_mol_modo := 'ninguna';
  end if;

  -- 3. Tercero: existente (RLS), activo y cliente de servicios ---------------------------------------------------
  select t.roles, t.activo into v_ter from public.terceros t where t.id = v_tercero_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'tercero_no_encontrado',
      detail = 'El tercero no existe o no pertenece a tu cliente.';
  end if;
  if not v_ter.activo then
    raise exception using errcode = 'P0001', message = 'tercero_inactivo',
      detail = 'El tercero está desactivado: actívalo para registrar recepciones.';
  end if;
  if not 'cliente_servicio' = any(v_ter.roles) then
    raise exception using errcode = 'P0001', message = 'tercero_no_es_cliente_servicio',
      detail = 'El tercero no está registrado como cliente de servicios.';
  end if;

  -- 4. Alertas de calidad (snapshot; no bloquean) -------------------------------------------------------------
  -- Solo se evalúa lo que se midió Y tiene rango configurado; `rangos_calidad` guarda los rangos usados, de modo
  -- que cambiar el parámetro después no altera el lote. Sin ninguno: sin alertas y `rangos_calidad = null`.
  v_rango_h := cafe.rango_calidad('cafe.humedad_rango_pct');
  v_rango_d := cafe.rango_calidad('cafe.densidad_rango');

  if v_humedad is not null and v_rango_h is not null then
    v_rangos := coalesce(v_rangos, '{}') || jsonb_build_object('humedad', v_rango_h);
    if v_humedad < (v_rango_h ->> 'min')::numeric then
      v_alertas := array_append(v_alertas, 'humedad_baja');
    elsif v_humedad > (v_rango_h ->> 'max')::numeric then
      v_alertas := array_append(v_alertas, 'humedad_alta');
    end if;
  end if;
  if v_densidad is not null and v_rango_d is not null then
    v_rangos := coalesce(v_rangos, '{}') || jsonb_build_object('densidad', v_rango_d);
    if v_densidad < (v_rango_d ->> 'min')::numeric then
      v_alertas := array_append(v_alertas, 'densidad_baja');
    elsif v_densidad > (v_rango_d ->> 'max')::numeric then
      v_alertas := array_append(v_alertas, 'densidad_alta');
    end if;
  end if;

  -- 5. Lote ----------------------------------------------------------------------------------------------
  -- El número se pide lo más tarde posible: si algo de arriba falla, el consecutivo no se consume. Si falla
  -- después, el rollback de la transacción lo devuelve. El trigger de `cafe.lotes` añade `empaque` a la tostión
  -- (va incluido sin coste) y ordena los servicios.
  v_codigo := public.siguiente_consecutivo('MQ', v_fecha);

  insert into cafe.lotes (codigo, linea, tercero_id, fecha_recepcion, peso_recibido_kg, humedad_pct,
                          densidad, alertas_calidad, rangos_calidad, servicios, nivel_tueste, perfil_temp_c, perfil_tiempo_min, observaciones,
                          molienda_solicitada_modo, molienda_solicitada_kg)
  values (v_codigo, 'servicio', v_tercero_id, v_fecha, v_peso, v_humedad, v_densidad, v_alertas, v_rangos,
          v_servicios, v_nivel, v_temp, v_tiempo, v_obs, v_mol_modo, v_mol_kg)
  returning id, servicios into v_id, v_servicios;

  if jsonb_array_length(v_filas) > 0 then
    insert into cafe.lote_perfil_tostion (lote_id, orden, nivel, temp_c, tiempo_min, kg)
    select v_id, x.ord::smallint, (x.f ->> 'nivel')::cafe.nivel_tueste, (x.f ->> 'temp_c')::numeric,
           (x.f ->> 'tiempo_min')::numeric, (x.f ->> 'kg')::numeric
      from jsonb_array_elements(v_filas) with ordinality as x(f, ord);
  end if;

  -- 6. Estimación del valor de los servicios -----------------------------------------------------------------------
  -- Peso que entra a cada paso: el recibido, menos la merma de referencia de los pasos anteriores contratados
  -- (500 kg → trilla 19 % → 405 kg para la tostión). La molienda no tiene merma de referencia (decisión 3 de
  -- CO-20). La tarifa es la vigente en la fecha de la recepción (hoy: ahora mismo); sin tarifa, NULL.
  v_zona := coalesce((select t.zona_horaria from public.tenants t where t.id = (select public.tenant_actual())),
                     'America/Bogota');
  v_hoy  := (now() at time zone v_zona)::date;
  v_at   := case when v_fecha = v_hoy then now()
                 else ((v_fecha + 1)::timestamp at time zone v_zona) - interval '1 microsecond' end;

  v_peso_paso := v_peso;
  foreach v_s in array v_servicios loop
    if v_s = 'empaque' then
      continue;  -- sin tarifa: incluido
    end if;

    begin
      v_tarifa := public.tarifa_vigente('cafe.' || v_s::text, v_at);
    exception when sqlstate 'P0001' then
      v_tarifa := null;   -- `tarifa_no_definida`: no se bloquea la recepción por una estimación
    end;

    -- La molienda estima los kilos que se piden moler (B-03), no todo el tostado.
    if v_s = 'molienda' and v_mol_kg is not null then
      v_peso_paso := v_mol_kg;
    end if;
    v_estimacion := v_estimacion || jsonb_build_object(
      'servicio', v_s,
      'peso_kg', v_peso_paso,
      'tarifa_kg', v_tarifa,
      'valor_estimado', case when v_tarifa is null then null else round(v_peso_paso * v_tarifa, 0) end);

    -- Mermas de referencia (mismos valores por defecto que `PARAMETROS_CAFE`: 19 % y 18 %).
    v_merma := case v_s
      when 'trilla'  then cafe.parametro_numero('cafe.merma_referencia_trilla_pct', 19)
      when 'tostion' then cafe.parametro_numero('cafe.merma_referencia_tostion_' || v_nivel::text || '_pct',
                            cafe.parametro_numero('cafe.merma_referencia_tostion_pct', 18))
      else 0 end;
    v_peso_paso := round(v_peso_paso * (1 - v_merma / 100), 3);
  end loop;

  return jsonb_build_object(
    'id', v_id,
    'codigo', v_codigo,
    'servicios', to_jsonb(v_servicios),
    'alertas_calidad', to_jsonb(v_alertas),
    'estimacion', v_estimacion,
    'molienda_solicitada_modo', v_mol_modo,
    'molienda_solicitada_kg', v_mol_kg);
end $function$;
