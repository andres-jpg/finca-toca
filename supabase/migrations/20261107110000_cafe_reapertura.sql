-- Vertical café: reapertura de producto empacado de marca propia (FIN-114 · CO-33, HU-F1-16).
--
-- Reabrir es devolver a granel parte de lo ya empacado de un lote de marca propia para MOLERLO y/o REEMPACARLO en
-- otra presentación (un pedido de 2.500 g molido) sin perder de qué lote viene el café.
--
--  1. `cafe.reaperturas`: qué lote, qué presentación y cuántas unidades se reabrieron (con su peso, generado). Es el
--     "peso inicial" del trabajo que sigue. Sin DELETE ni cambios salvo la nota; auditada.
--  2. `cafe.procesos.reapertura_id` (desde CO-27 sin FK, «pendiente de CO-33») pasa a ser una FK compuesta
--     (cliente, reapertura, lote): un proceso de reapertura es del MISMO lote que la reapertura. Solo `molienda` o
--     `empaque`, a lo sumo uno de cada uno por reapertura, y SIN bultos (el café reabierto ya no está en los bultos
--     del lote: el origen se conserva por la reapertura).
--  3. `cafe.reabrir_producto(p jsonb)`: una transacción que valida el saldo reabrible del lote, el stock global del
--     producto terminado, inserta la reapertura y descuenta el inventario (motivo `reapertura`, sin permitir negativo).
--  4. `cafe.registrar_proceso` y `cafe.registrar_empaque` aceptan `reapertura_id` en lugar de bultos (molienda y/o
--     empaque). El núcleo del proceso de reapertura es `cafe._insertar_proceso_reapertura`; el de bultos
--     (`_insertar_proceso`) no cambia.
--  5. Los procesos de reapertura NO cuentan como avance del lote: `v_lote_etapas`, `servicios_requeridos()` y
--     `orden_ultimo_proceso()` los ignoran. Se muestran aparte (`v_reaperturas`).
--  6. Vistas `v_saldo_reabrible` (empacado − reabierto por lote y presentación) y `v_reaperturas` (estado derivado:
--     pendiente → en_proceso → completada), ambas `security_invoker`; nada de estados guardados.
--
-- SUPUESTO (HU-16): el producto terminado se lleva por tipo × presentación, NO por lote (las ventas no dicen de qué
-- lote sale cada bolsa). Por eso el «saldo empacado» de un lote es lo empacado de él en esa presentación menos lo ya
-- reabierto de él, y además tiene que haber stock global suficiente: no se reabre lo que ya se vendió. Lo empacado
-- a partir de una reapertura sigue siendo café de ese lote y cuenta en su saldo.
--
-- Solo crea objetos nuevos o redefine funciones/vistas con las mismas firmas: segura en bases con datos. Los
-- procesos existentes tienen `reapertura_id` NULL, así que nada cambia para ellos.

-- 1. Tabla -----------------------------------------------------------------------------------------------------------

create table cafe.reaperturas (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.tenant_actual() references public.tenants,
  lote_id         uuid not null,
  articulo_pt_id  uuid not null,                                       -- producto terminado que se reabre (tipo × presentación)
  presentacion_g  integer not null check (presentacion_g > 0),
  unidades        integer not null check (unidades > 0),
  peso_kg         numeric(10,3) generated always as (unidades * presentacion_g / 1000.0) stored,
  fecha           date not null check (fecha between date '2000-01-01' and date '2100-12-31'),
  motivo          text check (motivo is null or (btrim(motivo) <> '' and char_length(motivo) <= 500)),
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references auth.users,
  updated_at      timestamptz,
  updated_by      uuid references auth.users,
  constraint reaperturas_tenant_id_uk unique (tenant_id, id),
  constraint reaperturas_ref_uk unique (tenant_id, id, lote_id),       -- destino de la FK de procesos
  -- Mismo cliente que el lote y que el producto, garantizado por la base (la comprobación de una FK salta el RLS).
  constraint reaperturas_lote_fk foreign key (tenant_id, lote_id)
    references cafe.lotes (tenant_id, id) on delete restrict,
  constraint reaperturas_articulo_fk foreign key (tenant_id, articulo_pt_id)
    references public.articulos (tenant_id, id) on delete restrict
);

create index on cafe.reaperturas (tenant_id, lote_id);
create index on cafe.reaperturas (tenant_id, fecha desc);

create trigger set_updated before update on cafe.reaperturas
  for each row execute function public.set_updated();

-- Solo se reabre un lote de MARCA PROPIA y que no esté anulado (la RPC lo comprueba antes; esto lo repite para
-- quien inserte directo). Nunca café de terceros: ese no es nuestro para moler ni vender.
create or replace function cafe.reaperturas_verificar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_linea cafe.linea_lote;
  v_anulado timestamptz;
begin
  select l.linea, l.anulado_at into v_linea, v_anulado from cafe.lotes l where l.id = new.lote_id;
  if v_linea is distinct from 'marca_propia' then
    raise exception using errcode = 'P0001', message = 'reapertura_solo_marca_propia',
      detail = 'Solo se reabre producto empacado de un lote de marca propia, nunca café de un cliente.';
  end if;
  if v_anulado is not null then
    raise exception using errcode = 'P0001', message = 'lote_anulado',
      detail = 'El lote está anulado: ya no se puede modificar.';
  end if;
  return new;
end $$;

create trigger reaperturas_verificar before insert on cafe.reaperturas
  for each row execute function cafe.reaperturas_verificar();

-- 2. El proceso cuelga de una reapertura -------------------------------------------------------------------------------

alter table cafe.procesos
  add constraint procesos_reapertura_fk foreign key (tenant_id, reapertura_id, lote_id)
    references cafe.reaperturas (tenant_id, id, lote_id) on delete restrict,
  add constraint proceso_reapertura_tipo_ck check (reapertura_id is null or tipo in ('molienda', 'empaque'));

-- Una reapertura admite como máximo una molienda y un empaque vigentes (anular uno permite registrarlo de nuevo).
create unique index procesos_reapertura_tipo_uk on cafe.procesos (reapertura_id, tipo)
  where reapertura_id is not null and anulado_at is null;
create index on cafe.procesos (reapertura_id) where reapertura_id is not null;

grant insert (reapertura_id) on table cafe.procesos to authenticated;

-- Un proceso de reapertura no pasa bultos: el café reabierto ya no está en los bultos del lote.
create or replace function cafe.proceso_bultos_sin_reapertura()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from cafe.procesos p where p.id = new.proceso_id and p.reapertura_id is not null) then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'Un proceso de reapertura no lleva bultos: trabaja el café reabierto.';
  end if;
  return new;
end $$;

create trigger proceso_bultos_sin_reapertura before insert on cafe.proceso_bultos
  for each row execute function cafe.proceso_bultos_sin_reapertura();

-- Anular: igual que `procesos_proteger` de CO-27, más una regla para la reapertura: no se anula la molienda si ya
-- hay un empaque vigente hecho con su salida (`proceso_con_dependientes`; se anula de atrás hacia delante).
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
            and cafe.orden_proceso(po.tipo) > cafe.orden_proceso(old.tipo))
       or (old.reapertura_id is not null and old.tipo = 'molienda'
           and exists (select 1 from cafe.procesos po
                        where po.reapertura_id = old.reapertura_id and po.tipo = 'empaque' and po.anulado_at is null)) then
      raise exception using errcode = 'P0001', message = 'proceso_con_dependientes',
        detail = 'Hay procesos posteriores que dependen de este: anula primero el último proceso de esos bultos.';
    end if;
    new.anulado_at  := now();
    new.anulado_por := coalesce(auth.uid(), new.anulado_por);
  end if;
  return new;
end $$;

-- 3. Los procesos de reapertura no cuentan como avance del lote ---------------------------------------------------------
-- El lote avanza con los bultos que pasan por cada paso. La molienda o el empaque de un café reabierto son trabajo
-- sobre OTRA cosa (lo reabierto), así que ni suman bultos procesados ni hacen "listo" o "parcial" al lote.

create or replace view cafe.v_lote_etapas with (security_invoker = true) as
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
  where p.anulado_at is null and p.reapertura_id is null
  group by p.tenant_id, p.lote_id, p.tipo
) e
join cafe.lotes l on l.id = e.lote_id
left join lateral (
  select count(*) as n from cafe.proceso_bultos pb where pb.lote_id = e.lote_id and pb.tipo = e.tipo
) b on true;

-- Misma definición que en CO-27 con un cambio: la molienda de una reapertura no hace que el lote «ya molió».
create or replace function cafe.servicios_requeridos(l cafe.lotes)
returns cafe.tipo_proceso[]
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_molienda boolean := false;
begin
  if l.linea = 'servicio' then
    return l.servicios;
  end if;

  if to_regclass('cafe.procesos') is not null then
    execute 'select exists (select 1 from cafe.procesos where lote_id = $1 and tipo = ''molienda'' and anulado_at is null and reapertura_id is null)'
      into v_molienda using l.id;
  end if;

  return case when v_molienda
              then array['tostion', 'molienda', 'empaque']::cafe.tipo_proceso[]
              else array['tostion', 'empaque']::cafe.tipo_proceso[] end;
end $$;

create or replace function cafe.orden_ultimo_proceso(p_lote uuid)
returns smallint
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_orden smallint;
begin
  if to_regclass('cafe.procesos') is null then
    return null;
  end if;
  execute 'select max(cafe.orden_proceso(tipo)) from cafe.procesos where lote_id = $1 and anulado_at is null and reapertura_id is null'
    into v_orden using p_lote;
  return v_orden;
end $$;

-- 4. Saldo reabrible y estado de las reaperturas -----------------------------------------------------------------------------
-- Saldo reabrible de un lote en una presentación = unidades empacadas de ese lote (de cualquier empaque vigente,
-- también el hecho a partir de una reapertura) − unidades ya reabiertas de ese lote. NO mira el stock global:
-- eso lo exige además la RPC.

create view cafe.v_saldo_reabrible with (security_invoker = true) as
select
  e.tenant_id,
  e.lote_id,
  e.presentacion_g,
  e.articulo_pt_id,
  e.unidades_empacadas,
  coalesce(r.unidades, 0)::integer                           as unidades_reabiertas,
  (e.unidades_empacadas - coalesce(r.unidades, 0))::integer  as saldo
from (
  select
    p.tenant_id, p.lote_id, el.presentacion_g,
    (array_agg(el.articulo_pt_id order by p.created_at desc))[1] as articulo_pt_id,
    sum(el.unidades)::integer                                    as unidades_empacadas
  from cafe.empaque_lineas el
  join cafe.procesos p on p.id = el.proceso_id and p.anulado_at is null
  group by p.tenant_id, p.lote_id, el.presentacion_g
) e
left join (
  select r.tenant_id, r.lote_id, r.presentacion_g, sum(r.unidades) as unidades
    from cafe.reaperturas r
   group by r.tenant_id, r.lote_id, r.presentacion_g
) r on r.tenant_id = e.tenant_id and r.lote_id = e.lote_id and r.presentacion_g = e.presentacion_g;

create or replace function cafe.saldo_reabrible(p_lote uuid, p_presentacion integer)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((select s.saldo from cafe.v_saldo_reabrible s
                    where s.lote_id = p_lote and s.presentacion_g = p_presentacion), 0)
$$;

-- Cada reapertura con su avance: `pendiente` (sin proceso), `en_proceso` (molida, falta empacar) o `completada`
-- (empacada). DERIVADO de los procesos vigentes; anular la molienda la devuelve a `pendiente`.
create view cafe.v_reaperturas with (security_invoker = true) as
select
  r.id,
  r.tenant_id,
  r.lote_id,
  l.codigo                                  as lote_codigo,
  l.tipo_cafe_id,
  tc.nombre                                 as tipo_cafe_nombre,
  r.articulo_pt_id,
  a.nombre                                  as producto,
  r.presentacion_g,
  r.unidades,
  r.peso_kg,
  r.fecha,
  r.motivo,
  r.created_at,
  r.created_by,
  m.id                                      as molienda_id,
  m.peso_salida_kg                          as molienda_salida_kg,
  e.id                                      as empaque_id,
  case when e.id is not null then 'completada'
       when m.id is not null then 'en_proceso'
       else 'pendiente' end                 as estado,
  case when e.id is not null then 0
       else coalesce(m.peso_salida_kg, r.peso_kg) end::numeric(12,3) as peso_disponible_kg
from cafe.reaperturas r
join cafe.lotes l on l.id = r.lote_id
left join cafe.tipos_cafe tc on tc.id = l.tipo_cafe_id
left join public.articulos a on a.id = r.articulo_pt_id
left join lateral (
  select p.id, p.peso_salida_kg from cafe.procesos p
   where p.reapertura_id = r.id and p.tipo = 'molienda' and p.anulado_at is null limit 1
) m on true
left join lateral (
  select p.id from cafe.procesos p
   where p.reapertura_id = r.id and p.tipo = 'empaque' and p.anulado_at is null limit 1
) e on true;

-- Peso que entra al paso `p_tipo` de una reapertura: la molienda parte de todo lo reabierto; el empaque, de la
-- salida de la molienda vigente (si la hay) o de lo reabierto. NULL si la reapertura no existe o el paso no aplica.
create or replace function cafe.peso_disponible_reapertura(p_reapertura uuid, p_tipo cafe.tipo_proceso)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select case
           when p_tipo = 'molienda' then r.peso_kg
           when p_tipo = 'empaque' then coalesce(
             (select m.peso_salida_kg from cafe.procesos m
               where m.reapertura_id = r.id and m.tipo = 'molienda' and m.anulado_at is null), r.peso_kg)
         end
    from cafe.reaperturas r
   where r.id = p_reapertura
$$;

-- 5. Reabrir producto ----------------------------------------------------------------------------------------------------------
-- Entrada (jsonb; todo lo demás se ignora):
--   { "lote_id": uuid, "presentacion_g": 500, "unidades": 40, "fecha": "2026-11-15", "motivo": "Pedido de 2.500 g molido" }
-- Reglas, en este orden: permisos → formato → lote de marca propia y vigente (`reapertura_solo_marca_propia`) →
-- unidades ≤ saldo empacado del lote en esa presentación (`reapertura_supera_saldo_lote`) → unidades ≤ stock global del
-- producto (`reapertura_sin_stock`: lo ya vendido no se reabre). Inserta la reapertura y descuenta el inventario con
-- `registrar_movimientos` (motivo `reapertura`, `ref_tipo = 'cafe.lote'`, `ref_id` = el lote, SIN permitir negativo).
-- Todo o nada. Devuelve { id, peso_kg, lote_id, presentacion_g, unidades, producto, stock }.

create or replace function cafe.reabrir_producto(p jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_lote_id   uuid;
  v_g         numeric;
  v_u         numeric;
  v_fecha     date;
  v_motivo    text;
  v_lote      cafe.lotes;
  v_saldo     record;
  v_producto  text;
  v_stock     numeric;
  v_id        uuid;
  v_peso      numeric;
  v_mov       jsonb;
  v_etiqueta  text;
begin
  if not coalesce((select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'), false)
     or not coalesce((select public.tenant_tiene_modulo('cafe.procesos')), false) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La reapertura no tiene el formato esperado.';
  end if;

  -- Los tipos erróneos no deben acabar como un error inesperado de cast.
  begin
    if jsonb_typeof(p -> 'lote_id') is distinct from 'string'
       or jsonb_typeof(p -> 'presentacion_g') is distinct from 'number'
       or jsonb_typeof(p -> 'unidades') is distinct from 'number'
       or jsonb_typeof(p -> 'fecha') is distinct from 'string' then
      raise exception using errcode = '22023';
    end if;
    v_lote_id := (p ->> 'lote_id')::uuid;
    v_g       := (p ->> 'presentacion_g')::numeric;
    v_u       := (p ->> 'unidades')::numeric;
    v_fecha   := (p ->> 'fecha')::date;

    if jsonb_typeof(p -> 'motivo') = 'string' then
      v_motivo := nullif(btrim(p ->> 'motivo'), '');
    elsif p ? 'motivo' and jsonb_typeof(p -> 'motivo') <> 'null' then
      raise exception using errcode = '22023';
    end if;
  exception when others then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La reapertura no tiene el formato esperado.';
  end;

  if v_g <> trunc(v_g) or v_g < 1 or v_g > 99999 or v_u <> trunc(v_u) or v_u < 1 or v_u > 99999 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'La presentación y las unidades son números enteros mayores que cero.';
  end if;
  if v_fecha not between date '2000-01-01' and date '2100-12-31' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La fecha de la reapertura no es válida.';
  end if;
  if v_motivo is not null and char_length(v_motivo) > 500 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El motivo admite hasta 500 caracteres.';
  end if;

  -- Serializa por lote (la misma clave que los procesos): dos reaperturas a la vez no pueden gastar el mismo saldo.
  perform pg_advisory_xact_lock(hashtextextended('cafe.lote:' || v_lote_id::text, 0));

  select * into v_lote from cafe.lotes l where l.id = v_lote_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'lote_no_encontrado',
      detail = 'El lote no existe o no pertenece a tu cliente.';
  end if;
  if v_lote.anulado_at is not null then
    raise exception using errcode = 'P0001', message = 'lote_anulado',
      detail = 'El lote está anulado: ya no se puede modificar.';
  end if;
  if v_lote.linea <> 'marca_propia' then
    raise exception using errcode = 'P0001', message = 'reapertura_solo_marca_propia',
      detail = 'Solo se reabre producto empacado de un lote de marca propia, nunca café de un cliente.';
  end if;

  -- Saldo empacado del lote en esa presentación (empacado − ya reabierto).
  v_etiqueta := cafe.etiqueta_presentacion(v_g::integer);
  select s.articulo_pt_id, s.unidades_empacadas, s.unidades_reabiertas, s.saldo into v_saldo
    from cafe.v_saldo_reabrible s
   where s.lote_id = v_lote_id and s.presentacion_g = v_g::integer;
  if not found then
    raise exception using errcode = 'P0001', message = 'reapertura_supera_saldo_lote',
      detail = format('El lote %s no tiene nada empacado en %s.', v_lote.codigo, v_etiqueta);
  end if;
  if v_u > v_saldo.saldo then
    raise exception using errcode = 'P0001', message = 'reapertura_supera_saldo_lote',
      detail = format('Del lote %s solo quedan %s de %s por reabrir (empacadas %s, ya reabiertas %s).',
                      v_lote.codigo, v_saldo.saldo, v_etiqueta, v_saldo.unidades_empacadas, v_saldo.unidades_reabiertas);
  end if;

  -- Stock global: el producto se lleva por tipo × presentación, no por lote, y se puede haber vendido.
  select a.nombre into v_producto from public.articulos a where a.id = v_saldo.articulo_pt_id;
  select coalesce(s.stock, 0) into v_stock from public.v_stock s where s.articulo_id = v_saldo.articulo_pt_id;
  v_stock := coalesce(v_stock, 0);
  if v_u > v_stock then
    raise exception using errcode = 'P0001', message = 'reapertura_sin_stock',
      detail = format('Solo hay %s de %s en el inventario: lo demás ya salió (venta, cortesía, muestra…) y no se puede reabrir.',
                      trim_scale(v_stock), v_producto);
  end if;

  insert into cafe.reaperturas (lote_id, articulo_pt_id, presentacion_g, unidades, fecha, motivo)
  values (v_lote_id, v_saldo.articulo_pt_id, v_g::integer, v_u::integer, v_fecha, v_motivo)
  returning id, peso_kg into v_id, v_peso;

  -- Un día pasado se registra al final de ese día en la zona del cliente; hoy, ahora (igual que el empaque).
  v_mov := public.registrar_movimientos(
    jsonb_build_array(jsonb_build_object(
      'articulo_id', v_saldo.articulo_pt_id,
      'cantidad', -v_u::integer,
      'motivo', 'reapertura',
      'fecha', cafe.instante_fecha(v_fecha),
      'ref_tipo', 'cafe.lote',
      'ref_id', v_lote_id,
      'observaciones', 'Reapertura ' || v_lote.codigo || coalesce(' · ' || v_motivo, ''))),
    false);

  return jsonb_build_object(
    'id', v_id,
    'peso_kg', v_peso,
    'lote_id', v_lote_id,
    'presentacion_g', v_g::integer,
    'unidades', v_u::integer,
    'producto', v_producto,
    'stock', v_stock - v_u,
    'stocks', v_mov -> 'stocks');
end $$;

-- 6. Proceso de reapertura ------------------------------------------------------------------------------------------------------
-- Núcleo de la molienda y del empaque de un café reabierto. Hermano de `_insertar_proceso`, sin bultos ni baches:
--   · solo `molienda` o `empaque` (`reapertura_solo_molienda_empaque`);
--   · a lo sumo uno de cada tipo vigente (`reapertura_proceso_duplicado`); la molienda va antes del empaque;
--   · entrada = el peso disponible (`peso_disponible_reapertura`): la molienda, lo reabierto; el empaque, la salida de
--     la molienda (o lo reabierto si no se molió). Puede pasarse de él hasta un 0,5 % (`peso_supera_disponible`) y no
--     puede quedarse corta en más de un 0,5 %: una reapertura admite una sola molienda y un solo empaque, así que lo
--     que no entra se perdería de la trazabilidad;
--   · sin tarifa (marca propia no se cobra) ni merma de referencia (decisión 3 de CO-20); la tolerancia es la del cliente.
-- Devuelve lo mismo que `_insertar_proceso`.

create or replace function cafe._insertar_proceso_reapertura(
  p_reapertura    uuid,
  p_tipo          cafe.tipo_proceso,
  p_fecha         date,
  p_entrada       numeric,
  p_salida        numeric,
  p_observaciones text
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
                             merma_referencia_pct, tolerancia_pts, observaciones, reapertura_id)
  values (v_reap.lote_id, p_tipo, p_fecha, v_entrada, v_salida, 0, null, v_tol,
          nullif(btrim(coalesce(p_observaciones, '')), ''), p_reapertura)
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

-- `registrar_proceso` (CO-27) con `reapertura_id` opcional: con él se registra la molienda de un café reabierto, sin
-- bultos. Igual que antes en todo lo demás.
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

    if jsonb_typeof(p -> 'reapertura_id') = 'string' then
      v_reap := (p ->> 'reapertura_id')::uuid;
    elsif p ? 'reapertura_id' and jsonb_typeof(p -> 'reapertura_id') <> 'null' then
      raise exception using errcode = '22023';
    end if;
  exception when others then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El proceso no tiene el formato esperado.';
  end;

  -- Proceso sobre un café reabierto (HU-16): solo molienda o empaque, sin bultos ni baches ni tueste.
  if v_reap is not null then
    if v_tipo not in ('molienda', 'empaque') then
      raise exception using errcode = 'P0001', message = 'reapertura_solo_molienda_empaque',
        detail = 'El café reabierto ya está tostado: solo se muele o se empaca, sin repetir trilla ni tostión.';
    end if;
    if coalesce(cardinality(v_bultos), 0) > 0 or v_nivel is not null
       or (v_baches is not null and jsonb_array_length(v_baches) > 0) then
      raise exception using errcode = 'P0001', message = 'datos_invalidos',
        detail = 'Un proceso de reapertura no lleva bultos, baches ni nivel de tueste.';
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
  if v_tipo = 'empaque' and exists (select 1 from cafe.lotes l where l.id = v_lote and l.linea = 'marca_propia') then
    raise exception using errcode = 'P0001', message = 'usar_registrar_empaque',
      detail = 'El empaque de marca propia se registra con las presentaciones y los insumos: usa el formulario de empaque.';
  end if;

  if v_reap is not null then
    return cafe._insertar_proceso_reapertura(v_reap, v_tipo, v_fecha, v_entrada, v_salida, v_obs);
  end if;
  return cafe._insertar_proceso(v_lote, v_tipo, v_fecha, v_bultos, v_entrada, v_salida, v_nivel, v_baches, v_obs);
end $$;

-- `registrar_empaque` (CO-30) con `reapertura_id` opcional: empaca el café reabierto (o su molienda) en vez de bultos
-- del lote. Todo lo demás —presentaciones, bolsas, etiquetas, producto terminado del tipo del lote, movimientos,
-- advertencias— es idéntico: el nuevo producto nace del empaque, con `ref_tipo = 'cafe.proceso'`.
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
  if v_lote.linea <> 'marca_propia' then
    raise exception using errcode = 'P0001', message = 'usar_registrar_proceso',
      detail = 'El empaque de un lote de servicio no mueve inventario: regístralo como un paso más de la planta.';
  end if;

  -- Empaque de un café reabierto: es de ESTE lote y no lleva bultos.
  if v_reap is not null then
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
      v_res := cafe._insertar_proceso(v_lote_id, 'empaque', v_fecha, v_bultos, v_entrada, v_salida, null, null, v_obs);
    else
      v_res := cafe._insertar_proceso_reapertura(v_reap, 'empaque', v_fecha, v_entrada, v_salida, v_obs);
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
        detail = format('Empacarías %s kg y solo hay %s kg disponibles en %s. Empaca solo lo que hay%s.',
                        trim_scale(v_salida), trim_scale(v_disp),
                        case when v_reap is null then 'los bultos elegidos' else 'el café reabierto' end,
                        case when v_reap is null then ' o elige más bultos' else '' end);
    end if;
    raise exception using errcode = 'P0001', message = v_msg, detail = v_det;
  end;
  v_proc := (v_res ->> 'id')::uuid;

  -- Las líneas van ANTES de los movimientos: el trigger de producto terminado comprueba que existan.
  insert into cafe.empaque_lineas (proceso_id, presentacion_g, unidades, articulo_pt_id)
  select v_proc, (l ->> 'presentacion_g')::integer, (l ->> 'unidades')::integer, (l ->> 'producto_id')::uuid
    from jsonb_array_elements(v_det_lin) l;

  -- Movimientos: −bolsa, −etiqueta y +producto terminado por línea. Un día pasado se registra al final de ese
  -- día en la zona del cliente; hoy, ahora.
  v_fecha_mov := cafe.instante_fecha(v_fecha);
  for v_elem in select l from jsonb_array_elements(v_det_lin) l loop
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

  v_mov := public.registrar_movimientos(v_movs, true);

  -- Las advertencias con el nombre del artículo, para que la pantalla no tenga que buscarlo.
  for v_a in select x from jsonb_array_elements(v_mov -> 'advertencias') x loop
    select a.nombre into v_nombre from public.articulos a where a.id = (v_a ->> 'articulo_id')::uuid;
    v_adv := v_adv || jsonb_build_array(v_a || jsonb_build_object('articulo', v_nombre));
  end loop;

  return jsonb_build_object(
    'proceso_id', v_proc,
    'merma_kg', v_res -> 'merma_kg',
    'merma_pct', v_res -> 'merma_pct',
    'peso_entrada_kg', v_res -> 'peso_entrada_kg',
    'peso_salida_kg', v_res -> 'peso_salida_kg',
    'lote_estado', v_res -> 'lote_estado',
    'avance_texto', v_res -> 'avance_texto',
    'lineas', (select jsonb_agg(l - 'bolsa_id' - 'etiqueta_id' - 'bolsa' - 'etiqueta') from jsonb_array_elements(v_det_lin) l),
    'stocks', v_mov -> 'stocks',
    'advertencias', v_adv);
end $$;

-- 7. «Quién lo registró»: la reapertura también cuenta ---------------------------------------------------------------------------
-- Mismo cuerpo que en CO-32 (lote, procesos y remisiones) más quien reabrió producto del lote.

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
             select r.anulada_por from cafe.remisiones r where r.lote_id = p_lote and r.tenant_id = v_tenant
             union
             select re.created_by from cafe.reaperturas re where re.lote_id = p_lote and re.tenant_id = v_tenant)
       and exists (select 1 from public.tenant_members m where m.user_id = u.id and m.tenant_id = v_tenant);
end $$;

-- 8. RLS y privilegios ---------------------------------------------------------------------------------------------------------------
-- Como `procesos` (módulo `cafe.procesos`): lectura, cualquier miembro; INSERT, owner/admin/operativo (lo usa la RPC
-- SECURITY INVOKER); UPDATE solo del motivo, owner/admin; nadie borra (una reapertura ya descontó inventario).

alter table cafe.reaperturas enable row level security;

create policy reaperturas_select on cafe.reaperturas for select to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.procesos')));

create policy reaperturas_insert on cafe.reaperturas for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.procesos'))
              and (select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'));

create policy reaperturas_update on cafe.reaperturas for update to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.procesos'))
         and (select public.rol_en_tenant()) in ('owner', 'admin'))
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.procesos'))
              and (select public.rol_en_tenant()) in ('owner', 'admin'));

revoke all on table cafe.reaperturas from public, anon, authenticated, service_role;
grant select on table cafe.reaperturas to authenticated, service_role;
grant insert (tenant_id, lote_id, articulo_pt_id, presentacion_g, unidades, fecha, motivo)
  on table cafe.reaperturas to authenticated;
grant update (motivo) on table cafe.reaperturas to authenticated;
grant insert on table cafe.reaperturas to service_role;

revoke all on table cafe.v_saldo_reabrible from public, anon, authenticated, service_role;
revoke all on table cafe.v_reaperturas     from public, anon, authenticated, service_role;
grant select on table cafe.v_saldo_reabrible, cafe.v_reaperturas to authenticated, service_role;

-- Funciones: las RPC las llaman los usuarios; las de los triggers, nadie a mano. `_insertar_proceso_reapertura` es
-- ejecutable porque la llaman las RPC como SECURITY INVOKER, pero es interna.
revoke all on function cafe.saldo_reabrible(uuid, integer) from public, anon;
grant execute on function cafe.saldo_reabrible(uuid, integer) to authenticated, service_role;
revoke all on function cafe.peso_disponible_reapertura(uuid, cafe.tipo_proceso) from public, anon;
grant execute on function cafe.peso_disponible_reapertura(uuid, cafe.tipo_proceso) to authenticated, service_role;
revoke all on function cafe.reabrir_producto(jsonb) from public, anon;
grant execute on function cafe.reabrir_producto(jsonb) to authenticated;
revoke all on function cafe._insertar_proceso_reapertura(uuid, cafe.tipo_proceso, date, numeric, numeric, text) from public, anon;
grant execute on function cafe._insertar_proceso_reapertura(uuid, cafe.tipo_proceso, date, numeric, numeric, text) to authenticated;
revoke all on function cafe.reaperturas_verificar() from public, anon, authenticated;
revoke all on function cafe.proceso_bultos_sin_reapertura() from public, anon, authenticated;

-- 9. Auditoría ------------------------------------------------------------------------------------------------------------------------

select audit.activar('cafe.reaperturas');
