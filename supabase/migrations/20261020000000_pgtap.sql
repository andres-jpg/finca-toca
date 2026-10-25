-- FIN-83 · Habilita pgTAP para `supabase test db` (los tests viven en supabase/tests/).
-- En el esquema `extensions`, igual que el resto de extensiones de Supabase.
create extension if not exists pgtap with schema extensions;
