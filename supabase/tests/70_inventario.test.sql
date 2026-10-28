-- Inventario tipo kardex (FIN-96 · CO-16): articulos, movimientos_inventario, v_stock, v_kardex y
-- registrar_movimientos().
-- Usuarios del seed (password123): admin@vb.test (admin VB), user@vb.test (operativo VB),
-- viewer@vb.test (viewer VB), admin@velero.test (admin de otro cliente).
-- Los artículos y movimientos se crean AQUÍ, dentro de la transacción (rollback al final).
--   a01 bolsa 500 g (mínimo 100)   a02 etiqueta 500 g (mínimo 50)   a03 Excelso 500 g (producto terminado)
--   a04 artículo del kardex        a05/a06 sin atributos            b01 artículo de El Velero
begin;

select plan(129);

-- Helpers ------------------------------------------------------------------------------------------
create temp table res (j jsonb);
grant all on res to authenticated;

-- `detail` con el que falla una llamada (lo que callRpc entrega como `message`).
create or replace function pg_temp.detalle_de(p_sql text)
returns text
language plpgsql
as $$
declare
  v_detalle text;
begin
  execute p_sql;
  return null;
exception when others then
  get stacked diagnostics v_detalle = pg_exception_detail;
  return v_detalle;
end $$;
grant execute on function pg_temp.detalle_de(text) to authenticated;

-- 0. Estructura y privilegios ---------------------------------------------------------------------
select has_table('public', 'articulos', 'existe articulos');
select has_table('public', 'movimientos_inventario', 'existe movimientos_inventario');
select has_view('public', 'v_stock', 'existe v_stock');
select has_view('public', 'v_kardex', 'existe v_kardex');
select enum_has_labels('public', 'tipo_articulo', array['insumo', 'producto_terminado', 'materia_prima', 'otro'],
  'tipo_articulo tiene sus 4 valores');
select enum_has_labels('public', 'motivo_movimiento',
  array['saldo_inicial', 'compra', 'produccion', 'consumo', 'venta', 'cortesia', 'muestra', 'perdida', 'ajuste', 'devolucion', 'reapertura'],
  'motivo_movimiento tiene sus 11 valores');
select ok(
  (select bool_and(relrowsecurity) from pg_class
    where oid in ('public.articulos'::regclass, 'public.movimientos_inventario'::regclass)),
  'las dos tablas tienen RLS activada'
);
select ok(
  (select bool_and(coalesce('security_invoker=true' = any (reloptions), false)) from pg_class
    where oid in ('public.v_stock'::regclass, 'public.v_kardex'::regclass)),
  'las dos vistas son security_invoker (se leen con el RLS del usuario)'
);
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.registrar_movimientos(jsonb, boolean)'::regprocedure),
  false, 'registrar_movimientos es SECURITY INVOKER'
);
select ok(not has_function_privilege('anon', 'public.registrar_movimientos(jsonb, boolean)', 'execute'),
  'anon no ejecuta registrar_movimientos');
select ok(has_function_privilege('authenticated', 'public.registrar_movimientos(jsonb, boolean)', 'execute'),
  'authenticated sí ejecuta registrar_movimientos');
select ok(
  not has_table_privilege('authenticated', 'public.movimientos_inventario', 'update')
  and not has_table_privilege('authenticated', 'public.movimientos_inventario', 'delete')
  and not has_table_privilege('authenticated', 'public.movimientos_inventario', 'truncate'),
  'authenticated no tiene UPDATE, DELETE ni TRUNCATE sobre movimientos (append-only)'
);
select ok(
  not has_table_privilege('service_role', 'public.movimientos_inventario', 'update')
  and not has_table_privilege('service_role', 'public.movimientos_inventario', 'delete'),
  'ni siquiera service_role puede modificar o borrar movimientos'
);
select ok(
  not has_table_privilege('authenticated', 'public.articulos', 'delete')
  and not has_table_privilege('service_role', 'public.articulos', 'delete'),
  'nadie borra artículos (solo se desactivan)'
);
select ok(
  not has_table_privilege('anon', 'public.articulos', 'select')
  and not has_table_privilege('anon', 'public.movimientos_inventario', 'select')
  and not has_table_privilege('anon', 'public.v_stock', 'select')
  and not has_table_privilege('anon', 'public.v_kardex', 'select'),
  'anon no lee nada del inventario'
);

-- 1. Altas de artículos (admin) -----------------------------------------------------------------------
select tests.autenticar_como('admin@vb.test');

select lives_ok(
  $$ insert into public.articulos (id, codigo, nombre, tipo, atributos, stock_minimo) values
       ('90000000-0000-0000-0000-000000000a01', 'BOL-500', 'Bolsa 500 g', 'insumo',
        '{"clase":"bolsa","presentacion_g":500}', 100),
       ('90000000-0000-0000-0000-000000000a02', 'ETI-500', 'Etiqueta 500 g', 'insumo',
        '{"clase":"etiqueta","presentacion_g":500}', 50),
       ('90000000-0000-0000-0000-000000000a03', null, 'Excelso 500 g', 'producto_terminado',
        '{"tipo_cafe":"excelso","presentacion_g":500}', null) $$,
  'el admin crea artículos'
);
select is(
  (select tenant_id from public.articulos where id = '90000000-0000-0000-0000-000000000a01'),
  '00000000-0000-0000-0000-0000000000a1'::uuid, 'tenant_id se estampa solo (DEFAULT tenant_actual())'
);
select is(
  (select unidad from public.articulos where id = '90000000-0000-0000-0000-000000000a01'),
  'unidad', 'la unidad por defecto es "unidad"'
);

-- 2. Unicidad -----------------------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.articulos (nombre, tipo, atributos)
     values ('Bolsa duplicada', 'insumo', '{"presentacion_g":500,"clase":"bolsa"}') $$,
  '23505', null, 'no se pueden crear dos artículos con el mismo tipo + atributos (el orden de las claves no importa)'
);
select lives_ok(
  $$ insert into public.articulos (nombre, tipo, atributos)
     values ('Bolsa 500 g (otro tipo)', 'otro', '{"clase":"bolsa","presentacion_g":500}') $$,
  'los mismos atributos con otro tipo sí se permiten'
);
select throws_ok(
  $$ insert into public.articulos (codigo, nombre, tipo) values ('BOL-500', 'Otro con el mismo código', 'otro') $$,
  '23505', null, 'el código es único por cliente'
);
select lives_ok(
  $$ insert into public.articulos (id, nombre, tipo) values
       ('90000000-0000-0000-0000-000000000a05', 'Sin atributos 1', 'materia_prima'),
       ('90000000-0000-0000-0000-000000000a06', 'Sin atributos 2', 'materia_prima'),
       ('90000000-0000-0000-0000-000000000a07', 'Sin código 1', 'otro') $$,
  'varios artículos sin atributos ({}) y sin código conviven'
);
select throws_ok(
  $$ insert into public.articulos (nombre, tipo, unidad) values ('Unidad mala', 'otro', 'docena') $$,
  '23514', null, 'la unidad solo admite unidad|kg|g|litro'
);
select throws_ok(
  $$ insert into public.articulos (nombre, tipo, stock_minimo) values ('Mínimo negativo', 'otro', -1) $$,
  '23514', null, 'el stock mínimo no puede ser negativo'
);
select throws_ok(
  $$ insert into public.articulos (nombre, tipo, atributos) values ('Atributos mal', 'otro', '[1,2]') $$,
  '23514', null, 'atributos debe ser un objeto JSON'
);

-- 3. Movimientos: coherencia signo/motivo y ajuste -----------------------------------------------------
select throws_ok(
  $$ insert into public.movimientos_inventario (articulo_id, cantidad, motivo)
     values ('90000000-0000-0000-0000-000000000a01', 5, 'venta') $$,
  '23514', null, 'CHECK: una venta con cantidad positiva falla'
);
select throws_ok(
  $$ insert into public.movimientos_inventario (articulo_id, cantidad, motivo)
     values ('90000000-0000-0000-0000-000000000a01', -5, 'compra') $$,
  '23514', null, 'CHECK: una compra con cantidad negativa falla'
);
select throws_ok(
  $$ insert into public.movimientos_inventario (articulo_id, cantidad, motivo)
     values ('90000000-0000-0000-0000-000000000a01', 0, 'ajuste') $$,
  '23514', null, 'CHECK: la cantidad no puede ser cero'
);
select throws_ok(
  $$ insert into public.movimientos_inventario (articulo_id, cantidad, motivo)
     values ('90000000-0000-0000-0000-000000000a01', 5, 'ajuste') $$,
  '23514', null, 'CHECK: un ajuste sin observación falla'
);
select throws_ok(
  $$ insert into public.movimientos_inventario (articulo_id, cantidad, motivo, observaciones)
     values ('90000000-0000-0000-0000-000000000a01', 5, 'ajuste', '   ') $$,
  '23514', null, 'CHECK: un ajuste con observación en blanco también falla'
);

-- 4. registrar_movimientos: saldos iniciales ---------------------------------------------------------
select lives_ok(
  $$ insert into res select public.registrar_movimientos('[
       {"articulo_id":"90000000-0000-0000-0000-000000000a01","cantidad":200,"motivo":"saldo_inicial"},
       {"articulo_id":"90000000-0000-0000-0000-000000000a02","cantidad":40,"motivo":"saldo_inicial"},
       {"articulo_id":"90000000-0000-0000-0000-000000000a03","cantidad":10,"motivo":"saldo_inicial",
        "costo_unitario":12500.50,"ref_tipo":"cafe.lote","ref_id":"90000000-0000-0000-0000-0000000000f1",
        "observaciones":"Conteo inicial"}
     ]') $$,
  'registra tres saldos iniciales en una llamada'
);
select is(
  (select jsonb_array_length(j -> 'movimientos') from res), 3, 'devuelve los 3 ids de los movimientos'
);
select is(
  (select jsonb_array_length(j -> 'stocks') from res), 3, 'devuelve el stock de los 3 artículos'
);
select is(
  (select jsonb_array_length(j -> 'advertencias') from res), 0, 'sin advertencias'
);
select is(
  (select s ->> 'bajo_minimo' from res, jsonb_array_elements(j -> 'stocks') s
    where s ->> 'articulo_id' = '90000000-0000-0000-0000-000000000a02'),
  'true', 'la etiqueta (40 < mínimo 50) vuelve marcada como bajo mínimo'
);
select is(
  (select s ->> 'bajo_minimo' from res, jsonb_array_elements(j -> 'stocks') s
    where s ->> 'articulo_id' = '90000000-0000-0000-0000-000000000a01'),
  'false', 'la bolsa (200 ≥ mínimo 100) no'
);

-- 5. Stock derivado = suma de movimientos -----------------------------------------------------------
select is(
  (select stock from public.v_stock where articulo_id = '90000000-0000-0000-0000-000000000a01'),
  200::numeric, 'v_stock: bolsa = 200'
);
select is(
  (select stock from public.v_stock where articulo_id = '90000000-0000-0000-0000-000000000a05'),
  0::numeric, 'v_stock: un artículo sin movimientos tiene stock 0 (no desaparece)'
);
select results_eq(
  $$ select v.stock from public.v_stock v
      where v.articulo_id in ('90000000-0000-0000-0000-000000000a01', '90000000-0000-0000-0000-000000000a02', '90000000-0000-0000-0000-000000000a03')
      order by v.articulo_id $$,
  $$ select coalesce(sum(m.cantidad), 0)::numeric(14,3) from (values
       ('90000000-0000-0000-0000-000000000a01'::uuid), ('90000000-0000-0000-0000-000000000a02'), ('90000000-0000-0000-0000-000000000a03')) a(id)
      left join public.movimientos_inventario m on m.articulo_id = a.id
      group by a.id order by a.id $$,
  'v_stock coincide con la suma de movimientos de cada artículo'
);
select is(
  (select count(*)::int from public.v_stock where bajo_minimo),
  1, 'solo la etiqueta está bajo mínimo'
);
select is(
  (select bajo_minimo from public.v_stock where articulo_id = '90000000-0000-0000-0000-000000000a03'),
  false, 'sin stock_minimo (NULL) nunca está bajo mínimo'
);

-- 6. Append-only ----------------------------------------------------------------------------------------
select throws_ok(
  $$ update public.movimientos_inventario set cantidad = 999 $$,
  '42501', null, 'UPDATE de movimientos falla (sin privilegio)'
);
select throws_ok(
  $$ delete from public.movimientos_inventario $$,
  '42501', null, 'DELETE de movimientos falla (sin privilegio)'
);
select is(
  (select count(*)::int from public.movimientos_inventario where articulo_id = '90000000-0000-0000-0000-000000000a01'),
  1, 'los movimientos siguen ahí'
);

-- 7. Empacar: varios movimientos, una transacción ---------------------------------------------------------
delete from res;
select lives_ok(
  $$ insert into res select public.registrar_movimientos('[
       {"articulo_id":"90000000-0000-0000-0000-000000000a01","cantidad":-10,"motivo":"consumo"},
       {"articulo_id":"90000000-0000-0000-0000-000000000a02","cantidad":-10,"motivo":"consumo"},
       {"articulo_id":"90000000-0000-0000-0000-000000000a03","cantidad":10,"motivo":"produccion"}
     ]') $$,
  'empacar: −bolsa −etiqueta +producto terminado en una sola llamada'
);
select results_eq(
  $$ select articulo_id::text, stock from public.v_stock
      where articulo_id in ('90000000-0000-0000-0000-000000000a01', '90000000-0000-0000-0000-000000000a02', '90000000-0000-0000-0000-000000000a03')
      order by articulo_id $$,
  $$ values ('90000000-0000-0000-0000-000000000a01', 190::numeric), ('90000000-0000-0000-0000-000000000a02', 30::numeric),
            ('90000000-0000-0000-0000-000000000a03', 20::numeric) $$,
  'stocks tras empacar: 190 / 30 / 20'
);

-- 8. Atomicidad -------------------------------------------------------------------------------------------
-- El 3.º movimiento falla DESPUÉS de haberse insertado los dos primeros: no debe quedar ninguno.
select throws_ok(
  $$ select public.registrar_movimientos('[
       {"articulo_id":"90000000-0000-0000-0000-000000000a01","cantidad":-1,"motivo":"consumo"},
       {"articulo_id":"90000000-0000-0000-0000-000000000a02","cantidad":-1,"motivo":"consumo"},
       {"articulo_id":"90000000-0000-0000-0000-000000000a03","cantidad":"mucho","motivo":"produccion"}
     ]') $$,
  'P0001', 'movimientos_invalidos', 'el 3.º movimiento con un valor inválido aborta la llamada'
);
select throws_ok(
  $$ select public.registrar_movimientos('[
       {"articulo_id":"90000000-0000-0000-0000-000000000a01","cantidad":-1,"motivo":"consumo"},
       {"articulo_id":"90000000-0000-0000-0000-000000000a02","cantidad":-1,"motivo":"consumo"},
       {"articulo_id":"90000000-0000-0000-0000-000000000a03","cantidad":5,"motivo":"venta"}
     ]') $$,
  'P0001', 'movimiento_invalido', 'el 3.º movimiento con signo incoherente aborta la llamada'
);
select results_eq(
  $$ select articulo_id::text, stock from public.v_stock
      where articulo_id in ('90000000-0000-0000-0000-000000000a01', '90000000-0000-0000-0000-000000000a02', '90000000-0000-0000-0000-000000000a03')
      order by articulo_id $$,
  $$ values ('90000000-0000-0000-0000-000000000a01', 190::numeric), ('90000000-0000-0000-0000-000000000a02', 30::numeric),
            ('90000000-0000-0000-0000-000000000a03', 20::numeric) $$,
  'atómico: tras los dos fallos no quedó ningún movimiento (stocks intactos)'
);
select is(
  (select count(*)::int from public.movimientos_inventario
    where articulo_id in ('90000000-0000-0000-0000-000000000a01', '90000000-0000-0000-0000-000000000a02', '90000000-0000-0000-0000-000000000a03')),
  6, 'atómico: siguen existiendo solo los 6 movimientos anteriores'
);

-- 9. Stock insuficiente ------------------------------------------------------------------------------------
select throws_ok(
  $$ select public.registrar_movimientos('[
       {"articulo_id":"90000000-0000-0000-0000-000000000a01","cantidad":-5,"motivo":"consumo"},
       {"articulo_id":"90000000-0000-0000-0000-000000000a03","cantidad":-25,"motivo":"venta"}
     ]') $$,
  'P0001', 'stock_insuficiente', 'una salida sin existencias falla con stock_insuficiente'
);
select ok(
  pg_temp.detalle_de($$ select public.registrar_movimientos('[
       {"articulo_id":"90000000-0000-0000-0000-000000000a03","cantidad":-25,"motivo":"venta"}]') $$)
    like '%Excelso 500 g%quedaría en -5%',
  'el detalle nombra el artículo y el stock que quedaría'
);
select is(
  (select stock from public.v_stock where articulo_id = '90000000-0000-0000-0000-000000000a01'),
  190::numeric, 'stock_insuficiente aborta todo: la salida válida de la bolsa tampoco quedó'
);
select throws_ok(
  $$ select public.registrar_movimientos('[
       {"articulo_id":"90000000-0000-0000-0000-000000000a03","cantidad":-25,"motivo":"ajuste","observaciones":"Conteo físico"}]', null) $$,
  'P0001', 'stock_insuficiente', 'un ajuste negativo que deja stock < 0 también falla (p_permitir_negativo null = false)'
);
select lives_ok(
  $$ select public.registrar_movimientos('[
       {"articulo_id":"90000000-0000-0000-0000-000000000a03","cantidad":-20,"motivo":"venta"}]') $$,
  'vender exactamente todo el stock (queda en 0) es válido'
);

-- Con p_permitir_negativo = true (caso venta): se registra y avisa.
delete from res;
select lives_ok(
  $$ insert into res select public.registrar_movimientos('[
       {"articulo_id":"90000000-0000-0000-0000-000000000a03","cantidad":-3,"motivo":"venta"}]', true) $$,
  'con p_permitir_negativo = true la venta sin stock se registra'
);
select is(
  (select j -> 'advertencias' -> 0 ->> 'articulo_id' from res),
  '90000000-0000-0000-0000-000000000a03', 'y devuelve la advertencia del artículo'
);
select is(
  (select (j -> 'advertencias' -> 0 ->> 'stock_resultante')::numeric from res),
  -3::numeric, 'con el stock resultante'
);
select is(
  (select stock from public.v_stock where articulo_id = '90000000-0000-0000-0000-000000000a03'),
  -3::numeric, 'v_stock refleja el stock negativo'
);
select is(
  (select bajo_minimo from public.v_stock where articulo_id = '90000000-0000-0000-0000-000000000a03'),
  false, 'sin mínimo definido, ni el negativo marca bajo_minimo (la alerta es solo con mínimo)'
);

-- Un artículo ya en negativo no bloquea una entrada que no lo empeora.
select lives_ok(
  $$ select public.registrar_movimientos('[
       {"articulo_id":"90000000-0000-0000-0000-000000000a03","cantidad":1,"motivo":"devolucion"}]') $$,
  'una entrada sobre un artículo en negativo no lanza stock_insuficiente'
);
select throws_ok(
  $$ select public.registrar_movimientos('[
       {"articulo_id":"90000000-0000-0000-0000-000000000a03","cantidad":-1,"motivo":"muestra"}]') $$,
  'P0001', 'stock_insuficiente', 'pero otra salida sobre ese artículo sí falla'
);

-- 10. Mínimos independientes por artículo ---------------------------------------------------------------------
select lives_ok(
  $$ update public.articulos set stock_minimo = 190 where id = '90000000-0000-0000-0000-000000000a01' $$,
  'el admin cambia el mínimo de la bolsa'
);
select is(
  (select bajo_minimo from public.v_stock where articulo_id = '90000000-0000-0000-0000-000000000a01'),
  false, 'stock = mínimo (190 = 190) no es bajo mínimo (estricto <)'
);
select lives_ok(
  $$ update public.articulos set stock_minimo = 191 where id = '90000000-0000-0000-0000-000000000a01' $$,
  'sube el mínimo de la bolsa a 191'
);
select results_eq(
  $$ select articulo_id::text, bajo_minimo from public.v_stock
      where articulo_id in ('90000000-0000-0000-0000-000000000a01', '90000000-0000-0000-0000-000000000a02')
      order by articulo_id $$,
  $$ values ('90000000-0000-0000-0000-000000000a01', true), ('90000000-0000-0000-0000-000000000a02', true) $$,
  'bolsa (190 < 191) y etiqueta (30 < 50) bajo mínimo, cada una con el suyo'
);
select lives_ok(
  $$ update public.articulos set stock_minimo = 10 where id = '90000000-0000-0000-0000-000000000a02' $$,
  'baja el mínimo de la etiqueta a 10'
);
select results_eq(
  $$ select articulo_id::text, bajo_minimo from public.v_stock
      where articulo_id in ('90000000-0000-0000-0000-000000000a01', '90000000-0000-0000-0000-000000000a02')
      order by articulo_id $$,
  $$ values ('90000000-0000-0000-0000-000000000a01', true), ('90000000-0000-0000-0000-000000000a02', false) $$,
  'cambiar el mínimo de uno no afecta al otro'
);
select is(
  (select count(*)::int from public.v_stock where bajo_minimo and articulo_id = '90000000-0000-0000-0000-000000000a01'),
  1, 'la bolsa sale al filtrar por bajo_minimo (lo que usa la tarjeta de alertas)'
);

-- 11. Validación de la entrada de la RPC ----------------------------------------------------------------------
select throws_ok($$ select public.registrar_movimientos('[]') $$, 'P0001', 'movimientos_invalidos', 'lista vacía');
select throws_ok($$ select public.registrar_movimientos(null) $$, 'P0001', 'movimientos_invalidos', 'null');
select throws_ok($$ select public.registrar_movimientos('{"cantidad":1}') $$, 'P0001', 'movimientos_invalidos', 'un objeto en vez de una lista');
select throws_ok(
  $$ select public.registrar_movimientos('[{"cantidad":1,"motivo":"compra"}]') $$,
  'P0001', 'movimientos_invalidos', 'sin articulo_id'
);
select throws_ok(
  $$ select public.registrar_movimientos('[{"articulo_id":"no-es-uuid","cantidad":1,"motivo":"compra"}]') $$,
  'P0001', 'movimientos_invalidos', 'articulo_id que no es un uuid'
);
select throws_ok(
  $$ select public.registrar_movimientos('[{"articulo_id":"90000000-0000-0000-0000-000000000a01","cantidad":1,"motivo":"inventado"}]') $$,
  'P0001', 'movimientos_invalidos', 'motivo que no existe'
);
select throws_ok(
  $$ select public.registrar_movimientos('[{"articulo_id":"90000000-0000-0000-0000-000000000a01","cantidad":1}]') $$,
  'P0001', 'movimiento_invalido', 'sin motivo'
);
select throws_ok(
  $$ select public.registrar_movimientos('[{"articulo_id":"90000000-0000-0000-0000-000000000a01","cantidad":0,"motivo":"ajuste","observaciones":"x"}]') $$,
  'P0001', 'movimiento_invalido', 'cantidad cero'
);
select throws_ok(
  $$ select public.registrar_movimientos('[{"articulo_id":"90000000-0000-0000-0000-000000000a01","cantidad":-1,"motivo":"compra"}]') $$,
  'P0001', 'movimiento_invalido', 'compra con cantidad negativa (mensaje claro antes de saltar el CHECK)'
);
select throws_ok(
  $$ select public.registrar_movimientos('[{"articulo_id":"90000000-0000-0000-0000-000000000a01","cantidad":1,"motivo":"ajuste"}]') $$,
  'P0001', 'movimiento_invalido', 'ajuste sin observación'
);
select throws_ok(
  $$ select public.registrar_movimientos('[{"articulo_id":"90000000-0000-0000-0000-0000000000ff","cantidad":1,"motivo":"compra"}]') $$,
  'P0001', 'articulo_no_encontrado', 'artículo inexistente'
);

-- 12. Kardex: saldo acumulado ------------------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.articulos (id, nombre, tipo, atributos)
     values ('90000000-0000-0000-0000-000000000a04', 'Artículo del kardex', 'insumo', '{"k":1}') $$,
  'crea el artículo del kardex'
);
select lives_ok(
  $$ select public.registrar_movimientos('[{"articulo_id":"90000000-0000-0000-0000-000000000a04","cantidad":100,"motivo":"compra","fecha":"2026-01-01T10:00:00Z"}]') $$,
  'kardex: compra de 100'
);
select lives_ok(
  $$ select public.registrar_movimientos('[{"articulo_id":"90000000-0000-0000-0000-000000000a04","cantidad":-30,"motivo":"consumo","fecha":"2026-01-02T10:00:00Z"}]') $$,
  'kardex: consumo de 30'
);
select lives_ok(
  $$ select public.registrar_movimientos('[
       {"articulo_id":"90000000-0000-0000-0000-000000000a04","cantidad":-20,"motivo":"venta","fecha":"2026-01-03T10:00:00Z",
        "ref_tipo":"cafe.venta","ref_id":"90000000-0000-0000-0000-0000000000f2","costo_unitario":9000},
       {"articulo_id":"90000000-0000-0000-0000-000000000a04","cantidad":-5,"motivo":"perdida","fecha":"2026-01-03T10:00:00Z"},
       {"articulo_id":"90000000-0000-0000-0000-000000000a04","cantidad":-5,"motivo":"muestra","fecha":"2026-01-03T10:00:00Z"}
     ]') $$,
  'kardex: tres salidas con la misma fecha en una sola llamada'
);
select is(
  (select array_agg(saldo order by fecha, created_at, seq) from public.v_kardex
    where articulo_id = '90000000-0000-0000-0000-000000000a04'),
  array[100, 70, 50, 45, 40]::numeric[], 'v_kardex: saldo acumulado 100, 70, 50, 45, 40 (sin empates entre movimientos simultáneos)'
);
select is(
  (select saldo from public.v_kardex where articulo_id = '90000000-0000-0000-0000-000000000a04' order by fecha desc, seq desc limit 1),
  (select stock from public.v_stock where articulo_id = '90000000-0000-0000-0000-000000000a04'),
  'el último saldo del kardex es el stock de v_stock'
);
select is(
  (select saldo from public.v_kardex
    where articulo_id = '90000000-0000-0000-0000-000000000a04' and fecha >= '2026-01-02T00:00:00Z'
    order by fecha, seq limit 1),
  70::numeric, 'filtrar por rango de fechas no reinicia el saldo (arrastra lo anterior)'
);
select results_eq(
  $$ select ref_tipo, ref_id::text, costo_unitario from public.v_kardex
      where articulo_id = '90000000-0000-0000-0000-000000000a04' and motivo = 'venta' $$,
  $$ values ('cafe.venta', '90000000-0000-0000-0000-0000000000f2', 9000.00::numeric) $$,
  'la referencia y el costo del movimiento llegan al kardex'
);
select is(
  (select articulo_nombre from public.v_kardex where articulo_id = '90000000-0000-0000-0000-000000000a04' limit 1),
  'Artículo del kardex', 'el kardex trae el nombre del artículo'
);

-- 13. Desactivar, no borrar ---------------------------------------------------------------------------------------------
select throws_ok(
  $$ delete from public.articulos where id = '90000000-0000-0000-0000-000000000a04' $$,
  '42501', null, 'el admin no puede borrar un artículo'
);
select lives_ok(
  $$ update public.articulos set activo = false where id = '90000000-0000-0000-0000-000000000a04' $$,
  'el admin desactiva el artículo'
);
select throws_ok(
  $$ select public.registrar_movimientos('[{"articulo_id":"90000000-0000-0000-0000-000000000a04","cantidad":1,"motivo":"compra"}]') $$,
  'P0001', 'articulo_inactivo', 'un artículo desactivado no admite movimientos'
);
select is(
  (select stock from public.v_stock where articulo_id = '90000000-0000-0000-0000-000000000a04' and not activo),
  40::numeric, 'v_stock sigue mostrando el artículo desactivado, con su stock'
);
select throws_ok(
  $$ update public.articulos set tipo = 'otro' where id = '90000000-0000-0000-0000-000000000a01' $$,
  '42501', null, 'el tipo no se edita una vez creado el artículo'
);
select throws_ok(
  $$ update public.articulos set unidad = 'kg' where id = '90000000-0000-0000-0000-000000000a01' $$,
  '42501', null, 'la unidad tampoco'
);

-- 14. Auditoría ----------------------------------------------------------------------------------------------------------
select is(
  (select updated_by from public.articulos where id = '90000000-0000-0000-0000-000000000a04'),
  (select auth.uid()), 'set_updated rellena updated_by (el usuario de la sesión)'
);
select ok(
  (select updated_at is not null from public.articulos where id = '90000000-0000-0000-0000-000000000a04'),
  'set_updated rellena updated_at'
);

reset role;
select is(
  (select count(*)::int from audit.log
    where tabla = 'public.articulos' and registro_id = '90000000-0000-0000-0000-000000000a04' and accion = 'INSERT'),
  1, 'el alta del artículo quedó en audit.log'
);
select is(
  (select cambios from audit.log
    where tabla = 'public.articulos' and registro_id = '90000000-0000-0000-0000-000000000a04' and accion = 'UPDATE'),
  '{"activo": false}'::jsonb, 'desactivarlo quedó en audit.log con solo el campo cambiado'
);
select is(
  (select count(*)::int from audit.log where tabla = 'public.movimientos_inventario'),
  0, 'los movimientos no se auditan (ya son un log)'
);
select throws_ok(
  $$ delete from public.articulos where id = '90000000-0000-0000-0000-000000000a04' $$,
  '23503', null, 'incluso como dueño, un artículo con movimientos no se borra (FK restrict)'
);

-- 15. Roles dentro del cliente ---------------------------------------------------------------------------------------------
-- operativo
select tests.autenticar_como('user@vb.test');
select is((select count(*)::int from public.articulos), 8, 'el operativo lee los artículos de su cliente');
select lives_ok(
  $$ select public.registrar_movimientos('[
       {"articulo_id":"90000000-0000-0000-0000-000000000a01","cantidad":-5,"motivo":"consumo"},
       {"articulo_id":"90000000-0000-0000-0000-000000000a02","cantidad":-5,"motivo":"consumo"},
       {"articulo_id":"90000000-0000-0000-0000-000000000a03","cantidad":5,"motivo":"produccion"}]') $$,
  'el operativo registra movimientos (empacar) vía la RPC'
);
select throws_ok(
  $$ insert into public.articulos (nombre, tipo) values ('Lo crea un operativo', 'otro') $$,
  '42501', null, 'el operativo no crea artículos'
);
select is(
  tests.filas_afectadas($$ update public.articulos set stock_minimo = 1 where id = '90000000-0000-0000-0000-000000000a01' $$),
  0, 'el operativo no edita artículos (RLS: 0 filas)'
);
select throws_ok(
  $$ update public.movimientos_inventario set cantidad = 1 $$,
  '42501', null, 'el operativo no modifica movimientos'
);
reset role;

-- viewer
select tests.autenticar_como('viewer@vb.test');
select is((select count(*)::int from public.articulos), 8, 'el viewer lee los artículos');
select ok((select count(*) from public.v_stock) > 0 and (select count(*) from public.v_kardex) > 0, 'el viewer lee v_stock y v_kardex');
select throws_ok(
  $$ select public.registrar_movimientos('[{"articulo_id":"90000000-0000-0000-0000-000000000a01","cantidad":1,"motivo":"compra"}]') $$,
  '42501', null, 'el viewer no registra movimientos por la RPC'
);
select throws_ok(
  $$ insert into public.movimientos_inventario (articulo_id, cantidad, motivo)
     values ('90000000-0000-0000-0000-000000000a01', 1, 'compra') $$,
  '42501', null, 'el viewer tampoco por INSERT directo'
);
select throws_ok(
  $$ insert into public.articulos (nombre, tipo) values ('Lo crea un viewer', 'otro') $$,
  '42501', null, 'el viewer no crea artículos'
);
select is(
  tests.filas_afectadas($$ update public.articulos set activo = false where id = '90000000-0000-0000-0000-000000000a01' $$),
  0, 'el viewer no desactiva artículos'
);
reset role;

-- 16. Aislamiento por cliente -------------------------------------------------------------------------------------------------
select tests.autenticar_como('admin@velero.test');
select is((select count(*)::int from public.articulos), 0, 'El Velero no ve ningún artículo de Villa Blanca');
select is((select count(*)::int from public.movimientos_inventario), 0, 'ni sus movimientos');
select is((select count(*)::int from public.v_stock), 0, 'ni v_stock');
select is((select count(*)::int from public.v_kardex), 0, 'ni v_kardex');
select lives_ok(
  $$ insert into public.articulos (id, nombre, tipo, codigo, atributos)
     values ('90000000-0000-0000-0000-000000000b01', 'Bolsa 500 g', 'insumo', 'BOL-500', '{"clase":"bolsa","presentacion_g":500}') $$,
  'El Velero crea el mismo tipo + atributos y el mismo código (la unicidad es por cliente)'
);
select throws_ok(
  $$ select public.registrar_movimientos('[{"articulo_id":"90000000-0000-0000-0000-000000000a01","cantidad":1,"motivo":"compra"}]') $$,
  'P0001', 'articulo_no_encontrado', 'no registra movimientos sobre un artículo de Villa Blanca por la RPC'
);
select throws_ok(
  $$ insert into public.movimientos_inventario (articulo_id, cantidad, motivo)
     values ('90000000-0000-0000-0000-000000000a01', 1, 'compra') $$,
  '23503', null, 'ni por INSERT directo (la FK compuesta exige el mismo cliente)'
);
select throws_ok(
  $$ insert into public.movimientos_inventario (tenant_id, articulo_id, cantidad, motivo)
     values ('00000000-0000-0000-0000-0000000000a1', '90000000-0000-0000-0000-000000000a01', 1, 'compra') $$,
  '42501', null, 'ni falseando tenant_id (el WITH CHECK lo impide)'
);
select throws_ok(
  $$ insert into public.articulos (tenant_id, nombre, tipo) values ('00000000-0000-0000-0000-0000000000a1', 'Falso', 'otro') $$,
  '42501', null, 'ni creando artículos en el cliente ajeno'
);
select is(
  tests.filas_afectadas($$ update public.articulos set activo = false where id = '90000000-0000-0000-0000-000000000a01' $$),
  0, 'no edita artículos de Villa Blanca (0 filas)'
);
select lives_ok(
  $$ select public.registrar_movimientos('[{"articulo_id":"90000000-0000-0000-0000-000000000b01","cantidad":7,"motivo":"compra"}]') $$,
  'sí registra sobre su propio artículo'
);
select is(
  (select stock from public.v_stock where articulo_id = '90000000-0000-0000-0000-000000000b01'),
  7::numeric, 'y ve su stock'
);
reset role;

-- Villa Blanca no ve lo de El Velero
select tests.autenticar_como('admin@vb.test');
select is(
  (select count(*)::int from public.articulos where id = '90000000-0000-0000-0000-000000000b01'),
  0, 'Villa Blanca no ve el artículo de El Velero'
);
select is(
  (select count(*)::int from public.v_stock where tenant_id <> '00000000-0000-0000-0000-0000000000a1'),
  0, 'v_stock de Villa Blanca no mezcla clientes'
);
reset role;

-- 17. Sin sesión ----------------------------------------------------------------------------------------------------------------
select tests.como_anon();
select throws_ok($$ select count(*) from public.articulos $$, '42501', null, 'anon no lee articulos');
select throws_ok($$ select count(*) from public.v_stock $$, '42501', null, 'anon no lee v_stock');
select throws_ok(
  $$ select public.registrar_movimientos('[{"articulo_id":"90000000-0000-0000-0000-000000000a01","cantidad":1,"motivo":"compra"}]') $$,
  '42501', null, 'anon no ejecuta registrar_movimientos'
);
reset role;

select * from finish();
rollback;
