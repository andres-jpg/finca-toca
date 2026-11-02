-- Vertical café: «Convertir presentación» (A-15 · FIN-133). Sustituye en el inventario a «Reabrir» (HU-F1-16) para el
-- caso de reempacar sin moler: sacar unidades de una presentación de un lote de marca propia (2 × 2.500 g) y
-- entrarlas en otra del MISMO tipo y forma (10 × 500 g) consumiendo la bolsa y la etiqueta del destino.
--
--  1. `cafe.conversiones_presentacion`: la traza, ligada al lote de origen. Append-only (sin UPDATE ni DELETE), auditada.
--  2. `cafe.convertir_presentacion(p jsonb)`: UNA transacción; valida el saldo del lote y el stock global del origen y
--     registra todos los movimientos por `public.registrar_movimientos` (origen −, destino +, bolsa −, etiqueta −).
--  3. `cafe.proteger_entradas_pt()` admite la entrada del destino cuando viene de una conversión registrada.
--
-- Los kilos que no cuadran (kg destino ≠ kg origen) NO bloquean: se guardan como `diferencia_kg` y vuelven en la
-- respuesta para que la pantalla avise. La reapertura (CO-33, molienda de lo reabierto) sigue existiendo.
-- Solo crea objetos nuevos y redefine un trigger con la misma firma: segura en bases con datos.
-- Rollback manual: drop function cafe.convertir_presentacion(jsonb); drop table cafe.conversiones_presentacion;
--   y recrear cafe.proteger_entradas_pt() de 20261106100000_cafe_empaque.sql.

create table cafe.conversiones_presentacion (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null default public.tenant_actual() references public.tenants,
  lote_id           uuid not null,
  fecha             date not null check (fecha between date '2000-01-01' and date '2100-12-31'),
  articulo_origen_id  uuid not null,
  presentacion_origen_g integer not null check (presentacion_origen_g > 0),
  unidades_origen   integer not null check (unidades_origen > 0),
  articulo_destino_id uuid not null,
  presentacion_destino_g integer not null check (presentacion_destino_g > 0),
  unidades_destino  integer not null check (unidades_destino > 0),
  kg_origen         numeric(12,3) generated always as (unidades_origen * presentacion_origen_g / 1000.0) stored,
  kg_destino        numeric(12,3) generated always as (unidades_destino * presentacion_destino_g / 1000.0) stored,
  diferencia_kg     numeric(12,3) generated always as ((unidades_destino * presentacion_destino_g - unidades_origen * presentacion_origen_g) / 1000.0) stored,
  motivo            text check (motivo is null or (btrim(motivo) <> '' and char_length(motivo) <= 500)),
  created_at        timestamptz not null default now(),
  created_by        uuid default auth.uid() references auth.users,
  updated_at        timestamptz,
  updated_by        uuid references auth.users,
  constraint conversiones_tenant_id_uk unique (tenant_id, id),
  constraint conversiones_distinto_ck check (articulo_origen_id <> articulo_destino_id),
  constraint conversiones_lote_fk foreign key (tenant_id, lote_id) references cafe.lotes (tenant_id, id) on delete restrict,
  constraint conversiones_origen_fk foreign key (tenant_id, articulo_origen_id) references public.articulos (tenant_id, id) on delete restrict,
  constraint conversiones_destino_fk foreign key (tenant_id, articulo_destino_id) references public.articulos (tenant_id, id) on delete restrict
);

create index on cafe.conversiones_presentacion (tenant_id, lote_id);
create index on cafe.conversiones_presentacion (tenant_id, fecha desc);

create trigger set_updated before update on cafe.conversiones_presentacion
  for each row execute function public.set_updated();

alter table cafe.conversiones_presentacion enable row level security;

create policy conversiones_select on cafe.conversiones_presentacion for select to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.inventario')));

create policy conversiones_insert on cafe.conversiones_presentacion for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.inventario'))
              and (select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'));

revoke all on table cafe.conversiones_presentacion from public, anon, authenticated, service_role;
grant select on table cafe.conversiones_presentacion to authenticated, service_role;
grant insert (tenant_id, lote_id, fecha, articulo_origen_id, presentacion_origen_g, unidades_origen,
              articulo_destino_id, presentacion_destino_g, unidades_destino, motivo)
  on table cafe.conversiones_presentacion to authenticated;
grant insert on table cafe.conversiones_presentacion to service_role;

select audit.activar('cafe.conversiones_presentacion');

-- 3. La entrada del destino solo se admite si viene de una conversión registrada -----------------------------------------
create or replace function cafe.proteger_entradas_pt()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.motivo not in ('compra', 'produccion', 'saldo_inicial', 'devolucion') then
    return new;
  end if;
  if not exists (select 1 from public.articulos a
                  where a.id = new.articulo_id and a.tenant_id = new.tenant_id and a.tipo = 'producto_terminado') then
    return new;
  end if;
  if not exists (select 1 from public.tenants t where t.id = new.tenant_id and t.vertical = 'cafe') then
    return new;
  end if;

  if new.ref_tipo = 'cafe.proceso' and new.ref_id is not null
     and exists (select 1 from cafe.empaque_lineas el
                  where el.proceso_id = new.ref_id and el.articulo_pt_id = new.articulo_id) then
    return new;
  end if;
  if new.ref_tipo = 'cafe.venta' and new.motivo = 'devolucion' and new.ref_id is not null then
    return new;
  end if;
  if new.ref_tipo = 'cafe.arranque' and new.motivo = 'saldo_inicial' then
    return new;
  end if;
  if new.ref_tipo = 'cafe.conversion' and new.motivo = 'produccion' and new.ref_id is not null
     and exists (select 1 from cafe.conversiones_presentacion c
                  where c.id = new.ref_id and c.articulo_destino_id = new.articulo_id and c.tenant_id = new.tenant_id) then
    return new;
  end if;

  raise exception using errcode = 'P0001', message = 'entrada_pt_no_permitida',
    detail = 'El producto terminado solo aumenta al empacar un lote. Para corregir existencias usa un ajuste.';
end $$;

-- 2. La RPC ---------------------------------------------------------------------------------------------------------------
-- Entrada: { lote_id, fecha, origen: { articulo_id, unidades }, destino: { articulo_id, unidades }, motivo? }
-- Salida:  { id, kg_origen, kg_destino, diferencia_kg, cuadra, stocks, advertencias }
create or replace function cafe.convertir_presentacion(p jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_lote_id  uuid;
  v_fecha    date;
  v_motivo   text;
  v_ao       uuid;
  v_ad       uuid;
  v_uo       numeric;
  v_ud       numeric;
  v_lote     cafe.lotes;
  v_o        public.articulos;
  v_d        public.articulos;
  v_go       numeric;
  v_gd       numeric;
  v_bolsa    public.articulos;
  v_etiq     public.articulos;
  v_empacado numeric;
  v_saldo    numeric;
  v_stock    numeric;
  v_id       uuid;
  v_mov      jsonb;
  v_fm       timestamptz;
  v_adv      jsonb := '[]'::jsonb;
  v_a        jsonb;
  v_nombre   text;
begin
  if not coalesce((select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'), false)
     or not coalesce((select public.tenant_tiene_modulo('cafe.inventario')), false) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La conversión no tiene el formato esperado.';
  end if;

  begin
    if jsonb_typeof(p -> 'lote_id') is distinct from 'string'
       or jsonb_typeof(p -> 'fecha') is distinct from 'string'
       or jsonb_typeof(p -> 'origen') is distinct from 'object'
       or jsonb_typeof(p -> 'destino') is distinct from 'object'
       or jsonb_typeof(p #> '{origen,articulo_id}') is distinct from 'string'
       or jsonb_typeof(p #> '{destino,articulo_id}') is distinct from 'string'
       or jsonb_typeof(p #> '{origen,unidades}') is distinct from 'number'
       or jsonb_typeof(p #> '{destino,unidades}') is distinct from 'number' then
      raise exception using errcode = '22023';
    end if;
    v_lote_id := (p ->> 'lote_id')::uuid;
    v_fecha   := (p ->> 'fecha')::date;
    v_ao      := (p #>> '{origen,articulo_id}')::uuid;
    v_ad      := (p #>> '{destino,articulo_id}')::uuid;
    v_uo      := (p #>> '{origen,unidades}')::numeric;
    v_ud      := (p #>> '{destino,unidades}')::numeric;
    if jsonb_typeof(p -> 'motivo') = 'string' then
      v_motivo := nullif(btrim(p ->> 'motivo'), '');
    elsif p ? 'motivo' and jsonb_typeof(p -> 'motivo') <> 'null' then
      raise exception using errcode = '22023';
    end if;
  exception when others then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La conversión no tiene el formato esperado.';
  end;

  if v_uo <> trunc(v_uo) or v_uo < 1 or v_uo > 99999 or v_ud <> trunc(v_ud) or v_ud < 1 or v_ud > 99999 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'Las unidades son números enteros mayores que cero.';
  end if;
  if v_fecha not between date '2000-01-01' and date '2100-12-31' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La fecha de la conversión no es válida.';
  end if;
  if v_motivo is not null and char_length(v_motivo) > 500 then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'El motivo admite hasta 500 caracteres.';
  end if;
  if v_ao = v_ad then
    raise exception using errcode = 'P0001', message = 'conversion_mismo_producto',
      detail = 'El origen y el destino son el mismo producto: elige otra presentación de destino.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('cafe.lote:' || v_lote_id::text, 0));

  select * into v_lote from cafe.lotes l where l.id = v_lote_id;
  if not found then
    raise exception using errcode = 'P0001', message = 'lote_no_encontrado', detail = 'El lote no existe o no pertenece a tu cliente.';
  end if;
  if v_lote.anulado_at is not null then
    raise exception using errcode = 'P0001', message = 'lote_anulado', detail = 'El lote está anulado: ya no se puede modificar.';
  end if;
  if v_lote.linea <> 'marca_propia' then
    raise exception using errcode = 'P0001', message = 'reapertura_solo_marca_propia',
      detail = 'Solo se convierte producto de un lote de marca propia, nunca café de un cliente.';
  end if;

  select * into v_o from public.articulos a where a.id = v_ao and a.tipo = 'producto_terminado';
  select * into v_d from public.articulos a where a.id = v_ad and a.tipo = 'producto_terminado';
  if v_o.id is null or v_d.id is null then
    raise exception using errcode = 'P0001', message = 'articulo_no_encontrado',
      detail = 'El producto terminado no existe o no pertenece a tu cliente.';
  end if;
  if not v_d.activo then
    raise exception using errcode = 'P0001', message = 'articulo_inactivo', detail = 'El producto de destino está desactivado.';
  end if;

  -- Mismo tipo de café y misma forma: convertir es reempacar, no moler ni mezclar calidades.
  if jsonb_typeof(v_o.atributos -> 'presentacion_g') is distinct from 'number'
     or jsonb_typeof(v_d.atributos -> 'presentacion_g') is distinct from 'number'
     or (v_o.atributos ->> 'tipo_cafe_id') is distinct from (v_d.atributos ->> 'tipo_cafe_id')
     or coalesce(v_o.atributos ->> 'forma', 'grano') <> coalesce(v_d.atributos ->> 'forma', 'grano')
     or (v_o.atributos ->> 'tipo_cafe_id') is distinct from v_lote.tipo_cafe_id::text then
    raise exception using errcode = 'P0001', message = 'conversion_incompatible',
      detail = 'Origen y destino deben ser del mismo tipo de café y de la misma forma (grano o molido) que el lote.';
  end if;
  v_go := (v_o.atributos ->> 'presentacion_g')::numeric;
  v_gd := (v_d.atributos ->> 'presentacion_g')::numeric;

  -- Saldo del lote en el producto de origen: lo empacado de él, menos lo reabierto o convertido, más lo convertido hacia él.
  select coalesce(sum(el.unidades), 0) into v_empacado
    from cafe.empaque_lineas el
    join cafe.procesos pr on pr.id = el.proceso_id and pr.anulado_at is null and pr.lote_id = v_lote_id
   where el.articulo_pt_id = v_ao;
  v_saldo := v_empacado
    - coalesce((select sum(r.unidades) from cafe.reaperturas r where r.lote_id = v_lote_id and r.articulo_pt_id = v_ao), 0)
    - coalesce((select sum(c.unidades_origen) from cafe.conversiones_presentacion c where c.lote_id = v_lote_id and c.articulo_origen_id = v_ao), 0)
    + coalesce((select sum(c.unidades_destino) from cafe.conversiones_presentacion c where c.lote_id = v_lote_id and c.articulo_destino_id = v_ao), 0);
  if v_uo > v_saldo then
    raise exception using errcode = 'P0001', message = 'conversion_supera_saldo_lote',
      detail = format('Del lote %s solo quedan %s unidades de %s para convertir.', v_lote.codigo, v_saldo::integer, v_o.nombre);
  end if;

  -- Existencias globales: lo ya vendido no se convierte.
  select coalesce(s.stock, 0) into v_stock from public.v_stock s where s.articulo_id = v_ao;
  if v_uo > coalesce(v_stock, 0) then
    raise exception using errcode = 'P0001', message = 'conversion_sin_stock',
      detail = format('Solo hay %s unidades de %s en existencia.', coalesce(v_stock, 0)::integer, v_o.nombre);
  end if;

  -- Bolsa y etiqueta activas del destino (la misma búsqueda que el empaque).
  select a.* into v_bolsa from public.articulos a
   where a.tenant_id = v_lote.tenant_id and a.tipo = 'insumo' and a.activo and a.atributos ->> 'clase' = 'bolsa'
     and jsonb_typeof(a.atributos -> 'presentacion_g') = 'number' and (a.atributos ->> 'presentacion_g')::numeric = v_gd
   order by a.created_at, a.id limit 1;
  select a.* into v_etiq from public.articulos a
   where a.tenant_id = v_lote.tenant_id and a.tipo = 'insumo' and a.activo and a.atributos ->> 'clase' = 'etiqueta'
     and jsonb_typeof(a.atributos -> 'presentacion_g') = 'number' and (a.atributos ->> 'presentacion_g')::numeric = v_gd
   order by a.created_at, a.id limit 1;
  if v_bolsa.id is null or v_etiq.id is null then
    raise exception using errcode = 'P0001', message = 'insumo_no_configurado',
      detail = format('Falta %s activa de %s en el inventario de insumos.',
                      case when v_bolsa.id is null and v_etiq.id is null then 'la bolsa y la etiqueta'
                           when v_bolsa.id is null then 'la bolsa' else 'la etiqueta' end,
                      cafe.etiqueta_presentacion(v_gd::integer));
  end if;

  insert into cafe.conversiones_presentacion (lote_id, fecha, articulo_origen_id, presentacion_origen_g, unidades_origen,
                                              articulo_destino_id, presentacion_destino_g, unidades_destino, motivo)
  values (v_lote_id, v_fecha, v_ao, v_go::integer, v_uo::integer, v_ad, v_gd::integer, v_ud::integer, v_motivo)
  returning id into v_id;

  v_fm := cafe.instante_fecha(v_fecha);
  -- Bolsas y etiquetas pueden quedar en negativo (se registra y se avisa, como el empaque); el origen ya se comprobó.
  v_mov := public.registrar_movimientos(jsonb_build_array(
    jsonb_build_object('articulo_id', v_ao, 'cantidad', -v_uo, 'motivo', 'reapertura', 'fecha', v_fm,
                       'ref_tipo', 'cafe.conversion', 'ref_id', v_id, 'observaciones', 'Conversión de presentación · ' || v_lote.codigo),
    jsonb_build_object('articulo_id', v_ad, 'cantidad', v_ud, 'motivo', 'produccion', 'fecha', v_fm,
                       'ref_tipo', 'cafe.conversion', 'ref_id', v_id, 'observaciones', 'Conversión de presentación · ' || v_lote.codigo),
    jsonb_build_object('articulo_id', v_bolsa.id, 'cantidad', -v_ud, 'motivo', 'consumo', 'fecha', v_fm,
                       'ref_tipo', 'cafe.conversion', 'ref_id', v_id, 'observaciones', 'Conversión de presentación · ' || v_lote.codigo),
    jsonb_build_object('articulo_id', v_etiq.id, 'cantidad', -v_ud, 'motivo', 'consumo', 'fecha', v_fm,
                       'ref_tipo', 'cafe.conversion', 'ref_id', v_id, 'observaciones', 'Conversión de presentación · ' || v_lote.codigo)),
    true);

  for v_a in select x from jsonb_array_elements(v_mov -> 'advertencias') x loop
    select a.nombre into v_nombre from public.articulos a where a.id = (v_a ->> 'articulo_id')::uuid;
    v_adv := v_adv || jsonb_build_array(v_a || jsonb_build_object('articulo', v_nombre));
  end loop;

  return jsonb_build_object(
    'id', v_id,
    'lote_id', v_lote_id,
    'kg_origen', round(v_uo * v_go / 1000, 3),
    'kg_destino', round(v_ud * v_gd / 1000, 3),
    'diferencia_kg', round((v_ud * v_gd - v_uo * v_go) / 1000, 3),
    'cuadra', v_ud * v_gd = v_uo * v_go,
    'stocks', v_mov -> 'stocks',
    'advertencias', v_adv);
end $$;

revoke all on function cafe.convertir_presentacion(jsonb) from public, anon;
grant execute on function cafe.convertir_presentacion(jsonb) to authenticated;
revoke all on function cafe.proteger_entradas_pt() from public, anon, authenticated;
