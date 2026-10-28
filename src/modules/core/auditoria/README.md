# auditoria

Lectura del log de auditoría (`audit.log`, FIN-88). El log lo escriben triggers en la base; aquí solo se consulta.

- `actions/historial.actions.ts` → `getHistorialCambios(tabla, registroId?)`: llama a la RPC `public.historial_cambios` (el esquema `audit` no está expuesto en la API). Solo owner/admin (membresía) y solo el cliente del llamante.
- `components/historial-cambios.tsx` → lista presentacional (fecha, usuario, acción, campos). Admite `etiquetaRegistro` y `resumir` para personalizar texto; lo usa la pantalla de equipo (`core/equipo`).
- `lib/formato-cambios.ts` → formateo puro (con tests).

Para auditar una tabla nueva ver *Auditoría* en CLAUDE.md.
