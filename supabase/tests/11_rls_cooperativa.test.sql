-- RLS · `pagos_finca`: la única tabla con políticas por pertenencia (no solo por rol).
-- `cooperativa_user` solo ve/actualiza los pagos de las fincas de SU itinerario, y solo mientras
-- `responsable = 'conductor'` y `estado = 'pendiente'`. `cooperativa_admin` lo ve y lo toca todo.
-- El seed no trae pagos, así que se crean aquí (todo se revierte al final). Se identifican por
-- `litros`, que es un marcador libre:
--   101  finca de su itinerario · conductor · pendiente   → visible y actualizable
--   102  finca fuera de su itinerario · conductor · pendiente → invisible
--   103  finca de su itinerario · punto_venta · pendiente → visible, no actualizable
--   104  finca de su itinerario · conductor · pagado      → visible, no actualizable
begin;

select plan(18);

-- Preparación como postgres (salta RLS).
insert into public.fincas_cooperativa (nombre, precio_litro, activa, metodo_pago)
values ('Finca Ajena (test)', 1800, true, 'conductor');

insert into public.pagos_finca (finca_id, itinerario_id, fecha_inicio, fecha_fin, litros, estado, responsable)
select f.id, 1, current_date - 15, current_date, 101, 'pendiente', 'conductor'
  from public.fincas_cooperativa f where f.nombre = 'Finca La Esperanza (demo)'
union all
select f.id, null, current_date - 15, current_date, 102, 'pendiente', 'conductor'
  from public.fincas_cooperativa f where f.nombre = 'Finca Ajena (test)'
union all
select f.id, 1, current_date - 15, current_date, 103, 'pendiente', 'punto_venta'
  from public.fincas_cooperativa f where f.nombre = 'Finca El Roble (demo)'
union all
select f.id, 1, current_date - 30, current_date - 16, 104, 'pagado', 'conductor'
  from public.fincas_cooperativa f where f.nombre = 'Finca La Esperanza (demo)';

-- Precondición: la finca ajena de verdad no está en ningún itinerario.
select is(
  (select count(*)::int from public.itinerarios_fincas itf
     join public.fincas_cooperativa f on f.id = itf.finca_id where f.nombre = 'Finca Ajena (test)'),
  0, 'precondición: la finca ajena no pertenece a ningún itinerario'
);

-- 1. cooperativa_user (itinerario 1) --------------------------------------------------------------
select tests.autenticar_como('coop.user@test');

select is(
  (select array_agg(litros order by litros) from public.pagos_finca),
  array[101, 103, 104]::numeric[],
  'cooperativa_user solo ve los pagos de las fincas de su itinerario'
);
select is(
  (select count(*)::int from public.pagos_finca where litros = 102),
  0, 'cooperativa_user no ve el pago de una finca fuera de su itinerario'
);
select is(
  tests.filas_afectadas($$ update public.pagos_finca set estado = 'pagado' where litros = 102 $$),
  0, 'cooperativa_user no puede actualizar el pago de una finca fuera de su itinerario'
);
select is(
  tests.filas_afectadas($$ update public.pagos_finca set estado = 'pagado' where litros = 103 $$),
  0, 'cooperativa_user no puede actualizar un pago cuyo responsable no es el conductor'
);
select is(
  tests.filas_afectadas($$ update public.pagos_finca set estado = 'devuelto' where litros = 104 $$),
  0, 'cooperativa_user no puede actualizar un pago que ya no está pendiente'
);
select throws_ok(
  $$ update public.pagos_finca
        set finca_id = (select id from public.fincas_cooperativa where nombre = 'Finca Ajena (test)')
      where litros = 101 $$,
  '42501', null, 'cooperativa_user no puede reasignar su pago a una finca de otro itinerario (WITH CHECK)'
);
select throws_ok(
  $$ insert into public.pagos_finca (finca_id, fecha_inicio, fecha_fin, litros)
     select id, current_date, current_date, 105 from public.fincas_cooperativa
      where nombre = 'Finca La Esperanza (demo)' $$,
  '42501', null, 'cooperativa_user no puede crear (activar) pagos'
);
select is(
  tests.filas_afectadas($$ delete from public.pagos_finca where litros = 101 $$),
  0, 'cooperativa_user no puede borrar pagos'
);
select is(
  tests.filas_afectadas($$ update public.pagos_finca set estado = 'pagado' where litros = 101 $$),
  1, 'cooperativa_user sí puede marcar como pagado un pago pendiente de su itinerario con responsable conductor'
);
select is(
  tests.filas_afectadas($$ update public.pagos_finca set estado = 'devuelto' where litros = 101 $$),
  0, 'una vez marcado, el pago deja de ser editable por el conductor'
);

-- 2. cooperativa_admin ------------------------------------------------------------------------------
reset role;
select tests.autenticar_como('coop.admin@test');

select is((select count(*)::int from public.pagos_finca), 4, 'cooperativa_admin ve todos los pagos');
select is(
  tests.filas_afectadas($$ update public.pagos_finca set estado = 'devuelto' where litros = 104 $$),
  1, 'cooperativa_admin puede actualizar un pago ya cerrado'
);
select is(
  tests.filas_afectadas($$ update public.pagos_finca set estado = 'punto_venta' where litros = 102 $$),
  1, 'cooperativa_admin puede actualizar el pago de cualquier finca'
);

-- 3. Roles de finca: no tienen nada que ver con la cooperativa ------------------------------------------
reset role;
select tests.autenticar_como('admin@vb.test');

select is((select count(*)::int from public.pagos_finca), 0, 'admin de finca no ve pagos de la cooperativa');

reset role;
select tests.autenticar_como('viewer@vb.test');

select is((select count(*)::int from public.pagos_finca), 0, 'viewer de finca no ve pagos de la cooperativa');

-- 4. anon -----------------------------------------------------------------------------------------------------
reset role;
select tests.como_anon();

select is((select count(*)::int from public.pagos_finca), 0, 'anon no ve pagos');
select is(
  tests.filas_afectadas($$ update public.pagos_finca set estado = 'pagado' $$),
  0, 'anon no puede actualizar pagos'
);

select * from finish();
rollback;
