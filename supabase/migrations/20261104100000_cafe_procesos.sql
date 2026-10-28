-- Vertical café: procesos, mermas, baches, proceso parcial por bultos y avance derivado (FIN-108 · CO-27, HU-F1-04).
--
--  1. `cafe.procesos`: un registro por trilla, tostión, molienda o empaque. Merma, valor y desvío son columnas
--     GENERADAS (siempre las calcula la base); tarifa, merma de referencia y tolerancia son snapshots del
--     momento de guardar, así que lo cobrado no cambia si luego cambian la tarifa o los parámetros.
--  2. `cafe.proceso_bultos`: qué bultos del lote pasaron por el proceso (proceso parcial: se eligen los bultos).
--     Un bulto pasa UNA vez por cada tipo de proceso (índice único); anular el proceso lo libera.
--  3. `cafe.baches`: la tostión se registra por baches; cada uno conserva su peso y su resultado.
--  4. Funciones: `pasos_del_lote`, `paso_previo`, `peso_disponible`, `sugerir_baches`, `registrar_proceso`,
--     `anular_proceso` y la común `_insertar_proceso` (la reutilizará `registrar_empaque`, CO-30).
--  5. Vistas `v_proceso_bultos_peso`, `v_bultos_estado`, `v_lote_etapas` y `v_lotes` (`security_invoker`): el
--     estado y el avance del lote se DERIVAN de los procesos, nunca se guardan.
--  6. Triggers: baches que cuadran con la tostión (diferido), protección y anulación de procesos.
--  7. RLS (plantilla de FIN-90 + módulo `cafe.procesos`), privilegios y auditoría.
--
-- Solo crea objetos nuevos (más un índice único de apoyo sobre `cafe.lote_bultos`): segura en bases con datos.
-- Las funciones de negocio son SECURITY INVOKER: el RLS de `cafe.lotes`, `cafe.lote_bultos` y de estas tablas
-- sigue aplicando con el usuario real. La RPC es la vía soportada para escribir (como `registrar_movimientos()`
-- en el inventario): serializa por lote y valida el orden; las tablas solo dejan INSERT a quien opera.
--
-- Empaque de MARCA PROPIA: lo registrará `cafe.registrar_empaque` (CO-30) llamando a `cafe._insertar_proceso`;
-- aquí `registrar_proceso` lo rechaza con `usar_registrar_empaque`. El empaque de maquila (sin insumos) sí se
-- registra aquí.

-- 1. Apoyo para las FK compuestas ------------------------------------------------------------------------------
-- `(tenant_id, lote_id, id)` único en los bultos: así `proceso_bultos` apunta a un bulto del MISMO lote y del
-- mismo cliente por construcción (la comprobación de una FK salta el RLS). Mismo patrón que `lotes`.

create unique index lote_bultos_tenant_lote_id_uk on cafe.lote_bultos (tenant_id, lote_id, id);

-- 2. Tablas -------------------------------------------------------------------------------------------------------

create table cafe.procesos (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null default public.tenant_actual() references public.tenants,
  lote_id              uuid not null,
  tipo                 cafe.tipo_proceso not null,
  fecha                date not null,
  peso_entrada_kg      numeric(10,3) not null check (peso_entrada_kg > 0),
  peso_salida_kg       numeric(10,3) not null check (peso_salida_kg >= 0 and peso_salida_kg <= peso_entrada_kg),
  merma_kg             numeric(10,3) generated always as (peso_entrada_kg - peso_salida_kg) stored,
  merma_pct            numeric(6,3)  generated always as (round((peso_entrada_kg - peso_salida_kg) / peso_entrada_kg * 100, 3)) stored,
  tarifa_kg            numeric(12,2) not null default 0 check (tarifa_kg >= 0),   -- snapshot (0 en empaque y en marca propia)
  valor                numeric(14,2) generated always as (round(peso_entrada_kg * tarifa_kg, 0)) stored,
  merma_referencia_pct numeric(6,3) check (merma_referencia_pct between 0 and 100), -- snapshot (NULL = sin referencia)
  tolerancia_pts       numeric(6,3) check (tolerancia_pts >= 0),                    -- snapshot
  desvio               boolean generated always as (
    merma_referencia_pct is not null and tolerancia_pts is not null
    and abs(round((peso_entrada_kg - peso_salida_kg) / peso_entrada_kg * 100, 3) - merma_referencia_pct) > tolerancia_pts) stored,
  nivel_tueste         cafe.nivel_tueste,                                           -- solo tostión
  reapertura_id        uuid,                                                        -- la FK llega con CO-33 (HU-16)
  observaciones        text,
  anulado_at           timestamptz,
  anulado_por          uuid references auth.users,
  motivo_anulacion     text check (motivo_anulacion is null or btrim(motivo_anulacion) <> ''),
  created_at           timestamptz not null default now(),
  created_by           uuid default auth.uid() references auth.users,
  updated_at           timestamptz,
  updated_by           uuid references auth.users,
  constraint procesos_tenant_id_uk unique (tenant_id, id),
  constraint procesos_ref_uk unique (tenant_id, id, tipo, lote_id),                 -- destino de proceso_bultos
  constraint procesos_lote_fk foreign key (tenant_id, lote_id)
    references cafe.lotes (tenant_id, id) on delete restrict,
  -- La tostión lleva nivel de tueste y ningún otro proceso lo lleva.
  constraint proceso_tueste_ck check ((tipo = 'tostion') = (nivel_tueste is not null)),
  constraint proceso_anulacion_ck check ((anulado_at is null) = (motivo_anulacion is null))
);

create index on cafe.procesos (tenant_id, fecha desc);
create index on cafe.procesos (lote_id, tipo) where anulado_at is null;

create table cafe.proceso_bultos (
  id         uuid not null default gen_random_uuid(),                                 -- solo para `audit.activar`
  proceso_id uuid not null,
  bulto_id   uuid not null,
  tipo       cafe.tipo_proceso not null,                                              -- denormalizado para la unicidad
  lote_id    uuid not null,                                                           -- denormalizado: bulto y proceso son del mismo lote
  tenant_id  uuid not null default public.tenant_actual() references public.tenants,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users,
  primary key (proceso_id, bulto_id),
  constraint proceso_bultos_id_uk unique (id),
  constraint proceso_bultos_proceso_fk foreign key (tenant_id, proceso_id, tipo, lote_id)
    references cafe.procesos (tenant_id, id, tipo, lote_id) on delete cascade,
  constraint proceso_bultos_bulto_fk foreign key (tenant_id, lote_id, bulto_id)
    references cafe.lote_bultos (tenant_id, lote_id, id) on delete restrict
);

-- Un bulto pasa una sola vez por cada tipo de proceso (los procesos anulados no dejan filas aquí).
create unique index proceso_bultos_unico on cafe.proceso_bultos (bulto_id, tipo);
create index on cafe.proceso_bultos (tenant_id, lote_id, tipo);

create table cafe.baches (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.tenant_actual() references public.tenants,
  proceso_id      uuid not null,
  numero          smallint not null check (numero >= 1),
  peso_entrada_kg numeric(10,3) not null check (peso_entrada_kg > 0),
  peso_salida_kg  numeric(10,3) not null check (peso_salida_kg >= 0 and peso_salida_kg <= peso_entrada_kg),
  merma_pct       numeric(6,3) generated always as (round((peso_entrada_kg - peso_salida_kg) / peso_entrada_kg * 100, 3)) stored,
  temperatura_c   numeric(5,1),                                                       -- opcional (decisión 7 de CO-20)
  observaciones   text,
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references auth.users,
  constraint baches_numero_uk unique (proceso_id, numero),
  constraint baches_proceso_fk foreign key (tenant_id, proceso_id)
    references cafe.procesos (tenant_id, id) on delete cascade
);

create index on cafe.baches (tenant_id, proceso_id);

create trigger set_updated before update on cafe.procesos
  for each row execute function public.set_updated();

-- 3. Funciones de apoyo ------------------------------------------------------------------------------------------

-- Valor numérico de un parámetro del cliente, o `p_default` si falta o no es un número (un JSON `null` es
-- «sin configurar»). Mismos valores por defecto que `PARAMETROS_CAFE` y que `registrar_recepcion`.
create or replace function cafe.parametro_numero(p_clave text, p_default numeric)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select case when jsonb_typeof(v.valor) = 'number' then (v.valor #>> '{}')::numeric else p_default end
    from (select public.parametro(p_clave) as valor) v
$$;

-- Instante contra el que se mide «la tarifa vigente en la fecha del proceso» (decisión 4 de CO-20): hoy es
-- AHORA (cuenta una tarifa que cambió esta misma mañana); cualquier otra fecha es el final de ese día en la
-- zona horaria del cliente. Misma regla que la estimación de la recepción.
create or replace function cafe.instante_fecha(p_fecha date)
returns timestamptz
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_zona text := coalesce(
    (select t.zona_horaria from public.tenants t where t.id = (select public.tenant_actual())), 'America/Bogota');
begin
  if p_fecha = (now() at time zone v_zona)::date then
    return now();
  end if;
  return ((p_fecha + 1)::timestamp at time zone v_zona) - interval '1 microsecond';
end $$;

-- Pasos que admite el lote. Servicio: los contratados. Marca propia: tostión, molienda (opcional) y empaque;
-- nunca trilla (ya compra el café trillado). NULL si el lote no existe o no es visible.
create or replace function cafe.pasos_del_lote(p_lote uuid)
returns cafe.tipo_proceso[]
language sql
stable
security invoker
set search_path = ''
as $$
  select case l.linea
           when 'servicio' then l.servicios
           else array['tostion', 'molienda', 'empaque']::cafe.tipo_proceso[]
         end
    from cafe.lotes l
   where l.id = p_lote
$$;

-- Paso inmediatamente anterior que ese lote exige antes de `p_tipo`; NULL si es el primero.
--   Servicio: el servicio contratado anterior (trilla → tostión → molienda → empaque, solo los contratados).
--   Marca propia: la molienda sigue a la tostión; el empaque sigue a la molienda SI ese bulto pasó por ella
--   (`p_bulto`) y, si no, a la tostión. Sin `p_bulto` el empaque cuelga de la tostión (lo obligatorio).
create or replace function cafe.paso_previo(p_lote uuid, p_tipo cafe.tipo_proceso, p_bulto uuid default null)
returns cafe.tipo_proceso
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_linea     cafe.linea_lote;
  v_servicios cafe.tipo_proceso[];
  v_previo    cafe.tipo_proceso;
begin
  select l.linea, l.servicios into v_linea, v_servicios from cafe.lotes l where l.id = p_lote;
  if not found then
    return null;
  end if;

  if v_linea = 'servicio' then
    select s into v_previo
      from unnest(v_servicios) s
     where cafe.orden_proceso(s) < cafe.orden_proceso(p_tipo)
     order by cafe.orden_proceso(s) desc
     limit 1;
    return v_previo;
  end if;

  if p_tipo = 'molienda' then
    return 'tostion';
  elsif p_tipo = 'empaque' then
    if p_bulto is not null
       and exists (select 1 from cafe.proceso_bultos pb where pb.bulto_id = p_bulto and pb.tipo = 'molienda') then
      return 'molienda';
    end if;
    return 'tostion';
  end if;
  return null;
end $$;

-- 4. Vistas de apoyo y de avance ------------------------------------------------------------------------------------
-- Las vistas van antes de `peso_disponible` y de las RPC, que las leen. `security_invoker = true`: el RLS del
-- usuario filtra por cliente y módulo.

-- Reparte lo que SALIÓ de cada proceso entre sus bultos en proporción a su peso original: la salida de una
-- trilla de 8 bultos de 62,5 kg (405 kg) son 50,625 kg por bulto, y es lo que «entra» a la tostión de ese
-- bulto. Solo procesos vigentes (no anulados). `partition by lote_id, proceso_id` deja que un filtro por lote
-- baje hasta la ventana en vez de calcularla para todos los lotes.
create view cafe.v_proceso_bultos_peso with (security_invoker = true) as
select
  pb.tenant_id,
  pb.lote_id,
  pb.proceso_id,
  pb.bulto_id,
  pb.tipo,
  b.numero,
  b.peso_kg as peso_bulto_kg,
  p.peso_entrada_kg * b.peso_kg / sum(b.peso_kg) over (partition by pb.lote_id, pb.proceso_id) as entrada_bulto_kg,
  p.peso_salida_kg  * b.peso_kg / sum(b.peso_kg) over (partition by pb.lote_id, pb.proceso_id) as salida_bulto_kg
from cafe.proceso_bultos pb
join cafe.procesos p     on p.id = pb.proceso_id and p.anulado_at is null
join cafe.lote_bultos b  on b.id = pb.bulto_id;

-- Cada bulto con los pasos por los que ya pasó, el último y lo que pesa AHORA: la salida atribuida del último
-- paso (o su peso original si no ha pasado por ninguno). Para la tabla «Bultos» de la ficha del lote.
create view cafe.v_bultos_estado with (security_invoker = true) as
select
  b.tenant_id,
  b.lote_id,
  b.id as bulto_id,
  b.numero,
  b.peso_kg,
  coalesce(u.pasos, '{}') as pasos,
  u.ultimo_tipo,
  round(coalesce(u.salida_bulto_kg, b.peso_kg), 3) as peso_actual_kg,
  coalesce(u.salida_bulto_kg, b.peso_kg)           as peso_actual_exacto_kg   -- sin redondear: lo suma v_lotes
from cafe.lote_bultos b
left join lateral (
  select
    array_agg(v.tipo order by cafe.orden_proceso(v.tipo)) as pasos,
    (array_agg(v.tipo order by cafe.orden_proceso(v.tipo) desc))[1] as ultimo_tipo,
    (array_agg(v.salida_bulto_kg order by cafe.orden_proceso(v.tipo) desc))[1] as salida_bulto_kg
  from cafe.v_proceso_bultos_peso v
  where v.bulto_id = b.id and v.lote_id = b.lote_id
) u on true;

-- Una fila por lote y tipo de proceso con al menos un proceso vigente. «completo» = todos los bultos del lote
-- pasaron por ese paso; «parcial» = algunos sí y otros no. La merma es la ponderada: sum(merma) / sum(entrada).
create view cafe.v_lote_etapas with (security_invoker = true) as
select
  e.tenant_id,
  e.lote_id,
  e.tipo,
  l.num_bultos::integer                                         as bultos_total,
  coalesce(b.n, 0)::integer                                     as bultos_procesados,
  coalesce(b.n, 0) = l.num_bultos                               as completo,
  coalesce(b.n, 0) > 0 and coalesce(b.n, 0) < l.num_bultos      as parcial,
  e.num_procesos,
  e.peso_entrada,
  e.peso_salida,
  e.merma_kg,
  round(e.merma_kg / e.peso_entrada * 100, 3)                   as merma_pct,
  e.valor,
  e.desvios,
  e.ultima_fecha
from (
  select
    p.tenant_id, p.lote_id, p.tipo,
    count(*)::integer                         as num_procesos,
    sum(p.peso_entrada_kg)                    as peso_entrada,
    sum(p.peso_salida_kg)                     as peso_salida,
    sum(p.merma_kg)                           as merma_kg,
    sum(p.valor)                              as valor,
    (count(*) filter (where p.desvio))::integer as desvios,
    max(p.fecha)                              as ultima_fecha
  from cafe.procesos p
  where p.anulado_at is null
  group by p.tenant_id, p.lote_id, p.tipo
) e
join cafe.lotes l on l.id = e.lote_id
left join lateral (
  select count(*) as n from cafe.proceso_bultos pb where pb.lote_id = e.lote_id and pb.tipo = e.tipo
) b on true;

-- Una fila por lote: sus datos, el tercero y el tipo de café, el avance («2 de 3») y el estado DERIVADO:
--   anulado | recibido (sin procesos) | en_proceso | parcial (algún paso con bultos pendientes) |
--   listo (todos los pasos requeridos completos).
-- `entregado` lo añadirá la remisión (CO-32). Los pasos requeridos son `servicios_requeridos()`: los
-- contratados, o tostión + empaque en marca propia (la molienda cuenta si se hizo).
-- `peso_actual_kg` es lo que queda en planta: la salida atribuida del último paso de cada bulto más los bultos
-- sin procesar; `merma_total_*` = recibido − actual. Los kilos de marca propia y de servicio no se suman nunca
-- entre sí: cada fila es de un solo lote.
create view cafe.v_lotes with (security_invoker = true) as
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

-- 5. Peso disponible y baches sugeridos ---------------------------------------------------------------------------------
-- Peso que puede entrar al paso `p_tipo` con esos bultos:
--   · sin paso previo → la suma de los pesos de los bultos;
--   · con paso previo → por cada bulto, la parte de la SALIDA de su proceso previo que le toca (proporcional a
--     su peso original dentro de ese proceso). Así «el peso final de trilla pasa como peso inicial de
--     tostión» (HU-03 c5) también cuando se procesó por partes.
-- NULL si no se puede calcular: sin bultos, algún bulto no es del lote o aún no pasó por el paso previo.
create or replace function cafe.peso_disponible(p_lote uuid, p_tipo cafe.tipo_proceso, p_bultos uuid[])
returns numeric
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_ids    uuid[];
  v_n      integer;
  v_validos integer;
  v_total  numeric;
begin
  select array_agg(distinct x) into v_ids from unnest(p_bultos) x where x is not null;
  if v_ids is null then
    return null;
  end if;

  select count(*),
         count(*) filter (where x.previo is null or v.salida_bulto_kg is not null),
         sum(case when x.previo is null then b.peso_kg else v.salida_bulto_kg end)
    into v_n, v_validos, v_total
    from cafe.lote_bultos b
   cross join lateral (select cafe.paso_previo(p_lote, p_tipo, b.id) as previo) x
    left join cafe.v_proceso_bultos_peso v
           on v.lote_id = p_lote and v.bulto_id = b.id and v.tipo = x.previo
   where b.lote_id = p_lote
     and b.id = any(v_ids);

  if v_n <> cardinality(v_ids) or v_validos <> v_n then
    return null;
  end if;
  return round(v_total, 3);
end $$;

-- Reparte el peso en baches de la capacidad de la tostadora (`cafe.capacidad_tostadora_kg`, 13,5 por defecto):
-- n = ceil(peso / capacidad) y reparto en partes iguales a gramos, con el último absorbiendo el resto (81 kg →
-- 6 × 13,5; 100 kg → 8 × 12,5). Misma regla que `sugerirBaches()` de TypeScript. Solo sugiere: la planta lo
-- edita.
create or replace function cafe.sugerir_baches(p_peso numeric)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_cap  numeric := cafe.parametro_numero('cafe.capacidad_tostadora_kg', 13.5);
  v_capg bigint;
  v_n    integer;
begin
  if p_peso is null or p_peso <= 0 or p_peso >= 10000000 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'El peso a tostar debe ser mayor que cero.';
  end if;
  if v_cap <= 0 then
    v_cap := 13.5;
  end if;

  v_capg := greatest(round(v_cap * 1000), 1);
  v_n    := ceil(round(p_peso * 1000)::numeric / v_capg);

  return jsonb_build_object(
    'capacidad_kg', v_cap,
    'num_baches', v_n,
    'baches', to_jsonb(cafe.repartir_peso(p_peso, v_n)));
end $$;

-- 6. Triggers ---------------------------------------------------------------------------------------------------------------

-- 6.1 Los baches cuadran con la tostión: al FINAL de la transacción (el proceso y sus baches se insertan en
-- instrucciones distintas). Tostión: ≥ 1 bache y la suma de entradas y salidas = las del proceso (1 g de
-- tolerancia). Cualquier otro proceso no lleva baches. Dispara desde ambas tablas.
create or replace function cafe.verificar_baches_proceso(p_proceso uuid)
returns void
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_tipo    cafe.tipo_proceso;
  v_entrada numeric;
  v_salida  numeric;
  v_n       integer;
  v_sum_e   numeric;
  v_sum_s   numeric;
begin
  select p.tipo, p.peso_entrada_kg, p.peso_salida_kg into v_tipo, v_entrada, v_salida
    from cafe.procesos p where p.id = p_proceso;
  if not found then
    return;
  end if;

  select count(*), coalesce(sum(b.peso_entrada_kg), 0), coalesce(sum(b.peso_salida_kg), 0)
    into v_n, v_sum_e, v_sum_s
    from cafe.baches b where b.proceso_id = p_proceso;

  if v_tipo <> 'tostion' then
    if v_n > 0 then
      raise exception using errcode = 'P0001', message = 'baches_no_cuadran',
        detail = 'Solo la tostión se registra por baches.';
    end if;
    return;
  end if;

  if v_n = 0 then
    raise exception using errcode = 'P0001', message = 'baches_no_cuadran',
      detail = 'La tostión se registra por baches: indica al menos uno.';
  end if;
  if abs(v_sum_e - v_entrada) > 0.001 or abs(v_sum_s - v_salida) > 0.001 then
    raise exception using errcode = 'P0001', message = 'baches_no_cuadran',
      detail = format('Los baches suman %s kg de entrada y %s kg de salida; la tostión tiene %s y %s.',
                      v_sum_e, v_sum_s, v_entrada, v_salida);
  end if;
end $$;

create or replace function cafe.procesos_verificar_baches()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'procesos' then
    perform cafe.verificar_baches_proceso(new.id);
  else
    if tg_op <> 'INSERT' then
      perform cafe.verificar_baches_proceso(old.proceso_id);
    end if;
    if tg_op <> 'DELETE' and (tg_op = 'INSERT' or new.proceso_id <> old.proceso_id) then
      perform cafe.verificar_baches_proceso(new.proceso_id);
    end if;
  end if;
  return null;
end $$;

create constraint trigger procesos_baches_cuadran
  after insert or update of peso_entrada_kg, peso_salida_kg, tipo on cafe.procesos
  deferrable initially deferred
  for each row execute function cafe.procesos_verificar_baches();

create constraint trigger baches_cuadran
  after insert or update of peso_entrada_kg, peso_salida_kg, proceso_id or delete on cafe.baches
  deferrable initially deferred
  for each row execute function cafe.procesos_verificar_baches();

-- 6.2 Protección y anulación. Un proceso no nace en un lote anulado; uno anulado ya no se toca. Anular es un
-- UPDATE de `owner`/`admin` (RLS) y solo si NINGÚN proceso vigente posterior usa alguno de sus bultos
-- (`proceso_con_dependientes`); quién y cuándo anula lo fija la base. Al anular, el trigger AFTER libera los
-- bultos (borra sus filas de `proceso_bultos`) para que puedan volver a procesarse.
create or replace function cafe.procesos_proteger()
returns trigger
language plpgsql
set search_path = ''
as $$
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
         select 1
           from cafe.proceso_bultos mio
           join cafe.proceso_bultos otro on otro.bulto_id = mio.bulto_id and otro.proceso_id <> mio.proceso_id
           join cafe.procesos po         on po.id = otro.proceso_id and po.anulado_at is null
          where mio.proceso_id = old.id
            and cafe.orden_proceso(po.tipo) > cafe.orden_proceso(old.tipo)) then
      raise exception using errcode = 'P0001', message = 'proceso_con_dependientes',
        detail = 'Hay procesos posteriores que dependen de este: anula primero el último proceso de esos bultos.';
    end if;
    new.anulado_at  := now();
    new.anulado_por := coalesce(auth.uid(), new.anulado_por);
  end if;
  return new;
end $$;

create trigger procesos_proteger before insert or update on cafe.procesos
  for each row execute function cafe.procesos_proteger();

create or replace function cafe.procesos_liberar_bultos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  delete from cafe.proceso_bultos where proceso_id = new.id;
  return null;
end $$;

create trigger procesos_liberar_bultos after update of anulado_at on cafe.procesos
  for each row when (old.anulado_at is null and new.anulado_at is not null)
  execute function cafe.procesos_liberar_bultos();

-- Los bultos de un proceso vigente no se sueltan a mano: se anula el proceso. (Si el proceso ya no existe, es
-- el borrado en cascada.)
create or replace function cafe.proceso_bultos_proteger()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from cafe.procesos p where p.id = old.proceso_id and p.anulado_at is null) then
    raise exception using errcode = 'P0001', message = 'proceso_vigente',
      detail = 'Los bultos de un proceso vigente no se liberan a mano: anula el proceso.';
  end if;
  return old;
end $$;

create trigger proceso_bultos_proteger before delete on cafe.proceso_bultos
  for each row execute function cafe.proceso_bultos_proteger();

-- 7. Registrar un proceso ---------------------------------------------------------------------------------------------------
-- Núcleo común de `registrar_proceso` y, desde CO-30, de `registrar_empaque`: valida y escribe el proceso, sus
-- bultos y sus baches. Todo en la transacción del llamante; si algo falla no queda nada.
--
--   p_bultos: ids de `cafe.lote_bultos`; vacío solo se admite en un lote de UN bulto (se toma ese).
--   p_entrada: NULL = el peso disponible (`peso_disponible`); si se envía y supera el disponible en más de
--              0,5 % → `peso_supera_disponible`.
--   p_salida: obligatoria salvo en tostión con baches (entonces es la suma de sus salidas).
--   p_nivel: solo tostión; NULL = el del lote (servicio). Obligatorio en marca propia.
--   p_baches: [{ peso_entrada_kg, peso_salida_kg, temperatura_c?, observaciones? }, …]; obligatorio en tostión y
--             prohibido en el resto. Se numeran 1..n en el orden recibido.
-- Errores de negocio (P0001): lote_no_encontrado, lote_anulado, servicio_no_contratado, marca_propia_sin_trilla,
-- bulto_invalido, bulto_ya_procesado, orden_proceso_invalido, peso_supera_disponible, salida_supera_entrada,
-- baches_no_cuadran, falta_nivel_tueste, datos_invalidos y tarifa_no_definida (del núcleo). Sin permiso: 42501.
-- Devuelve { id, merma_kg, merma_pct, desvio, valor, lote_estado, peso_entrada_kg, peso_salida_kg, tarifa_kg,
-- avance_texto }.
create or replace function cafe._insertar_proceso(
  p_lote          uuid,
  p_tipo          cafe.tipo_proceso,
  p_fecha         date,
  p_bultos        uuid[],
  p_entrada       numeric,
  p_salida        numeric,
  p_nivel         cafe.nivel_tueste,
  p_baches        jsonb,
  p_observaciones text
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
                             merma_referencia_pct, tolerancia_pts, nivel_tueste, observaciones)
  values (p_lote, p_tipo, p_fecha, v_entrada, v_salida, v_tarifa, v_ref, v_tol, v_nivel,
          nullif(btrim(coalesce(p_observaciones, '')), ''))
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

-- Entrada (jsonb; todo lo demás se ignora):
--   { "lote_id": uuid, "tipo": "tostion", "fecha": "2026-11-06", "bultos": [uuid, …],
--     "peso_entrada_kg": 81.0 | null, "peso_salida_kg": 66.4 | null, "nivel_tueste": "medio" | null,
--     "baches": [{ "peso_entrada_kg": 13.5, "peso_salida_kg": 11.1, "temperatura_c": 210 }, …] | null,
--     "observaciones": null }
-- Salida: ver `_insertar_proceso`. El empaque de MARCA PROPIA no se registra aquí (`usar_registrar_empaque`).
create or replace function cafe.registrar_proceso(p jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_lote    uuid;
  v_tipo    cafe.tipo_proceso;
  v_fecha   date;
  v_bultos  uuid[];
  v_entrada numeric;
  v_salida  numeric;
  v_nivel   cafe.nivel_tueste;
  v_baches  jsonb;
  v_obs     text;
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

    if jsonb_typeof(p -> 'bultos') = 'array' then
      if exists (select 1 from jsonb_array_elements(p -> 'bultos') e where jsonb_typeof(e) <> 'string') then
        raise exception using errcode = '22023';
      end if;
      v_bultos := array(select (e #>> '{}')::uuid from jsonb_array_elements(p -> 'bultos') e);
    elsif p ? 'bultos' and jsonb_typeof(p -> 'bultos') <> 'null' then
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
  exception when others then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El proceso no tiene el formato esperado.';
  end;

  -- El empaque de marca propia mueve inventario (bolsas, etiquetas, producto terminado): su RPC es otra.
  if v_tipo = 'empaque' and exists (select 1 from cafe.lotes l where l.id = v_lote and l.linea = 'marca_propia') then
    raise exception using errcode = 'P0001', message = 'usar_registrar_empaque',
      detail = 'El empaque de marca propia se registra con las presentaciones y los insumos: usa el formulario de empaque.';
  end if;

  return cafe._insertar_proceso(v_lote, v_tipo, v_fecha, v_bultos, v_entrada, v_salida, v_nivel, v_baches, v_obs);
end $$;

-- 8. Anular un proceso ----------------------------------------------------------------------------------------------------
-- Solo `owner`/`admin`, con motivo, y solo si es el ÚLTIMO proceso de esos bultos (`proceso_con_dependientes`).
-- Conserva el proceso (auditado, con `anulado_at`) y libera sus bultos. Devuelve { id, lote_id, lote_estado,
-- bultos_liberados }.
create or replace function cafe.anular_proceso(p_proceso uuid, p_motivo text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_lote     uuid;
  v_anulado  timestamptz;
  v_liberados integer;
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

  select count(*) into v_liberados from cafe.proceso_bultos pb where pb.proceso_id = p_proceso;

  -- El trigger comprueba los dependientes, fija quién y cuándo anula y libera los bultos.
  update cafe.procesos
     set anulado_at = now(), motivo_anulacion = btrim(p_motivo)
   where id = p_proceso;

  select v.estado into v_estado from cafe.v_lotes v where v.id = v_lote;

  return jsonb_build_object('id', p_proceso, 'lote_id', v_lote, 'lote_estado', v_estado,
                            'bultos_liberados', v_liberados);
end $$;

-- 9. Privilegios de las funciones -----------------------------------------------------------------------------------------------
-- Las de negocio las llaman los usuarios (RPC); las de los triggers, nadie a mano. `_insertar_proceso` es
-- ejecutable porque la llaman las RPC como SECURITY INVOKER (se comprueba el EXECUTE del usuario), pero es
-- interna: la app llama a `registrar_proceso` / `registrar_empaque`.

revoke all on function cafe.parametro_numero(text, numeric) from public, anon;
grant execute on function cafe.parametro_numero(text, numeric) to authenticated, service_role;
revoke all on function cafe.instante_fecha(date) from public, anon;
grant execute on function cafe.instante_fecha(date) to authenticated, service_role;
revoke all on function cafe.pasos_del_lote(uuid) from public, anon;
grant execute on function cafe.pasos_del_lote(uuid) to authenticated, service_role;
revoke all on function cafe.paso_previo(uuid, cafe.tipo_proceso, uuid) from public, anon;
grant execute on function cafe.paso_previo(uuid, cafe.tipo_proceso, uuid) to authenticated, service_role;
revoke all on function cafe.peso_disponible(uuid, cafe.tipo_proceso, uuid[]) from public, anon;
grant execute on function cafe.peso_disponible(uuid, cafe.tipo_proceso, uuid[]) to authenticated, service_role;
revoke all on function cafe.sugerir_baches(numeric) from public, anon;
grant execute on function cafe.sugerir_baches(numeric) to authenticated, service_role;
revoke all on function cafe.verificar_baches_proceso(uuid) from public, anon;
grant execute on function cafe.verificar_baches_proceso(uuid) to authenticated, service_role;
revoke all on function cafe._insertar_proceso(uuid, cafe.tipo_proceso, date, uuid[], numeric, numeric, cafe.nivel_tueste, jsonb, text) from public, anon;
grant execute on function cafe._insertar_proceso(uuid, cafe.tipo_proceso, date, uuid[], numeric, numeric, cafe.nivel_tueste, jsonb, text) to authenticated;
revoke all on function cafe.registrar_proceso(jsonb) from public, anon;
grant execute on function cafe.registrar_proceso(jsonb) to authenticated;
revoke all on function cafe.anular_proceso(uuid, text) from public, anon;
grant execute on function cafe.anular_proceso(uuid, text) to authenticated;
revoke all on function cafe.procesos_verificar_baches() from public, anon, authenticated;
revoke all on function cafe.procesos_proteger() from public, anon, authenticated;
revoke all on function cafe.procesos_liberar_bultos() from public, anon, authenticated;
revoke all on function cafe.proceso_bultos_proteger() from public, anon, authenticated;

-- 10. RLS y privilegios ---------------------------------------------------------------------------------------------------------------
-- El módulo `cafe.procesos` se exige en todas las políticas. Lectura: cualquier miembro. INSERT: owner, admin y
-- operativo (lo usan las RPC SECURITY INVOKER). UPDATE de `procesos` (anulación y notas): owner y admin. DELETE:
-- nadie, salvo `proceso_bultos` a `owner`/`admin` para liberar los bultos de un proceso ANULADO (lo hace el
-- trigger; el de `proceso_bultos_proteger` impide soltar los de un proceso vigente). Los baches no se editan.

alter table cafe.procesos       enable row level security;
alter table cafe.proceso_bultos enable row level security;
alter table cafe.baches         enable row level security;

create policy procesos_select on cafe.procesos for select to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.procesos')));

create policy procesos_insert on cafe.procesos for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.procesos'))
              and (select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'));

create policy procesos_update on cafe.procesos for update to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.procesos'))
         and (select public.rol_en_tenant()) in ('owner', 'admin'))
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.procesos'))
              and (select public.rol_en_tenant()) in ('owner', 'admin'));

create policy proceso_bultos_select on cafe.proceso_bultos for select to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.procesos')));

create policy proceso_bultos_insert on cafe.proceso_bultos for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.procesos'))
              and (select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'));

create policy proceso_bultos_delete on cafe.proceso_bultos for delete to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.procesos'))
         and (select public.rol_en_tenant()) in ('owner', 'admin'));

create policy baches_select on cafe.baches for select to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.procesos')));

create policy baches_insert on cafe.baches for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.procesos'))
              and (select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'));

-- Los privilegios por defecto del schema `cafe` dan también DELETE: se quitan y se da solo lo necesario.
-- INSERT por columnas en `procesos`: lo calculado (merma, valor, desvío) y la anulación no se escriben; de un
-- proceso solo se corrigen las observaciones o se anula (quién y cuándo los fija el trigger).
revoke all on table cafe.procesos       from public, anon, authenticated, service_role;
revoke all on table cafe.proceso_bultos from public, anon, authenticated, service_role;
revoke all on table cafe.baches         from public, anon, authenticated, service_role;

grant select on table cafe.procesos, cafe.proceso_bultos, cafe.baches to authenticated;
grant insert (tenant_id, lote_id, tipo, fecha, peso_entrada_kg, peso_salida_kg, tarifa_kg, merma_referencia_pct,
              tolerancia_pts, nivel_tueste, observaciones)
  on table cafe.procesos to authenticated;
grant update (observaciones, anulado_at, motivo_anulacion) on table cafe.procesos to authenticated;
grant insert (tenant_id, proceso_id, bulto_id, tipo, lote_id) on table cafe.proceso_bultos to authenticated;
grant delete on table cafe.proceso_bultos to authenticated;
grant insert (tenant_id, proceso_id, numero, peso_entrada_kg, peso_salida_kg, temperatura_c, observaciones)
  on table cafe.baches to authenticated;

grant select, insert, update on table cafe.procesos to service_role;
grant select, insert, delete on table cafe.proceso_bultos to service_role;
grant select, insert on table cafe.baches to service_role;

revoke all on table cafe.v_proceso_bultos_peso from public, anon, authenticated, service_role;
revoke all on table cafe.v_bultos_estado       from public, anon, authenticated, service_role;
revoke all on table cafe.v_lote_etapas         from public, anon, authenticated, service_role;
revoke all on table cafe.v_lotes               from public, anon, authenticated, service_role;
grant select on table cafe.v_proceso_bultos_peso, cafe.v_bultos_estado, cafe.v_lote_etapas, cafe.v_lotes
  to authenticated, service_role;

-- 11. Auditoría ---------------------------------------------------------------------------------------------------------------------------

select audit.activar('cafe.procesos');
select audit.activar('cafe.proceso_bultos');
select audit.activar('cafe.baches');
