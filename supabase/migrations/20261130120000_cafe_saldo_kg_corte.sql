-- ADR 0002 (FIN-142 · T-01) · migración 3 de 9 · B-01 (FIN-144), CORTE: el saldo pasa a kilos y los bultos salen del flujo.
--
-- * `paso_previo(lote, tipo)` y `peso_disponible(lote, tipo)` sin bultos (se eliminan las firmas viejas).
-- * `_resolver_origen`: elige el proceso previo del que consume un paso (explícito o único con saldo).
-- * `_insertar_proceso`, `registrar_proceso`, `registrar_empaque`, `anular_proceso`, `procesos_proteger`, `editar_lote`,
--   `registrar_compra`, `registrar_recepcion`, `lotes_proteger`, `kpis_periodo`, `seed_vertical` por origen y por kilos.
-- * `procesos_saldo_ok` (constraint trigger diferido) y `procesos_origen_coherente`: integridad del saldo sin el índice único
--   por bulto (sigue el `pg_advisory_xact_lock` por lote en las RPC).
-- * `v_lote_pesos` (kg en planta / empacado derivados de `v_origenes_disponibles`), `v_lote_etapas` y `v_lotes` por kg.
-- * Se eliminan los triggers y constraint triggers de bultos y se revoca INSERT/UPDATE/DELETE de `lote_bultos` y
--   `proceso_bultos`: quedan como historia de solo lectura (se borran en el contract).
-- * Compara con la foto previa de la migración 2 (estado, avance, peso actual y pasos) y AVISA (warning) con un listado de lo que cambia:
--   lotes que por bultos estaban «listos» pero tienen kilos sin procesar pasan a «parcial». No aborta.
-- Las RPC con entrada jsonb aceptan e ignoran `bultos`, `num_bultos` y `pesos_bultos` durante un release.

-- 1) Firmas viejas ---------------------------------------------------------------------------------------------
drop function cafe.paso_previo(uuid, cafe.tipo_proceso, uuid);
drop function cafe.peso_disponible(uuid, cafe.tipo_proceso, uuid[]);

-- Paso anterior en el ORDEN de los pasos (no en la cadena de kilos: para eso está `paso_origen`). En servicios es el
-- anterior contratado; en marca propia, la molienda y el empaque siguen a la tostión.
create or replace function cafe.paso_previo(p_lote uuid, p_tipo cafe.tipo_proceso)
returns cafe.tipo_proceso
language plpgsql
stable
set search_path = ''
as $$
declare
  v_linea     cafe.linea_lote;
  v_servicios cafe.tipo_proceso[];
begin
  select l.linea, l.servicios into v_linea, v_servicios from cafe.lotes l where l.id = p_lote;
  if not found then
    return null;
  end if;

  if v_linea = 'servicio' then
    return (select s from unnest(v_servicios) s
             where cafe.orden_proceso(s) < cafe.orden_proceso(p_tipo)
             order by cafe.orden_proceso(s) desc limit 1);
  end if;

  return case when p_tipo in ('molienda', 'empaque') then 'tostion'::cafe.tipo_proceso end;
end $$;

-- Kilos que un paso puede consumir hoy: Σ saldo de los orígenes de `paso_origen(lote, tipo)` (la raíz si no hay previo).
-- NULL si no hay ningún origen vigente (el paso previo no se ha registrado).
create or replace function cafe.peso_disponible(p_lote uuid, p_tipo cafe.tipo_proceso)
returns numeric
language sql
stable
set search_path = ''
as $$
  select round(sum(o.saldo_kg), 3)
    from cafe.v_origenes_disponibles o
   where o.lote_id = p_lote and o.tipo is not distinct from cafe.paso_origen(p_lote, p_tipo)
$$;

-- Proceso de origen de un paso (null = raíz del lote). `p_origen` explícito: debe ser un proceso vigente del tipo de origen.
-- Sin él: el único candidato (con saldo; para la molienda, la tostión que aún no se muele). Más de uno → `origen_requerido`.
create or replace function cafe._resolver_origen(p_lote uuid, p_tipo cafe.tipo_proceso, p_origen uuid)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_tipo_origen cafe.tipo_proceso := cafe.paso_origen(p_lote, p_tipo);
  v_n           integer;
  v_id          uuid;
  v_nombre      text;
begin
  if v_tipo_origen is null then
    if p_origen is not null then
      raise exception using errcode = 'P0001', message = 'origen_invalido',
        detail = 'Este paso parte del café recibido: no lleva proceso de origen.';
    end if;
    return null;
  end if;

  v_nombre := case v_tipo_origen when 'trilla' then 'la trilla' else 'la tostión' end;

  if p_origen is not null then
    if not exists (select 1 from cafe.procesos o
                    where o.id = p_origen and o.lote_id = p_lote and o.tipo = v_tipo_origen
                      and o.anulado_at is null and o.reapertura_id is null) then
      raise exception using errcode = 'P0001', message = 'origen_invalido',
        detail = format('El proceso de origen no es %s vigente de este lote.', v_nombre);
    end if;
    return p_origen;
  end if;

  select count(*), (array_agg(o.proceso_id))[1] into v_n, v_id
    from cafe.v_origenes_disponibles o
   where o.lote_id = p_lote and o.tipo = v_tipo_origen
     and case when p_tipo = 'molienda'
              then not exists (select 1 from cafe.procesos m
                                where m.origen_proceso_id = o.proceso_id and m.tipo = 'molienda' and m.anulado_at is null)
              else o.saldo_kg > cafe.saldo_tolerancia_kg(o.base_kg) end;
  if v_n = 0 and p_tipo = 'molienda' then
    select count(*), (array_agg(o.proceso_id))[1] into v_n, v_id
      from cafe.v_origenes_disponibles o where o.lote_id = p_lote and o.tipo = v_tipo_origen;
  end if;

  if v_n = 0 then
    if not exists (select 1 from cafe.v_origenes_disponibles o where o.lote_id = p_lote and o.tipo = v_tipo_origen) then
      raise exception using errcode = 'P0001', message = 'orden_proceso_invalido',
        detail = format('Primero registra %s de este lote.', v_nombre);
    end if;
    raise exception using errcode = 'P0001', message = 'origen_sin_saldo',
      detail = format('No queda café por procesar de %s.', v_nombre);
  elsif v_n > 1 then
    raise exception using errcode = 'P0001', message = 'origen_requerido',
      detail = format('Hay más de una tanda con café por procesar: elige de cuál sale este proceso (%s).', v_nombre);
  end if;
  return v_id;
end $$;

revoke execute on function cafe.paso_previo(uuid, cafe.tipo_proceso), cafe.peso_disponible(uuid, cafe.tipo_proceso),
  cafe._resolver_origen(uuid, cafe.tipo_proceso, uuid) from public, anon;
grant execute on function cafe.paso_previo(uuid, cafe.tipo_proceso), cafe.peso_disponible(uuid, cafe.tipo_proceso),
  cafe._resolver_origen(uuid, cafe.tipo_proceso, uuid) to authenticated, service_role;

-- 2) Vistas por kilos -------------------------------------------------------------------------------------------
-- Pesos de un lote derivados del saldo. La tostión sin empaque aporta su entrada menos la merma de referencia (estimado). La
-- molienda histórica con salida resta lo que perdió: el saldo de su tostión la cuenta como café que sigue ahí (los lotes de
-- antes del corte pesaban «la salida de su último paso» por bulto; así los pesos actuales no cambian). Sin bultos ni FIFO.
create view cafe.v_lote_pesos with (security_invoker = true) as
select l.tenant_id,
       l.id as lote_id,
       coalesce(s.kg_planta, 0) - coalesce(m.perdida, 0)       as kg_en_planta,
       coalesce(s.kg_empacado, 0)                              as kg_empacado,
       coalesce(s.kg_planta, 0) - coalesce(m.perdida, 0) + coalesce(s.kg_empacado, 0) as peso_actual_kg,
       coalesce(s.estimado, false)                             as estimado
  from cafe.lotes l
  left join lateral (
    select sum(case when o.tipo is distinct from 'empaque'
                    then case when o.estimado then o.saldo_kg * (1 - coalesce(p.merma_referencia_pct, 0) / 100) else o.saldo_kg end
               end) as kg_planta,
           sum(case when o.tipo = 'empaque' then o.saldo_kg end) as kg_empacado,
           bool_or(o.estimado) as estimado
      from cafe.v_origenes_disponibles o
      left join cafe.procesos p on p.id = o.proceso_id
     where o.lote_id = l.id
  ) s on true
  left join lateral (
    select sum(m.peso_entrada_kg - m.peso_salida_kg) as perdida
      from cafe.procesos m
     where m.lote_id = l.id and m.tipo = 'molienda' and m.anulado_at is null and m.reapertura_id is null
       and m.peso_salida_kg is not null
  ) m on true;

grant select on cafe.v_lote_pesos to authenticated, service_role;

create or replace view cafe.v_lote_etapas with (security_invoker = true) as
select e.tenant_id,
       e.lote_id,
       e.tipo,
       null::integer as bultos_total,
       null::integer as bultos_procesados,
       k.kg_pendientes <= cafe.saldo_tolerancia_kg(k.kg_base) as completo,
       k.kg_procesados > 0 and k.kg_pendientes > cafe.saldo_tolerancia_kg(k.kg_base) as parcial,
       e.num_procesos,
       e.peso_entrada,
       e.peso_salida,
       e.merma_kg,
       round(e.merma_kg / nullif(e.entrada_merma, 0) * 100::numeric, 3) as merma_pct,
       e.valor,
       e.desvios,
       e.ultima_fecha,
       k.kg_base,
       k.kg_procesados,
       k.kg_pendientes
  from (select p.tenant_id, p.lote_id, p.tipo,
               count(*)::integer as num_procesos,
               sum(p.peso_entrada_kg) filter (where p.tipo <> 'tostion' or p.peso_salida_kg is not null) as peso_entrada,
               sum(p.peso_salida_kg) as peso_salida,
               sum(p.merma_kg) filter (where p.tipo in ('trilla', 'tostion')) as merma_kg,
               sum(p.peso_entrada_kg) filter (where p.tipo in ('trilla', 'tostion') and p.peso_salida_kg is not null) as entrada_merma,
               sum(p.valor) as valor,
               count(*) filter (where p.desvio)::integer as desvios,
               max(p.fecha) as ultima_fecha
          from cafe.procesos p
         where p.anulado_at is null and p.reapertura_id is null
         group by p.tenant_id, p.lote_id, p.tipo) e
  join cafe.lotes l on l.id = e.lote_id
 cross join lateral (
   -- kg_base: lo que el paso puede procesar. Trilla: lo recibido. Tostión: lo que entregan sus orígenes (salida de trilla o
   -- lo recibido). Molienda y empaque de una tostión: lo que entró a tostión (el mismo kilo verde). kg_procesados: lo que ya
   -- consumieron sus procesos vigentes; en molienda y empaque, lo de las tostiones que ya tienen ese paso.
   select round(b.kg_base, 3) as kg_base,
          round(b.kg_procesados, 3) as kg_procesados,
          round(greatest(b.kg_base - b.kg_procesados, 0), 3) as kg_pendientes
     from (select case
                    when e.tipo = 'trilla' then l.peso_recibido_kg
                    when e.tipo in ('molienda', 'empaque') and cafe.paso_origen(l.id, e.tipo) = 'tostion'
                      then coalesce((select sum(t.peso_entrada_kg) from cafe.procesos t
                                      where t.lote_id = l.id and t.tipo = 'tostion' and t.anulado_at is null and t.reapertura_id is null), 0)
                    when cafe.paso_origen(l.id, e.tipo) is null then l.peso_recibido_kg
                    else coalesce((select sum(coalesce(o.peso_salida_kg, o.peso_entrada_kg)) from cafe.procesos o
                                    where o.lote_id = l.id and o.tipo = cafe.paso_origen(l.id, e.tipo)
                                      and o.anulado_at is null and o.reapertura_id is null), 0)
                  end as kg_base,
                  case
                    when e.tipo in ('molienda', 'empaque') and cafe.paso_origen(l.id, e.tipo) = 'tostion'
                      then coalesce((select sum(t.peso_entrada_kg * case
                                        -- Molienda nueva (sin salida): basta con que la tanda tenga su molienda.
                                        when e.tipo = 'molienda' and exists (select 1 from cafe.procesos d where d.origen_proceso_id = t.id
                                               and d.tipo = 'molienda' and d.anulado_at is null and d.peso_salida_kg is null) then 1
                                        -- Si no, la fracción de la tanda que ya pasó por el paso (los lotes de antes del corte
                                        -- molían y empacaban por partes; la molienda histórica con salida perdió kilos que no
                                        -- vuelven a empacarse).
                                        else least(1, (coalesce((select sum(d.peso_entrada_kg) from cafe.procesos d
                                                                 where d.origen_proceso_id = t.id and d.tipo = e.tipo and d.anulado_at is null), 0)
                                                      + case when e.tipo = 'empaque'
                                                             then coalesce((select sum(m.peso_entrada_kg - m.peso_salida_kg) from cafe.procesos m
                                                                             where m.origen_proceso_id = t.id and m.tipo = 'molienda'
                                                                               and m.anulado_at is null and m.peso_salida_kg is not null), 0)
                                                             else 0 end)
                                                    / nullif(coalesce(t.peso_salida_kg, t.peso_entrada_kg), 0)) end)
                                      from cafe.procesos t
                                      where t.lote_id = l.id and t.tipo = 'tostion' and t.anulado_at is null and t.reapertura_id is null), 0)
                    else coalesce((select sum(d.peso_entrada_kg) from cafe.procesos d
                                    where d.lote_id = l.id and d.tipo = e.tipo and d.anulado_at is null and d.reapertura_id is null), 0)
                  end as kg_procesados) b
 ) k;

create or replace view cafe.v_lotes with (security_invoker = true) as
SELECT l.id,
    l.tenant_id,
    l.codigo,
    l.linea,
    l.tercero_id,
    t.nombre AS tercero_nombre,
    t.identificacion AS tercero_identificacion,
    l.tipo_cafe_id,
    tc.nombre AS tipo_cafe_nombre,
    l.fecha_recepcion,
    l.peso_recibido_kg,
    null::smallint AS num_bultos,
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
    COALESCE(et.completados, 0::bigint) AS servicios_completados,
    (COALESCE(et.completados, 0::bigint)::text || ' de '::text) || cardinality(req.servicios_requeridos)::text AS avance_texto,
        CASE
            WHEN l.anulado_at IS NOT NULL THEN 'anulado'::text
            WHEN (EXISTS ( SELECT 1
               FROM cafe.remisiones_lotes rl
              WHERE rl.lote_id = l.id AND rl.activa)) THEN 'entregado'::text
            WHEN COALESCE(et.n_etapas, 0::bigint) = 0 THEN 'recibido'::text
            WHEN COALESCE(et.completados, 0::bigint) = cardinality(req.servicios_requeridos) THEN 'listo'::text
            WHEN COALESCE(et.n_parciales, 0::bigint) > 0 THEN 'parcial'::text
            ELSE 'en_proceso'::text
        END AS estado,
    round(pa.peso_actual_kg, 3)::numeric(12,3) AS peso_actual_kg,
    (CASE WHEN pa.estimado THEN NULL::numeric ELSE l.peso_recibido_kg - round(pa.peso_actual_kg, 3) END)::numeric(12,3) AS merma_total_kg,
    (CASE WHEN pa.estimado THEN NULL::numeric ELSE round((l.peso_recibido_kg - pa.peso_actual_kg) / l.peso_recibido_kg * 100::numeric, 3) END)::numeric(7,3) AS merma_total_pct,
    COALESCE(et.valor_servicios, 0::numeric)::numeric(14,2) AS valor_servicios,
    COALESCE(et.desvios, 0::bigint) > 0 AS tiene_desvio,
    l.perfil_temp_c,
    l.perfil_tiempo_min,
    pa.estimado AS peso_actual_estimado
   FROM cafe.lotes l
     LEFT JOIN terceros t ON t.id = l.tercero_id
     LEFT JOIN cafe.tipos_cafe tc ON tc.id = l.tipo_cafe_id
     CROSS JOIN LATERAL ( SELECT cafe.servicios_requeridos(l.*) AS servicios_requeridos) req
     LEFT JOIN LATERAL ( SELECT count(*) AS n_etapas,
            count(*) FILTER (WHERE e.parcial) AS n_parciales,
            count(*) FILTER (WHERE e.completo AND (e.tipo = ANY (req.servicios_requeridos))) AS completados,
            sum(e.valor) AS valor_servicios,
            sum(e.desvios) AS desvios
           FROM cafe.v_lote_etapas e
          WHERE e.lote_id = l.id) et ON true
     CROSS JOIN LATERAL ( SELECT COALESCE(max(lp.peso_actual_kg), 0::numeric) AS peso_actual_kg,
            COALESCE(bool_or(lp.estimado), false) AS estimado
           FROM cafe.v_lote_pesos lp
          WHERE lp.lote_id = l.id) pa;

-- 3) Triggers de bultos fuera; integridad del saldo ------------------------------------------------------------------
drop trigger procesos_liberar_bultos on cafe.procesos;
drop trigger proceso_bultos_proteger on cafe.proceso_bultos;
drop trigger proceso_bultos_sin_reapertura on cafe.proceso_bultos;
drop trigger lotes_bultos_cuadran on cafe.lotes;
drop trigger lote_bultos_cuadran on cafe.lote_bultos;

revoke insert, update, delete on cafe.lote_bultos, cafe.proceso_bultos from authenticated, anon;

-- Coherencia del origen (depende de los servicios del lote, que un CHECK no puede mirar): `origen_tipo` debe ser el
-- `paso_origen` del tipo. La reapertura no lleva origen.
create or replace function cafe.procesos_origen_coherente()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_esperado cafe.tipo_proceso;
begin
  if new.reapertura_id is not null then
    return new;
  end if;
  v_esperado := cafe.paso_origen(new.lote_id, new.tipo);
  if new.origen_tipo is distinct from v_esperado then
    raise exception using errcode = 'P0001', message = 'origen_invalido',
      detail = case when v_esperado is null then 'Este paso parte del café recibido: no lleva proceso de origen.'
                    else format('Este paso consume de %s: indica el proceso de origen.',
                                case v_esperado when 'trilla' then 'la trilla' else 'la tostión' end) end;
  end if;
  return new;
end $$;

create trigger procesos_origen_coherente before insert on cafe.procesos
  for each row execute function cafe.procesos_origen_coherente();

-- Saldo no negativo en concurrencia: al terminar la transacción, el origen del proceso insertado o editado no puede haber
-- gastado más que su base más la tolerancia. Solo procesos nuevos o editados: los históricos pueden traer hasta -0,5 %.
create or replace function cafe.procesos_verificar_saldo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_o record;
begin
  if new.anulado_at is not null or new.reapertura_id is not null then
    return null;
  end if;

  for v_o in
    select o.base_kg, o.consumido_kg, o.saldo_kg
      from cafe.v_origenes_disponibles o
     where o.lote_id = new.lote_id
       and (   (new.tipo <> 'molienda' and o.proceso_id is not distinct from new.origen_proceso_id)
            or (o.proceso_id = new.id))
  loop
    if v_o.saldo_kg < -cafe.saldo_tolerancia_kg(v_o.base_kg) then
      raise exception using errcode = 'P0001', message = 'peso_supera_disponible',
        detail = format('Se procesarían %s kg y solo hay %s kg disponibles.', trim_scale(v_o.consumido_kg), trim_scale(v_o.base_kg));
    end if;
  end loop;
  return null;
end $$;

create constraint trigger procesos_saldo_ok
  after insert or update of peso_entrada_kg, peso_salida_kg, origen_proceso_id, anulado_at on cafe.procesos
  deferrable initially deferred
  for each row execute function cafe.procesos_verificar_saldo();

-- 4) Procesos ---------------------------------------------------------------------------------------------------
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
  v_sum_s     numeric := 0;
  v_x         numeric;
  v_y         numeric;
  v_temp      numeric;
  v_tiempo    numeric;
  v_grupo     smallint;
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

  -- 6) Baches (solo tostión).
  if p_tipo = 'tostion' then
    if jsonb_typeof(p_baches) is distinct from 'array' or jsonb_array_length(p_baches) = 0 then
      raise exception using errcode = 'P0001', message = 'baches_no_cuadran',
        detail = 'La tostión se registra por baches: indica al menos uno.';
    end if;

    v_baches := '[]';
    for v_elem in select e from jsonb_array_elements(p_baches) e loop
      if jsonb_typeof(v_elem) <> 'object'
         or jsonb_typeof(v_elem -> 'peso_entrada_kg') is distinct from 'number'
         or jsonb_typeof(v_elem -> 'peso_salida_kg') is distinct from 'number' then
        raise exception using errcode = 'P0001', message = 'datos_invalidos',
          detail = 'Cada bache necesita su peso de entrada y de salida.';
      end if;
      v_x := (v_elem ->> 'peso_entrada_kg')::numeric;
      v_y := (v_elem ->> 'peso_salida_kg')::numeric;
      if v_x <= 0 or v_x >= 10000000 or v_x <> round(v_x, 3)
         or v_y < 0 or v_y >= 10000000 or v_y <> round(v_y, 3) then
        raise exception using errcode = 'P0001', message = 'datos_invalidos',
          detail = 'Los pesos de cada bache deben ser positivos y tener como máximo 3 decimales.';
      end if;
      if v_y > v_x then
        raise exception using errcode = 'P0001', message = 'salida_supera_entrada',
          detail = 'En un bache la salida no puede superar la entrada.';
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

      -- A-12: tiempo real del bache (minutos) y grupo de pesaje (varios baches pesados juntos).
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
      v_grupo := null;
      if jsonb_typeof(v_elem -> 'grupo_pesaje') = 'number' then
        if (v_elem ->> 'grupo_pesaje')::numeric <> trunc((v_elem ->> 'grupo_pesaje')::numeric)
           or (v_elem ->> 'grupo_pesaje')::numeric not between 1 and 500 then
          raise exception using errcode = 'P0001', message = 'datos_invalidos',
            detail = 'El grupo de pesaje del bache no es válido.';
        end if;
        v_grupo := (v_elem ->> 'grupo_pesaje')::smallint;
      elsif v_elem ? 'grupo_pesaje' and jsonb_typeof(v_elem -> 'grupo_pesaje') <> 'null' then
        raise exception using errcode = 'P0001', message = 'datos_invalidos',
          detail = 'El grupo de pesaje del bache debe ser un número.';
      end if;

      v_sum_e := v_sum_e + v_x;
      v_sum_s := v_sum_s + v_y;
      v_baches := v_baches || jsonb_build_object(
        'peso_entrada_kg', v_x,
        'peso_salida_kg', v_y,
        'temperatura_c', v_temp,
        'tiempo_min', v_tiempo,
        'grupo_pesaje', v_grupo,
        'observaciones', nullif(btrim(coalesce(v_elem ->> 'observaciones', '')), ''));
    end loop;
  elsif p_baches is not null and jsonb_typeof(p_baches) not in ('null') then
    if jsonb_typeof(p_baches) <> 'array' or jsonb_array_length(p_baches) > 0 then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'Solo la tostión se registra por baches.';
    end if;
  end if;

  v_salida := coalesce(p_salida, case when p_tipo = 'tostion' then v_sum_s end);
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

  if p_tipo = 'tostion' and (abs(v_sum_e - v_entrada) > 0.001 or abs(v_sum_s - v_salida) > 0.001) then
    raise exception using errcode = 'P0001', message = 'baches_no_cuadran',
      detail = format('Los baches suman %s kg de entrada y %s kg de salida; la tostión tiene %s y %s.',
                      v_sum_e, v_sum_s, v_entrada, v_salida);
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
    insert into cafe.baches (proceso_id, numero, peso_entrada_kg, peso_salida_kg, temperatura_c, tiempo_min, grupo_pesaje, observaciones)
    select v_proc.id, x.n::smallint, (x.e ->> 'peso_entrada_kg')::numeric, (x.e ->> 'peso_salida_kg')::numeric,
           (x.e ->> 'temperatura_c')::numeric, (x.e ->> 'tiempo_min')::numeric,
           (x.e ->> 'grupo_pesaje')::smallint, x.e ->> 'observaciones'
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
  if v_tipo = 'empaque' and exists (select 1 from cafe.lotes l where l.id = v_lote and l.linea = 'marca_propia') then
    raise exception using errcode = 'P0001', message = 'usar_registrar_empaque',
      detail = 'El empaque de marca propia se registra con las presentaciones y los insumos: usa el formulario de empaque.';
  end if;

  if v_reap is not null then
    return cafe._insertar_proceso_reapertura(v_reap, v_tipo, v_fecha, v_entrada, v_salida, v_obs);
  end if;
  return cafe._insertar_proceso(v_lote, v_tipo, v_fecha, v_origen, v_entrada, v_salida, v_nivel, v_baches, v_obs);
end $function$;

CREATE OR REPLACE FUNCTION cafe.anular_proceso(p_proceso uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_lote     uuid;
  v_anulado  timestamptz;
  v_kg       numeric;
  v_estado   text;
begin
  if not coalesce((select public.rol_en_tenant()) in ('owner', 'admin'), false)
     or not coalesce((select public.tenant_tiene_modulo('cafe.procesos')), false) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'Indica el motivo de la anulación.';
  end if;

  select p.lote_id into v_lote from cafe.procesos p where p.id = p_proceso;
  if not found then
    raise exception using errcode = 'P0001', message = 'proceso_no_encontrado',
      detail = 'El proceso no existe o no pertenece a tu cliente.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cafe.lote:' || v_lote::text, 0));

  select p.anulado_at into v_anulado from cafe.procesos p where p.id = p_proceso;
  if v_anulado is not null then
    raise exception using errcode = 'P0001', message = 'proceso_anulado',
      detail = 'El proceso ya está anulado.';
  end if;

  select p.peso_entrada_kg into v_kg from cafe.procesos p where p.id = p_proceso;

  -- El trigger comprueba los dependientes (de atrás hacia delante) y fija quién y cuándo anula. Anular libera saldo: el saldo
  -- es derivado, no se borra ninguna fila.
  update cafe.procesos
     set anulado_at = now(), motivo_anulacion = btrim(p_motivo)
   where id = p_proceso;

  select v.estado into v_estado from cafe.v_lotes v where v.id = v_lote;

  return jsonb_build_object('id', p_proceso, 'lote_id', v_lote, 'lote_estado', v_estado,
                            'kg_liberados', v_kg);
end $function$;

CREATE OR REPLACE FUNCTION cafe.procesos_proteger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from cafe.lotes l where l.id = new.lote_id and l.anulado_at is not null) then
      raise exception using errcode = 'P0001', message = 'lote_anulado',
        detail = 'El lote está anulado: ya no se puede modificar.';
    end if;
    return new;
  end if;

  if old.anulado_at is not null then
    raise exception using errcode = 'P0001', message = 'proceso_anulado',
      detail = 'El proceso está anulado: ya no se puede modificar.';
  end if;

  if new.anulado_at is not null then
    if exists (
         select 1 from cafe.procesos d where d.origen_proceso_id = old.id and d.anulado_at is null)
       or (old.reapertura_id is not null and old.tipo = 'molienda'
           and exists (select 1 from cafe.procesos po
                        where po.reapertura_id = old.reapertura_id and po.tipo = 'empaque' and po.anulado_at is null)) then
      raise exception using errcode = 'P0001', message = 'proceso_con_dependientes',
        detail = 'Hay procesos posteriores que dependen de este: anula primero el último proceso de esa tanda.';
    end if;
    new.anulado_at  := now();
    new.anulado_por := coalesce(auth.uid(), new.anulado_por);
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION cafe.lotes_proteger()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_ultimo smallint;
begin
  if tg_op = 'INSERT' then
    return new;
  end if;

  if old.anulado_at is not null then
    raise exception using errcode = 'P0001', message = 'lote_anulado',
      detail = 'El lote está anulado: ya no se puede modificar.';
  end if;

  v_ultimo := cafe.orden_ultimo_proceso(old.id);

  if new.anulado_at is not null then
    if v_ultimo is not null then
      raise exception using errcode = 'P0001', message = 'lote_con_procesos',
        detail = 'El lote ya tiene procesos registrados: anula primero los procesos para poder anularlo.';
    end if;
    -- Quién y cuándo anula lo fija la base, no el cliente.
    new.anulado_at  := now();
    new.anulado_por := coalesce(auth.uid(), new.anulado_por);
    return new;
  end if;

  if v_ultimo is not null then
    if new.linea            is distinct from old.linea
       or new.tercero_id       is distinct from old.tercero_id
       or new.peso_recibido_kg is distinct from old.peso_recibido_kg then
      raise exception using errcode = 'P0001', message = 'lote_bloqueado',
        detail = 'El lote ya tiene procesos: no se pueden cambiar la línea, el tercero ni el peso.';
    end if;

    -- Los servicios solo admiten AÑADIR pasos posteriores al último registrado.
    if not (old.servicios <@ new.servicios)
       or exists (select 1 from unnest(new.servicios) s
                   where s <> all (old.servicios) and cafe.orden_proceso(s) <= v_ultimo) then
      raise exception using errcode = 'P0001', message = 'lote_bloqueado',
        detail = 'El lote ya tiene procesos: solo se pueden añadir servicios posteriores al último registrado.';
    end if;
  end if;

  return new;
end $function$;

CREATE OR REPLACE FUNCTION cafe.registrar_compra(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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

  -- `num_bultos` y `pesos_bultos` (versión anterior) se aceptan y se ignoran durante un release.

  -- 5) Escrituras. El número se pide lo más tarde posible: si algo de abajo falla, el rollback también
  -- revierte el contador y el consecutivo no se consume.
  v_codigo := public.siguiente_consecutivo('MP', v_fecha);

  insert into cafe.lotes (codigo, linea, tercero_id, tipo_cafe_id, fecha_recepcion, peso_recibido_kg,
                          precio_compra_kg, factura_proveedor, observaciones)
  values (v_codigo, 'marca_propia', v_tercero, v_tipo, v_fecha, v_peso, v_precio, v_factura, v_obs)
  returning id, valor_compra into v_id, v_valor;

  return jsonb_build_object('id', v_id, 'codigo', v_codigo, 'valor_compra', v_valor);
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
                          densidad, alertas_calidad, rangos_calidad, servicios, nivel_tueste, perfil_temp_c, perfil_tiempo_min, observaciones)
  values (v_codigo, 'servicio', v_tercero_id, v_fecha, v_peso, v_humedad, v_densidad, v_alertas, v_rangos,
          v_servicios, v_nivel, v_temp, v_tiempo, v_obs)
  returning id, servicios into v_id, v_servicios;

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
end $function$;

CREATE OR REPLACE FUNCTION cafe.registrar_empaque(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_lote_id   uuid;
  v_fecha     date;
  v_origen    uuid;
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
  v_org       uuid;
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

    -- `bultos` (versión anterior) se acepta y se ignora durante un release.
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

  -- Empaque de un café reabierto: es de ESTE lote y no lleva origen.
  if v_reap is not null then
    if not v_mp then
      raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Solo se reabre café de marca propia.';
    end if;
    if v_origen is not null then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'Un empaque de reapertura no lleva origen: empaca el café reabierto.';
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

  -- El proceso: toda la lógica de pasos, origen y pesos vive en `_insertar_proceso` (o, con reapertura, en
  -- `_insertar_proceso_reapertura`). Una salida mayor que la entrada es, para el empaque, `empaque_supera_peso`
  -- (no se puede empacar más café del que hay).
  begin
    if v_mol is not null then
      -- Molienda en el mismo paso: se registra primero (misma transacción) y el empaque recibe lo que NO se molió
      -- más lo que salió de la molienda.
      v_org := cafe._resolver_origen(v_lote_id, 'molienda', v_origen);
      if v_org is null then
        raise exception using errcode = 'P0001', message = 'orden_proceso_invalido',
          detail = 'Primero registra la tostión: la molienda parte del café tostado.';
      end if;
      select coalesce(o.peso_salida_kg, o.peso_entrada_kg)
               - coalesce((select sum(m.peso_entrada_kg) from cafe.procesos m
                            where m.origen_proceso_id = o.id and m.tipo = 'molienda' and m.anulado_at is null), 0)
        into v_disp0 from cafe.procesos o where o.id = v_org;
      v_mol_res := cafe._insertar_proceso(v_lote_id, 'molienda', v_fecha, v_org, v_mol_e, v_mol_s, null, null, null);
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
                                 merma_referencia_pct, tolerancia_pts, observaciones, diferencia_destino,
                                 origen_proceso_id, origen_tipo)
      values (v_lote_id, 'empaque', v_fecha, v_ent_emp, v_salida, 0, null,
              cafe.parametro_numero('cafe.merma_tolerancia_pts', 2), v_obs,
              case when v_ent_emp > v_salida then v_destino end, v_org, 'tostion')
      returning * into v_p;
      select v.estado, v.avance_texto into v_est from cafe.v_lotes v where v.id = v_lote_id;
      v_res := jsonb_build_object('id', v_p.id, 'merma_kg', v_p.merma_kg, 'merma_pct', v_p.merma_pct,
                                  'peso_entrada_kg', v_p.peso_entrada_kg, 'peso_salida_kg', v_p.peso_salida_kg,
                                  'lote_estado', v_est.estado, 'avance_texto', v_est.avance_texto);
    elsif v_hay_molido and v_reap is null and not exists (
            select 1 from cafe.procesos pm
             where pm.lote_id = v_lote_id and pm.tipo = 'molienda' and pm.anulado_at is null and pm.reapertura_id is null
               and pm.origen_proceso_id is not distinct from cafe._resolver_origen(v_lote_id, 'empaque', v_origen)) then
      raise exception using errcode = 'P0001', message = 'molienda_requerida',
        detail = 'El café molido necesita la molienda: registra cuánto entró y cuánto salió, o muele primero esta tanda.';
    elsif v_hay_molido and v_reap is not null and not exists (
            select 1 from cafe.procesos pm where pm.reapertura_id = v_reap and pm.tipo = 'molienda' and pm.anulado_at is null) then
      raise exception using errcode = 'P0001', message = 'molienda_requerida',
        detail = 'El café molido necesita la molienda de la reapertura: regístrala antes de empacar.';
    elsif v_reap is null then
      v_res := cafe._insertar_proceso(v_lote_id, 'empaque', v_fecha, v_origen, v_entrada, v_salida, null, null, v_obs, v_destino);
    else
      v_res := cafe._insertar_proceso_reapertura(v_reap, 'empaque', v_fecha, v_entrada, v_salida, v_obs, v_destino);
    end if;
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
    if v_msg = 'salida_supera_entrada' then
      v_disp := coalesce(v_entrada,
                  case when v_reap is null
                       then cafe.peso_disponible(v_lote_id, 'empaque')
                       else cafe.peso_disponible_reapertura(v_reap, 'empaque') end);
      raise exception using errcode = 'P0001', message = 'empaque_supera_peso',
        detail = format('Las bolsas suman %s kg y a empaque solo llegan %s kg (%s)%s.',
                        trim_scale(v_salida), trim_scale(v_disp),
                        case when v_reap is null then 'la tanda elegida' else 'el café reabierto' end,
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
end $function$;

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
          select sum(b.peso_entrada_kg), sum(b.peso_salida_kg) into v_ent, v_sal
            from cafe.baches b where b.proceso_id = v_proc.id;
          if (v_p ? 'peso_entrada_kg' and abs(cafe._edicion_num(v_p, 'peso_entrada_kg') - v_ent) > 0.001)
             or (v_p ? 'peso_salida_kg' and abs(cafe._edicion_num(v_p, 'peso_salida_kg') - v_sal) > 0.001) then
            raise exception using errcode = 'P0001', message = 'edicion_incoherente',
              detail = 'Los pesos de una tostión salen de sus baches: corrige los baches, no el total.';
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
        if v_ent is null or v_sal is null or v_ent <= 0 or v_sal < 0 or v_sal > v_ent then
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
             sum(p.peso_entrada_kg)                                                  as entrada,
             sum(p.peso_salida_kg)                                                   as salida,
             sum(p.merma_kg)                                                         as merma,
             round(sum(p.merma_kg) / nullif(sum(p.peso_entrada_kg), 0) * 100, 3)     as pct,
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

-- El parámetro «bulto sugerido» (`cafe.peso_bulto_kg`) deja de sembrarse; las filas existentes se borran en el contract.
CREATE OR REPLACE FUNCTION platform.seed_vertical(p_tenant uuid, p_vertical vertical)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      (p_tenant, 'cafe.merma_referencia_tostion_pct', to_jsonb(18::numeric))
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
$function$;

-- 5) Firma vieja de _insertar_proceso y validación contra la foto previa -------------------------------------------------
drop function cafe._insertar_proceso(uuid, cafe.tipo_proceso, date, uuid[], numeric, numeric, cafe.nivel_tueste, jsonb, text, text);

revoke execute on function cafe._insertar_proceso(uuid, cafe.tipo_proceso, date, uuid, numeric, numeric, cafe.nivel_tueste, jsonb, text, text),
  cafe.procesos_origen_coherente(), cafe.procesos_verificar_saldo() from public, anon;
grant execute on function cafe._insertar_proceso(uuid, cafe.tipo_proceso, date, uuid, numeric, numeric, cafe.nivel_tueste, jsonb, text, text)
  to authenticated;

do $$
declare
  v_fallas text;
begin
  -- Estado, avance y peso actual por lote.
  select string_agg(format('lote %s: estado %s → %s, avance %s → %s, peso actual %s → %s kg', f.codigo, f.estado, v.estado,
                           f.avance_texto, v.avance_texto, f.peso_actual_kg, v.peso_actual_kg), E'\n' order by f.codigo)
    into v_fallas
    from cafe._saldo_kg_foto_lotes f
    join cafe.v_lotes v on v.id = f.lote_id
   where v.estado is distinct from f.estado
      or v.avance_texto is distinct from f.avance_texto
      or abs(coalesce(v.peso_actual_kg, 0) - coalesce(f.peso_actual_kg, 0))
           > cafe.saldo_tolerancia_kg((select l.peso_recibido_kg from cafe.lotes l where l.id = f.lote_id));
  if v_fallas is not null then
    -- No aborta: leer por kilos es el objetivo del ADR. Lo que antes se daba por terminado por bultos y tiene kilos sin procesar
    -- pasa a mostrarse como pendiente. Queda en el log para revisarlo.
    raise warning '%', 'Corte a saldo por kilos (ADR 0002): el estado, el avance o el peso actual de estos lotes cambian al leerse por kilos:' || E'\n' || v_fallas;
  end if;

  -- Por paso: completo/parcial (trilla, tostión y empaque; la molienda pasa a «cada tostión con su molienda») y kg pendientes
  -- de trilla y tostión dentro de la tolerancia.
  select string_agg(format('lote %s · %s: completo %s → %s, parcial %s → %s, pendiente %s → %s kg', l.codigo, f.tipo, f.completo, e.completo,
                           f.parcial, e.parcial, round(f.pendiente_kg, 3), round(e.kg_pendientes, 3)), E'\n' order by l.codigo, f.tipo)
    into v_fallas
    from cafe._saldo_kg_foto_etapas f
    join cafe.lotes l on l.id = f.lote_id
    join cafe.v_lote_etapas e on e.lote_id = f.lote_id and e.tipo = f.tipo
   where f.tipo <> 'molienda'
     and (e.completo is distinct from f.completo or e.parcial is distinct from f.parcial
          or (f.tipo in ('trilla', 'tostion') and abs(e.kg_pendientes - f.pendiente_kg) > cafe.saldo_tolerancia_kg(l.peso_recibido_kg)));
  if v_fallas is not null then
    raise warning '%', 'Corte a saldo por kilos (ADR 0002): los pasos de estos lotes cambian al leerse por kilos:' || E'\n' || v_fallas;
  end if;
end $$;

-- La foto cumplió su función.
drop table cafe._saldo_kg_foto_lotes;
drop table cafe._saldo_kg_foto_etapas;
