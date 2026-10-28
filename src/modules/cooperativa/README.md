# cooperativa — vertical de cooperativa

Pendiente de migrar desde `src/features` (Fase 2): `fincas-cooperativa`, `rutas-cooperativa`, `itinerarios`, `recolecciones`, `pagos-cooperativa`, `usuarios-cooperativa`, `informes-cooperativa`.

Hasta entonces el código sigue en `src/features`. Cuando llegue aquí aplicarán las mismas reglas que al resto de verticales: puede usar `core`, `ui` y `lib`, pero no otro vertical.

## `manifest.ts`

Declara la navegación del vertical (`NavItemDef[]`): las entradas del menú con su `modulo`, `rolesLegacy`, icono y orden. La barra lateral se construye con él (`getNavParaSesion()` en `src/modules/registry.ts`); ya no hay lista de rutas en `sidebar.tsx`. Una pantalla nueva añade su entrada aquí, `requireModuloPagina()` en la página y `requireModulo()` en sus actions. Ver *Registro de módulos y barra lateral (FIN-92)* en CLAUDE.md.
