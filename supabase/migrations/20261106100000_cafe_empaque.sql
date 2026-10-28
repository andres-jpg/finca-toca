-- Vertical café: empaque de marca propia e inventario de producto terminado (FIN-111 · CO-30, HU-F1-06).
--
--  1. `cafe.empaque_lineas`: qué presentaciones (y cuántas unidades) salieron de un proceso de empaque, con el
--     producto terminado al que se sumaron. Inmutable: corregir es un ajuste de inventario o la reapertura (CO-33).
--  2. `cafe.registrar_empaque(p jsonb)`: empaca un lote de MARCA PROPIA en UNA transacción. Reutiliza
--     `cafe._insertar_proceso` (CO-27: orden de los pasos, bultos, pesos, snapshots) y luego mueve inventario con
--     `public.registrar_movimientos`: −bolsa, −etiqueta y +producto terminado por cada presentación, todos con
--     `ref_tipo = 'cafe.proceso'` y `ref_id` = el proceso. Faltar insumos AVISA y no bloquea (decisión 14 de CO-20).
--  3. Solo el empaque crea producto terminado (HU-06 c3): un trigger en `movimientos_inventario` rechaza las
--     entradas manuales (`compra`, `produccion`, `saldo_inicial`, `devolucion`) sobre un producto terminado de un
--     cliente de café salvo las tres vías previstas (`entrada_pt_no_permitida`).
--  4. `cafe.registrar_salida_pt(p jsonb)`: las salidas manuales del producto terminado que no son venta ni cortesía
--     (CO-31): muestra y pérdida (owner/admin/operativo) y ajuste (solo owner/admin, con signo).
--  5. Un empaque que movió inventario no se anula (`empaque_no_anulable`): hasta la reapertura (CO-33), se corrige
--     con un ajuste.
--
-- Solo crea objetos nuevos: segura en bases con datos. El stock de cada producto sigue siendo la suma de sus
-- movimientos (FIN-96); aquí no se guarda ningún número de stock.

-- 1. Tabla ---------------------------------------------------------------------------------------------------------

create table cafe.empaque_lineas (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default public.tenant_actual() references public.tenants,
  proceso_id      uuid not null,                                       -- proceso de tipo 'empaque'
  presentacion_g  integer not null check (presentacion_g > 0),
  unidades        integer not null check (unidades > 0),
  articulo_pt_id  uuid not null,                                       -- producto terminado tipo × presentación
  created_at      timestamptz not null default now(),
  created_by      uuid default auth.uid() references auth.users,
  constraint empaque_lineas_presentacion_uk unique (proceso_id, presentacion_g),
  -- Mismo cliente que el proceso y que el producto, garantizado por la base (la comprobación de una FK salta el RLS).
  constraint empaque_lineas_proceso_fk foreign key (tenant_id, proceso_id)
    references cafe.procesos (tenant_id, id) on delete restrict,
  constraint empaque_lineas_articulo_fk foreign key (tenant_id, articulo_pt_id)
    references public.articulos (tenant_id, id) on delete restrict
);

create index on cafe.empaque_lineas (tenant_id, articulo_pt_id);

-- La línea cuelga de un proceso de EMPAQUE (la FK solo ata el cliente).
create or replace function cafe.empaque_lineas_verificar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from cafe.procesos p where p.id = new.proceso_id and p.tipo = 'empaque') then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'Las presentaciones empacadas cuelgan de un proceso de empaque.';
  end if;
  return new;
end $$;

create trigger empaque_lineas_verificar before insert on cafe.empaque_lineas
  for each row execute function cafe.empaque_lineas_verificar();

-- 2. RLS y privilegios (como `procesos`: módulo `cafe.procesos`) -----------------------------------------------------
-- Lectura: cualquier miembro. INSERT: owner/admin/operativo (lo usa la RPC SECURITY INVOKER). Sin UPDATE ni DELETE.

alter table cafe.empaque_lineas enable row level security;

create policy empaque_lineas_select on cafe.empaque_lineas for select to authenticated
  using (tenant_id = (select public.tenant_actual())
         and (select public.tenant_tiene_modulo('cafe.procesos')));

create policy empaque_lineas_insert on cafe.empaque_lineas for insert to authenticated
  with check (tenant_id = (select public.tenant_actual())
              and (select public.tenant_tiene_modulo('cafe.procesos'))
              and (select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'));

revoke all on table cafe.empaque_lineas from public, anon, authenticated, service_role;
grant select on table cafe.empaque_lineas to authenticated, service_role;
grant insert (tenant_id, proceso_id, presentacion_g, unidades, articulo_pt_id)
  on table cafe.empaque_lineas to authenticated;
grant insert on table cafe.empaque_lineas to service_role;

select audit.activar('cafe.empaque_lineas');

-- 3. Solo el empaque crea producto terminado -----------------------------------------------------------------------
-- Entradas (`compra`, `produccion`, `saldo_inicial`, `devolucion`) sobre un producto terminado solo por:
--   · `ref_tipo = 'cafe.proceso'` de un empaque que tiene esa línea (la crea `registrar_empaque` ANTES de mover
--     el inventario; así un `ref_id` inventado no sirve);
--   · `devolucion` con `ref_tipo = 'cafe.venta'` (anulación de una venta, CO-31);
--   · `saldo_inicial` con `ref_tipo = 'cafe.arranque'` (función de arranque, CO-37).
-- Las salidas (`venta`, `cortesia`, `muestra`, `perdida`, `reapertura`) y el `ajuste` no pasan por aquí. Solo aplica
-- a clientes de café (`tenants.vertical`): el inventario del núcleo sigue siendo genérico para otros verticales.
-- SECURITY INVOKER: lee `articulos` y `tenants` con el RLS del usuario que inserta el movimiento.

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

  raise exception using errcode = 'P0001', message = 'entrada_pt_no_permitida',
    detail = 'El producto terminado solo aumenta al empacar un lote. Para corregir existencias usa un ajuste.';
end $$;

create trigger movimientos_proteger_entradas_pt before insert on public.movimientos_inventario
  for each row execute function cafe.proteger_entradas_pt();

-- 4. Un empaque con inventario movido no se anula -----------------------------------------------------------------
-- `anular_proceso` liberaría los bultos pero dejaría las bolsas, las etiquetas y el producto terminado como
-- están. Hasta que exista la reapertura (CO-33), un empaque se corrige con un ajuste de inventario.

create or replace function cafe.procesos_empaque_no_anulable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.anulado_at is not null and old.anulado_at is null
     and exists (select 1 from cafe.empaque_lineas el where el.proceso_id = old.id) then
    raise exception using errcode = 'P0001', message = 'empaque_no_anulable',
      detail = 'Este empaque ya movió inventario (bolsas, etiquetas y producto terminado) y no se anula. Corrige las existencias con un ajuste.';
  end if;
  return new;
end $$;

create trigger procesos_empaque_no_anulable before update on cafe.procesos
  for each row execute function cafe.procesos_empaque_no_anulable();

-- 5. Registrar un empaque ---------------------------------------------------------------------------------------------
-- Entrada (jsonb; todo lo demás se ignora):
--   { "lote_id": uuid, "fecha": "2026-11-08", "bultos": [uuid, …], "peso_entrada_kg": null | 81.0,
--     "lineas": [{ "presentacion_g": 500, "unidades": 120 }, { "presentacion_g": 2500, "unidades": 8 }],
--     "observaciones": null }
--
--   · Solo lotes de MARCA PROPIA (uno de servicio → `usar_registrar_proceso`). Los bultos tienen que haber pasado
--     por la tostión (y por la molienda si se molió) y no estar empacados: lo valida `_insertar_proceso`.
--   · `peso_entrada_kg` null = el peso disponible de esos bultos. `peso_salida` = Σ unidades × presentación / 1000;
--     si supera la entrada → `empaque_supera_peso`. La diferencia es la merma de empaque. SUPUESTO: el café que
--     entra sin empacarse es merma; si queda café tostado suelto que se quiere conservar, se empacan solo los
--     bultos que se terminan.
--   · Por línea: la bolsa y la etiqueta ACTIVAS de esa presentación (`insumo_no_configurado`) y el producto
--     terminado {tipo de café del lote, presentación} (si falta se intenta crear con
--     `asegurar_productos_terminados`; `producto_no_configurado` si no se puede).
--   · Movimientos con `p_permitir_negativo = true`: faltar bolsas o etiquetas se registra y vuelve en
--     `advertencias`, no bloquea (decisión 14 de CO-20). Todo o nada: si algo falla no queda nada escrito.
-- Salida: { proceso_id, merma_kg, merma_pct, peso_entrada_kg, peso_salida_kg, lote_estado, avance_texto,
--           lineas: [{ presentacion_g, unidades, kg, producto_id, producto }],
--           stocks: [{ articulo_id, stock, bajo_minimo }],
--           advertencias: [{ articulo_id, articulo, stock_resultante }] }

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

  -- El proceso: toda la lógica de pasos, bultos y pesos vive en `_insertar_proceso`. Una salida mayor que la
  -- entrada es, para el empaque, `empaque_supera_peso` (no se puede empacar más café del que hay).
  begin
    v_res := cafe._insertar_proceso(v_lote_id, 'empaque', v_fecha, v_bultos, v_entrada, v_salida, null, null, v_obs);
  exception when sqlstate 'P0001' then
    get stacked diagnostics v_msg = message_text, v_det = pg_exception_detail;
    if v_msg = 'salida_supera_entrada' then
      v_disp := coalesce(v_entrada, cafe.peso_disponible(v_lote_id, 'empaque',
                  coalesce(v_bultos, array(select b.id from cafe.lote_bultos b where b.lote_id = v_lote_id))));
      raise exception using errcode = 'P0001', message = 'empaque_supera_peso',
        detail = format('Empacarías %s kg y solo hay %s kg disponibles en los bultos elegidos. Empaca solo lo que hay o elige más bultos.',
                        trim_scale(v_salida), trim_scale(v_disp));
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

-- 6. Salidas manuales del producto terminado ---------------------------------------------------------------------------
-- Muestra y pérdida: salidas de `unidades` (> 0) enteras; ajuste: `unidades` con signo (≠ 0), solo owner/admin.
-- La pérdida y el ajuste exigen una observación que los explique. No permite dejar el stock en negativo (a
-- diferencia de la venta, CO-31): `stock_insuficiente`. Venta y cortesía son de CO-31; la reapertura, de CO-33.
--   { "articulo_id": uuid, "motivo": "muestra" | "perdida" | "ajuste", "unidades": 3, "observaciones": "…" }
-- Devuelve lo mismo que `registrar_movimientos`.

create or replace function cafe.registrar_salida_pt(p jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_articulo uuid;
  v_motivo   text;
  v_unidades numeric;
  v_obs      text;
begin
  if not coalesce((select public.rol_en_tenant()) in ('owner', 'admin', 'operativo'), false)
     or not coalesce((select public.tenant_tiene_modulo('cafe.inventario')), false) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La salida no tiene el formato esperado.';
  end if;

  begin
    if jsonb_typeof(p -> 'articulo_id') is distinct from 'string'
       or jsonb_typeof(p -> 'motivo') is distinct from 'string'
       or jsonb_typeof(p -> 'unidades') is distinct from 'number' then
      raise exception using errcode = '22023';
    end if;
    v_articulo := (p ->> 'articulo_id')::uuid;
    v_motivo   := p ->> 'motivo';
    v_unidades := (p ->> 'unidades')::numeric;
    if jsonb_typeof(p -> 'observaciones') = 'string' then
      v_obs := nullif(btrim(p ->> 'observaciones'), '');
    elsif p ? 'observaciones' and jsonb_typeof(p -> 'observaciones') <> 'null' then
      raise exception using errcode = '22023';
    end if;
  exception when others then
    raise exception using errcode = 'P0001', message = 'datos_invalidos', detail = 'La salida no tiene el formato esperado.';
  end;

  if v_motivo not in ('muestra', 'perdida', 'ajuste') then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = 'El motivo de la salida es muestra, pérdida o ajuste.';
  end if;
  -- Un ajuste es una corrección: solo owner/admin (el RLS de los movimientos lo exige también).
  if v_motivo = 'ajuste' and (select public.rol_en_tenant()) not in ('owner', 'admin') then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;

  if v_unidades <> trunc(v_unidades) or v_unidades = 0 or abs(v_unidades) > 999999
     or (v_motivo <> 'ajuste' and v_unidades < 0) then
    raise exception using errcode = 'P0001', message = 'datos_invalidos',
      detail = case when v_motivo = 'ajuste' then 'Las unidades del ajuste son un entero distinto de cero.'
                    else 'Las unidades son un entero mayor que cero.' end;
  end if;
  if v_motivo in ('perdida', 'ajuste') and v_obs is null then
    raise exception using errcode = 'P0001', message = 'observacion_obligatoria',
      detail = case v_motivo when 'perdida' then 'Explica la pérdida: la observación es obligatoria.'
                             else 'Explica el ajuste: la observación es obligatoria.' end;
  end if;

  if not exists (select 1 from public.articulos a where a.id = v_articulo and a.tipo = 'producto_terminado') then
    raise exception using errcode = 'P0001', message = 'articulo_no_encontrado',
      detail = 'El producto terminado no existe o no pertenece a tu cliente.';
  end if;

  return public.registrar_movimientos(
    jsonb_build_array(jsonb_build_object(
      'articulo_id', v_articulo,
      'cantidad', case when v_motivo = 'ajuste' then v_unidades else -v_unidades end,
      'motivo', v_motivo,
      'observaciones', v_obs)),
    false);
end $$;

-- 7. Privilegios de las funciones ---------------------------------------------------------------------------------------
-- Las RPC las llaman los usuarios; las de los triggers, nadie a mano.

revoke all on function cafe.registrar_empaque(jsonb) from public, anon;
grant execute on function cafe.registrar_empaque(jsonb) to authenticated;
revoke all on function cafe.registrar_salida_pt(jsonb) from public, anon;
grant execute on function cafe.registrar_salida_pt(jsonb) to authenticated;
revoke all on function cafe.empaque_lineas_verificar() from public, anon, authenticated;
revoke all on function cafe.proteger_entradas_pt() from public, anon, authenticated;
revoke all on function cafe.procesos_empaque_no_anulable() from public, anon, authenticated;
