-- ADR 0002 (FIN-142 · T-01) · migración 8 de 9 · B-09 (FIN-155): sobrante de empaque → «Tostado sin empacar».
--
-- DECISIÓN (la ficha pedía decidir y documentar): MOVIMIENTOS, no un saldo mutable. `cafe.tostado_movimientos` es un libro
-- de solo inserción (delta en kg con su origen: `empaque_sobrante`, `empaque_inclusion` o `ajuste`) y `v_inventario_tostado` el
-- saldo por lote, tipo de café y forma (grano/molido). Mismo patrón que el kardex de insumos: trazable, sin carreras de
-- lectura-modificación-escritura y el saldo nunca queda negativo (constraint trigger diferido).
--
-- * El sobrante de un empaque de marca propia suma a «Tostado sin empacar» (forma `sobrante_forma`, por defecto grano).
-- * `registrar_empaque` acepta `incluir_tostado: [{ lote_origen_id, forma, kg }]`: esos kilos van a las bolsas pero NO son la
--   báscula de la tanda (no entran al cálculo de su merma: ADR 0002 §4). Guardan su cantidad en `procesos.tostado_incluido_kg`,
--   y como `peso_salida_kg` es solo lo que salió de la tanda, merma = (entró − báscula) / entró no se altera.
--       sobrante = báscula + incluido − bolsas        bolsas ≤ báscula + incluido
-- * Backfill: los sobrantes históricos `granel` de marca propia pasan al libro como grano.
-- * Se retira `v_granel_lote` (sin uso desde esta migración).
-- Nunca vuelve a café verde: ningún movimiento de tostado alimenta el saldo de verde.

alter table cafe.procesos add column tostado_incluido_kg numeric(10, 3);
alter table cafe.procesos add constraint procesos_tostado_incluido_ck check (tostado_incluido_kg is null or tostado_incluido_kg > 0);
comment on column cafe.procesos.tostado_incluido_kg is
  'Solo empaque (B-09): kg de tostado sin empacar de tandas anteriores que se incluyeron en las bolsas. No son báscula de la tanda.';

create table cafe.tostado_movimientos (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default public.tenant_actual() references public.tenants (id),
  lote_id      uuid not null,
  tipo_cafe_id uuid not null,
  forma        text not null check (forma in ('grano', 'molido')),
  delta_kg     numeric(10, 3) not null check (delta_kg <> 0),
  origen       text not null check (origen in ('empaque_sobrante', 'empaque_inclusion', 'ajuste')),
  proceso_id   uuid,
  created_at   timestamptz not null default now(),
  created_by   uuid default auth.uid() references auth.users (id),
  updated_at   timestamptz,
  updated_by   uuid references auth.users (id),
  constraint tostado_mov_lote_fk foreign key (tenant_id, lote_id) references cafe.lotes (tenant_id, id) on delete restrict,
  constraint tostado_mov_tipo_fk foreign key (tenant_id, tipo_cafe_id) references cafe.tipos_cafe (tenant_id, id) on delete restrict,
  constraint tostado_mov_proceso_fk foreign key (tenant_id, proceso_id) references cafe.procesos (tenant_id, id) on delete restrict,
  constraint tostado_mov_signo_ck check ((origen = 'empaque_sobrante' and delta_kg > 0) or (origen = 'empaque_inclusion' and delta_kg < 0) or origen = 'ajuste')
);
create index tostado_mov_saldo_idx on cafe.tostado_movimientos (tenant_id, lote_id, forma);
create index tostado_mov_proceso_idx on cafe.tostado_movimientos (proceso_id) where proceso_id is not null;

create trigger set_updated before update on cafe.tostado_movimientos
  for each row execute function public.set_updated();

alter table cafe.tostado_movimientos enable row level security;

-- Plantilla de membresías + módulo del inventario. Libro de solo inserción: nadie actualiza ni borra.
create policy tostado_mov_select on cafe.tostado_movimientos for select to authenticated
  using (tenant_id = (select public.tenant_actual()) and (select public.tenant_tiene_modulo('cafe.inventario')));
create policy tostado_mov_insert on cafe.tostado_movimientos for insert to authenticated
  with check (tenant_id = (select public.tenant_actual()) and (select public.tenant_tiene_modulo('cafe.inventario'))
              and (select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'));

revoke all on table cafe.tostado_movimientos from public, anon, authenticated, service_role;
grant select on table cafe.tostado_movimientos to authenticated, service_role;
grant insert (tenant_id, lote_id, tipo_cafe_id, forma, delta_kg, origen, proceso_id) on table cafe.tostado_movimientos to authenticated;
grant insert on table cafe.tostado_movimientos to service_role;

select audit.activar('cafe.tostado_movimientos');

-- El saldo nunca queda negativo por lote y forma (se comprueba al final de la transacción, con la lectura del propio cliente).
create or replace function cafe.tostado_verificar_saldo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_saldo numeric;
begin
  select coalesce(sum(m.delta_kg), 0) into v_saldo
    from cafe.tostado_movimientos m
   where m.tenant_id = new.tenant_id and m.lote_id = new.lote_id and m.forma = new.forma;
  if v_saldo < -0.0005 then
    raise exception using errcode = 'P0001', message = 'tostado_insuficiente',
      detail = 'No hay tanto tostado sin empacar de ese lote. Revisar cantidades.';
  end if;
  return null;
end $$;

create constraint trigger tostado_saldo_ok after insert on cafe.tostado_movimientos
  deferrable initially deferred for each row execute function cafe.tostado_verificar_saldo();
revoke all on function cafe.tostado_verificar_saldo() from public, anon, authenticated;

-- Saldo por lote, tipo de café y forma (solo lo que queda).
create view cafe.v_inventario_tostado with (security_invoker = true) as
select m.tenant_id,
       m.lote_id,
       l.codigo as lote_codigo,
       m.tipo_cafe_id,
       tc.nombre as tipo_cafe_nombre,
       m.forma,
       round(sum(m.delta_kg), 3) as kg,
       max(m.created_at) as ultimo_movimiento
  from cafe.tostado_movimientos m
  join cafe.lotes l on l.tenant_id = m.tenant_id and l.id = m.lote_id
  join cafe.tipos_cafe tc on tc.tenant_id = m.tenant_id and tc.id = m.tipo_cafe_id
 group by m.tenant_id, m.lote_id, l.codigo, m.tipo_cafe_id, tc.nombre, m.forma
having round(sum(m.delta_kg), 3) > 0;
grant select on cafe.v_inventario_tostado to authenticated, service_role;

-- Backfill: sobrantes históricos de marca propia («queda a granel») → tostado sin empacar, en grano.
insert into cafe.tostado_movimientos (tenant_id, lote_id, tipo_cafe_id, forma, delta_kg, origen, proceso_id, created_at, created_by)
select p.tenant_id, p.lote_id, l.tipo_cafe_id, 'grano', p.diferencia_kg, 'empaque_sobrante', p.id, p.created_at, p.created_by
  from cafe.procesos p
  join cafe.lotes l on l.id = p.lote_id
 where p.tipo = 'empaque' and p.diferencia_destino = 'granel' and p.anulado_at is null
   and l.linea = 'marca_propia' and l.tipo_cafe_id is not null and p.diferencia_kg > 0;

drop view cafe.v_granel_lote;

-- `_insertar_proceso` gana `p_incluido` (kg de tostado de tandas anteriores en las bolsas). Se elimina la firma de 10 parámetros
-- (con `default`, un overload sería ambiguo).
grant insert (tostado_incluido_kg) on table cafe.procesos to authenticated;
drop function cafe._insertar_proceso(uuid, cafe.tipo_proceso, date, uuid, numeric, numeric, cafe.nivel_tueste, jsonb, text, text);
CREATE OR REPLACE FUNCTION cafe._insertar_proceso(p_lote uuid, p_tipo cafe.tipo_proceso, p_fecha date, p_origen uuid, p_entrada numeric, p_salida numeric, p_nivel cafe.nivel_tueste, p_baches jsonb, p_observaciones text, p_diferencia_destino text DEFAULT NULL::text, p_incluido numeric DEFAULT NULL::numeric)
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
                             origen_proceso_id, origen_tipo, tostado_incluido_kg)
  values (p_lote, p_tipo, p_fecha, v_entrada, v_salida, v_tarifa, v_ref, v_tol, v_nivel,
          nullif(btrim(coalesce(p_observaciones, '')), ''),
          case when p_tipo = 'empaque' and v_entrada > v_salida then p_diferencia_destino end,
          v_origen, cafe.paso_origen(p_lote, p_tipo), case when p_tipo = 'empaque' then p_incluido end)
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

revoke execute on function cafe._insertar_proceso(uuid, cafe.tipo_proceso, date, uuid, numeric, numeric, cafe.nivel_tueste, jsonb, text, text, numeric) from public, anon;
grant execute on function cafe._insertar_proceso(uuid, cafe.tipo_proceso, date, uuid, numeric, numeric, cafe.nivel_tueste, jsonb, text, text, numeric) to authenticated;

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
        'forma', coalesce(nullif(v_elem ->> 'forma', ''), 'grano'), 'bolsa_cliente', true);
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

