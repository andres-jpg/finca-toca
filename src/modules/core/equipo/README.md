# equipo

Pantalla de equipo del cliente (FIN-103): el `owner`/`admin` invita usuarios, cambia su rol, los desactiva y ve el historial. Módulo `core.equipo`; página en `src/app/dashboard/equipo/`.

- `actions/equipo.actions.ts` → `invitarMiembro`, `cambiarRolMiembro`, `cambiarEstadoMiembro`. Cada una: `requireModulo` → `requireRolTenant(['owner','admin'])` → Zod → RPC. El cliente admin (service role) solo se usa para `inviteUserByEmail`, tras esa autorización y tras la RPC.
- `queries/equipo.queries.ts` → `listarMiembros()` (RPC `listar_miembros_tenant`).
- `lib/roles.ts` → etiquetas de rol (Propietario/Administrador/Operativo/Gerencia) y reglas de la interfaz; `lib/historial.ts` → resumen de los cambios de `tenant_members` para el historial.
- Las reglas de verdad viven en las RPC de `supabase/migrations/20261101110000_equipo.sql` (nadie se modifica a sí mismo, solo un owner toca a un owner, siempre queda un owner). La UI solo las refleja.

Ver *Equipo del cliente (FIN-103)* en CLAUDE.md.
