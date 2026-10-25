# supabase/legacy — solo historia

Aquí están los `.sql` fechados que se aplicaron a mano / vía MCP **antes** de FIN-81 (CO-01), más los
scripts del antiguo schema `preview` (`preview-schema.sql`, `copy-public-to-preview.sql`,
`2026-08-04-preview-unificar-animales.sql`).

**La fuente de verdad del esquema es [`../migrations/`](../migrations/).** Su baseline
(`20261019000000_baseline.sql`) ya incluye el resultado de todos estos ficheros.

- No los ejecutes: duplicarían objetos que la baseline ya crea, y los de `preview` apuntan a un
  schema que desaparece con el proyecto de staging separado (el schema `preview` del proyecto de
  producción se borra en CO-19).
- No los edites. Sirven para entender *por qué* el esquema es como es (por ejemplo,
  `2026-08-05-multitenancy.sql` documenta `tenant_actual()`, `rol_actual()` y el alta de un cliente).
- Un cambio de esquema nuevo va como migración en `supabase/migrations/`, nunca aquí.
