-- Perfil de tueste pedido por el cliente (FIN-127 · A-09). Reversible: ver el bloque «Rollback» al final.
-- 1. `perfil_temp_c` y `perfil_tiempo_min` (nullable) en el lote; solo tienen sentido con tostión (CHECK).
-- 2. `cafe.registrar_recepcion()` los lee y valida (misma definición que 20261103110000 + el perfil).
-- 3. `cafe.v_lotes` los expone al final (columnas nuevas al final: `create or replace view` lo exige).
-- Migración compatible hacia atrás (expand): el código antiguo no los envía y siguen en NULL.

alter table cafe.lotes
  add column perfil_temp_c      numeric(5,1) check (perfil_temp_c > 0 and perfil_temp_c <= 400),
  add column perfil_tiempo_min  numeric(5,1) check (perfil_tiempo_min > 0 and perfil_tiempo_min <= 120),
  add constraint lote_perfil_ck check (
    (perfil_temp_c is null and perfil_tiempo_min is null) or nivel_tueste is not null);

-- Los privilegios de `cafe.lotes` son por columna (ver 20261102100000): las nuevas se conceden igual que `nivel_tueste`.
grant insert (perfil_temp_c, perfil_tiempo_min) on table cafe.lotes to authenticated;
grant update (perfil_temp_c, perfil_tiempo_min) on table cafe.lotes to authenticated;

create or replace function cafe.registrar_recepcion(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
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
    if jsonb_typeof(p -> 'peso_kg') is distinct from 'number'
       or jsonb_typeof(p -> 'num_bultos') is distinct from 'number' then
      raise exception using errcode = '22023';
    end if;
    v_tercero_id := (p ->> 'tercero_id')::uuid;
    v_fecha      := (p ->> 'fecha')::date;
    v_peso       := round((p ->> 'peso_kg')::numeric, 3);
    v_num        := (p ->> 'num_bultos')::integer;

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

    -- Pesos por bulto: ausente o null = reparto en partes iguales.
    if jsonb_typeof(p -> 'pesos_bultos') = 'array' then
      if exists (select 1 from jsonb_array_elements(p -> 'pesos_bultos') e where jsonb_typeof(e) <> 'number') then
        raise exception using errcode = '22023';
      end if;
      v_pesos := array(select round((e #>> '{}')::numeric, 3)
                         from jsonb_array_elements(p -> 'pesos_bultos') with ordinality as x(e, ord)
                        order by ord);
    elsif jsonb_typeof(p -> 'pesos_bultos') not in ('null') and p ? 'pesos_bultos' then
      raise exception using errcode = '22023';
    end if;
  exception when others then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La recepción no es válida.';
  end;

  v_obs := nullif(btrim(coalesce(p ->> 'observaciones', '')), '');

  if v_tercero_id is null or v_fecha is null
     or v_fecha not between date '2000-01-01' and date '2100-12-31'
     or v_peso is null or v_peso <= 0 or v_peso > 9999999
     or v_num is null or v_num < 1 or v_num > 200
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
    begin
      v_nivel := nullif(p ->> 'nivel_tueste', '')::cafe.nivel_tueste;
    exception when others then
      raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El nivel de tueste no es válido.';
    end;
    if v_nivel is null then
      raise exception using errcode = 'P0001', message = 'falta_nivel_tueste',
        detail = 'Indica el nivel de tueste (bajo, medio o alto): la planta lo necesita para la tostión.';
    end if;

    -- Perfil pedido por el cliente (opcional): temperatura en °C y tiempo en minutos.
    begin
      if jsonb_typeof(p -> 'perfil_temp_c') = 'number' then
        v_temp := round((p ->> 'perfil_temp_c')::numeric, 1);
      elsif p ? 'perfil_temp_c' and jsonb_typeof(p -> 'perfil_temp_c') <> 'null' then
        raise exception using errcode = '22023';
      end if;
      if jsonb_typeof(p -> 'perfil_tiempo_min') = 'number' then
        v_tiempo := round((p ->> 'perfil_tiempo_min')::numeric, 1);
      elsif p ? 'perfil_tiempo_min' and jsonb_typeof(p -> 'perfil_tiempo_min') <> 'null' then
        raise exception using errcode = '22023';
      end if;
    exception when others then
      raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El perfil de tueste no es válido.';
    end;
    if (v_temp is not null and (v_temp <= 0 or v_temp > 400))
       or (v_tiempo is not null and (v_tiempo <= 0 or v_tiempo > 120)) then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'La temperatura (°C) y el tiempo (min) del perfil deben ser positivos y razonables.';
    end if;
  end if;

  -- Pesos por bulto explícitos: tantos como bultos, positivos y que sumen el peso total.
  if v_pesos is not null then
    if cardinality(v_pesos) <> v_num or abs((select sum(x) from unnest(v_pesos) x) - v_peso) > 0.001 then
      raise exception using errcode = 'P0001', message = 'bultos_no_cuadran',
        detail = format('Debe haber %s pesos de bulto y sumar %s kg.', v_num, v_peso);
    end if;
    if exists (select 1 from unnest(v_pesos) x where x <= 0) then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'El peso de cada bulto debe ser mayor que cero.';
    end if;
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

  -- 5. Lote y bultos ----------------------------------------------------------------------------------------------
  -- El número se pide lo más tarde posible: si algo de arriba falla, el consecutivo no se consume. Si falla
  -- después, el rollback de la transacción lo devuelve. El trigger de `cafe.lotes` añade `empaque` a la tostión
  -- (va incluido sin coste) y ordena los servicios.
  v_codigo := public.siguiente_consecutivo('MQ', v_fecha);

  insert into cafe.lotes (codigo, linea, tercero_id, fecha_recepcion, peso_recibido_kg, num_bultos, humedad_pct,
                          densidad, alertas_calidad, rangos_calidad, servicios, nivel_tueste, perfil_temp_c, perfil_tiempo_min, observaciones)
  values (v_codigo, 'servicio', v_tercero_id, v_fecha, v_peso, v_num, v_humedad, v_densidad, v_alertas, v_rangos,
          v_servicios, v_nivel, v_temp, v_tiempo, v_obs)
  returning id, servicios into v_id, v_servicios;

  insert into cafe.lote_bultos (lote_id, numero, peso_kg)
  select v_id, x.n, x.peso
    from unnest(coalesce(v_pesos, cafe.repartir_peso(v_peso, v_num))) with ordinality as x(peso, n);

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

    v_estimacion := v_estimacion || jsonb_build_object(
      'servicio', v_s,
      'peso_kg', v_peso_paso,
      'tarifa_kg', v_tarifa,
      'valor_estimado', case when v_tarifa is null then null else round(v_peso_paso * v_tarifa, 0) end);

    -- Mermas de referencia (mismos valores por defecto que `PARAMETROS_CAFE`: 19 % y 18 %).
    v_merma := case v_s
      when 'trilla'  then case when jsonb_typeof(public.parametro('cafe.merma_referencia_trilla_pct')) = 'number'
                               then (public.parametro('cafe.merma_referencia_trilla_pct'))::text::numeric else 19 end
      when 'tostion' then case when jsonb_typeof(public.parametro('cafe.merma_referencia_tostion_pct')) = 'number'
                               then (public.parametro('cafe.merma_referencia_tostion_pct'))::text::numeric else 18 end
      else 0 end;
    v_peso_paso := round(v_peso_paso * (1 - v_merma / 100), 3);
  end loop;

  return jsonb_build_object(
    'id', v_id,
    'codigo', v_codigo,
    'servicios', to_jsonb(v_servicios),
    'alertas_calidad', to_jsonb(v_alertas),
    'estimacion', v_estimacion);
end $$;

revoke execute on function cafe.registrar_recepcion(jsonb) from public, anon;
grant execute on function cafe.registrar_recepcion(jsonb) to authenticated;

create or replace view cafe.v_lotes with (security_invoker = true) as
select
  l.id,
  l.tenant_id,
  l.codigo,
  l.linea,
  l.tercero_id,
  t.nombre            as tercero_nombre,
  t.identificacion    as tercero_identificacion,
  l.tipo_cafe_id,
  tc.nombre           as tipo_cafe_nombre,
  l.fecha_recepcion,
  l.peso_recibido_kg,
  l.num_bultos,
  l.humedad_pct,
  l.densidad,
  l.alertas_calidad,
  l.rangos_calidad,
  l.servicios,
  l.nivel_tueste,
  l.precio_compra_kg,
  l.valor_compra,
  l.factura_proveedor,
  l.observaciones,
  l.anulado_at,
  l.anulado_por,
  l.motivo_anulacion,
  l.created_at,
  l.created_by,
  req.servicios_requeridos,
  coalesce(et.completados, 0)                                                   as servicios_completados,
  coalesce(et.completados, 0)::text || ' de ' || cardinality(req.servicios_requeridos)::text as avance_texto,
  case
    when l.anulado_at is not null                                          then 'anulado'
    when exists (select 1 from cafe.remisiones r
                  where r.lote_id = l.id and r.anulada_at is null)         then 'entregado'
    when coalesce(et.n_etapas, 0) = 0                                      then 'recibido'
    when coalesce(et.completados, 0) = cardinality(req.servicios_requeridos) then 'listo'
    when coalesce(et.n_parciales, 0) > 0                                   then 'parcial'
    else 'en_proceso'
  end                                                                           as estado,
  pa.peso_actual_kg::numeric(12,3)                                              as peso_actual_kg,
  (l.peso_recibido_kg - pa.peso_actual_kg)::numeric(12,3)                       as merma_total_kg,
  round((l.peso_recibido_kg - pa.peso_actual_kg) / l.peso_recibido_kg * 100, 3)::numeric(7,3) as merma_total_pct,
  coalesce(et.valor_servicios, 0)::numeric(14,2)                                as valor_servicios,
  coalesce(et.desvios, 0) > 0                                                   as tiene_desvio,
  l.perfil_temp_c,
  l.perfil_tiempo_min
from cafe.lotes l
left join public.terceros t   on t.id = l.tercero_id
left join cafe.tipos_cafe tc  on tc.id = l.tipo_cafe_id
cross join lateral (select cafe.servicios_requeridos(l) as servicios_requeridos) req
left join lateral (
  select
    count(*)                                                                  as n_etapas,
    count(*) filter (where e.parcial)                                         as n_parciales,
    count(*) filter (where e.completo and e.tipo = any(req.servicios_requeridos)) as completados,
    sum(e.valor)                                                              as valor_servicios,
    sum(e.desvios)                                                            as desvios
  from cafe.v_lote_etapas e
  where e.lote_id = l.id
) et on true
cross join lateral (
  select round(coalesce(sum(be.peso_actual_exacto_kg), 0), 3) as peso_actual_kg
    from cafe.v_bultos_estado be
   where be.lote_id = l.id
) pa;
-- Rollback (manual, solo si hace falta deshacer; recrea antes v_lotes y registrar_recepcion de las migraciones previas):
--   alter table cafe.lotes drop constraint lote_perfil_ck, drop column perfil_temp_c, drop column perfil_tiempo_min;
