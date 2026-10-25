-- Schema `cafe`: vertical de café (FIN-86 · CO-06). Nace vacío; las tablas llegan en fases posteriores.
-- Solo `authenticated` y `service_role` lo usan; `anon` queda fuera.
-- Recuerda exponerlo en la API: local en supabase/config.toml; staging/prod a mano en
-- Settings → API → Exposed schemas.

create schema if not exists cafe;

grant usage on schema cafe to authenticated, service_role;

-- Privilegios por defecto para lo que se cree después en el schema (tablas, secuencias, funciones).
alter default privileges in schema cafe grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema cafe grant usage, select on sequences to authenticated;
alter default privileges in schema cafe grant execute on functions to authenticated;

revoke all on schema cafe from anon;
