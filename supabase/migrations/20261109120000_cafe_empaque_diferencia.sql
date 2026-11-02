-- Vertical café: el empaque no genera merma; la diferencia se clasifica por destino (FIN-119 · A-01).
--
-- Antes, lo que no entraba en bolsas (llegan 205,0 kg, se empacan 200,0 kg) quedaba como «merma de empaque» y el café
-- desaparecía del inventario. Ahora el proceso de empaque guarda `diferencia_kg` (entrada − usado en bolsas) y, si es
-- mayor que cero, un `diferencia_destino` obligatorio:
--   · `suelto`  – se entrega suelto al cliente (solo servicios a terceros);
--   · `granel`  – queda a granel (solo marca propia): es el saldo de «tostado a granel» del lote (`cafe.v_granel_lote`),
--                 que consumirá el inventario de A-15;
--   · `muestra` y `perdida` – en las dos líneas.
-- Cuadre: empacado + granel/suelto + muestra + pérdida = lo que llegó. El empaque ya no cuenta como merma en los
-- indicadores (el panel y los resúmenes lo excluyen); `merma_kg`/`merma_pct` siguen siendo columnas calculadas por
-- compatibilidad, pero ya no se interpretan.
--
-- Cambios:
--   1. `cafe.procesos`: `diferencia_kg` (calculada, solo empaque) y `diferencia_destino` (+ CHECK de coherencia).
--   2. `cafe.empaque_lineas`: `articulo_pt_id` admite NULL (servicios a terceros no mueven inventario propio) y
--      `bolsa_cliente`. El trigger de verificación y el de anulación se ajustan.
--   3. `cafe._insertar_proceso` / `cafe._insertar_proceso_reapertura`: parámetro opcional `p_diferencia_destino`.
--   4. `cafe.registrar_empaque`: acepta lotes de servicio, exige el destino de la diferencia y devuelve
--      `diferencia_kg`/`diferencia_destino`.
--   5. `cafe.v_granel_lote`: saldo de tostado a granel por lote.
-- Los empaques anteriores quedan con `diferencia_destino` NULL (su diferencia fue la «merma» de entonces).
--
-- Reversión (a mano, en orden): drop view cafe.v_granel_lote; restaurar de 20261107110000 `registrar_empaque`,
-- `_insertar_proceso_reapertura`, y de 20261104100000 `_insertar_proceso` (borrando antes las versiones de 10/6
-- parámetros); restaurar `empaque_lineas_verificar`/`procesos_empaque_no_anulable` de 20261106100000; borrar las
-- líneas de servicio (`articulo_pt_id is null`) y `alter table cafe.empaque_lineas alter column articulo_pt_id set not
-- null, drop column bolsa_cliente`; `alter table cafe.procesos drop column diferencia_destino, drop column diferencia_kg`.

-- 1. cafe.procesos -------------------------------------------------------------------------------------------------

alter table cafe.procesos
  add column diferencia_kg numeric(10,3)
    generated always as (case when tipo = 'empaque' then peso_entrada_kg - peso_salida_kg end) stored,
  add column diferencia_destino text,
  add constraint procesos_diferencia_destino_ck check (
    diferencia_destino is null
    or (tipo = 'empaque' and peso_entrada_kg > peso_salida_kg
        and diferencia_destino in ('suelto', 'granel', 'muestra', 'perdida')));

grant insert (diferencia_destino) on table cafe.procesos to authenticated;

-- 2. cafe.empaque_lineas -----------------------------------------------------------------------------------------------

alter table cafe.empaque_lineas
  alter column articulo_pt_id drop not null,
  add column bolsa_cliente boolean not null default false;

grant insert (bolsa_cliente) on table cafe.empaque_lineas to authenticated;

-- La línea cuelga de un proceso de EMPAQUE; en marca propia lleva su producto terminado y en servicios no.
create or replace function cafe.empaque_lineas_verificar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_linea cafe.linea_lote;
begin
  select l.linea into v_linea
    from cafe.procesos p join cafe.lotes l on l.id = p.lote_id
   where p.id = new.proceso_id and p.tipo = 'empaque';
  if v_linea is null then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'Las presentaciones empacadas cuelgan de un proceso de empaque.';
  end if;
  if (v_linea = 'marca_propia') <> (new.articulo_pt_id is not null) then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'El producto terminado va en las líneas de marca propia y no en las de servicios.';
  end if;
  return new;
end $$;

-- Solo el empaque que movió inventario (con producto terminado) no se anula; el de servicios sí.
create or replace function cafe.procesos_empaque_no_anulable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.anulado_at is not null and old.anulado_at is null
     and exists (select 1 from cafe.empaque_lineas el where el.proceso_id = old.id and el.articulo_pt_id is not null) then
    raise exception using errcode = 'P0001', message = 'empaque_no_anulable',
      detail = 'Este empaque ya movió inventario (bolsas, etiquetas y producto terminado) y no se anula. Corrige las existencias con un ajuste.';
  end if;
  return new;
end $$;

-- 3. Inserción de procesos con el destino de la diferencia ---------------------------------------------------------------
-- Se sustituyen las firmas de 9 y 6 parámetros por las de 10 y 7 (el último, opcional): las llamadas existentes siguen
-- valiendo. El destino solo se guarda en un empaque con diferencia > 0; la obligación de indicarlo la comprueba
-- `registrar_empaque` (el resto de rutas no lo pide).

drop function cafe._insertar_proceso(uuid, cafe.tipo_proceso, date, uuid[], numeric, numeric, cafe.nivel_tueste, jsonb, text);
drop function cafe._insertar_proceso_reapertura(uuid, cafe.tipo_proceso, date, numeric, numeric, text);

create function cafe._insertar_proceso(
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
  v_ref := case p_tipo
             when 'trilla'  then cafe.parametro_numero('cafe.merma_referencia_trilla_pct', 19)
             when 'tostion' then cafe.parametro_numero('cafe.merma_referencia_tostion_pct', 18)
           end;
  v_tol := cafe.parametro_numero('cafe.merma_tolerancia_pts', 3);

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
    'valor', v_proc.valor,
    'lote_estado', v_estado.estado,
    'peso_entrada_kg', v_proc.peso_entrada_kg,
    'peso_salida_kg', v_proc.peso_salida_kg,
    'tarifa_kg', v_proc.tarifa_kg,
    'avance_texto', v_estado.avance_texto);
end $$;


create function cafe._insertar_proceso_reapertura(
  p_reapertura    uuid,
  p_tipo          cafe.tipo_proceso,
  p_fecha         date,
  p_entrada       numeric,
  p_salida        numeric,
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
  v_reap    cafe.reaperturas;
  v_lote    cafe.lotes;
  v_disp    numeric;
  v_entrada numeric;
  v_salida  numeric;
  v_tol     numeric;
  v_proc    cafe.procesos;
  v_estado  record;
begin
  if not coalesce((select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'), false)
     or not coalesce((select public.tenant_tiene_modulo('cafe.procesos')), false) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  select * into v_reap from cafe.reaperturas r where r.id = p_reapertura;
  if not found then
    raise exception using errcode = 'P0001', message = 'reapertura_no_encontrada',
      detail = 'La reapertura no existe o no pertenece a tu cliente.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cafe.lote:' || v_reap.lote_id::text, 0));

  select * into v_lote from cafe.lotes l where l.id = v_reap.lote_id;
  if v_lote.anulado_at is not null then
    raise exception using errcode = 'P0001', message = 'lote_anulado',
      detail = 'El lote está anulado: ya no se puede modificar.';
  end if;

  if p_tipo is null or p_tipo not in ('molienda', 'empaque') then
    raise exception using errcode = 'P0001', message = 'reapertura_solo_molienda_empaque',
      detail = 'El café reabierto ya está tostado: solo se muele o se empaca, sin repetir trilla ni tostión.';
  end if;
  if p_fecha is null or p_fecha not between date '2000-01-01' and date '2100-12-31' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Indica una fecha válida.';
  end if;
  if p_observaciones is not null and char_length(p_observaciones) > 500 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'Las observaciones admiten hasta 500 caracteres.';
  end if;

  if exists (select 1 from cafe.procesos p
              where p.reapertura_id = p_reapertura and p.tipo = p_tipo and p.anulado_at is null) then
    raise exception using errcode = 'P0001', message = 'reapertura_proceso_duplicado',
      detail = format('Esta reapertura ya tiene su %s registrada: una reapertura admite una molienda y un empaque.',
                      case p_tipo when 'molienda' then 'molienda' else 'empaque' end);
  end if;
  if p_tipo = 'molienda' and exists (select 1 from cafe.procesos p
                                      where p.reapertura_id = p_reapertura and p.tipo = 'empaque' and p.anulado_at is null) then
    raise exception using errcode = 'P0001', message = 'orden_proceso_invalido',
      detail = 'Esta reapertura ya se empacó: la molienda va antes del empaque.';
  end if;
  if p_fecha < v_reap.fecha then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'El proceso no puede ser anterior a la reapertura.';
  end if;

  -- Pesos.
  v_disp := cafe.peso_disponible_reapertura(p_reapertura, p_tipo);
  if p_entrada is not null then
    if p_entrada <= 0 or p_entrada >= 10000000 or p_entrada <> round(p_entrada, 3) then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'El peso de entrada debe ser mayor que cero y tener como máximo 3 decimales.';
    end if;
    if p_entrada > v_disp * 1.005 then
      raise exception using errcode = 'P0001', message = 'peso_supera_disponible',
        detail = format('El peso de entrada (%s kg) supera el disponible (%s kg) en más de 0,5 %%.', p_entrada, v_disp);
    end if;
    if p_entrada < v_disp * 0.995 then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = format('En una reapertura entra todo el café reabierto (%s kg): lo que no se procese se perdería de la trazabilidad.', v_disp);
    end if;
  end if;
  v_entrada := coalesce(p_entrada, v_disp);

  if p_salida is null then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Indica el peso de salida.';
  end if;
  v_salida := p_salida;
  if v_salida < 0 or v_salida >= 10000000 or v_salida <> round(v_salida, 3) then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'El peso de salida no puede ser negativo y tiene como máximo 3 decimales.';
  end if;
  if v_salida > v_entrada then
    raise exception using errcode = 'P0001', message = 'salida_supera_entrada',
      detail = format('El peso de salida (%s kg) no puede superar el de entrada (%s kg).', v_salida, v_entrada);
  end if;

  -- Tolerancia del cliente (snapshot); sin merma de referencia ni tarifa.
  v_tol := cafe.parametro_numero('cafe.merma_tolerancia_pts', 3);

  insert into cafe.procesos (lote_id, tipo, fecha, peso_entrada_kg, peso_salida_kg, tarifa_kg,
                             merma_referencia_pct, tolerancia_pts, observaciones, reapertura_id, diferencia_destino)
  values (v_reap.lote_id, p_tipo, p_fecha, v_entrada, v_salida, 0, null, v_tol,
          nullif(btrim(coalesce(p_observaciones, '')), ''), p_reapertura,
          case when p_tipo = 'empaque' and v_entrada > v_salida then p_diferencia_destino end)
  returning * into v_proc;

  select v.estado, v.avance_texto into v_estado from cafe.v_lotes v where v.id = v_reap.lote_id;

  return jsonb_build_object(
    'id', v_proc.id,
    'merma_kg', v_proc.merma_kg,
    'merma_pct', v_proc.merma_pct,
    'desvio', v_proc.desvio,
    'valor', v_proc.valor,
    'lote_estado', v_estado.estado,
    'peso_entrada_kg', v_proc.peso_entrada_kg,
    'peso_salida_kg', v_proc.peso_salida_kg,
    'tarifa_kg', v_proc.tarifa_kg,
    'avance_texto', v_estado.avance_texto);
end $$;


revoke all on function cafe._insertar_proceso(uuid, cafe.tipo_proceso, date, uuid[], numeric, numeric, cafe.nivel_tueste, jsonb, text, text) from public, anon;
grant execute on function cafe._insertar_proceso(uuid, cafe.tipo_proceso, date, uuid[], numeric, numeric, cafe.nivel_tueste, jsonb, text, text) to authenticated;
revoke all on function cafe._insertar_proceso_reapertura(uuid, cafe.tipo_proceso, date, numeric, numeric, text, text) from public, anon;
grant execute on function cafe._insertar_proceso_reapertura(uuid, cafe.tipo_proceso, date, numeric, numeric, text, text) to authenticated;

-- 4. Registrar un empaque ----------------------------------------------------------------------------------------------------
-- Entrada (jsonb): como antes, más
--   "diferencia_destino": "suelto" | "granel" | "muestra" | "perdida" | null   (obligatorio si sobra café)
--   lineas[].bolsa_cliente: boolean opcional (servicios: la bolsa es del cliente)
-- Marca propia: bolsas, etiquetas y producto terminado como antes. Servicios a terceros: solo registra las líneas.
-- `empaque_supera_peso` = las bolsas suman más de lo que llega; `diferencia_sin_destino` = sobra café sin destino.
-- Salida: la de antes + { diferencia_kg, diferencia_destino }.

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
  v_gs        integer[] := '{}';
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
    if v_g::integer = any(v_gs) then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = format('La presentación de %s g está repetida.', v_g::integer);
    end if;
    if v_elem ? 'bolsa_cliente' and jsonb_typeof(v_elem -> 'bolsa_cliente') not in ('boolean', 'null') then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'Indica si la bolsa es del cliente con sí o no.';
    end if;
    v_gs := v_gs || v_g::integer;
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
        'bolsa_cliente', coalesce((v_elem ->> 'bolsa_cliente')::boolean, false));
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

    for i in 1..2 loop
      select a.id, a.nombre into v_pt
        from public.articulos a
       where a.tenant_id = v_lote.tenant_id and a.tipo = 'producto_terminado' and a.activo
         and a.atributos ->> 'tipo_cafe_id' = v_lote.tipo_cafe_id::text
         and jsonb_typeof(a.atributos -> 'presentacion_g') = 'number'
         and (a.atributos ->> 'presentacion_g')::numeric = v_g
       order by a.created_at, a.id limit 1;
      exit when v_pt.id is not null or i = 2;
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
      'presentacion_g', v_g::integer, 'unidades', v_u::integer, 'kg', v_u * v_g / 1000,
      'producto_id', v_pt.id, 'producto', v_pt.nombre,
      'bolsa_id', v_bolsa.id, 'bolsa', v_bolsa.nombre, 'etiqueta_id', v_etiq.id, 'etiqueta', v_etiq.nombre);
  end loop;

  -- El proceso: toda la lógica de pasos, bultos y pesos vive en `_insertar_proceso` (o, con reapertura, en
  -- `_insertar_proceso_reapertura`). Una salida mayor que la entrada es, para el empaque, `empaque_supera_peso`
  -- (no se puede empacar más café del que hay).
  begin
    if v_reap is null then
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
  insert into cafe.empaque_lineas (proceso_id, presentacion_g, unidades, articulo_pt_id, bolsa_cliente)
  select v_proc, (l ->> 'presentacion_g')::integer, (l ->> 'unidades')::integer, (l ->> 'producto_id')::uuid,
         coalesce((l ->> 'bolsa_cliente')::boolean, false)
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
    'stocks', v_mov -> 'stocks',
    'advertencias', v_adv);
end $$;

revoke all on function cafe.registrar_empaque(jsonb) from public, anon;
grant execute on function cafe.registrar_empaque(jsonb) to authenticated;

-- 5. Saldo de tostado a granel por lote ---------------------------------------------------------------------------------------------
-- El café que «queda a granel» al empacar (marca propia). Sale de la suma de las diferencias con ese destino de los
-- empaques vigentes: nadie edita un número. El consumo del granel (A-15) restará de aquí cuando exista.

create or replace view cafe.v_granel_lote with (security_invoker = true) as
select p.tenant_id,
       p.lote_id,
       sum(p.diferencia_kg) as kg_granel,
       max(p.fecha)         as ultima_fecha
  from cafe.procesos p
 where p.tipo = 'empaque' and p.diferencia_destino = 'granel' and p.anulado_at is null
 group by p.tenant_id, p.lote_id;

revoke all on cafe.v_granel_lote from public, anon, authenticated, service_role;
grant select on cafe.v_granel_lote to authenticated, service_role;
