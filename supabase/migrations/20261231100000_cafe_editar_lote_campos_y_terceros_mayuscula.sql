-- Editar lote: proveedor / cliente, tipo de café, servicios contratados y calidad; nombres de terceros en mayúscula.
--
--  1. `cafe.editar_lote` acepta además, en `lote`: `tercero_id` (proveedor en marca propia, cliente en maquila), `tipo_cafe_id`
--     (marca propia), `servicios_agregar` (+ `nivel_tueste` si se añade la tostión) y `humedad_pct` / `densidad` (maquila; las
--     alertas se evalúan de nuevo con los rangos de hoy). Los servicios SOLO se añaden (nunca se quitan) y solo mientras el lote
--     no tenga procesos; con procesos, el tercero y el tipo de café también se bloquean (`lote_bloqueado`). La molienda añadida
--     se pide sobre todo el tostado estimado (`cafe._fijar_molienda`, SECURITY DEFINER ya documentada) y la tostión añadida deja su
--     perfil de tueste con el café que le entra. Todo queda en el historial con motivo.
--  2. `public.terceros.nombre` siempre en MAYÚSCULA: trigger `terceros_nombre_mayuscula` (excepto el «Consumidor final», registro
--     del sistema) y una pasada única sobre los nombres existentes. Sin cambios de esquema ni de privilegios.
--
-- Compatible hacia atrás: solo reemplaza una función y añade un trigger. Rollback: reaplicar `editar_lote` de
-- 20261201100000 y `drop trigger terceros_nombre_mayuscula on public.terceros; drop function public.terceros_nombre_mayuscula()`.

create or replace function public.terceros_nombre_mayuscula()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not new.es_consumidor_final then
    new.nombre := upper(new.nombre);
  end if;
  return new;
end $$;

-- Se dispara después de `terceros_normalizar` y de `terceros_proteger_consumidor_final` (orden alfabético de los triggers).
create trigger terceros_zz_nombre_mayuscula before insert or update on public.terceros
  for each row execute function public.terceros_nombre_mayuscula();
revoke all on function public.terceros_nombre_mayuscula() from public, anon, authenticated;

-- Los nombres que ya existen. La unicidad es por identificación, no por nombre: no hay choques.
update public.terceros set nombre = upper(nombre) where not es_consumidor_final and nombre <> upper(nombre);

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
  v_tercero   uuid;
  v_tipo      uuid;
  v_ter       record;
  v_ultimo    smallint;
  v_agregar   cafe.tipo_proceso[];
  v_servicios cafe.tipo_proceso[];
  v_s         text;
  v_nivel     cafe.nivel_tueste;
  v_hum       numeric;
  v_den       numeric;
  v_alertas   text[];
  v_rangos    jsonb;
  v_rango     jsonb;
  v_merma     numeric;
  v_tostado   numeric;
  v_kg_tost   numeric;
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
      if v_clave <> all (array['fecha_recepcion', 'llegada_at', 'peso_recibido_kg', 'precio_compra_kg', 'factura_proveedor', 'observaciones',
                                     'tercero_id', 'tipo_cafe_id', 'servicios_agregar', 'nivel_tueste', 'humedad_pct', 'densidad']) then
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

      -- Quién (proveedor o cliente), tipo de café, servicios y calidad. Todo lo que cambia lo que ya se hizo se bloquea con el
      -- primer proceso (el trigger `lotes_proteger` repite el bloqueo del tercero).
      v_ultimo := cafe.orden_ultimo_proceso(v_lote_id);

      if v_obj ? 'tercero_id' then
        begin
          v_tercero := (v_obj ->> 'tercero_id')::uuid;
        exception when others then
          raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El proveedor o cliente no es válido.';
        end;
        if v_tercero is null then
          raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Indica el proveedor o cliente.';
        end if;
        if v_tercero <> v_lote.tercero_id then
          if v_ultimo is not null then
            raise exception using errcode = 'P0001', message = 'lote_bloqueado',
              detail = 'El lote ya tiene procesos: no se puede cambiar el proveedor o cliente.';
          end if;
          select t.roles, t.activo into v_ter from public.terceros t where t.id = v_tercero;
          if not found then
            raise exception using errcode = 'P0001', message = 'tercero_no_encontrado',
              detail = 'El tercero no existe o no pertenece a tu cliente.';
          end if;
          if not v_ter.activo then
            raise exception using errcode = 'P0001', message = 'tercero_inactivo',
              detail = 'El tercero está desactivado: actívalo para usarlo en el lote.';
          end if;
          if v_lote.linea = 'marca_propia' and not 'proveedor' = any(v_ter.roles) then
            raise exception using errcode = 'P0001', message = 'tercero_no_es_proveedor',
              detail = 'El tercero no está registrado como proveedor.';
          end if;
          if v_lote.linea = 'servicio' and not 'cliente_servicio' = any(v_ter.roles) then
            raise exception using errcode = 'P0001', message = 'tercero_no_es_cliente_servicio',
              detail = 'El tercero no está registrado como cliente de servicios.';
          end if;
        end if;
      end if;

      if v_obj ? 'tipo_cafe_id' then
        if v_lote.linea <> 'marca_propia' then
          raise exception using errcode = 'P0001', message = 'datos_invalidos',
            detail = 'El tipo de café solo se corrige en marca propia.';
        end if;
        begin
          v_tipo := (v_obj ->> 'tipo_cafe_id')::uuid;
        exception when others then
          raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El tipo de café no es válido.';
        end;
        if v_tipo is null then
          raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Indica el tipo de café.';
        end if;
        if v_tipo <> v_lote.tipo_cafe_id then
          if v_ultimo is not null then
            raise exception using errcode = 'P0001', message = 'lote_bloqueado',
              detail = 'El lote ya tiene procesos: no se puede cambiar el tipo de café.';
          end if;
          if not exists (select 1 from cafe.tipos_cafe t where t.id = v_tipo and t.activo) then
            raise exception using errcode = 'P0001', message = 'tipo_cafe_invalido',
              detail = 'El tipo de café no existe, está inactivo o no pertenece a tu cliente.';
          end if;
        end if;
      end if;

      -- Servicios: solo se AÑADEN (nunca se quitan) y solo mientras el lote no haya empezado a procesarse.
      v_servicios := v_lote.servicios;
      if v_obj ? 'servicios_agregar' or v_obj ? 'nivel_tueste' then
        if v_lote.linea <> 'servicio' then
          raise exception using errcode = 'P0001', message = 'datos_invalidos',
            detail = 'Los servicios solo se corrigen en maquila.';
        end if;
        if jsonb_typeof(v_obj -> 'servicios_agregar') is distinct from 'array'
           or jsonb_array_length(v_obj -> 'servicios_agregar') = 0 then
          raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Indica los servicios a añadir.';
        end if;
        if v_ultimo is not null then
          raise exception using errcode = 'P0001', message = 'lote_bloqueado',
            detail = 'El lote ya empezó a procesarse: no se pueden añadir servicios.';
        end if;
        begin
          v_agregar := array(select s::cafe.tipo_proceso from jsonb_array_elements_text(v_obj -> 'servicios_agregar') s);
        exception when others then
          raise exception using errcode = 'P0001', message = 'servicios_invalidos', detail = 'Alguno de los servicios no es válido.';
        end;
        if exists (select 1 from unnest(v_agregar) s where s = any (v_lote.servicios)) then
          raise exception using errcode = 'P0001', message = 'servicios_invalidos',
            detail = 'Alguno de esos servicios ya está contratado.';
        end if;
        v_servicios := v_lote.servicios || v_agregar;
        if ('molienda' = any(v_servicios) or 'empaque' = any(v_servicios)) and not 'tostion' = any(v_servicios) then
          raise exception using errcode = 'P0001', message = 'servicios_invalidos', detail = 'La molienda y el empaque requieren tostión.';
        end if;
        -- Una tostión nueva necesita su nivel de tueste (la planta lo exige) y deja un perfil con todo el café que le entra.
        if 'tostion' = any(v_agregar) then
          begin
            v_nivel := nullif(v_obj ->> 'nivel_tueste', '')::cafe.nivel_tueste;
          exception when others then
            raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El nivel de tueste no es válido.';
          end;
          if v_nivel is null then
            raise exception using errcode = 'P0001', message = 'falta_nivel_tueste',
              detail = 'Indica el nivel de tueste (bajo, medio o alto): la planta lo necesita para la tostión.';
          end if;
        elsif v_obj ? 'nivel_tueste' then
          raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El nivel de tueste solo se indica al añadir la tostión.';
        end if;
      end if;

      -- Calidad de la recepción (humedad y densidad): la alerta se vuelve a evaluar con los rangos de hoy, como en la recepción.
      if v_obj ? 'humedad_pct' or v_obj ? 'densidad' then
        if v_lote.linea <> 'servicio' then
          raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La calidad solo se corrige en maquila.';
        end if;
        v_hum := v_lote.humedad_pct;
        v_den := v_lote.densidad;
        if v_obj ? 'humedad_pct' then
          v_hum := round(cafe._edicion_num(v_obj, 'humedad_pct'), 2);
          if v_hum is not null and (v_hum < 0 or v_hum > 100) then
            raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La humedad debe estar entre 0 y 100 %.';
          end if;
        end if;
        if v_obj ? 'densidad' then
          v_den := round(cafe._edicion_num(v_obj, 'densidad'), 2);
          if v_den is not null and (v_den <= 0 or v_den >= 1000000) then
            raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La densidad debe ser mayor que cero.';
          end if;
        end if;
        v_alertas := '{}';
        v_rangos := null;
        v_rango := cafe.rango_calidad('cafe.humedad_rango_pct');
        if v_hum is not null and v_rango is not null then
          v_rangos := coalesce(v_rangos, '{}') || jsonb_build_object('humedad', v_rango);
          if v_hum < (v_rango ->> 'min')::numeric then v_alertas := array_append(v_alertas, 'humedad_baja');
          elsif v_hum > (v_rango ->> 'max')::numeric then v_alertas := array_append(v_alertas, 'humedad_alta'); end if;
        end if;
        v_rango := cafe.rango_calidad('cafe.densidad_rango');
        if v_den is not null and v_rango is not null then
          v_rangos := coalesce(v_rangos, '{}') || jsonb_build_object('densidad', v_rango);
          if v_den < (v_rango ->> 'min')::numeric then v_alertas := array_append(v_alertas, 'densidad_baja');
          elsif v_den > (v_rango ->> 'max')::numeric then v_alertas := array_append(v_alertas, 'densidad_alta'); end if;
        end if;
      end if;

      update cafe.lotes l set
        fecha_recepcion   = case when v_obj ? 'fecha_recepcion' then v_fecha else l.fecha_recepcion end,
        created_at        = case when v_obj ? 'llegada_at' then v_llegada else l.created_at end,
        peso_recibido_kg  = case when v_obj ? 'peso_recibido_kg' then v_peso else l.peso_recibido_kg end,
        precio_compra_kg  = case when v_obj ? 'precio_compra_kg' then cafe._edicion_num(v_obj, 'precio_compra_kg') else l.precio_compra_kg end,
        factura_proveedor = case when v_obj ? 'factura_proveedor' then cafe._edicion_texto(v_obj, 'factura_proveedor') else l.factura_proveedor end,
        observaciones     = case when v_obj ? 'observaciones' then cafe._edicion_texto(v_obj, 'observaciones') else l.observaciones end,
        tercero_id        = case when v_obj ? 'tercero_id' then v_tercero else l.tercero_id end,
        tipo_cafe_id      = case when v_obj ? 'tipo_cafe_id' then v_tipo else l.tipo_cafe_id end,
        servicios         = case when v_agregar is not null then v_servicios else l.servicios end,
        nivel_tueste      = case when v_nivel is not null then v_nivel else l.nivel_tueste end,
        humedad_pct       = case when v_obj ? 'humedad_pct' then v_hum else l.humedad_pct end,
        densidad          = case when v_obj ? 'densidad' then v_den else l.densidad end,
        alertas_calidad   = case when v_alertas is not null then v_alertas else l.alertas_calidad end,
        rangos_calidad    = case when v_alertas is not null then v_rangos else l.rangos_calidad end
       where l.id = v_lote_id
       returning * into v_nuevo_l;

      -- Servicios añadidos: la tostión nueva deja su perfil (todo el café que le entra) y la molienda nueva se pide sobre todo el
      -- tostado estimado (mismas mermas de referencia que la recepción; en la tostión se confirma o cambia por tanda).
      if v_agregar is not null then
        if 'tostion' = any(v_agregar) or 'molienda' = any(v_agregar) then
          v_kg_tost := v_nuevo_l.peso_recibido_kg;
          if 'trilla' = any(v_nuevo_l.servicios) then
            v_kg_tost := v_kg_tost * (1 - cafe.parametro_numero('cafe.merma_referencia_trilla_pct', 19) / 100);
          end if;
          v_kg_tost := round(v_kg_tost, 3);
        end if;
        if 'tostion' = any(v_agregar) then
          insert into cafe.lote_perfil_tostion (lote_id, orden, nivel, kg) values (v_lote_id, 1, v_nivel, greatest(v_kg_tost, 0.001));
        end if;
        if 'molienda' = any(v_agregar) then
          v_merma := coalesce(
            (select sum(f.kg * cafe.parametro_numero('cafe.merma_referencia_tostion_' || f.nivel::text || '_pct',
                                                     cafe.parametro_numero('cafe.merma_referencia_tostion_pct', 18)))
                    / nullif(sum(f.kg), 0)
               from cafe.lote_perfil_tostion f where f.lote_id = v_lote_id),
            cafe.parametro_numero('cafe.merma_referencia_tostion_' || coalesce(v_nuevo_l.nivel_tueste::text, '') || '_pct',
                                  cafe.parametro_numero('cafe.merma_referencia_tostion_pct', 18)));
          v_tostado := round(v_kg_tost * (1 - v_merma / 100), 1);
          perform cafe._fijar_molienda(v_lote_id, null, 'todo', v_tostado);
        end if;
      end if;

      v_n := v_n
        + cafe._registrar_cambio_edicion(v_edicion, v_lote_id, 'lote', v_lote_id, v_lote.codigo, 'tercero_id',
            (select t.nombre from public.terceros t where t.id = v_lote.tercero_id), (select t.nombre from public.terceros t where t.id = v_nuevo_l.tercero_id), v_motivo)
        + cafe._registrar_cambio_edicion(v_edicion, v_lote_id, 'lote', v_lote_id, v_lote.codigo, 'tipo_cafe_id',
            (select t.nombre from cafe.tipos_cafe t where t.id = v_lote.tipo_cafe_id), (select t.nombre from cafe.tipos_cafe t where t.id = v_nuevo_l.tipo_cafe_id), v_motivo)
        + cafe._registrar_cambio_edicion(v_edicion, v_lote_id, 'lote', v_lote_id, v_lote.codigo, 'servicios',
            array_to_string(v_lote.servicios, ', '), array_to_string(v_nuevo_l.servicios, ', '), v_motivo)
        + cafe._registrar_cambio_edicion(v_edicion, v_lote_id, 'lote', v_lote_id, v_lote.codigo, 'nivel_tueste', v_lote.nivel_tueste::text, v_nuevo_l.nivel_tueste::text, v_motivo)
        + cafe._registrar_cambio_edicion(v_edicion, v_lote_id, 'lote', v_lote_id, v_lote.codigo, 'humedad_pct', v_lote.humedad_pct, v_nuevo_l.humedad_pct, v_motivo)
        + cafe._registrar_cambio_edicion(v_edicion, v_lote_id, 'lote', v_lote_id, v_lote.codigo, 'densidad', v_lote.densidad, v_nuevo_l.densidad, v_motivo)
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
