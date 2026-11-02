-- A-18 (FIN-136 · HU-F1-11) · Edición de lotes solo por el administrador, con motivo obligatorio, historial y recálculo.
--
--  1. `cafe.lote_ediciones`: historial de ediciones (campo · antes → después · usuario · fecha · motivo NOT NULL). Es
--     append-only (sin UPDATE ni DELETE) y complementa a `audit.log`, que no guarda motivos. Auditada.
--  2. `cafe.lote_bloqueo_edicion(lote)`: por qué un lote NO se puede editar (`lote_anulado`, `lote_entregado` o
--     `lote_con_ventas`). «Con ventas»: el esquema no enlaza una venta con un lote (vende producto terminado por tipo ×
--     presentación), así que se entiende como «alguno de los productos que empacó el lote tiene ventas/cortesías vigentes».
--  3. `cafe.editar_lote(p_input jsonb)`: LA vía de edición (SECURITY INVOKER, solo owner/admin). Corrige datos del lote
--     (fecha de recepción, hora de llegada, precio de compra, factura, observaciones), de sus procesos (fecha, pesos,
--     observaciones; no el empaque) y de sus baches (pesos, temperatura, tiempo). Con `simular = true` hace todo, mide el
--     impacto y revierte: es la previsualización. Merma, valor del servicio, desvío, avance y costo por libra son columnas
--     generadas o se derivan en cada lectura, así que se recalculan solos; la RPC además valida que ningún proceso
--     posterior quede con más entrada de la que el paso anterior entrega.
--  4. Privilegios: las columnas que esta edición abre (`lotes.created_at` = hora de llegada; `procesos.fecha/pesos`;
--     `baches.pesos/temperatura/tiempo`) solo se pueden cambiar con la RPC: un trigger exige la marca de sesión que ella
--     pone (`cafe.edicion_lote`). Nada se borra: para quitar un proceso se anula (con motivo) como siempre.
--  5. `cafe.ediciones_lote(lote)`: lectura del historial con el email de quien editó (SECURITY DEFINER acotado al cliente).
--
-- Compatible hacia atrás (expand): solo objetos y privilegios nuevos. No toca filas.
-- Rollback: drop function cafe.ediciones_lote(uuid), cafe.editar_lote(jsonb), cafe._metricas_edicion(uuid),
--   cafe.lote_bloqueo_edicion(uuid), cafe._edicion_num(jsonb, text), cafe._edicion_texto(jsonb, text),
--   cafe._edicion_activa() cascade; drop table cafe.lote_ediciones; revoke update (created_at) on cafe.lotes from
--   authenticated; revoke update (fecha, peso_entrada_kg, peso_salida_kg) on cafe.procesos from authenticated;
--   drop policy baches_update on cafe.baches; revoke update on cafe.baches from authenticated;
--   drop function cafe._exigir_edicion(), cafe.lotes_edicion_directa(), cafe.procesos_edicion_directa(),
--   cafe.baches_edicion_directa(), cafe.lote_ediciones_edicion_directa() cascade (arrastra sus triggers).

-- 1. Historial ---------------------------------------------------------------------------------------------------------

create table cafe.lote_ediciones (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null default public.tenant_actual() references public.tenants,
  lote_id        uuid not null,
  edicion_id     uuid not null,                                         -- agrupa los campos cambiados en un mismo guardado
  entidad        text not null check (entidad in ('lote', 'proceso', 'bache')),
  entidad_id     uuid not null,
  referencia     text,                                                  -- «Tostión · bache 2», para mostrarlo sin más consultas
  campo          text not null check (btrim(campo) <> ''),
  valor_anterior text,
  valor_nuevo    text,
  motivo         text not null check (length(btrim(motivo)) >= 3),
  created_at     timestamptz not null default now(),
  created_by     uuid default auth.uid() references auth.users,
  constraint lote_ediciones_lote_fk foreign key (tenant_id, lote_id)
    references cafe.lotes (tenant_id, id) on delete restrict
);

create index on cafe.lote_ediciones (tenant_id, lote_id, created_at desc);

alter table cafe.lote_ediciones enable row level security;

create policy lote_ediciones_select on cafe.lote_ediciones for select to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.recepcion')));

create policy lote_ediciones_insert on cafe.lote_ediciones for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.recepcion'))
              and (select public.rol_en_tenant()) in ('owner', 'admin'));

revoke all on table cafe.lote_ediciones from public, anon, authenticated, service_role;
grant select on table cafe.lote_ediciones to authenticated, service_role;
grant insert (tenant_id, lote_id, edicion_id, entidad, entidad_id, referencia, campo, valor_anterior, valor_nuevo, motivo)
  on table cafe.lote_ediciones to authenticated;

select audit.activar('cafe.lote_ediciones');

-- 2. Marca de sesión y guardas -----------------------------------------------------------------------------------------
-- `cafe.edicion_lote = 'on'` solo lo pone `editar_lote()` (con set_config local a la transacción). PostgREST no expone
-- `set_config`, así que un cliente no puede activarla desde la API.

create or replace function cafe._edicion_activa()
returns boolean
language sql
stable
set search_path = ''
as $$ select coalesce(current_setting('cafe.edicion_lote', true), '') = 'on' $$;

create or replace function cafe._exigir_edicion()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not cafe._edicion_activa() then
    raise exception using errcode = 'P0001', message = 'edicion_directa',
      detail = 'Estos datos solo se corrigen desde «Editar lote», con su motivo.';
  end if;
end $$;

create or replace function cafe.lotes_edicion_directa()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.created_at is distinct from old.created_at then perform cafe._exigir_edicion(); end if;
  return new;
end $$;

create or replace function cafe.procesos_edicion_directa()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.fecha is distinct from old.fecha or new.peso_entrada_kg is distinct from old.peso_entrada_kg
     or new.peso_salida_kg is distinct from old.peso_salida_kg then
    perform cafe._exigir_edicion();
  end if;
  return new;
end $$;

create or replace function cafe.baches_edicion_directa()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.peso_entrada_kg is distinct from old.peso_entrada_kg or new.peso_salida_kg is distinct from old.peso_salida_kg
     or new.temperatura_c is distinct from old.temperatura_c or new.tiempo_min is distinct from old.tiempo_min then
    perform cafe._exigir_edicion();
  end if;
  return new;
end $$;

create or replace function cafe.lote_ediciones_edicion_directa()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform cafe._exigir_edicion();
  return new;
end $$;

create trigger lotes_3_edicion_directa before update on cafe.lotes
  for each row execute function cafe.lotes_edicion_directa();
create trigger procesos_edicion_directa before update on cafe.procesos
  for each row execute function cafe.procesos_edicion_directa();
create trigger baches_edicion_directa before update on cafe.baches
  for each row execute function cafe.baches_edicion_directa();
create trigger lote_ediciones_edicion_directa before insert on cafe.lote_ediciones
  for each row execute function cafe.lote_ediciones_edicion_directa();

revoke all on function cafe._exigir_edicion() from public, anon;
grant execute on function cafe._exigir_edicion() to authenticated, service_role;
revoke all on function cafe.lotes_edicion_directa() from public, anon, authenticated;
revoke all on function cafe.procesos_edicion_directa() from public, anon, authenticated;
revoke all on function cafe.baches_edicion_directa() from public, anon, authenticated;
revoke all on function cafe.lote_ediciones_edicion_directa() from public, anon, authenticated;

-- Privilegios nuevos: solo estas columnas, y solo owner/admin por RLS.
grant update (created_at) on table cafe.lotes to authenticated;
grant update (fecha, peso_entrada_kg, peso_salida_kg) on table cafe.procesos to authenticated;
grant update (peso_entrada_kg, peso_salida_kg, temperatura_c, tiempo_min) on table cafe.baches to authenticated;

create policy baches_update on cafe.baches for update to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.procesos'))
         and (select public.rol_en_tenant()) in ('owner', 'admin'))
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.procesos'))
              and (select public.rol_en_tenant()) in ('owner', 'admin'));

revoke all on function cafe._edicion_activa() from public, anon;
grant execute on function cafe._edicion_activa() to authenticated, service_role;

-- 3. Lectura de valores del payload -------------------------------------------------------------------------------------

create or replace function cafe._edicion_num(p_obj jsonb, p_clave text)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_obj -> p_clave is null or jsonb_typeof(p_obj -> p_clave) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_obj -> p_clave) <> 'number' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = format('«%s» debe ser un número.', p_clave);
  end if;
  return (p_obj ->> p_clave)::numeric;
end $$;

create or replace function cafe._edicion_texto(p_obj jsonb, p_clave text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_obj -> p_clave is null or jsonb_typeof(p_obj -> p_clave) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_obj -> p_clave) <> 'string' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = format('«%s» debe ser un texto.', p_clave);
  end if;
  return nullif(btrim(p_obj ->> p_clave), '');
end $$;

revoke all on function cafe._edicion_num(jsonb, text) from public, anon;
revoke all on function cafe._edicion_texto(jsonb, text) from public, anon;
grant execute on function cafe._edicion_num(jsonb, text) to authenticated;
grant execute on function cafe._edicion_texto(jsonb, text) to authenticated;

-- 4. Qué impide editar un lote -----------------------------------------------------------------------------------------
-- NULL = editable. Orden: anulado → entregado (remisión vigente) → con ventas.

create or replace function cafe.lote_bloqueo_edicion(p_lote uuid)
returns text
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if exists (select 1 from cafe.lotes l where l.id = p_lote and l.anulado_at is not null) then
    return 'lote_anulado';
  end if;
  if to_regclass('cafe.remisiones') is not null and exists (
       select 1 from cafe.remisiones r where r.lote_id = p_lote and r.anulada_at is null) then
    return 'lote_entregado';
  end if;
  if to_regclass('cafe.venta_lineas') is not null and exists (
       select 1
         from cafe.empaque_lineas el
         join cafe.procesos p on p.tenant_id = el.tenant_id and p.id = el.proceso_id
         join cafe.venta_lineas vl on vl.tenant_id = el.tenant_id and vl.articulo_pt_id = el.articulo_pt_id
         join cafe.ventas v on v.tenant_id = vl.tenant_id and v.id = vl.venta_id
        where p.lote_id = p_lote and p.anulado_at is null and v.anulada_at is null) then
    return 'lote_con_ventas';
  end if;
  return null;
end $$;

revoke all on function cafe.lote_bloqueo_edicion(uuid) from public, anon;
grant execute on function cafe.lote_bloqueo_edicion(uuid) to authenticated;

-- 5. Métricas del lote (antes/después del impacto) -------------------------------------------------------------------------

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

revoke all on function cafe._metricas_edicion(uuid) from public, anon;
grant execute on function cafe._metricas_edicion(uuid) to authenticated;

-- 6. La edición ---------------------------------------------------------------------------------------------------------
--   {
--     "lote_id": uuid, "motivo": "texto (obligatorio)", "simular": false,
--     "lote":     { "fecha_recepcion"?: "YYYY-MM-DD", "llegada_at"?: ISO, "precio_compra_kg"?: n, "factura_proveedor"?: t|null,
--                   "observaciones"?: t|null },
--     "procesos": [ { "id": uuid, "fecha"?, "peso_entrada_kg"?, "peso_salida_kg"?, "observaciones"?,
--                     "baches"?: [ { "id": uuid, "peso_entrada_kg"?, "peso_salida_kg"?, "temperatura_c"?, "tiempo_min"? } ] } ]
--   }
-- Solo se escribe (y se registra) lo que cambia de verdad. En una tostión con baches, los pesos del proceso son la suma de
-- sus baches: se recalculan aquí. Devuelve { simulado, edicion_id, cambios[], antes{}, despues{} }.
-- Errores: no_autorizado (42501), motivo_requerido, sin_cambios, lote_anulado | lote_entregado | lote_con_ventas,
-- proceso_no_encontrado, bache_no_encontrado, proceso_no_editable, edicion_incoherente, datos_invalidos.

create or replace function cafe._registrar_cambio_edicion(
  p_edicion uuid, p_lote uuid, p_entidad text, p_entidad_id uuid, p_ref text, p_campo text,
  p_antes anyelement, p_despues anyelement, p_motivo text)
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if p_antes is not distinct from p_despues then
    return 0;
  end if;
  insert into cafe.lote_ediciones (lote_id, edicion_id, entidad, entidad_id, referencia, campo, valor_anterior, valor_nuevo, motivo)
  values (p_lote, p_edicion, p_entidad, p_entidad_id, p_ref, p_campo, p_antes::text, p_despues::text, p_motivo);
  return 1;
end $$;

revoke all on function cafe._registrar_cambio_edicion(uuid, uuid, text, uuid, text, text, anyelement, anyelement, text) from public, anon;
grant execute on function cafe._registrar_cambio_edicion(uuid, uuid, text, uuid, text, text, anyelement, anyelement, text) to authenticated;

create or replace function cafe.editar_lote(p_input jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
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

    -- 4) Coherencia hacia adelante: lo editado y lo que cuelga de sus bultos no puede entrar más de lo que el paso
    -- anterior entrega (o que lo que pesan los bultos, en el primer paso). Los pesos de baches ↔ proceso se comprueban
    -- ahora (los constraint triggers son diferidos y en una simulación no llegarían a ejecutarse).
    set constraints all immediate;
    set constraints all deferred;
    for v_x in
      select p.id, p.tipo, p.peso_entrada_kg as entrada,
             (select coalesce(sum(coalesce(prev.salida_bulto_kg, b.peso_kg)), 0)
                from cafe.proceso_bultos pb
                join cafe.lote_bultos b on b.id = pb.bulto_id
                left join lateral (
                  select v.salida_bulto_kg from cafe.v_proceso_bultos_peso v
                   where v.bulto_id = pb.bulto_id and cafe.orden_proceso(v.tipo) < cafe.orden_proceso(p.tipo)
                   order by cafe.orden_proceso(v.tipo) desc limit 1) prev on true
               where pb.proceso_id = p.id) as disponible
        from cafe.procesos p
       where p.lote_id = v_lote_id and p.anulado_at is null and p.reapertura_id is null
         and (p.id = any(v_editados)
              or exists (select 1 from cafe.proceso_bultos a
                           join cafe.proceso_bultos b2 on b2.bulto_id = a.bulto_id
                          where a.proceso_id = any(v_editados) and b2.proceso_id = p.id
                            and cafe.orden_proceso(p.tipo) > (select cafe.orden_proceso(x.tipo) from cafe.procesos x where x.id = a.proceso_id)))
    loop
      if v_x.entrada > v_x.disponible + 0.001 then
        raise exception using errcode = 'P0001', message = 'edicion_incoherente',
          detail = format('Tras la corrección, %s tendría %s kg de entrada y el paso anterior solo entrega %s kg. Corrige también ese proceso.',
                          initcap(v_x.tipo::text), round(v_x.entrada, 3), round(v_x.disponible, 3));
      end if;
    end loop;

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
end $$;

revoke all on function cafe.editar_lote(jsonb) from public, anon;
grant execute on function cafe.editar_lote(jsonb) to authenticated;

-- 7. Lectura del historial -----------------------------------------------------------------------------------------------

create or replace function cafe.ediciones_lote(p_lote uuid)
returns table (
  edicion_id uuid, entidad text, entidad_id uuid, referencia text, campo text,
  valor_anterior text, valor_nuevo text, motivo text, created_at timestamptz, email text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := (select public.tenant_actual());
begin
  if v_tenant is null
     or (select public.rol_en_tenant()) is null
     or not (select public.tenant_tiene_modulo('cafe.recepcion')) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  return query
    select e.edicion_id, e.entidad, e.entidad_id, e.referencia, e.campo, e.valor_anterior, e.valor_nuevo, e.motivo,
           e.created_at, u.email::text
      from cafe.lote_ediciones e
      left join auth.users u on u.id = e.created_by
       and exists (select 1 from public.tenant_members m where m.user_id = u.id and m.tenant_id = v_tenant)
     where e.lote_id = p_lote and e.tenant_id = v_tenant
     order by e.created_at desc, e.entidad desc, e.referencia, e.campo;
end $$;

revoke all on function cafe.ediciones_lote(uuid) from public, anon;
grant execute on function cafe.ediciones_lote(uuid) to authenticated;
