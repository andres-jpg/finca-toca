-- ADR 0002 (FIN-142 · T-01) · migración 1 de 9 · B-01 (FIN-144), SOLO EXPAND.
--
-- Prepara el saldo por kilos sin bultos: enlace explícito entre etapas (`procesos.origen_proceso_id`), pesos de salida
-- opcionales (la tostión ya no tiene salida propia: B-05/B-08), `lotes.num_bultos` opcional, las funciones nuevas de saldo y
-- la vista `v_origenes_disponibles` (fuente única del saldo). NO cambia ningún comportamiento: ninguna RPC ni vista
-- existente usa todavía lo nuevo (eso llega en `..._saldo_kg_corte`, tras el backfill del enlace).

-- 1) Enlace al proceso previo ------------------------------------------------------------------------------------
alter table cafe.procesos
  add column origen_proceso_id uuid,
  add column origen_tipo cafe.tipo_proceso;

-- FK compuesta por cliente, lote y tipo: el origen es del mismo cliente y del mismo lote por construcción (la comprobación
-- de una FK salta el RLS). `origen_tipo` está denormalizado solo para esta FK (mismo patrón que `proceso_bultos.tipo`).
alter table cafe.procesos
  add constraint procesos_origen_fk foreign key (tenant_id, origen_proceso_id, origen_tipo, lote_id)
    references cafe.procesos (tenant_id, id, tipo, lote_id) on delete restrict,
  add constraint procesos_origen_ck check ((origen_proceso_id is null) = (origen_tipo is null)),
  add constraint procesos_origen_reapertura_ck check (origen_proceso_id is null or reapertura_id is null);

comment on column cafe.procesos.origen_proceso_id is
  'Proceso previo del que consume kilos (null = primera etapa: sale de lotes.peso_recibido_kg). ADR 0002.';
comment on column cafe.procesos.origen_tipo is
  'Tipo del proceso de origen, denormalizado para la FK compuesta. Debe ser cafe.paso_origen(lote, tipo).';

-- Las RPC (security invoker) insertan el proceso como el usuario: el enlace entra por columna, como el resto.
grant insert (origen_proceso_id, origen_tipo) on table cafe.procesos to authenticated;

-- Dependientes y saldo de un origen: solo procesos vigentes.
create index procesos_origen_idx on cafe.procesos (origen_proceso_id)
  where origen_proceso_id is not null and anulado_at is null;

-- 2) Salidas y bultos opcionales ----------------------------------------------------------------------------------
-- Los CHECK `salida >= 0 and salida <= entrada` siguen valiendo: con NULL no se evalúan.
alter table cafe.procesos alter column peso_salida_kg drop not null;
alter table cafe.baches alter column peso_salida_kg drop not null;
alter table cafe.lotes alter column num_bultos drop not null;

-- 3) Funciones nuevas -----------------------------------------------------------------------------------------
-- Tolerancia única del saldo: la mayor de 0,05 kg y el 0,5 % de la base (la misma que ya aplicaba `peso_supera_disponible`).
-- Espejo TS: src/modules/cafe/procesos/lib/saldo.ts (casos compartidos en Vitest y pgTAP).
create or replace function cafe.saldo_tolerancia_kg(p_base numeric)
returns numeric
language sql
immutable
parallel safe
set search_path = ''
as $$
  select greatest(0.05, coalesce(p_base, 0) * 0.005)
$$;

-- Tipo de proceso del que un paso consume kilos. Se salta la molienda (es una confirmación, no un eslabón de la cadena de
-- kilos): el empaque siempre enlaza a su tostión (o a la trilla si el lote no lleva tostión). NULL = la raíz del lote.
create or replace function cafe.paso_origen(p_lote uuid, p_tipo cafe.tipo_proceso)
returns cafe.tipo_proceso
language plpgsql
stable
set search_path = ''
as $$
declare
  v_linea     cafe.linea_lote;
  v_servicios cafe.tipo_proceso[];
begin
  select l.linea, l.servicios into v_linea, v_servicios from cafe.lotes l where l.id = p_lote;
  if not found or p_tipo = 'trilla' then
    return null;
  end if;

  if v_linea = 'servicio' then
    return (select s
              from unnest(v_servicios) s
             where s <> 'molienda' and cafe.orden_proceso(s) < cafe.orden_proceso(p_tipo)
             order by cafe.orden_proceso(s) desc
             limit 1);
  end if;

  -- Marca propia: se compra trillada. La tostión sale de la raíz; molienda y empaque cuelgan de la tostión.
  return case when p_tipo = 'tostion' then null else 'tostion'::cafe.tipo_proceso end;
end $$;

-- Fuente única del saldo (ADR 0002 §3): una fila por origen posible de cada lote, la raíz (`proceso_id` null) y cada
-- proceso vigente que consume kilos (trilla, tostión y empaque). La molienda no consume saldo ni es origen; la reapertura
-- tampoco (sigue fuera del avance del lote).
--   base_kg      salida del proceso si la tiene; si no (tostión antes de su empaque), su entrada. Raíz: peso recibido.
--   consumido_kg Σ entrada de los procesos vigentes que lo tienen como origen.
--   estimado     tostión sin salida (tanda en curso).
create view cafe.v_origenes_disponibles with (security_invoker = true) as
select l.tenant_id,
       l.id                                       as lote_id,
       null::uuid                                 as proceso_id,
       null::cafe.tipo_proceso                    as tipo,
       l.peso_recibido_kg                         as base_kg,
       coalesce(c.kg, 0)                          as consumido_kg,
       l.peso_recibido_kg - coalesce(c.kg, 0)     as saldo_kg,
       false                                      as estimado
  from cafe.lotes l
  left join lateral (
    select sum(d.peso_entrada_kg) as kg
      from cafe.procesos d
     where d.lote_id = l.id and d.origen_proceso_id is null
       and d.anulado_at is null and d.reapertura_id is null and d.tipo <> 'molienda'
  ) c on true
union all
select p.tenant_id,
       p.lote_id,
       p.id,
       p.tipo,
       coalesce(p.peso_salida_kg, p.peso_entrada_kg),
       coalesce(c.kg, 0),
       coalesce(p.peso_salida_kg, p.peso_entrada_kg) - coalesce(c.kg, 0),
       p.tipo = 'tostion' and p.peso_salida_kg is null
  from cafe.procesos p
  left join lateral (
    select sum(d.peso_entrada_kg) as kg
      from cafe.procesos d
     where d.origen_proceso_id = p.id and d.anulado_at is null and d.tipo <> 'molienda'
  ) c on true
 where p.anulado_at is null and p.reapertura_id is null and p.tipo in ('trilla', 'tostion', 'empaque');

grant select on cafe.v_origenes_disponibles to authenticated, service_role;

-- Saldo de un proceso (null si no es un origen vigente).
create or replace function cafe.saldo_proceso(p_proceso uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select o.saldo_kg from cafe.v_origenes_disponibles o where o.proceso_id = p_proceso
$$;

revoke execute on function cafe.saldo_tolerancia_kg(numeric), cafe.paso_origen(uuid, cafe.tipo_proceso),
  cafe.saldo_proceso(uuid) from public, anon;
grant execute on function cafe.saldo_tolerancia_kg(numeric), cafe.paso_origen(uuid, cafe.tipo_proceso),
  cafe.saldo_proceso(uuid) to authenticated, service_role;
