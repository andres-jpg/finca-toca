-- Helpers compartidos por los tests de supabase/tests/. Se ejecuta primero (orden alfabético)
-- y, a diferencia del resto, hace COMMIT: las funciones del esquema `tests` tienen que seguir
-- ahí cuando arranquen los demás ficheros. Es idempotente (create or replace) y 99_limpieza.test.sql
-- lo retira al final, para que `pnpm db:diff` no lo confunda con esquema de la app.
--
-- Uso desde un test (siempre dentro de begin ... rollback):
--   select tests.autenticar_como('admin@vb.test');   -- a partir de aquí RLS aplica como ese usuario
--   reset role;                                      -- vuelve a postgres (para preparar datos o cambiar de usuario)
--   select tests.como_anon();                        -- peticiones sin sesión (clave pública)
begin;

select plan(4);

create schema if not exists tests;

-- Simula a un usuario autenticado por su email del seed: busca su uuid en auth.users, fija los
-- claims que PostgREST pondría (`auth.uid()` los lee) y cambia al rol `authenticated` hasta el
-- final de la transacción. Falla en voz alta si el email no existe, para que un seed cambiado
-- no convierta los tests en falsos positivos ("no veo nada" porque el usuario no existe).
create or replace function tests.autenticar_como(p_email text)
returns void
language plpgsql
as $$
declare
  v_id uuid;
begin
  select id into v_id from auth.users where email = p_email;
  if v_id is null then
    raise exception 'tests.autenticar_como: no existe el usuario % en auth.users (¿se ejecutó db reset con el seed?)', p_email;
  end if;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_id, 'role', 'authenticated', 'email', p_email)::text,
    true
  );
  perform set_config('request.jwt.claim.sub', v_id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  set local role authenticated;
end;
$$;

-- Petición sin sesión: rol `anon` y sin `sub`.
create or replace function tests.como_anon()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  set local role anon;
end;
$$;

-- Ejecuta un INSERT/UPDATE/DELETE y devuelve cuántas filas tocó. Con RLS, una fila que la
-- política no deja ver/tocar no da error: simplemente no se afecta, y ese 0 es lo que se comprueba.
-- (Un `WITH ... UPDATE` dentro de un subselect no es válido en Postgres, de ahí la función.)
create or replace function tests.filas_afectadas(p_sql text)
returns integer
language plpgsql
as $$
declare
  v_filas integer;
begin
  execute p_sql;
  get diagnostics v_filas = row_count;
  return v_filas;
end;
$$;

-- Los tests llaman a los helpers también con el rol ya cambiado (authenticated/anon).
grant usage on schema tests to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;

select has_schema('tests', 'existe el esquema de helpers');
select has_function('tests', 'autenticar_como', array['text'], 'existe tests.autenticar_como(email)');
select has_function('tests', 'filas_afectadas', array['text'], 'existe tests.filas_afectadas(sql)');
select has_function('tests', 'como_anon', 'existe tests.como_anon()');

select * from finish();
commit;
