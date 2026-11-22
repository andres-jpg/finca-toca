-- Recepción de clientes de servicios: tipo de café que se recibe.
--
-- `cafe.registrar_recepcion` acepta `tipo_cafe_id` (catálogo `cafe.tipos_cafe`, activo y del cliente) y lo guarda en
-- `cafe.lotes.tipo_cafe_id`, que ya admitía un valor en la línea `servicio` (`lote_servicio_ck` no lo prohíbe). La
-- pantalla lo pide; la RPC lo deja opcional para no romper clientes anteriores. Parte de la definición de
-- `20261220100000` (ver docs/claude/cafe.md: no partir de las anteriores). Sin cambios de privilegios.

CREATE OR REPLACE FUNCTION cafe.registrar_recepcion(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_tercero_id   uuid;
  v_tipo_cafe    uuid;
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
    v_tipo_cafe  := nullif(p ->> 'tipo_cafe_id', '')::uuid;
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

  -- 3b. Tipo de café que entrega el cliente (opcional en la RPC; la pantalla lo pide): del catálogo, activo y del cliente.
  if v_tipo_cafe is not null
     and not exists (select 1 from cafe.tipos_cafe t where t.id = v_tipo_cafe and t.activo) then
    raise exception using errcode = 'P0001', message = 'tipo_cafe_invalido',
      detail = 'El tipo de café no existe, está inactivo o no pertenece a tu cliente.';
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

  insert into cafe.lotes (codigo, linea, tercero_id, tipo_cafe_id, fecha_recepcion, peso_recibido_kg, humedad_pct,
                          densidad, alertas_calidad, rangos_calidad, servicios, nivel_tueste, perfil_temp_c, perfil_tiempo_min, observaciones,
                          molienda_solicitada_modo, molienda_solicitada_kg)
  values (v_codigo, 'servicio', v_tercero_id, v_tipo_cafe, v_fecha, v_peso, v_humedad, v_densidad, v_alertas, v_rangos,
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
