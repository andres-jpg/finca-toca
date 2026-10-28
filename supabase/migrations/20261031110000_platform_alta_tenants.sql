-- Alta de clientes sin SQL manual (FIN-98 · CO-18).
--
--  1. Esquema `platform` (NO expuesto a la API, sin USAGE para anon/authenticated): la lógica vive aquí.
--     `exigir_operador()`, `seed_vertical()`, `crear_tenant()`.
--  2. Wrappers `public.platform_*` (SECURITY DEFINER, search_path vacío): son lo único que llama la app.
--     Crear cliente, listar/ver, actualizar, activar o quitar módulos, añadir o quitar miembros.
--
-- Quién puede llamarlas ("operador de plataforma"): un platform admin con sesión (`es_platform_admin()`) o
-- el `service_role` (el CLI `scripts/crear-tenant.ts`, que no tiene `auth.uid()`). La comprobación está
-- DENTRO de cada función, no en la UI: son endpoints RPC públicos para cualquier usuario con sesión.
-- Cualquier otro llamante recibe 42501 (`no_autorizado` / `no_autenticado` en `callRpc`).
--
-- Solo crea objetos nuevos: no toca filas ni políticas de ningún cliente existente. Ningún dato de clientes.
-- Sin tabla de invitaciones: añadir un miembro vincula a un usuario de Auth que YA existe (por email).
-- Quien aún no tiene cuenta debe crearla primero (alta en Auth o invitación desde el dashboard de Supabase).

-- 1. Esquema `platform` ------------------------------------------------------------------------------
-- Sin USAGE para nadie salvo el dueño: aunque una función de aquí conservase EXECUTE para PUBLIC (Postgres
-- se lo da al crearla), nadie podría resolver el esquema. Los wrappers de `public` (SECURITY DEFINER,
-- dueño postgres) sí llegan. Tampoco está en `[api] schemas`, así que PostgREST no lo ve.

create schema if not exists platform;
revoke all on schema platform from public, anon, authenticated;

-- 2. Guarda ----------------------------------------------------------------------------------------------
-- `auth.role()` lee el claim `role` del JWT (solo la clave de servicio lo firma como `service_role`).

create or replace function platform.exigir_operador()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' then
    return;
  end if;

  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'no_autenticado';
  end if;

  if not (select public.es_platform_admin()) then
    raise exception using errcode = '42501', message = 'no_autorizado';
  end if;
end;
$$;

-- 3. seed_vertical ---------------------------------------------------------------------------------------
-- Configuración inicial de un cliente según su vertical. IDEMPOTENTE: ejecutarla dos veces no duplica nada,
-- y tampoco pisa lo que el cliente ya haya cambiado (una tarifa o un parámetro editados no se vuelven a
-- sembrar). Escribe con `tenant_id` EXPLÍCITO: quien la llama no es miembro del cliente, así que
-- `tenant_actual()` no sirve como DEFAULT.

create or replace function platform.seed_vertical(p_tenant uuid, p_vertical public.vertical)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform platform.exigir_operador();

  if not exists (select 1 from public.tenants t where t.id = p_tenant) then
    raise exception using errcode = 'P0001', message = 'tenant_no_encontrado',
      detail = 'El cliente indicado no existe.';
  end if;

  if p_vertical = 'ganaderia' then
    -- Catálogo mínimo de finanzas: el que el código da por hecho (subconcepto «Leche para crías» y un
    -- ingreso de leche) más los habituales. El precio del litro queda pendiente a propósito: sin él no se
    -- generan los apuntes automáticos de la leche, y lo fija el cliente.
    insert into public.conceptos_gasto (nombre, tenant_id)
    select c.nombre, p_tenant
      from (values ('Alimentación animal'), ('Operación y mantenimiento'), ('Sanidad')) as c(nombre)
    on conflict (tenant_id, nombre) do nothing;

    insert into public.subconceptos_gasto (concepto_id, nombre, tenant_id)
    select cg.id, s.nombre, p_tenant
      from (values
             ('Alimentación animal', 'Concentrado'),
             ('Alimentación animal', 'Leche para crías'),
             ('Alimentación animal', 'Sal mineralizada'),
             ('Operación y mantenimiento', 'Mano de obra'),
             ('Operación y mantenimiento', 'Combustible'),
             ('Sanidad', 'Medicamentos'),
             ('Sanidad', 'Vacunas')
           ) as s(concepto, nombre)
      join public.conceptos_gasto cg on cg.tenant_id = p_tenant and cg.nombre = s.concepto
    on conflict (concepto_id, nombre) do nothing;

    insert into public.conceptos_ingreso (nombre, tenant_id)
    values ('Ventas', p_tenant)
    on conflict (tenant_id, nombre) do nothing;

    insert into public.subconceptos_ingreso (concepto_id, nombre, tenant_id)
    select ci.id, s.nombre, p_tenant
      from (values ('Ventas', 'Venta de leche'), ('Ventas', 'Venta de animales')) as s(concepto, nombre)
      join public.conceptos_ingreso ci on ci.tenant_id = p_tenant and ci.nombre = s.concepto
    on conflict (concepto_id, nombre) do nothing;

  elsif p_vertical = 'cafe' then
    -- Tarifas (CO-14), vigentes desde el alta. Sin tarifa de empaque: no es un concepto cobrable.
    -- NOT EXISTS por concepto (no por `vigente_desde`): una segunda ejecución no añade otra versión.
    insert into public.tarifas (tenant_id, concepto, valor, unidad, vigente_desde, observaciones)
    select p_tenant, t.concepto, t.valor, 'kg', now(), 'Tarifa inicial del alta'
      from (values ('cafe.trilla', 1400), ('cafe.tostion', 2200), ('cafe.molienda', 1000)) as t(concepto, valor)
     where not exists (
             select 1 from public.tarifas x where x.tenant_id = p_tenant and x.concepto = t.concepto);

    -- Parámetros (CO-14). Humedad y densidad quedan SIN configurar (sin fila) hasta que el cliente dé los
    -- rangos; la tolerancia de merma tampoco se siembra: rige el valor por defecto del código.
    insert into public.parametros (tenant_id, clave, valor)
    values
      (p_tenant, 'cafe.capacidad_tostadora_kg',     to_jsonb(13.5::numeric)),
      (p_tenant, 'cafe.merma_referencia_trilla_pct', to_jsonb(19::numeric)),
      (p_tenant, 'cafe.merma_referencia_tostion_pct', to_jsonb(18::numeric)),
      (p_tenant, 'cafe.peso_bulto_kg',              to_jsonb(62.5::numeric))
    on conflict (tenant_id, clave) do nothing;

    -- Series de consecutivos (CO-15).
    insert into public.series_consecutivo (tenant_id, serie, descripcion)
    values
      (p_tenant, 'MP',  'Lotes marca propia'),
      (p_tenant, 'MQ',  'Lotes de servicio (trilla/maquila)'),
      (p_tenant, 'REM', 'Remisiones de entrega')
    on conflict (tenant_id, serie) do nothing;

    -- Consumidor final (CO-13): idempotente por sí misma; con `p_tenant` explícito no depende de la sesión.
    perform public.asegurar_consumidor_final(p_tenant);

    -- Insumos de empaque (CO-16), sin stock mínimo. TODO(Fase 1): los productos terminados se crean
    -- cuando exista `cafe.tipos_cafe`.
    insert into public.articulos (tenant_id, nombre, tipo, unidad, atributos)
    select p_tenant, a.nombre, 'insumo', 'unidad', a.atributos
      from (values
             ('Bolsa 500 g',      '{"clase":"bolsa","presentacion_g":500}'::jsonb),
             ('Bolsa 2.500 g',    '{"clase":"bolsa","presentacion_g":2500}'::jsonb),
             ('Etiqueta 500 g',   '{"clase":"etiqueta","presentacion_g":500}'::jsonb),
             ('Etiqueta 2.500 g', '{"clase":"etiqueta","presentacion_g":2500}'::jsonb)
           ) as a(nombre, atributos)
     where not exists (
             select 1 from public.articulos x where x.tenant_id = p_tenant and x.nombre = a.nombre);

  end if;
  -- cooperativa: nada todavía (Fase 2).
end;
$$;

-- 4. crear_tenant ----------------------------------------------------------------------------------------
-- Crea el cliente, le activa los módulos base de su vertical (más los de núcleo en café y los opcionales de
-- `p_modulos`) y le siembra su configuración. Una sola transacción: si algo falla no queda nada.
-- Los clientes de ganadería y cooperativa NO reciben todavía los módulos de núcleo (no cambia su menú).

create or replace function platform.crear_tenant(
  p_nombre   text,
  p_slug     text,
  p_vertical public.vertical,
  p_nit      text default null,
  p_plan     text default null,
  p_modulos  text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid;
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_slug   text := btrim(coalesce(p_slug, ''));
  v_modulo text;
begin
  perform platform.exigir_operador();

  if length(v_nombre) < 2 then
    raise exception using errcode = 'P0001', message = 'nombre_invalido',
      detail = 'El nombre del cliente es obligatorio.';
  end if;

  if v_slug !~ '^[a-z0-9-]{3,40}$' then
    raise exception using errcode = 'P0001', message = 'slug_invalido',
      detail = 'El identificador debe tener de 3 a 40 caracteres: minúsculas, números y guiones.';
  end if;

  if p_vertical is null then
    raise exception using errcode = 'P0001', message = 'vertical_invalido',
      detail = 'Indica el vertical del cliente.';
  end if;

  if exists (select 1 from public.tenants t where t.slug = v_slug) then
    raise exception using errcode = 'P0001', message = 'slug_duplicado',
      detail = 'Ya existe un cliente con ese identificador.';
  end if;

  -- Cada módulo pedido debe existir y ser de su vertical o de núcleo.
  foreach v_modulo in array coalesce(p_modulos, '{}') loop
    if not exists (
         select 1 from public.modulos m
          where m.id = v_modulo and (m.vertical is null or m.vertical = p_vertical)) then
      raise exception using errcode = 'P0001', message = 'modulo_no_valido',
        detail = format('El módulo «%s» no existe o no corresponde al vertical del cliente.', v_modulo);
    end if;
  end loop;

  insert into public.tenants (nombre, slug, vertical, nit, plan)
  values (v_nombre, v_slug, p_vertical, nullif(btrim(coalesce(p_nit, '')), ''), coalesce(nullif(btrim(coalesce(p_plan, '')), ''), 'pro'))
  returning id into v_id;

  insert into public.tenant_modulos (tenant_id, modulo_id)
  select v_id, m.id
    from public.modulos m
   where (m.vertical = p_vertical and m.base)
      or (p_vertical = 'cafe' and m.id in ('core.terceros', 'core.auditoria'))
      or m.id = any (coalesce(p_modulos, '{}'))
  on conflict (tenant_id, modulo_id) do nothing;

  perform platform.seed_vertical(v_id, p_vertical);

  return v_id;
end;
$$;

revoke all on function platform.exigir_operador() from public, anon, authenticated;
revoke all on function platform.seed_vertical(uuid, public.vertical) from public, anon, authenticated;
revoke all on function platform.crear_tenant(text, text, public.vertical, text, text, text[]) from public, anon, authenticated;

-- 5. Wrappers públicos ---------------------------------------------------------------------------------------
-- Cada uno repite `exigir_operador()` en su primera línea (las de `platform.*` también la llevan).

create or replace function public.platform_crear_tenant(
  p_nombre   text,
  p_slug     text,
  p_vertical public.vertical,
  p_nit      text default null,
  p_plan     text default null,
  p_modulos  text[] default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform platform.exigir_operador();
  return platform.crear_tenant(p_nombre, p_slug, p_vertical, p_nit, p_plan, p_modulos);
end;
$$;

-- Listado con conteos, para /admin/tenants. (`platform_listar_tenants()` de FIN-91, más corta, sigue
-- siendo la del selector de cliente.)
create or replace function public.platform_tenants_resumen()
returns table (
  id         uuid,
  nombre     text,
  slug       text,
  vertical   public.vertical,
  plan       text,
  estado     public.tenant_estado,
  nit        text,
  miembros   integer,
  modulos    integer,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform platform.exigir_operador();

  return query
    select t.id, t.nombre, t.slug, t.vertical, t.plan, t.estado, t.nit,
           (select count(*)::integer from public.tenant_members m where m.tenant_id = t.id and m.activo),
           (select count(*)::integer from public.tenant_modulos tm where tm.tenant_id = t.id and tm.activo),
           t.created_at
      from public.tenants t
     order by t.created_at desc, t.nombre;
end;
$$;

-- Detalle de un cliente: sus datos, el catálogo de módulos aplicable (su vertical + núcleo) con el estado de
-- cada uno, y sus miembros con email.
create or replace function public.platform_obtener_tenant(p_tenant uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_resultado jsonb;
begin
  perform platform.exigir_operador();

  select jsonb_build_object(
           'tenant', jsonb_build_object(
             'id', t.id, 'nombre', t.nombre, 'slug', t.slug, 'vertical', t.vertical, 'plan', t.plan,
             'estado', t.estado, 'nit', t.nit, 'logo_url', t.logo_url, 'color_primario', t.color_primario,
             'zona_horaria', t.zona_horaria, 'moneda', t.moneda, 'created_at', t.created_at),
           'modulos', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', m.id, 'nombre', m.nombre, 'descripcion', m.descripcion, 'vertical', m.vertical,
                      'base', m.base, 'activo', coalesce(tm.activo, false))
                    order by (m.vertical is null), m.id)
               from public.modulos m
               left join public.tenant_modulos tm on tm.modulo_id = m.id and tm.tenant_id = t.id
              where m.vertical is null or m.vertical = t.vertical), '[]'::jsonb),
           'miembros', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'user_id', mb.user_id, 'email', u.email, 'rol', mb.rol, 'activo', mb.activo,
                      'created_at', mb.created_at)
                    order by mb.activo desc, u.email)
               from public.tenant_members mb
               join auth.users u on u.id = mb.user_id
              where mb.tenant_id = t.id), '[]'::jsonb))
    into v_resultado
    from public.tenants t
   where t.id = p_tenant;

  if v_resultado is null then
    raise exception using errcode = 'P0001', message = 'tenant_no_encontrado',
      detail = 'El cliente indicado no existe.';
  end if;

  return v_resultado;
end;
$$;

-- Cambia datos del cliente. `p_cambios` es un json parcial: solo se tocan las claves presentes; un null
-- explícito vacía nit, logo y color. Claves admitidas: nombre, estado, plan, nit, logo_url, color_primario.
-- (`vertical` y `slug` no cambian nunca: un cambio de vertical dejaría módulos y datos huérfanos.)
create or replace function public.platform_actualizar_tenant(p_tenant uuid, p_cambios jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clave text;
  v_nombre text;
  v_plan text;
  v_color text;
begin
  perform platform.exigir_operador();

  if p_cambios is null or jsonb_typeof(p_cambios) <> 'object' then
    raise exception using errcode = 'P0001', message = 'cambios_invalidos',
      detail = 'Los cambios deben ser un objeto.';
  end if;

  for v_clave in select jsonb_object_keys(p_cambios) loop
    if v_clave not in ('nombre', 'estado', 'plan', 'nit', 'logo_url', 'color_primario') then
      raise exception using errcode = 'P0001', message = 'cambios_invalidos',
        detail = format('El campo «%s» no se puede cambiar.', v_clave);
    end if;
  end loop;

  if not exists (select 1 from public.tenants t where t.id = p_tenant) then
    raise exception using errcode = 'P0001', message = 'tenant_no_encontrado',
      detail = 'El cliente indicado no existe.';
  end if;

  if p_cambios ? 'nombre' then
    v_nombre := btrim(coalesce(p_cambios ->> 'nombre', ''));
    if length(v_nombre) < 2 then
      raise exception using errcode = 'P0001', message = 'nombre_invalido',
        detail = 'El nombre del cliente es obligatorio.';
    end if;
  end if;

  if p_cambios ? 'plan' then
    v_plan := btrim(coalesce(p_cambios ->> 'plan', ''));
    if v_plan = '' then
      raise exception using errcode = 'P0001', message = 'plan_invalido', detail = 'El plan es obligatorio.';
    end if;
  end if;

  if p_cambios ? 'color_primario' then
    v_color := p_cambios ->> 'color_primario';
    if v_color is not null and v_color !~ '^#[0-9a-fA-F]{6}$' then
      raise exception using errcode = 'P0001', message = 'color_invalido',
        detail = 'El color debe ser hexadecimal, p. ej. #1A7F5A.';
    end if;
  end if;

  if p_cambios ? 'estado'
     and not coalesce((p_cambios ->> 'estado') = any (enum_range(null::public.tenant_estado)::text[]), false) then
    raise exception using errcode = 'P0001', message = 'estado_invalido', detail = 'El estado no es válido.';
  end if;

  update public.tenants t
     set nombre         = case when p_cambios ? 'nombre' then v_nombre else t.nombre end,
         plan           = case when p_cambios ? 'plan' then v_plan else t.plan end,
         estado         = case when p_cambios ? 'estado' then (p_cambios ->> 'estado')::public.tenant_estado else t.estado end,
         nit            = case when p_cambios ? 'nit' then nullif(btrim(coalesce(p_cambios ->> 'nit', '')), '') else t.nit end,
         logo_url       = case when p_cambios ? 'logo_url' then nullif(btrim(coalesce(p_cambios ->> 'logo_url', '')), '') else t.logo_url end,
         color_primario = case when p_cambios ? 'color_primario' then v_color else t.color_primario end
   where t.id = p_tenant;
end;
$$;

-- Activa o desactiva un módulo (de su vertical o de núcleo). Idempotente. No borra la fila: desactivar
-- conserva su `config` y deja el historial en la auditoría de `tenant_modulos`.
create or replace function public.platform_set_modulo(p_tenant uuid, p_modulo text, p_activo boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vertical public.vertical;
begin
  perform platform.exigir_operador();

  if p_activo is null then
    raise exception using errcode = 'P0001', message = 'cambios_invalidos', detail = 'Indica si el módulo se activa o se desactiva.';
  end if;

  select t.vertical into v_vertical from public.tenants t where t.id = p_tenant;
  if not found then
    raise exception using errcode = 'P0001', message = 'tenant_no_encontrado',
      detail = 'El cliente indicado no existe.';
  end if;

  if not exists (
       select 1 from public.modulos m
        where m.id = p_modulo and (m.vertical is null or m.vertical = v_vertical)) then
    raise exception using errcode = 'P0001', message = 'modulo_no_valido',
      detail = format('El módulo «%s» no existe o no corresponde al vertical del cliente.', p_modulo);
  end if;

  insert into public.tenant_modulos (tenant_id, modulo_id, activo)
  values (p_tenant, p_modulo, p_activo)
  on conflict (tenant_id, modulo_id) do update set activo = excluded.activo;
end;
$$;

-- Vincula a un usuario de Auth que YA existe (por email) con el cliente. Idempotente: repetirla actualiza el
-- rol y reactiva la membresía.
--   · Ganadería: sus tablas siguen gobernadas por `roles` (legacy, una fila por usuario), así que además se
--     escribe ahí (owner/admin → admin, operativo → user, viewer → viewer). Si el usuario ya tiene un rol
--     legacy en OTRO cliente se rechaza: `roles.user_id` es único.
--   · Café: solo membresía (las tablas nuevas usan `rol_en_tenant()`).
--   · Cooperativa: solo membresía; sus roles legacy no dependen de un cliente concreto (Fase 2).
create or replace function public.platform_agregar_miembro(p_tenant uuid, p_email text, p_rol public.rol_tenant)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vertical  public.vertical;
  v_user      uuid;
  v_existente uuid;
  v_hay_rol   boolean;
begin
  perform platform.exigir_operador();

  if p_rol is null then
    raise exception using errcode = 'P0001', message = 'rol_invalido', detail = 'Indica el rol del miembro.';
  end if;

  select t.vertical into v_vertical from public.tenants t where t.id = p_tenant;
  if not found then
    raise exception using errcode = 'P0001', message = 'tenant_no_encontrado',
      detail = 'El cliente indicado no existe.';
  end if;

  select u.id into v_user from auth.users u where lower(u.email) = lower(btrim(coalesce(p_email, '')));
  if v_user is null then
    raise exception using errcode = 'P0001', message = 'usuario_no_encontrado',
      detail = 'No hay ningún usuario con ese email. Debe tener cuenta antes de añadirlo.';
  end if;

  if v_vertical = 'ganaderia' then
    select true, r.tenant_id into v_hay_rol, v_existente from public.roles r where r.user_id = v_user;
    if coalesce(v_hay_rol, false) and v_existente is distinct from p_tenant then
      raise exception using errcode = 'P0001', message = 'usuario_con_rol_en_otro_cliente',
        detail = 'Ese usuario ya tiene un rol en otro cliente de ganadería.';
    end if;

    -- El trigger `sincronizar_membresia` crea la membresía con el rol mapeado; el upsert de abajo fija el exacto.
    insert into public.roles (user_id, rol, tenant_id)
    values (v_user,
            case p_rol when 'operativo' then 'user'::public.rol when 'viewer' then 'viewer'::public.rol else 'admin'::public.rol end,
            p_tenant)
    on conflict (user_id) do update set rol = excluded.rol;
  end if;

  insert into public.tenant_members (user_id, tenant_id, rol)
  values (v_user, p_tenant, p_rol)
  on conflict (user_id, tenant_id) do update set rol = excluded.rol, activo = true;

  return v_user;
end;
$$;

-- Desactiva la membresía (no se borra: queda en el historial). En ganadería también retira su fila de
-- `roles` para que pierda el acceso a las tablas legacy.
create or replace function public.platform_quitar_miembro(p_tenant uuid, p_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform platform.exigir_operador();

  update public.tenant_members
     set activo = false
   where tenant_id = p_tenant and user_id = p_user and activo;

  if not found then
    raise exception using errcode = 'P0001', message = 'miembro_no_encontrado',
      detail = 'Ese usuario no es miembro activo del cliente.';
  end if;

  delete from public.roles where user_id = p_user and tenant_id = p_tenant;
end;
$$;

-- Privilegios: nunca PUBLIC ni anon (Postgres da EXECUTE a PUBLIC al crear la función).
revoke all on function public.platform_crear_tenant(text, text, public.vertical, text, text, text[]) from public, anon;
revoke all on function public.platform_tenants_resumen() from public, anon;
revoke all on function public.platform_obtener_tenant(uuid) from public, anon;
revoke all on function public.platform_actualizar_tenant(uuid, jsonb) from public, anon;
revoke all on function public.platform_set_modulo(uuid, text, boolean) from public, anon;
revoke all on function public.platform_agregar_miembro(uuid, text, public.rol_tenant) from public, anon;
revoke all on function public.platform_quitar_miembro(uuid, uuid) from public, anon;

grant execute on function public.platform_crear_tenant(text, text, public.vertical, text, text, text[]) to authenticated, service_role;
grant execute on function public.platform_tenants_resumen() to authenticated, service_role;
grant execute on function public.platform_obtener_tenant(uuid) to authenticated, service_role;
grant execute on function public.platform_actualizar_tenant(uuid, jsonb) to authenticated, service_role;
grant execute on function public.platform_set_modulo(uuid, text, boolean) to authenticated, service_role;
grant execute on function public.platform_agregar_miembro(uuid, text, public.rol_tenant) to authenticated, service_role;
grant execute on function public.platform_quitar_miembro(uuid, uuid) to authenticated, service_role;
