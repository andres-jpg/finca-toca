-- Exportación de lotes y procesos a Excel (FIN-116 · CO-35): catálogo de módulos.
-- La exportación no añade esquema: lee `cafe.v_lotes`, `cafe.procesos` y `cafe.proceso_bultos` con el RLS de siempre
-- (cubierto en 93/94). Aquí solo se fija lo que sí cambió: la descripción de `cafe.exportacion`.
begin;

select plan(3);

select is(
  (select descripcion from public.modulos where id = 'cafe.exportacion'),
  'Documentación de comercio exterior (no es la exportación a Excel, que va con cada módulo)',
  'cafe.exportacion se describe como comercio exterior, no como Excel'
);
select is(
  (select vertical::text || '/' || base::text from public.modulos where id = 'cafe.exportacion'),
  'cafe/false',
  'cafe.exportacion sigue siendo un módulo opcional del vertical café'
);
-- `modulos` es un catálogo global de solo lectura para authenticated.
select tests.autenticar_como('admin@vb.test');
select is(
  (select descripcion from public.modulos where id = 'cafe.exportacion') like 'Documentación de comercio exterior%',
  true,
  'un admin de cliente lee la descripción corregida'
);
reset role;

select * from finish();
rollback;
