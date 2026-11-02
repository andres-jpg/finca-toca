-- Vertical café: «Entregar» varios lotes en una remisión, con quién recibe obligatorio (FIN-132 · A-14).
--
--  1. `cafe.remisiones_lotes`: relación remisión-lote N:N con el SNAPSHOT de cada lote (kilos, detalle por servicio,
--     valor). `cafe.remisiones` conserva los TOTALES de la remisión (suma de sus lotes) y, por compatibilidad con el
--     código anterior (expand), `lote_id` = el primer lote y `lote_codigo` = los códigos separados por coma.
--     `remisiones_lotes.activa` pasa a false cuando se anula la remisión (lo hace un trigger SECURITY DEFINER: nadie
--     tiene UPDATE sobre la tabla) y su índice único parcial garantiza «una remisión vigente por lote» para TODOS los lotes.
--  2. `recibe_nombre` y `recibe_documento` NOT NULL (las remisiones anteriores quedan con «Sin registrar»; el nombre
--     previo de `recibido_por`, si existía, se conserva en `recibe_nombre`).
--  3. `cafe.entregar_lotes(p jsonb)`: la RPC nueva (varios lotes de UN cliente, una sola remisión REM). `generar_remision`
--     pasa a ser un envoltorio de un solo lote (compatibilidad). `anular_remision` libera todos los lotes.
--  4. `cafe.v_lotes.estado = 'entregado'`, el trigger de procesos, `responsables_lote()` y `kpis_periodo()` leen la
--     relación nueva en vez de `remisiones.lote_id`.
--  5. RLS (plantilla de FIN-90 + módulo `cafe.remisiones`), privilegios y auditoría de la tabla nueva.
--
-- El estado de una remisión no se guarda: «entregada» = `anulada_at is null`, «anulada» = lo contrario (lo que antes
-- se llamaba «vigente» es «entregada»; no hay nada que migrar en datos).
--
-- Rollback (manual): drop trigger remisiones_sync_lotes; recrear v_lotes, procesos_lote_entregado, responsables_lote
-- y kpis_periodo de las migraciones previas; drop table cafe.remisiones_lotes; drop function cafe.entregar_lotes;
-- alter table cafe.remisiones drop column recibe_nombre, drop column recibe_documento (lote_id vuelve a NOT NULL solo
-- si no hay remisiones multilote).

-- 1. Columnas nuevas de la remisión ---------------------------------------------------------------------------------------

alter table cafe.remisiones
  add column recibe_nombre text,
  add column recibe_documento text;

-- Las anuladas son definitivas (trigger): se rellena sin disparar los triggers de usuario (tampoco audita el backfill).
alter table cafe.remisiones disable trigger user;
update cafe.remisiones
   set recibe_nombre = coalesce(recibido_por, 'Sin registrar'),
       recibe_documento = 'Sin registrar';
alter table cafe.remisiones enable trigger user;

alter table cafe.remisiones
  alter column recibe_nombre set not null,
  alter column recibe_documento set not null,
  add constraint remisiones_recibe_nombre_ck check (btrim(recibe_nombre) <> ''),
  add constraint remisiones_recibe_documento_ck check (btrim(recibe_documento) <> ''),
  alter column lote_id drop not null,
  add constraint remisiones_tenant_id_uk unique (tenant_id, id);

grant insert (recibe_nombre, recibe_documento) on table cafe.remisiones to authenticated;

-- 2. La relación remisión-lote --------------------------------------------------------------------------------------------

create table cafe.remisiones_lotes (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null default public.tenant_actual() references public.tenants,
  remision_id       uuid not null,
  lote_id           uuid not null,
  lote_codigo       text not null check (btrim(lote_codigo) <> ''),
  -- Snapshot de ESE lote al entregar (la remisión suma estos).
  peso_recibido_kg  numeric(10,3) not null check (peso_recibido_kg > 0),
  peso_entregado_kg numeric(10,3) not null check (peso_entregado_kg >= 0),
  detalle           jsonb not null check (jsonb_typeof(detalle) = 'array'),
  valor_servicios   numeric(14,2) not null check (valor_servicios >= 0),
  -- false cuando la remisión se anula: libera el lote para otra entrega.
  activa            boolean not null default true,
  created_at        timestamptz not null default now(),
  created_by        uuid default auth.uid() references auth.users,
  updated_at        timestamptz,
  updated_by        uuid references auth.users,
  constraint remisiones_lotes_remision_fk foreign key (tenant_id, remision_id)
    references cafe.remisiones (tenant_id, id) on delete restrict,
  constraint remisiones_lotes_lote_fk foreign key (tenant_id, lote_id)
    references cafe.lotes (tenant_id, id) on delete restrict,
  constraint remisiones_lotes_uk unique (remision_id, lote_id)
);

-- Un lote en una sola remisión entregada (con `tenant_id`: ver el comentario del índice de `remisiones`).
create unique index remisiones_lotes_un_lote on cafe.remisiones_lotes (tenant_id, lote_id) where activa;
create index on cafe.remisiones_lotes (tenant_id, remision_id);
create index on cafe.remisiones_lotes (tenant_id, lote_id);

create trigger set_updated before update on cafe.remisiones_lotes
  for each row execute function public.set_updated();

-- Backfill: una fila por remisión existente (anuladas incluidas, inactivas).
insert into cafe.remisiones_lotes (tenant_id, remision_id, lote_id, lote_codigo, peso_recibido_kg, peso_entregado_kg,
                                   detalle, valor_servicios, activa, created_at, created_by)
select r.tenant_id, r.id, r.lote_id, r.lote_codigo, r.peso_recibido_kg, r.peso_entregado_kg, r.detalle,
       r.valor_servicios, r.anulada_at is null, r.created_at, r.created_by
  from cafe.remisiones r
 where r.lote_id is not null;

-- Al anular la remisión, sus lotes quedan libres.
create or replace function cafe.remisiones_sync_lotes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.anulada_at is not null and old.anulada_at is null then
    update cafe.remisiones_lotes rl
       set activa = false
     where rl.remision_id = new.id and rl.tenant_id = new.tenant_id;
  end if;
  return new;
end $$;

create trigger remisiones_sync_lotes after update on cafe.remisiones
  for each row execute function cafe.remisiones_sync_lotes();
revoke all on function cafe.remisiones_sync_lotes() from public, anon, authenticated;

-- 3. Quien lee «entregado» ------------------------------------------------------------------------------------------------

create or replace function cafe.procesos_lote_entregado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and not (new.anulado_at is not null and old.anulado_at is null) then
    return new;
  end if;
  if exists (select 1 from cafe.remisiones_lotes rl where rl.lote_id = new.lote_id and rl.activa) then
    raise exception using errcode = 'P0001', message = 'lote_entregado',
      detail = 'El lote ya tiene una remisión de entrega: anúlala antes de registrar o anular procesos.';
  end if;
  return new;
end $$;

-- Misma definición que en 20261108160100_cafe_perfil_tueste.sql con UN cambio: el `exists` del estado `entregado`.
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
    when exists (select 1 from cafe.remisiones_lotes rl
                  where rl.lote_id = l.id and rl.activa)                   then 'entregado'
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

-- Quién tocó el lote: la remisión se busca por la relación (mismo cuerpo que en 20261107110000_cafe_reapertura.sql).
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
             select r.created_by from cafe.remisiones r
              where r.tenant_id = v_tenant
                and r.id in (select rl.remision_id from cafe.remisiones_lotes rl where rl.lote_id = p_lote and rl.tenant_id = v_tenant)
             union
             select r.anulada_por from cafe.remisiones r
              where r.tenant_id = v_tenant
                and r.id in (select rl.remision_id from cafe.remisiones_lotes rl where rl.lote_id = p_lote and rl.tenant_id = v_tenant)
             union
             select re.created_by from cafe.reaperturas re where re.lote_id = p_lote and re.tenant_id = v_tenant)
       and exists (select 1 from public.tenant_members m where m.user_id = u.id and m.tenant_id = v_tenant);
end $$;

-- `kpis_periodo` (20261108100000_cafe_kpis.sql): «inventario de terceros» = lotes sin entrega vigente. Se reescribe la
-- condición sobre la definición vigente de la función (sin copiar sus 160 líneas); si el texto no está, falla la migración.
do $$
declare
  v_def  text := pg_get_functiondef('cafe.kpis_periodo(date,date,text)'::regprocedure);
  v_nueva text;
begin
  v_nueva := replace(v_def,
    'not exists (select 1 from cafe.remisiones rm where rm.tenant_id = l.tenant_id and rm.lote_id = l.id and rm.anulada_at is null)',
    'not exists (select 1 from cafe.remisiones_lotes rl where rl.tenant_id = l.tenant_id and rl.lote_id = l.id and rl.activa)');
  if v_nueva = v_def then
    raise exception 'kpis_periodo: no se encontró la condición de remisiones que se iba a reemplazar';
  end if;
  execute v_nueva;
end $$;

-- 4. Entregar --------------------------------------------------------------------------------------------------------------
-- Entrada (jsonb; todo lo demás se ignora):
--   { "lote_ids": [uuid, …] (1 a 20, todos del MISMO cliente), "fecha": "2026-11-12",
--     "recibe_nombre": "Juan Pérez", "recibe_documento": "1020304050",   -- obligatorios
--     "observaciones": null, "forzar": false }
-- Salida: { "id", "numero", "forzada", "lote_ids" }
-- Reglas: permisos → formato → lotes del cliente, de servicio, no anulados, sin entrega vigente, con procesos →
-- servicios completos (`servicios_incompletos`; `forzar` solo owner/admin y con observación) → número REM (lo más
-- tarde posible: si algo falla antes, el rollback no consume número).
create or replace function cafe.entregar_lotes(p jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_ids      uuid[];
  v_id       uuid;
  v_fecha    date;
  v_nombre   text;
  v_doc      text;
  v_obs      text;
  v_forzar   boolean := false;
  v_rol      public.rol_tenant;
  v_l        cafe.v_lotes%rowtype;
  v_tercero  uuid;
  v_faltan   text;
  v_detalle  jsonb;
  v_det_tot  jsonb := '[]'::jsonb;
  v_links    jsonb := '[]'::jsonb;
  v_codigos  text[] := '{}';
  v_primero  uuid;
  v_recibido numeric := 0;
  v_entregado numeric := 0;
  v_valor    numeric := 0;
  v_numero   text;
  v_rem      uuid;
  v_forzada  boolean := false;
  v_cod      text;
begin
  v_rol := (select public.rol_en_tenant());
  if not coalesce(v_rol in ('owner', 'admin', 'operativo'), false)
     or not coalesce((select public.tenant_tiene_modulo('cafe.remisiones')), false) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La entrega no tiene el formato esperado.';
  end if;

  begin
    if jsonb_typeof(p -> 'lote_ids') is distinct from 'array'
       or jsonb_typeof(p -> 'fecha') is distinct from 'string' then
      raise exception using errcode = '22023';
    end if;
    select array_agg(distinct x::uuid order by x::uuid) into v_ids from jsonb_array_elements_text(p -> 'lote_ids') x;
    v_fecha := (p ->> 'fecha')::date;

    if jsonb_typeof(p -> 'recibe_nombre') = 'string' then
      v_nombre := nullif(btrim(p ->> 'recibe_nombre'), '');
    end if;
    if jsonb_typeof(p -> 'recibe_documento') = 'string' then
      v_doc := nullif(btrim(p ->> 'recibe_documento'), '');
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
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La entrega no tiene el formato esperado.';
  end;

  if v_ids is null or cardinality(v_ids) < 1 or cardinality(v_ids) > 20 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Elige entre 1 y 20 lotes para entregar.';
  end if;
  if v_nombre is null then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Escribe el nombre de quien recibe.';
  end if;
  if v_doc is null then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Escribe la cédula de quien recibe.';
  end if;
  if length(v_nombre) > 120 or length(v_doc) > 30 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El nombre o la cédula de quien recibe son demasiado largos.';
  end if;
  if v_fecha < date '2000-01-01' or v_fecha > date '2100-12-31' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La fecha de entrega no es válida.';
  end if;
  if v_forzar and v_rol not in ('owner', 'admin') then
    raise exception using errcode = 'P0001', message = 'remision_forzar_no_permitido',
      detail = 'Solo un administrador puede entregar un lote con servicios pendientes.';
  end if;

  -- Serializa con registrar_proceso / anular_proceso de cada lote (misma clave), siempre en el mismo orden (por id)
  -- para que dos entregas cruzadas no se bloqueen entre sí.
  foreach v_id in array v_ids loop
    perform pg_advisory_xact_lock(hashtextextended('cafe.lote:' || v_id::text, 0));
  end loop;

  if (select count(*) from cafe.v_lotes v where v.id = any(v_ids)) <> cardinality(v_ids) then
    raise exception using errcode = 'P0001', message = 'lote_no_encontrado',
      detail = 'Algún lote no existe o no pertenece a tu cliente.';
  end if;

  for v_l in select * from cafe.v_lotes v where v.id = any(v_ids) order by v.codigo loop
    -- Con varios lotes los mensajes dicen de cuál se trata.
    v_cod := case when cardinality(v_ids) > 1 then ' ' || v_l.codigo else '' end;
    if v_tercero is null then
      v_tercero := v_l.tercero_id;
      v_primero := v_l.id;
    elsif v_l.tercero_id is distinct from v_tercero then
      raise exception using errcode = 'P0001', message = 'remision_clientes_distintos',
        detail = 'Los lotes de una remisión deben ser de un mismo cliente.';
    end if;

    if v_l.estado = 'anulado' then
      raise exception using errcode = 'P0001', message = 'lote_anulado',
        detail = format('El lote%s está anulado: ya no se puede modificar.', v_cod);
    end if;
    if v_l.linea <> 'servicio' then
      raise exception using errcode = 'P0001', message = 'remision_solo_servicios',
        detail = 'La remisión de entrega es solo para lotes de trilla y maquila de clientes.';
    end if;
    if v_l.estado = 'entregado' then
      raise exception using errcode = 'P0001', message = 'remision_duplicada',
        detail = format('El lote%s ya tiene una remisión vigente: anúlala si necesitas generar otra.', v_cod);
    end if;
    if v_fecha < v_l.fecha_recepcion then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = format('La fecha de entrega no puede ser anterior a la recepción del lote%s.', v_cod);
    end if;
    if v_l.estado = 'recibido' then
      raise exception using errcode = 'P0001', message = 'remision_sin_procesos',
        detail = format('El lote%s aún no tiene ningún proceso registrado: no hay nada que entregar.', v_cod);
    end if;

    if v_l.estado <> 'listo' then
      select string_agg(case s when 'tostion' then 'tostión' else s::text end, ', ' order by cafe.orden_proceso(s))
        into v_faltan
        from unnest(v_l.servicios_requeridos) s
       where not exists (select 1 from cafe.v_lote_etapas e where e.lote_id = v_l.id and e.tipo = s and e.completo);
      if not v_forzar then
        raise exception using errcode = 'P0001', message = 'servicios_incompletos',
          detail = format('Faltan servicios por completar%s: %s.', case when v_cod = '' then '' else ' (lote' || v_cod || ')' end, coalesce(v_faltan, '—'));
      end if;
      if v_obs is null then
        raise exception using errcode = 'P0001', message = 'datos_invalidos',
          detail = 'Para entregar con servicios pendientes escribe la observación (por qué se entrega así).';
      end if;
      v_forzada := true;
    end if;

    -- Detalle por servicio de ESTE lote, en el orden de la planta (contratados sin hacer = pendientes, sin cifras).
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
                       (select p2.nivel_tueste from cafe.procesos p2
                         where p2.lote_id = v_l.id and p2.tipo = 'tostion' and p2.anulado_at is null
                         order by p2.created_at desc limit 1) end,
                     'incluido', s = 'empaque',
                     'pendiente', not e.completo)
               end as fila
          from unnest(v_l.servicios_requeridos) s
          left join cafe.v_lote_etapas e on e.lote_id = v_l.id and e.tipo = s
      ) x;

    v_codigos := v_codigos || v_l.codigo;
    v_recibido := v_recibido + v_l.peso_recibido_kg;
    v_entregado := v_entregado + v_l.peso_actual_kg;
    v_valor := v_valor + v_l.valor_servicios;
    v_det_tot := v_det_tot || coalesce((select jsonb_agg(d || jsonb_build_object('lote_codigo', v_l.codigo))
                                          from jsonb_array_elements(v_detalle) d), '[]'::jsonb);
    v_links := v_links || jsonb_build_array(jsonb_build_object(
      'lote_id', v_l.id, 'lote_codigo', v_l.codigo, 'peso_recibido_kg', v_l.peso_recibido_kg,
      'peso_entregado_kg', v_l.peso_actual_kg, 'detalle', v_detalle, 'valor_servicios', v_l.valor_servicios));
  end loop;

  v_numero := public.siguiente_consecutivo('REM', v_fecha);

  insert into cafe.remisiones (numero, lote_id, lote_codigo, fecha, tercero_id, cliente_nombre, cliente_identificacion,
                               peso_recibido_kg, peso_entregado_kg, detalle, valor_servicios, recibido_por,
                               recibe_nombre, recibe_documento, observaciones, forzada)
  select v_numero, v_primero, array_to_string(v_codigos, ', '), v_fecha, v_tercero, coalesce(t.nombre, '—'),
         t.identificacion, v_recibido, v_entregado, v_det_tot, v_valor, v_nombre, v_nombre, v_doc, v_obs, v_forzada
    from public.terceros t where t.id = v_tercero
  returning id into v_rem;

  insert into cafe.remisiones_lotes (remision_id, lote_id, lote_codigo, peso_recibido_kg, peso_entregado_kg, detalle,
                                     valor_servicios)
  select v_rem, x.lote_id, x.lote_codigo, x.peso_recibido_kg, x.peso_entregado_kg, x.detalle, x.valor_servicios
    from jsonb_to_recordset(v_links) as x(lote_id uuid, lote_codigo text, peso_recibido_kg numeric,
                                          peso_entregado_kg numeric, detalle jsonb, valor_servicios numeric);

  return jsonb_build_object('id', v_rem, 'numero', v_numero, 'forzada', v_forzada, 'lote_ids', to_jsonb(v_ids));
end $$;

-- Compatibilidad (expand): una remisión de UN lote con la firma anterior. Ahora exige quién recibe y su cédula.
create or replace function cafe.generar_remision(p jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if p is null or jsonb_typeof(p) <> 'object' or jsonb_typeof(p -> 'lote_id') is distinct from 'string' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La remisión no tiene el formato esperado.';
  end if;
  return cafe.entregar_lotes(
    (p - 'lote_id' - 'recibido_por')
    || jsonb_build_object('lote_ids', jsonb_build_array(p -> 'lote_id'),
                          'recibe_nombre', coalesce(p -> 'recibe_nombre', p -> 'recibido_por')));
end $$;

-- Anular libera todos los lotes de la remisión. Devuelve { id, numero, lote_id (el primero), lote_estado, lote_ids }.
create or replace function cafe.anular_remision(p_remision uuid, p_motivo text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_r      cafe.remisiones%rowtype;
  v_ids    uuid[];
  v_id     uuid;
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

  select array_agg(rl.lote_id order by rl.lote_id) into v_ids
    from cafe.remisiones_lotes rl where rl.remision_id = p_remision;
  foreach v_id in array coalesce(v_ids, '{}') loop
    perform pg_advisory_xact_lock(hashtextextended('cafe.lote:' || v_id::text, 0));
  end loop;

  select r.anulada_at into v_r.anulada_at from cafe.remisiones r where r.id = p_remision;
  if v_r.anulada_at is not null then
    raise exception using errcode = 'P0001', message = 'remision_anulada',
      detail = 'La remisión ya está anulada.';
  end if;

  -- El trigger fija quién y cuándo anula y libera los lotes.
  update cafe.remisiones
     set anulada_at = now(), motivo_anulacion = btrim(p_motivo)
   where id = p_remision;

  select v.estado into v_estado from cafe.v_lotes v where v.id = v_r.lote_id;

  return jsonb_build_object('id', v_r.id, 'numero', v_r.numero, 'lote_id', v_r.lote_id, 'lote_estado', v_estado,
                            'lote_ids', to_jsonb(coalesce(v_ids, '{}')));
end $$;

revoke all on function cafe.entregar_lotes(jsonb) from public, anon;
grant execute on function cafe.entregar_lotes(jsonb) to authenticated;
revoke all on function cafe.generar_remision(jsonb) from public, anon;
grant execute on function cafe.generar_remision(jsonb) to authenticated;
revoke all on function cafe.anular_remision(uuid, text) from public, anon;
grant execute on function cafe.anular_remision(uuid, text) to authenticated;

-- 5. RLS, privilegios y auditoría de la relación ----------------------------------------------------------------------------

alter table cafe.remisiones_lotes enable row level security;

create policy remisiones_lotes_select on cafe.remisiones_lotes for select to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.remisiones')));

create policy remisiones_lotes_insert on cafe.remisiones_lotes for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.remisiones'))
              and (select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'));

-- Sin UPDATE ni DELETE para nadie con sesión: `activa` solo la cambia el trigger de la anulación.
revoke all on table cafe.remisiones_lotes from public, anon, authenticated, service_role;
grant select on table cafe.remisiones_lotes to authenticated;
grant insert (tenant_id, remision_id, lote_id, lote_codigo, peso_recibido_kg, peso_entregado_kg, detalle, valor_servicios)
  on table cafe.remisiones_lotes to authenticated;
grant select, insert, update on table cafe.remisiones_lotes to service_role;

select audit.activar('cafe.remisiones_lotes');
