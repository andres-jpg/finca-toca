import type { ModuleManifest } from "./registry/types";

/**
 * Navegación del núcleo: pantallas que sirven a cualquier vertical y aparecen cuando el cliente tiene
 * el módulo activo en `tenant_modulos`. **Hoy ningún cliente tiene `core.terceros`, así que ninguna de
 * estas entradas se ve**:
 * - Terceros → la crea FIN-93 (CO-13); la página todavía no existe.
 * - Tarifas y parámetros → `src/app/dashboard/tarifas` (FIN-94, CO-14). No hay `core.tarifas` en el catálogo
 *   de módulos, así que cuelga de `core.terceros` (decisión de FIN-94: no se inventan módulos sin avisar).
 * Quien cree cada página debe usar `requireModuloPagina()` en ella y `requireModulo()` en sus actions.
 */
export const coreManifest: ModuleManifest = {
  vertical: "core",
  nav: [
    { href: "/dashboard/terceros", label: "Terceros", icon: "Handshake", modulo: "core.terceros", roles: ["owner", "admin", "operativo", "viewer"], grupo: "Maestros", orden: 10 },
    // Ruta aparte de /dashboard/configuracion a propósito: el resaltado de la barra es por prefijo y
    // "Configuración" (ganadería) quedaría marcada junto a ella.
    { href: "/dashboard/tarifas", label: "Tarifas y parámetros", icon: "SlidersHorizontal", modulo: "core.terceros", roles: ["owner", "admin"], grupo: "Configuración", orden: 10 },
  ],
};
