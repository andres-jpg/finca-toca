-- Último fichero (orden alfabético): retira el esquema `tests` que creó 00_helpers.sql.
-- Sin esto, el esquema se queda en la base local y `pnpm db:diff` lo metería en la siguiente
-- migración generada. 00_helpers.sql lo vuelve a crear en cada ejecución de `pnpm test:db`;
-- por eso los tests se lanzan siempre juntos y no fichero a fichero.
begin;

select plan(1);

drop schema if exists tests cascade;

select hasnt_schema('tests', 'el esquema de helpers no se queda en la base');

select * from finish();
commit;
