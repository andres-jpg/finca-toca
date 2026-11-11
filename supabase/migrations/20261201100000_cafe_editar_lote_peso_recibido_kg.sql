-- B-16 (FIN-161) · «Editar lote» no corregía el peso recibido (sobre el modelo por kilos, ADR 0002).
--
-- Causa: A-18 (20261118100000) solo dejaba corregir fechas, precio, factura, observaciones y los pesos de los PROCESOS y baches.
-- El peso recibido (`lotes.peso_recibido_kg`) no tenía campo en el formulario, `lotes_proteger` lo bloquea en cuanto hay
-- procesos y `editar_lote` ignoraba en silencio cualquier clave que no conociera (devolvía «sin_cambios»): para el
-- administrador, «no guardó».
--
-- Con el saldo por kilos (20261130…) el peso recibido es UN solo campo (no hay bultos): es la base del saldo de la primera etapa.
--  1. `editar_lote` acepta `lote.peso_recibido_kg`: lo corrige con motivo y traza. `valor_compra` (columna generada) y el costo
--     por libra se recalculan solos, y los saldos salen de `v_origenes_disponibles`. Si tras la corrección algún proceso
--     consumiría más de lo que entrega su origen (p. ej. bajar el peso por debajo de lo ya tostado), se rechaza con
--     `edicion_incoherente`: hay que corregir también ese proceso (la comprobación por origen ya existente).
--  2. `lotes_proteger` deja pasar el cambio de peso SOLO con la marca de sesión de `editar_lote` (`cafe._edicion_activa()`).
--  3. `editar_lote` rechaza (`datos_invalidos`) las claves desconocidas del bloque `lote`: nada se ignora en silencio.
--  4. `_metricas_edicion` incluye `peso_recibido_kg` para el «Ver impacto».
--
-- Compatible hacia atrás: solo reemplaza funciones; sin cambios de esquema ni de privilegios. Reemplaza a la B-16 original
-- (que corregía el peso por bulto: los bultos se retiran en 20261130120000).
-- Rollback: reaplicar las definiciones de 20261130120000 (`lotes_proteger`) y 20261130130000 (`editar_lote`).

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
    -- El peso recibido solo lo corrige `editar_lote` (administrador, con motivo y traza); el saldo por origen lo vigila allí.
    if new.linea            is distinct from old.linea
       or new.tercero_id       is distinct from old.tercero_id
       or (new.peso_recibido_kg is distinct from old.peso_recibido_kg and not cafe._edicion_activa()) then
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

create or replace function cafe._metricas_edicion(p_lote uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_lote cafe.lotes;
  v_costo jsonb;
begin
  select * into v_lote from cafe.lotes l where l.id = p_lote;
  if v_lote.linea = 'marca_propia' then
    v_costo := cafe.costo_libra_lote(p_lote);
  end if;
  return jsonb_build_object(
    'fecha_recepcion', v_lote.fecha_recepcion,
    'peso_recibido_kg', v_lote.peso_recibido_kg,
    'llegada_at', v_lote.created_at,
    'valor_compra', v_lote.valor_compra,
    'merma_tostion_pct', (select round(sum(p.merma_kg) / nullif(sum(p.peso_entrada_kg), 0) * 100, 1)
                            from cafe.procesos p where p.lote_id = p_lote and p.tipo = 'tostion' and p.anulado_at is null),
    'merma_molienda_pct', (select round(sum(p.merma_kg) / nullif(sum(p.peso_entrada_kg), 0) * 100, 1)
                             from cafe.procesos p where p.lote_id = p_lote and p.tipo = 'molienda' and p.anulado_at is null),
    'valor_servicios', (select coalesce(sum(p.valor), 0) from cafe.procesos p where p.lote_id = p_lote and p.anulado_at is null),
    'costo_libra', case when v_costo is not null then v_costo -> 'costo_libra' end,
    'margen', case when v_costo is not null then v_costo -> 'margen' end,
    'procesos', coalesce((select jsonb_agg(jsonb_build_object(
                  'id', p.id, 'tipo', p.tipo, 'peso_entrada_kg', p.peso_entrada_kg, 'peso_salida_kg', p.peso_salida_kg,
                  'merma_pct', p.merma_pct, 'valor', p.valor, 'desvio', p.desvio) order by p.created_at)
                  from cafe.procesos p where p.lote_id = p_lote and p.anulado_at is null), '[]'::jsonb));
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
  v_peso      numeric;
  v_clave     text;
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
    if jsonb_typeof(v_obj) is distinct from 'object' then
      raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Los datos del lote no son válidos.';
    end if;
    -- Nada se ignora en silencio: una clave que no se puede corregir desde aquí se rechaza.
    for v_clave in select k from jsonb_object_keys(v_obj) k loop
      if v_clave <> all (array['fecha_recepcion', 'llegada_at', 'peso_recibido_kg', 'precio_compra_kg', 'factura_proveedor', 'observaciones']) then
        raise exception using errcode = 'P0001', message = 'datos_invalidos',
          detail = format('«%s» no se puede corregir desde aquí.', v_clave);
      end if;
    end loop;
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
      if v_obj ? 'peso_recibido_kg' then
        v_peso := cafe._edicion_num(v_obj, 'peso_recibido_kg');
        if v_peso is null or v_peso <= 0 or v_peso > 99999 then
          raise exception using errcode = 'P0001', message = 'datos_invalidos',
            detail = 'El peso recibido debe ser mayor que cero.';
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
        peso_recibido_kg  = case when v_obj ? 'peso_recibido_kg' then v_peso else l.peso_recibido_kg end,
        precio_compra_kg  = case when v_obj ? 'precio_compra_kg' then cafe._edicion_num(v_obj, 'precio_compra_kg') else l.precio_compra_kg end,
        factura_proveedor = case when v_obj ? 'factura_proveedor' then cafe._edicion_texto(v_obj, 'factura_proveedor') else l.factura_proveedor end,
        observaciones     = case when v_obj ? 'observaciones' then cafe._edicion_texto(v_obj, 'observaciones') else l.observaciones end
       where l.id = v_lote_id
       returning * into v_nuevo_l;

      v_n := v_n
        + cafe._registrar_cambio_edicion(v_edicion, v_lote_id, 'lote', v_lote_id, v_lote.codigo, 'fecha_recepcion', v_lote.fecha_recepcion, v_nuevo_l.fecha_recepcion, v_motivo)
        + cafe._registrar_cambio_edicion(v_edicion, v_lote_id, 'lote', v_lote_id, v_lote.codigo, 'llegada_at', to_char(v_lote.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), to_char(v_nuevo_l.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), v_motivo)
        + cafe._registrar_cambio_edicion(v_edicion, v_lote_id, 'lote', v_lote_id, v_lote.codigo, 'peso_recibido_kg', v_lote.peso_recibido_kg, v_nuevo_l.peso_recibido_kg, v_motivo)
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

revoke all on function cafe._metricas_edicion(uuid) from public, anon;
grant execute on function cafe._metricas_edicion(uuid) to authenticated;
revoke all on function cafe.editar_lote(jsonb) from public, anon;
grant execute on function cafe.editar_lote(jsonb) to authenticated;
