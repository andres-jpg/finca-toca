-- Integración B-18 (perfiles de tueste) + ADR 0002 (saldo por kilos): `platform.seed_vertical`.
--
-- 20261124100000 redefinió `seed_vertical` para sembrar los perfiles de tueste iniciales y 20261130120000 la volvió a redefinir
-- (por origen y por kilos) sin esa llamada: sin esta migración un cliente de café nuevo no recibiría perfiles. Esta es la versión
-- de 20261130120000 más `perform cafe.sembrar_perfiles_tueste(p_tenant)` en la rama `cafe`. Solo reemplaza la función.
-- Rollback: reaplicar la definición de 20261130120000.

CREATE OR REPLACE FUNCTION platform.seed_vertical(p_tenant uuid, p_vertical vertical)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      (p_tenant, 'cafe.merma_referencia_tostion_pct', to_jsonb(18::numeric))
    on conflict (tenant_id, clave) do nothing;

    -- Series de consecutivos (CO-15; `VT` = ventas y cortesías, CO-31).
    insert into public.series_consecutivo (tenant_id, serie, descripcion)
    values
      (p_tenant, 'MP',  'Lotes marca propia'),
      (p_tenant, 'MQ',  'Lotes de servicio (trilla/maquila)'),
      (p_tenant, 'REM', 'Remisiones de entrega'),
      (p_tenant, 'VT',  'Ventas y cortesías')
    on conflict (tenant_id, serie) do nothing;

    -- Consumidor final (CO-13): idempotente por sí misma; con `p_tenant` explícito no depende de la sesión.
    perform public.asegurar_consumidor_final(p_tenant);

    -- Insumos de empaque (CO-16), sin stock mínimo.
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

    -- Tipos de café (CO-21): solo si el cliente no tiene ninguno, para no volver a sembrar «Consumo» si lo
    -- renombró o desactivó. Después, un producto terminado por tipo activo × bolsa activa (los triggers ya
    -- los habrían creado; la llamada explícita deja el resultado independiente del orden de los inserts).
    insert into cafe.tipos_cafe (tenant_id, nombre, orden)
    select p_tenant, t.nombre, t.orden
      from (values ('Consumo', 1), ('Excelso', 2)) as t(nombre, orden)
     where not exists (select 1 from cafe.tipos_cafe x where x.tenant_id = p_tenant);

    perform cafe.asegurar_productos_terminados(p_tenant);

    -- Lista de precios de venta (CO-31): Consumo 500 g y Excelso 500 g. NOT EXISTS por concepto: no pisa un precio
    -- que el cliente ya fijó ni añade otra versión en una segunda ejecución.
    insert into public.tarifas (tenant_id, concepto, valor, unidad, vigente_desde, observaciones)
    select p_tenant, cafe.concepto_precio(a.id), pr.valor, 'unidad', now(), 'Precio inicial del alta'
      from public.articulos a
      join cafe.tipos_cafe tc on tc.tenant_id = a.tenant_id and tc.id = (a.atributos ->> 'tipo_cafe_id')::uuid
      join (values ('consumo', 23000), ('excelso', 29000)) as pr(tipo, valor) on lower(tc.nombre) = pr.tipo
     where a.tenant_id = p_tenant
       and a.tipo = 'producto_terminado'
       and (a.atributos ->> 'presentacion_g') = '500'
       and not exists (
             select 1 from public.tarifas x where x.tenant_id = p_tenant and x.concepto = cafe.concepto_precio(a.id));


    -- Perfiles de tueste iniciales (B-18).
    perform cafe.sembrar_perfiles_tueste(p_tenant);

  end if;
  -- cooperativa: nada todavía (Fase 2).
end;
$function$;
