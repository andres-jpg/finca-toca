-- ADR 0002 (FIN-142 · T-01) · migración 2 de 9 · B-01 (FIN-144): foto previa y backfill del enlace.
--
-- 1) Foto previa de TODOS los lotes del vertical con la lógica de bultos de hoy (estado, avance, peso actual y, por paso,
--    completo/parcial y kg pendientes). La migración 3 (corte) la compara con lo que dan las vistas por kilos y la borra.
-- 2) Backfill de `procesos.origen_proceso_id`: para cada proceso vigente (sin reapertura), su origen es el proceso vigente
--    de tipo `paso_origen(lote, tipo)` al que pertenecen sus bultos. Si los bultos de un mismo proceso vienen de más de un
--    origen, o no tienen origen cuando debería haberlo, la migración FALLA con un listado (no adivina).
-- No cambia kilos: `lotes.peso_recibido_kg` ya es la suma de los bultos y cada proceso ya guarda su `peso_entrada_kg`.

-- 1) Foto previa -------------------------------------------------------------------------------------------------
create table cafe._saldo_kg_foto_lotes (
  lote_id        uuid primary key,
  codigo         text not null,
  estado         text,
  avance_texto   text,
  peso_actual_kg numeric
);
create table cafe._saldo_kg_foto_etapas (
  lote_id      uuid not null,
  tipo         cafe.tipo_proceso not null,
  completo     boolean,
  parcial      boolean,
  pendiente_kg numeric,
  primary key (lote_id, tipo)
);
-- Tablas de paso: sin acceso por la API (solo la migración las lee).
alter table cafe._saldo_kg_foto_lotes enable row level security;
alter table cafe._saldo_kg_foto_etapas enable row level security;
revoke all on cafe._saldo_kg_foto_lotes, cafe._saldo_kg_foto_etapas from public, anon, authenticated;

insert into cafe._saldo_kg_foto_lotes (lote_id, codigo, estado, avance_texto, peso_actual_kg)
select v.id, v.codigo, v.estado, v.avance_texto, v.peso_actual_kg from cafe.v_lotes v;

-- Kg pendientes de un paso con bultos: lo que pesan, a la entrada de ese paso, los bultos que aún no pasaron por él.
insert into cafe._saldo_kg_foto_etapas (lote_id, tipo, completo, parcial, pendiente_kg)
select e.lote_id, e.tipo, e.completo, e.parcial,
       (select coalesce(sum(coalesce(prev.salida_bulto_kg, b.peso_kg)), 0)
          from cafe.lote_bultos b
          left join lateral (
            select v.salida_bulto_kg
              from cafe.v_proceso_bultos_peso v
             where v.bulto_id = b.id and cafe.orden_proceso(v.tipo) < cafe.orden_proceso(e.tipo)
             order by cafe.orden_proceso(v.tipo) desc
             limit 1) prev on true
         where b.lote_id = e.lote_id
           and not exists (select 1 from cafe.proceso_bultos pb where pb.bulto_id = b.id and pb.tipo = e.tipo))
  from cafe.v_lote_etapas e;

-- 2) Backfill del enlace -----------------------------------------------------------------------------------------
do $$
declare
  v_fallas text;
begin
  create temp table _origenes_calculados on commit drop as
  select p.id as proceso_id, p.lote_id, p.tipo, cafe.paso_origen(p.lote_id, p.tipo) as tipo_origen,
         (select array_agg(distinct o.id)
            from cafe.proceso_bultos pb
            join cafe.proceso_bultos pbo on pbo.bulto_id = pb.bulto_id
            join cafe.procesos o on o.id = pbo.proceso_id
           where pb.proceso_id = p.id and o.anulado_at is null and o.reapertura_id is null
             and o.tipo = cafe.paso_origen(p.lote_id, p.tipo)) as origenes
    from cafe.procesos p
   where p.anulado_at is null and p.reapertura_id is null;

  -- Procesos sin origen único donde debería haberlo.
  select string_agg(format('lote %s · %s (proceso %s): %s', l.codigo, c.tipo, c.proceso_id,
                           case when c.origenes is null then 'sus bultos no tienen un proceso de ' || c.tipo_origen
                                else 'sus bultos vienen de ' || cardinality(c.origenes) || ' procesos de '
                                     || c.tipo_origen || ' (' || array_to_string(c.origenes, ', ') || ')' end),
                    E'\n' order by l.codigo)
    into v_fallas
    from _origenes_calculados c
    join cafe.lotes l on l.id = c.lote_id
   where c.tipo_origen is not null and coalesce(cardinality(c.origenes), 0) <> 1;
  if v_fallas is not null then
    raise exception using errcode = 'P0001',
      message = 'Backfill del enlace entre etapas (ADR 0002): hay procesos que no se pueden enlazar a un único origen. '
                || 'Resuélvelos a mano (anular y registrar de nuevo, o dividir) antes de desplegar:' || E'\n' || v_fallas;
  end if;

  -- Solo se escribe el enlace: sin tocar updated_at/updated_by ni el guard de lotes entregados.
  alter table cafe.procesos disable trigger set_updated;
  alter table cafe.procesos disable trigger procesos_lote_entregado;

  update cafe.procesos p
     set origen_proceso_id = c.origenes[1],
         origen_tipo = c.tipo_origen
    from _origenes_calculados c
   where c.proceso_id = p.id and c.tipo_origen is not null;

  alter table cafe.procesos enable trigger set_updated;
  alter table cafe.procesos enable trigger procesos_lote_entregado;

  -- Ningún origen queda con más consumo que base + tolerancia (los históricos pueden traer hasta -0,5 % de sobreentrega).
  select string_agg(format('lote %s · %s %s: base %s kg, consumido %s kg', l.codigo, coalesce(o.tipo::text, 'raíz'),
                           coalesce(o.proceso_id::text, ''), o.base_kg, o.consumido_kg), E'\n' order by l.codigo)
    into v_fallas
    from cafe.v_origenes_disponibles o
    join cafe.lotes l on l.id = o.lote_id
   where o.saldo_kg < -cafe.saldo_tolerancia_kg(o.base_kg);
  if v_fallas is not null then
    raise exception using errcode = 'P0001',
      message = 'Backfill del enlace entre etapas (ADR 0002): hay orígenes con más consumo que kilos disponibles:'
                || E'\n' || v_fallas;
  end if;
end $$;
