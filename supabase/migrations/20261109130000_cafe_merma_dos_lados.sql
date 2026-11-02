-- A-03 (FIN-121) · Alerta de merma de dos lados (alta / baja), tolerancia ±2 y referencia por nivel de tueste.
--
--   1. `cafe.procesos.desvio_sentido` (GENERADA): 'alta' si la merma supera ref + tol, 'baja' si queda por debajo
--      de ref - tol y NULL en rango o sin referencia. `desvio` no cambia (ya era |merma - ref| > tol, es decir
--      alta OR baja); solo se nombra el lado. Es un aviso: nada bloquea el guardado.
--   2. `_insertar_proceso`: la referencia de tostión sale de `cafe.merma_referencia_tostion_<bajo|medio|alto>_pct`
--      (con respaldo en la clave general anterior y luego 18) y la tolerancia por defecto pasa de 3 a 2. Todo se
--      congela en el proceso (snapshot): cambiar la referencia solo afecta a procesos posteriores.
--   3. Los clientes que ya tenían `cafe.merma_referencia_tostion_pct` la reciben copiada a los tres niveles.
--
-- Parte de la versión de 10 parámetros de 20261109120000_cafe_empaque_diferencia.sql (A-01), de modo que conserva el
-- destino de la diferencia del empaque. Reversión: `alter table cafe.procesos drop column desvio_sentido;` y volver a
-- aplicar `_insertar_proceso` de aquella migración; las claves nuevas de `public.parametros` pueden quedarse o borrarse.

alter table cafe.procesos add column desvio_sentido text generated always as (
  case
    when merma_referencia_pct is null or tolerancia_pts is null then null
    when round((peso_entrada_kg - peso_salida_kg) / peso_entrada_kg * 100, 3) > merma_referencia_pct + tolerancia_pts then 'alta'
    when round((peso_entrada_kg - peso_salida_kg) / peso_entrada_kg * 100, 3) < merma_referencia_pct - tolerancia_pts then 'baja'
  end) stored;

insert into public.parametros (tenant_id, clave, valor)
select p.tenant_id, 'cafe.merma_referencia_tostion_' || n.nivel || '_pct', p.valor
  from public.parametros p
 cross join (values ('bajo'), ('medio'), ('alto')) n(nivel)
 where p.clave = 'cafe.merma_referencia_tostion_pct'
on conflict (tenant_id, clave) do nothing;

create or replace function cafe._insertar_proceso(
  p_lote          uuid,
  p_tipo          cafe.tipo_proceso,
  p_fecha         date,
  p_bultos        uuid[],
  p_entrada       numeric,
  p_salida        numeric,
  p_nivel         cafe.nivel_tueste,
  p_baches        jsonb,
  p_observaciones text,
  p_diferencia_destino text default null
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_lote      cafe.lotes;
  v_proc      cafe.procesos;
  v_bultos    uuid[];
  v_n         integer;
  v_prev      cafe.tipo_proceso;
  v_nums      text;
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
  v_estado    record;
begin
  -- 1) Permisos: rol operativo en el cliente y módulo de procesos activo.
  if not coalesce((select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'), false)
     or not coalesce((select public.tenant_tiene_modulo('cafe.procesos')), false) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  -- 2) Serializa por lote: dos registros a la vez no pueden ver el mismo bulto libre (el índice único
  -- lo impediría, pero con un 23505 genérico en vez de `bulto_ya_procesado`).
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

  -- 4) Bultos: del lote, sin repetir; ninguno pasó ya por este paso ni por uno posterior; todos pasaron por
  -- el previo.
  select array_agg(distinct x) into v_bultos from unnest(p_bultos) x where x is not null;
  if v_bultos is null then
    if v_lote.num_bultos = 1 then
      v_bultos := array(select b.id from cafe.lote_bultos b where b.lote_id = p_lote);
    else
      raise exception using errcode = 'P0001', message = 'bulto_invalido',
        detail = 'Elige los bultos que pasan por este proceso.';
    end if;
  end if;

  select count(*) into v_n from cafe.lote_bultos b where b.lote_id = p_lote and b.id = any(v_bultos);
  if v_n <> cardinality(v_bultos) then
    raise exception using errcode = 'P0001', message = 'bulto_invalido',
      detail = 'Alguno de los bultos no pertenece a este lote.';
  end if;

  select string_agg(b.numero::text, ', ' order by b.numero) into v_nums
    from cafe.lote_bultos b
   where b.id = any(v_bultos)
     and exists (select 1 from cafe.proceso_bultos pb where pb.bulto_id = b.id and pb.tipo = p_tipo);
  if v_nums is not null then
    raise exception using errcode = 'P0001', message = 'bulto_ya_procesado',
      detail = format('Los bultos %s ya pasaron por este proceso.', v_nums);
  end if;

  select string_agg(b.numero::text, ', ' order by b.numero) into v_nums
    from cafe.lote_bultos b
   where b.id = any(v_bultos)
     and exists (select 1 from cafe.proceso_bultos pb
                  where pb.bulto_id = b.id and cafe.orden_proceso(pb.tipo) > cafe.orden_proceso(p_tipo));
  if v_nums is not null then
    raise exception using errcode = 'P0001', message = 'orden_proceso_invalido',
      detail = format('Los bultos %s ya pasaron por un paso posterior: no se puede registrar este.', v_nums);
  end if;

  select x.previo, string_agg(b.numero::text, ', ' order by b.numero)
    into v_prev, v_nums
    from cafe.lote_bultos b
   cross join lateral (select cafe.paso_previo(p_lote, p_tipo, b.id) as previo) x
   where b.id = any(v_bultos)
     and x.previo is not null
     and not exists (select 1 from cafe.proceso_bultos pb where pb.bulto_id = b.id and pb.tipo = x.previo)
   group by x.previo
   order by cafe.orden_proceso(x.previo)
   limit 1;
  if v_nums is not null then
    raise exception using errcode = 'P0001', message = 'orden_proceso_invalido',
      detail = format('Primero registra %s de estos bultos (%s).',
                      case v_prev when 'trilla' then 'la trilla' when 'tostion' then 'la tostión'
                                  when 'molienda' then 'la molienda' else 'el empaque' end, v_nums);
  end if;

  -- 5) Pesos. Entrada: la enviada o la disponible; salida: la enviada (o la suma de los baches).
  v_disp := cafe.peso_disponible(p_lote, p_tipo, v_bultos);

  if p_entrada is not null then
    if p_entrada <= 0 or p_entrada >= 10000000 or p_entrada <> round(p_entrada, 3) then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'El peso de entrada debe ser mayor que cero y tener como máximo 3 decimales.';
    end if;
    if p_entrada > v_disp * 1.005 then
      raise exception using errcode = 'P0001', message = 'peso_supera_disponible',
        detail = format('El peso de entrada (%s kg) supera el disponible (%s kg) en más de 0,5 %%.', p_entrada, v_disp);
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

      v_sum_e := v_sum_e + v_x;
      v_sum_s := v_sum_s + v_y;
      v_baches := v_baches || jsonb_build_object(
        'peso_entrada_kg', v_x,
        'peso_salida_kg', v_y,
        'temperatura_c', v_temp,
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
                             merma_referencia_pct, tolerancia_pts, nivel_tueste, observaciones, diferencia_destino)
  values (p_lote, p_tipo, p_fecha, v_entrada, v_salida, v_tarifa, v_ref, v_tol, v_nivel,
          nullif(btrim(coalesce(p_observaciones, '')), ''),
          case when p_tipo = 'empaque' and v_entrada > v_salida then p_diferencia_destino end)
  returning * into v_proc;

  insert into cafe.proceso_bultos (proceso_id, bulto_id, tipo, lote_id)
  select v_proc.id, b, p_tipo, p_lote from unnest(v_bultos) b;

  if p_tipo = 'tostion' then
    insert into cafe.baches (proceso_id, numero, peso_entrada_kg, peso_salida_kg, temperatura_c, observaciones)
    select v_proc.id, x.n::smallint, (x.e ->> 'peso_entrada_kg')::numeric, (x.e ->> 'peso_salida_kg')::numeric,
           (x.e ->> 'temperatura_c')::numeric, x.e ->> 'observaciones'
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
end $$;
