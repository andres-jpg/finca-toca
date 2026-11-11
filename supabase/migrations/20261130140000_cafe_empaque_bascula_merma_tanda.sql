-- ADR 0002 (FIN-142 · T-01) · migración 7 de 9 · B-08 (FIN-154): empaque con peso total en báscula y merma de tostión por tanda.
--
-- * Un empaque vigente por tostión (índice único parcial): cada tanda se cierra con UN empaque.
-- * El peso de salida de la tostión es el peso total en báscula del empaque que cierra la tanda: `_asignar_salida_tostion`
--   (SECURITY DEFINER mínimo, excepción documentada) lo escribe UNA vez; las columnas generadas existentes (`merma_kg`,
--   `merma_pct`, `desvio`, `desvio_sentido`) calculan entonces la merma de la tanda con los snapshots de la propia tostión.
--   `anular_proceso` de un empaque de terceros libera esa salida (`_liberar_salida_tostion`).
-- * `registrar_empaque`: origen = tostión, báscula, sobrante (`diferencia_kg`), tanda; molienda y clasificación de la diferencia
--   fuera (el sobrante de marca propia es «tostado sin empacar»; el de terceros se entrega a granel). Ya no lleva `molienda`.
-- * `v_tostion_tandas`: tanda, báscula, merma y si está cerrada.
-- Debe salir en el mismo release que `..._tostion_tandas_sin_salida` (B-05).

-- 1) Una tanda, un empaque -----------------------------------------------------------------------------------------
do $$
declare
  v_fallas text;
begin
  select string_agg(format('lote %s: tostión %s con %s empaques vigentes', x.codigo, x.origen, x.n), E'\n' order by x.codigo)
    into v_fallas
    from (select l.codigo, p.origen_proceso_id as origen, count(*) as n
            from cafe.procesos p
            join cafe.lotes l on l.id = p.lote_id
           where p.tipo = 'empaque' and p.origen_tipo = 'tostion' and p.anulado_at is null
           group by l.codigo, p.origen_proceso_id
          having count(*) > 1) x;
  if v_fallas is not null then
    raise exception using errcode = 'P0001',
      message = 'Una tanda, un empaque (ADR 0002): estas tostiones tienen más de un empaque vigente (empaque parcial histórico). Resuélvelo a mano:'
                || E'\n' || v_fallas;
  end if;
end $$;

create unique index procesos_tanda_un_empaque_uk on cafe.procesos (origen_proceso_id)
  where tipo = 'empaque' and origen_tipo = 'tostion' and anulado_at is null;

-- 2) La salida de la tostión la fija su empaque -----------------------------------------------------------------------
-- EXCEPCIÓN DOCUMENTADA a «SECURITY INVOKER»: un operativo no tiene UPDATE sobre `procesos` y no se le amplía el RLS. Es
-- mínima: `search_path = ''`, solo el cliente actual, solo con el empaque VIGENTE enlazado, solo si la salida es null y
-- solo con el valor de ese empaque. Se concede a `authenticated` (la llama `registrar_empaque`, que es invoker) y por eso
-- repite el rol y el módulo. Activa la bandera de sesión de `editar_lote` solo durante el UPDATE (guard `procesos_edicion_directa`).
create or replace function cafe._asignar_salida_tostion(p_empaque uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e    cafe.procesos;
  v_prev text;
begin
  if not coalesce((select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'), false)
     or not coalesce((select public.tenant_tiene_modulo('cafe.procesos')), false) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  select * into v_e from cafe.procesos p
   where p.id = p_empaque and p.tenant_id = (select public.tenant_actual())
     and p.tipo = 'empaque' and p.origen_tipo = 'tostion' and p.anulado_at is null;
  if not found then
    raise exception using errcode = 'P0001', message = 'proceso_no_encontrado',
      detail = 'El empaque no existe, no es de una tostión o está anulado.';
  end if;

  v_prev := coalesce(current_setting('cafe.edicion_lote', true), 'off');
  perform set_config('cafe.edicion_lote', 'on', true);
  update cafe.procesos t
     set peso_salida_kg = v_e.peso_entrada_kg
   where t.id = v_e.origen_proceso_id and t.tenant_id = v_e.tenant_id and t.tipo = 'tostion'
     and t.anulado_at is null and t.peso_salida_kg is null;
  perform set_config('cafe.edicion_lote', v_prev, true);
end $$;

-- Al anular un empaque (solo los de terceros se anulan) la tanda vuelve a quedar abierta: su salida se borra.
create or replace function cafe._liberar_salida_tostion(p_empaque uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e    cafe.procesos;
  v_prev text;
begin
  if not coalesce((select public.rol_en_tenant()) in ('owner', 'admin'), false)
     or not coalesce((select public.tenant_tiene_modulo('cafe.procesos')), false) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  select * into v_e from cafe.procesos p
   where p.id = p_empaque and p.tenant_id = (select public.tenant_actual())
     and p.tipo = 'empaque' and p.origen_tipo = 'tostion' and p.anulado_at is not null;
  if not found then
    return;
  end if;

  v_prev := coalesce(current_setting('cafe.edicion_lote', true), 'off');
  perform set_config('cafe.edicion_lote', 'on', true);
  update cafe.procesos t
     set peso_salida_kg = null
   where t.id = v_e.origen_proceso_id and t.tenant_id = v_e.tenant_id and t.tipo = 'tostion' and t.anulado_at is null
     and not exists (select 1 from cafe.procesos x
                      where x.origen_proceso_id = t.id and x.tipo = 'empaque' and x.anulado_at is null);
  perform set_config('cafe.edicion_lote', v_prev, true);
end $$;

revoke execute on function cafe._asignar_salida_tostion(uuid), cafe._liberar_salida_tostion(uuid) from public, anon;
grant execute on function cafe._asignar_salida_tostion(uuid), cafe._liberar_salida_tostion(uuid) to authenticated;

-- 3) Tandas de tostión -------------------------------------------------------------------------------------------------
-- Una fila por tostión vigente: lo que entró, el peso en báscula (la salida que fijó su empaque), su merma y si la tanda
-- ya está cerrada. El acumulado del lote suma las tandas cerradas.
create view cafe.v_tostion_tandas with (security_invoker = true) as
select t.tenant_id,
       t.lote_id,
       t.id                       as proceso_id,
       t.fecha,
       t.peso_entrada_kg          as entrada_kg,
       t.peso_salida_kg           as bascula_kg,
       t.merma_kg,
       t.merma_pct,
       t.desvio,
       t.desvio_sentido,
       t.merma_referencia_pct,
       t.tolerancia_pts,
       e.id                       as empaque_id,
       e.id is not null           as cerrada
  from cafe.procesos t
  left join lateral (
    select p.id from cafe.procesos p
     where p.origen_proceso_id = t.id and p.tipo = 'empaque' and p.anulado_at is null
     limit 1
  ) e on true
 where t.tipo = 'tostion' and t.anulado_at is null and t.reapertura_id is null;

grant select on cafe.v_tostion_tandas to authenticated, service_role;

-- 4) Empaque ---------------------------------------------------------------------------------------------------------
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
      if v_salida > v_bascula + 0.0005 then
        raise exception using errcode = 'P0001', message = 'empaque_supera_peso',
          detail = 'Las bolsas suman más que el peso en báscula. Revisar cantidades.';
      end if;
      v_sobrante := greatest(round(v_bascula - v_salida, 3), 0);

      -- Marca propia: el sobrante queda como tostado sin empacar. Terceros: se entrega a granel al cliente (aquí «suelto»).
      v_res := cafe._insertar_proceso(v_lote_id, 'empaque', v_fecha, v_org, v_bascula, v_salida, null, null, v_obs,
                                      case when v_sobrante > 0 then case when v_mp then 'granel' else 'suelto' end end);
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
    'en_bolsas_kg', v_res -> 'peso_salida_kg',
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
  if v_tipo = 'empaque' and (exists (select 1 from cafe.lotes l where l.id = v_lote and l.linea = 'marca_propia')
                          or cafe.paso_origen(v_lote, 'empaque') = 'tostion') then
    raise exception using errcode = 'P0001', message = 'usar_registrar_empaque',
      detail = 'El empaque de una tanda se registra con su peso en báscula y sus bolsas: usar el formulario de empaque.';
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
  v_tipo     cafe.tipo_proceso;
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

  select p.lote_id, p.tipo into v_lote, v_tipo from cafe.procesos p where p.id = p_proceso;
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

  -- Anular el empaque de una tanda (solo terceros) la reabre: la salida de su tostión se borra.
  if v_tipo = 'empaque' then
    perform cafe._liberar_salida_tostion(p_proceso);
  end if;

  select v.estado into v_estado from cafe.v_lotes v where v.id = v_lote;

  return jsonb_build_object('id', p_proceso, 'lote_id', v_lote, 'lote_estado', v_estado,
                            'kg_liberados', v_kg);
end $function$;

