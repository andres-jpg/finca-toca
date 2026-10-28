-- Patrón de escrituras transaccionales (FIN-87): una función Postgres llamada por RPC es
-- atómica; si falla a mitad, no queda NADA escrito. Este fichero es el ejemplo de referencia
-- del patrón (ver "Escrituras transaccionales" en CLAUDE.md y src/modules/core/README.md).
--
-- `ping_transaccional` NO está en ninguna migración a propósito: se crea aquí, dentro de la
-- transacción del test, y el `rollback` final la retira. Así no llega a staging ni a
-- producción. Sigue la plantilla al pie de la letra (security invoker, search_path vacío,
-- errores P0001 con message = código y detail = texto, revoke/grant). Las tablas son
-- temporales, por eso van calificadas con `pg_temp.` (con search_path vacío no se resuelven solas).
begin;

select plan(12);

create temp table ping_a (id int primary key, nota text not null);
create temp table ping_b (id int primary key, valor int not null check (valor > 0));
grant select, insert on ping_a, ping_b to authenticated;

create or replace function public.ping_transaccional(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_fallar text := p->>'fallar';
begin
  -- 1) reglas de negocio, antes de escribir nada
  if p->>'id' is null then
    raise exception using errcode = 'P0001', message = 'id_requerido', detail = 'Falta el id del ping.';
  end if;

  -- 2) escrituras: la primera ya está hecha cuando la segunda puede fallar
  insert into pg_temp.ping_a (id, nota) values ((p->>'id')::int, 'a');

  if v_fallar = 'true' then
    raise exception using errcode = 'P0001', message = 'ping_fallido', detail = 'Falla a mitad, a propósito.';
  end if;

  -- fallo "natural" de la base (CHECK valor > 0) en lugar de un raise
  insert into pg_temp.ping_b (id, valor)
  values ((p->>'id')::int, case when v_fallar = 'constraint' then 0 else 1 end);

  -- 3) retorno
  return jsonb_build_object('id', (p->>'id')::int);
end $$;

revoke execute on function public.ping_transaccional(jsonb) from public, anon;
grant execute on function public.ping_transaccional(jsonb) to authenticated;

-- Devuelve el `detail` con el que falla una llamada (lo que callRpc entrega como `message`).
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

-- 1. Seguridad de la plantilla ----------------------------------------------------------------
select tests.como_anon();
select throws_ok(
  $$ select public.ping_transaccional('{"id": 1}') $$,
  '42501', null, 'anon no puede ejecutar la función (revoke ... from public, anon)'
);
reset role;

select is(
  (select p.prosecdef from pg_proc p where p.proname = 'ping_transaccional'),
  false, 'es security invoker: RLS sigue aplicando con el usuario real'
);

-- 2. Camino feliz: las dos tablas quedan escritas ---------------------------------------------
select tests.autenticar_como('admin@vb.test');

select is(
  public.ping_transaccional('{"id": 1}'),
  '{"id": 1}'::jsonb, 'devuelve el jsonb con el id'
);
select results_eq(
  $$ select (select count(*)::int from ping_a), (select count(*)::int from ping_b) $$,
  $$ values (1, 1) $$,
  'camino feliz: una fila en cada tabla'
);

-- 3. Fallo de negocio a mitad (raise P0001): rollback completo ---------------------------------
select throws_ok(
  $$ select public.ping_transaccional('{"id": 2, "fallar": "true"}') $$,
  'P0001', 'ping_fallido', 'el fallo de negocio sale con errcode P0001 y message = código'
);
select is(
  pg_temp.detalle_de($$ select public.ping_transaccional('{"id": 3, "fallar": "true"}') $$),
  'Falla a mitad, a propósito.', 'detail lleva el texto para el usuario'
);
select results_eq(
  $$ select (select count(*)::int from ping_a where id in (2, 3)), (select count(*)::int from ping_b where id in (2, 3)) $$,
  $$ values (0, 0) $$,
  'rollback completo: la inserción previa a la falla (ping_a) no quedó escrita'
);

-- 4. Fallo natural de la base a mitad (CHECK): también rollback completo ------------------------
select throws_ok(
  $$ select public.ping_transaccional('{"id": 4, "fallar": "constraint"}') $$,
  '23514', null, 'una violación de CHECK a mitad aborta la función'
);
select results_eq(
  $$ select (select count(*)::int from ping_a where id = 4), (select count(*)::int from ping_b where id = 4) $$,
  $$ values (0, 0) $$,
  'rollback completo también ante un error de la base'
);

-- 5. Validación previa: falla antes de escribir ---------------------------------------------------
select throws_ok(
  $$ select public.ping_transaccional('{}') $$,
  'P0001', 'id_requerido', 'una regla de negocio incumplida lanza su código'
);

-- 6. Solo quedó lo del camino feliz --------------------------------------------------------------
select results_eq(
  $$ select (select count(*)::int from ping_a), (select count(*)::int from ping_b) $$,
  $$ values (1, 1) $$,
  'al final solo existe la escritura del camino feliz'
);
select is(
  (select count(*)::int from ping_a where id <> 1),
  0, 'ninguna fila huérfana en ping_a'
);

reset role;
select * from finish();
rollback;
