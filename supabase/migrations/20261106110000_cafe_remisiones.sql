-- Vertical café: remisión de entrega de lotes de trilla y maquila (FIN-113 · CO-32, HU-F1-13).
--
--  1. `cafe.remisiones`: documento de control interno (NO tributario) con lo que se entrega al cliente. Es un
--     SNAPSHOT: recibido, entregado, merma, detalle por servicio y valor se copian al generarla y no cambian
--     aunque luego se corrija el lote. Una remisión vigente por lote (decisión 9 de CO-20); anulada la primera
--     se puede generar otra. El número sale de la serie `REM` (`siguiente_consecutivo`), aparte de MP/MQ.
--  2. `cafe.generar_remision(p jsonb)` y `cafe.anular_remision(id, motivo)`: RPC `SECURITY INVOKER`.
--  3. `cafe.v_lotes.estado` pasa a `entregado` cuando el lote tiene una remisión no anulada (se redefine con
--     `create or replace` conservando TODAS las columnas; solo cambia el `case` del estado).
--  4. Trigger en `cafe.procesos`: un lote entregado no admite procesos nuevos ni anular los existentes; hay que
--     anular antes la remisión (si no, el documento entregado dejaría de coincidir con el lote).
--  5. `cafe.responsables_lote()` (CO-29) suma a quien generó o anuló las remisiones del lote, para su línea de tiempo.
--  6. RLS (plantilla de FIN-90 + módulo `cafe.remisiones`), privilegios y auditoría.
--
-- Solo crea objetos nuevos y redefine la vista: segura en bases con datos. Las funciones de negocio son SECURITY
-- INVOKER: el RLS de `cafe.lotes`, de `cafe.procesos` y de esta tabla sigue aplicando con el usuario real.

-- 1. Tabla ---------------------------------------------------------------------------------------------------------

create table cafe.remisiones (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null default public.tenant_actual() references public.tenants,
  numero                 text not null check (btrim(numero) <> ''),                 -- REM-2026-0001
  lote_id                uuid not null,
  lote_codigo            text not null check (btrim(lote_codigo) <> ''),           -- MQ-2026-0007, para el listado
  fecha                  date not null,                                             -- fecha de entrega
  -- Cliente al momento de entregar (el tercero se puede renombrar después; el documento no cambia).
  tercero_id             uuid not null,                                             -- para filtrar el listado por cliente
  cliente_nombre         text not null check (btrim(cliente_nombre) <> ''),
  cliente_identificacion text,
  -- Snapshot de lo entregado.
  peso_recibido_kg       numeric(10,3) not null check (peso_recibido_kg > 0),
  peso_entregado_kg      numeric(10,3) not null check (peso_entregado_kg >= 0),
  merma_total_kg         numeric(10,3) generated always as (peso_recibido_kg - peso_entregado_kg) stored,
  merma_total_pct        numeric(7,3)  generated always as (round((peso_recibido_kg - peso_entregado_kg) / peso_recibido_kg * 100, 3)) stored,
  -- [{ servicio, kg_entrada, kg_salida, merma_kg, merma_pct, tarifa_kg, valor, nivel_tueste, incluido, pendiente }]
  detalle                jsonb not null check (jsonb_typeof(detalle) = 'array'),
  valor_servicios        numeric(14,2) not null check (valor_servicios >= 0),       -- referencia: no es una factura
  recibido_por           text check (recibido_por is null or btrim(recibido_por) <> ''),
  observaciones          text check (observaciones is null or btrim(observaciones) <> ''),
  -- Se entregó con servicios pendientes (solo owner/admin, con observación obligatoria).
  forzada                boolean not null default false,
  anulada_at             timestamptz,
  anulada_por            uuid references auth.users,
  motivo_anulacion       text check (motivo_anulacion is null or btrim(motivo_anulacion) <> ''),
  created_at             timestamptz not null default now(),
  created_by             uuid default auth.uid() references auth.users,
  updated_at             timestamptz,
  updated_by             uuid references auth.users,
  constraint remisiones_numero_uk unique (tenant_id, numero),
  constraint remisiones_lote_fk foreign key (tenant_id, lote_id)
    references cafe.lotes (tenant_id, id) on delete restrict,
  constraint remisiones_tercero_fk foreign key (tenant_id, tercero_id)
    references public.terceros (tenant_id, id) on delete restrict,
  constraint remision_anulacion_ck check ((anulada_at is null) = (motivo_anulacion is null)),
  constraint remision_forzada_ck check (not forzada or observaciones is not null)
);

-- Una remisión VIGENTE por lote; las anuladas se conservan (y el número no se reutiliza). Con `tenant_id` en el índice:
-- un cliente que intente colgar una remisión de un lote ajeno recibe la FK (23503) y no el aviso de duplicado, que
-- delataría que ese lote ya tiene remisión.
create unique index remisiones_un_lote on cafe.remisiones (tenant_id, lote_id) where anulada_at is null;
create index on cafe.remisiones (tenant_id, fecha desc);
create index on cafe.remisiones (tenant_id, tercero_id);

create trigger set_updated before update on cafe.remisiones
  for each row execute function public.set_updated();

-- Una remisión anulada es definitiva. Al anular, la base fija quién y cuándo (el cliente no lo falsea).
create or replace function cafe.remisiones_proteger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.anulada_at  := null;
    new.anulada_por := null;
    return new;
  end if;

  if old.anulada_at is not null then
    raise exception using errcode = 'P0001', message = 'remision_anulada',
      detail = 'La remisión está anulada: ya no se puede modificar.';
  end if;

  if new.anulada_at is not null then
    new.anulada_at  := now();
    new.anulada_por := coalesce(auth.uid(), new.anulada_por);
  end if;
  return new;
end $$;

create trigger remisiones_proteger before insert or update on cafe.remisiones
  for each row execute function cafe.remisiones_proteger();

-- 2. Un lote entregado no se toca ------------------------------------------------------------------------------------
-- La remisión congeló lo entregado: un proceso nuevo, o anular uno, lo dejaría desfasado. Hay que anular antes la
-- remisión. Las notas de un proceso (observaciones) sí se pueden corregir.

create or replace function cafe.procesos_lote_entregado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and not (new.anulado_at is not null and old.anulado_at is null) then
    return new;
  end if;
  if exists (select 1 from cafe.remisiones r where r.lote_id = new.lote_id and r.anulada_at is null) then
    raise exception using errcode = 'P0001', message = 'lote_entregado',
      detail = 'El lote ya tiene una remisión de entrega: anúlala antes de registrar o anular procesos.';
  end if;
  return new;
end $$;

create trigger procesos_lote_entregado before insert or update on cafe.procesos
  for each row execute function cafe.procesos_lote_entregado();

-- 3. Estado `entregado` en la vista del lote -----------------------------------------------------------------------------
-- Misma definición que en 20261104100000_cafe_procesos.sql con UN cambio: el `case` del estado. Las columnas, su
-- orden y sus tipos no cambian (`create or replace view` lo exige), y los privilegios de la vista se conservan.
--   anulado | entregado (remisión no anulada) | recibido | en_proceso | parcial | listo
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
  coalesce(et.desvios, 0) > 0                                                   as tiene_desvio
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

-- 4. Generar y anular ---------------------------------------------------------------------------------------------------------

-- Entrada (jsonb; todo lo demás se ignora):
--   { "lote_id": uuid, "fecha": "2026-11-12", "recibido_por": "Juan Pérez" | null,
--     "observaciones": null, "forzar": false }
-- Salida: { "id": uuid, "numero": "REM-2026-0001", "forzada": false }
-- Reglas (en este orden): permisos → formato → lote del cliente, de servicio, no anulado y sin remisión vigente →
-- con procesos → servicios completos (`servicios_incompletos`; `forzar` solo `owner`/`admin` y con observación) →
-- número REM (lo más tarde posible: si algo falla antes, el rollback no consume número).
create or replace function cafe.generar_remision(p jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_lote    uuid;
  v_fecha   date;
  v_recibe  text;
  v_obs     text;
  v_forzar  boolean := false;
  v_rol     public.rol_tenant;
  v_l       cafe.v_lotes%rowtype;
  v_faltan  text;
  v_detalle jsonb;
  v_numero  text;
  v_id      uuid;
  v_forzada boolean;
begin
  -- Permisos antes que nada: un viewer recibe 42501 aunque mande un formato erróneo.
  v_rol := (select public.rol_en_tenant());
  if not coalesce(v_rol in ('owner', 'admin', 'operativo'), false)
     or not coalesce((select public.tenant_tiene_modulo('cafe.remisiones')), false) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La remisión no tiene el formato esperado.';
  end if;

  -- Los tipos erróneos no deben acabar como un error inesperado de cast.
  begin
    if jsonb_typeof(p -> 'lote_id') is distinct from 'string'
       or jsonb_typeof(p -> 'fecha') is distinct from 'string' then
      raise exception using errcode = '22023';
    end if;
    v_lote  := (p ->> 'lote_id')::uuid;
    v_fecha := (p ->> 'fecha')::date;

    if jsonb_typeof(p -> 'recibido_por') = 'string' then
      v_recibe := nullif(btrim(p ->> 'recibido_por'), '');
    elsif p ? 'recibido_por' and jsonb_typeof(p -> 'recibido_por') <> 'null' then
      raise exception using errcode = '22023';
    end if;
    if jsonb_typeof(p -> 'observaciones') = 'string' then
      v_obs := nullif(btrim(p ->> 'observaciones'), '');
    elsif p ? 'observaciones' and jsonb_typeof(p -> 'observaciones') <> 'null' then
      raise exception using errcode = '22023';
    end if;
    if jsonb_typeof(p -> 'forzar') = 'boolean' then
      v_forzar := (p ->> 'forzar')::boolean;
    elsif p ? 'forzar' and jsonb_typeof(p -> 'forzar') <> 'null' then
      raise exception using errcode = '22023';
    end if;
  exception when others then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La remisión no tiene el formato esperado.';
  end;

  if v_fecha < date '2000-01-01' or v_fecha > date '2100-12-31' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La fecha de entrega no es válida.';
  end if;
  if v_forzar and v_rol not in ('owner', 'admin') then
    raise exception using errcode = 'P0001', message = 'remision_forzar_no_permitido',
      detail = 'Solo un administrador puede entregar un lote con servicios pendientes.';
  end if;

  -- Serializa con registrar_proceso / anular_proceso del mismo lote (misma clave).
  perform pg_advisory_xact_lock(hashtextextended('cafe.lote:' || v_lote::text, 0));

  select * into v_l from cafe.v_lotes v where v.id = v_lote;
  if not found then
    raise exception using errcode = 'P0001', message = 'lote_no_encontrado',
      detail = 'El lote no existe o no pertenece a tu cliente.';
  end if;
  if v_l.estado = 'anulado' then
    raise exception using errcode = 'P0001', message = 'lote_anulado',
      detail = 'El lote está anulado: ya no se puede modificar.';
  end if;
  if v_l.linea <> 'servicio' then
    raise exception using errcode = 'P0001', message = 'remision_solo_servicios',
      detail = 'La remisión de entrega es solo para lotes de trilla y maquila de clientes.';
  end if;
  if v_l.estado = 'entregado' then
    raise exception using errcode = 'P0001', message = 'remision_duplicada',
      detail = 'El lote ya tiene una remisión vigente: anúlala si necesitas generar otra.';
  end if;
  if v_fecha < v_l.fecha_recepcion then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'La fecha de entrega no puede ser anterior a la recepción del lote.';
  end if;
  if v_l.estado = 'recibido' then
    raise exception using errcode = 'P0001', message = 'remision_sin_procesos',
      detail = 'El lote aún no tiene ningún proceso registrado: no hay nada que entregar.';
  end if;

  -- Servicios contratados completos (todos los bultos). Si no, solo owner/admin pueden forzar, con observación.
  v_forzada := false;
  if v_l.estado <> 'listo' then
    select string_agg(case s when 'tostion' then 'tostión' else s::text end, ', ' order by cafe.orden_proceso(s))
      into v_faltan
      from unnest(v_l.servicios_requeridos) s
     where not exists (select 1 from cafe.v_lote_etapas e where e.lote_id = v_lote and e.tipo = s and e.completo);
    if not v_forzar then
      raise exception using errcode = 'P0001', message = 'servicios_incompletos',
        detail = format('Faltan servicios por completar: %s.', coalesce(v_faltan, '—'));
    end if;
    if v_obs is null then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'Para entregar con servicios pendientes escribe la observación (por qué se entrega así).';
    end if;
    v_forzada := true;
  end if;

  -- Detalle por servicio, en el orden de la planta. Los contratados que no se hicieron (solo al forzar) van como
  -- pendientes, sin cifras. La tarifa es la efectiva (valor / kg de entrada): los procesos congelan la suya.
  select coalesce(jsonb_agg(x.fila order by cafe.orden_proceso(x.servicio)), '[]'::jsonb) into v_detalle
    from (
      select s as servicio,
             case
               when e.tipo is null then
                 jsonb_build_object('servicio', s, 'pendiente', true, 'incluido', s = 'empaque')
               else
                 jsonb_build_object(
                   'servicio', s,
                   'kg_entrada', e.peso_entrada,
                   'kg_salida', e.peso_salida,
                   'merma_kg', e.merma_kg,
                   'merma_pct', e.merma_pct,
                   'tarifa_kg', case when e.peso_entrada > 0 then round(e.valor / e.peso_entrada, 2) else 0 end,
                   'valor', e.valor,
                   'nivel_tueste', case when s = 'tostion' then
                     (select p.nivel_tueste from cafe.procesos p
                       where p.lote_id = v_lote and p.tipo = 'tostion' and p.anulado_at is null
                       order by p.created_at desc limit 1) end,
                   'incluido', s = 'empaque',
                   'pendiente', not e.completo)
             end as fila
        from unnest(v_l.servicios_requeridos) s
        left join cafe.v_lote_etapas e on e.lote_id = v_lote and e.tipo = s
    ) x;

  v_numero := public.siguiente_consecutivo('REM', v_fecha);

  insert into cafe.remisiones (numero, lote_id, lote_codigo, fecha, tercero_id, cliente_nombre, cliente_identificacion,
                               peso_recibido_kg, peso_entregado_kg, detalle, valor_servicios, recibido_por,
                               observaciones, forzada)
  values (v_numero, v_lote, v_l.codigo, v_fecha, v_l.tercero_id, coalesce(v_l.tercero_nombre, '—'),
          v_l.tercero_identificacion, v_l.peso_recibido_kg, v_l.peso_actual_kg, v_detalle, v_l.valor_servicios,
          v_recibe, v_obs, v_forzada)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'forzada', v_forzada);
end $$;

-- Anula una remisión (solo `owner`/`admin`, con motivo). El lote vuelve a su estado derivado y se puede generar otra;
-- el número de la anulada no se reutiliza. Devuelve { id, numero, lote_id, lote_estado }.
create or replace function cafe.anular_remision(p_remision uuid, p_motivo text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_r      cafe.remisiones%rowtype;
  v_estado text;
begin
  if not coalesce((select public.rol_en_tenant()) in ('owner', 'admin'), false)
     or not coalesce((select public.tenant_tiene_modulo('cafe.remisiones')), false) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'Indica el motivo de la anulación.';
  end if;

  select * into v_r from cafe.remisiones r where r.id = p_remision;
  if not found then
    raise exception using errcode = 'P0001', message = 'remision_no_encontrada',
      detail = 'La remisión no existe o no pertenece a tu cliente.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cafe.lote:' || v_r.lote_id::text, 0));

  select r.anulada_at into v_r.anulada_at from cafe.remisiones r where r.id = p_remision;
  if v_r.anulada_at is not null then
    raise exception using errcode = 'P0001', message = 'remision_anulada',
      detail = 'La remisión ya está anulada.';
  end if;

  -- El trigger fija quién y cuándo anula.
  update cafe.remisiones
     set anulada_at = now(), motivo_anulacion = btrim(p_motivo)
   where id = p_remision;

  select v.estado into v_estado from cafe.v_lotes v where v.id = v_r.lote_id;

  return jsonb_build_object('id', v_r.id, 'numero', v_r.numero, 'lote_id', v_r.lote_id, 'lote_estado', v_estado);
end $$;

-- 5. Quién tocó el lote ---------------------------------------------------------------------------------------------------------
-- Igual que en 20261105110000_cafe_lotes_listado.sql (SECURITY DEFINER, solo miembros del cliente actual) con dos
-- orígenes más: quien generó y quien anuló cada remisión del lote. Los privilegios de la función se conservan.
create or replace function cafe.responsables_lote(p_lote uuid)
returns table (user_id uuid, email text)
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
    select u.id, u.email::text
      from auth.users u
     where u.id in (
             select l.created_by from cafe.lotes l where l.id = p_lote and l.tenant_id = v_tenant
             union
             select l.anulado_por from cafe.lotes l where l.id = p_lote and l.tenant_id = v_tenant
             union
             select p.created_by from cafe.procesos p where p.lote_id = p_lote and p.tenant_id = v_tenant
             union
             select p.anulado_por from cafe.procesos p where p.lote_id = p_lote and p.tenant_id = v_tenant
             union
             select r.created_by from cafe.remisiones r where r.lote_id = p_lote and r.tenant_id = v_tenant
             union
             select r.anulada_por from cafe.remisiones r where r.lote_id = p_lote and r.tenant_id = v_tenant)
       and exists (select 1 from public.tenant_members m where m.user_id = u.id and m.tenant_id = v_tenant);
end $$;

-- 6. Privilegios, RLS y auditoría ----------------------------------------------------------------------------------------------

revoke all on function cafe.generar_remision(jsonb) from public, anon;
grant execute on function cafe.generar_remision(jsonb) to authenticated;
revoke all on function cafe.anular_remision(uuid, text) from public, anon;
grant execute on function cafe.anular_remision(uuid, text) to authenticated;
revoke all on function cafe.remisiones_proteger() from public, anon, authenticated;
revoke all on function cafe.procesos_lote_entregado() from public, anon, authenticated;

alter table cafe.remisiones enable row level security;

-- El módulo `cafe.remisiones` se exige en todas las políticas. Lectura: cualquier miembro. INSERT: owner, admin y
-- operativo (lo usa la RPC SECURITY INVOKER). UPDATE (anulación y notas): owner y admin. DELETE: nadie.
create policy remisiones_select on cafe.remisiones for select to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.remisiones')));

create policy remisiones_insert on cafe.remisiones for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.remisiones'))
              and (select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'));

create policy remisiones_update on cafe.remisiones for update to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.remisiones'))
         and (select public.rol_en_tenant()) in ('owner', 'admin'))
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.remisiones'))
              and (select public.rol_en_tenant()) in ('owner', 'admin'));

-- Los privilegios por defecto del schema `cafe` dan también DELETE: se quitan y se da solo lo necesario. Lo
-- calculado (merma) y la anulación no se insertan; de una remisión solo se anula o se corrigen las notas.
revoke all on table cafe.remisiones from public, anon, authenticated, service_role;
grant select on table cafe.remisiones to authenticated;
grant insert (tenant_id, numero, lote_id, lote_codigo, fecha, tercero_id, cliente_nombre, cliente_identificacion,
              peso_recibido_kg, peso_entregado_kg, detalle, valor_servicios, recibido_por, observaciones, forzada)
  on table cafe.remisiones to authenticated;
grant update (recibido_por, observaciones, anulada_at, motivo_anulacion) on table cafe.remisiones to authenticated;
grant select, insert, update on table cafe.remisiones to service_role;

select audit.activar('cafe.remisiones');
