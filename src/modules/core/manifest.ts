import type { ModuleManifest } from "./registry/types";

/**
 * Navegación del núcleo: pantallas que sirven a cualquier vertical y aparecen cuando el cliente tiene
 * el módulo activo en `tenant_modulos`. **Hoy ningún cliente tiene `core.terceros`, así que ninguna de
 * estas entradas se ve**, y las dos páginas todavía no existen:
 * - Terceros → la crea FIN-93 (CO-13).
 * - Tarifas y parámetros → la crea FIN-94 (CO-14), que decidirá la ruta definitiva y si merece un módulo
 *   propio (no hay `core.tarifas` en el catálogo; por ahora cuelga de `core.terceros`).
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
