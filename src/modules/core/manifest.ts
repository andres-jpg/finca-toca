import type { ModuleManifest } from "./registry/types";

/**
 * Navegación del núcleo: pantallas que sirven a cualquier vertical y aparecen cuando el cliente tiene
 * el módulo activo en `tenant_modulos`. Los clientes de café lo reciben al alta (`crear_tenant`); ganadería
 * y cooperativa no lo tienen de serie, así que no las ven:
 * - Terceros → `/dashboard/terceros` (FIN-93, CO-13).
 * - Tarifas y parámetros → `src/app/dashboard/tarifas` (FIN-94, CO-14). No hay `core.tarifas` en el catálogo
 *   de módulos, así que cuelga de `core.terceros` (decisión de FIN-94: no se inventan módulos sin avisar).
 * Quien cree cada página debe usar `requireModuloPagina()` en ella y `requireModulo()` en sus actions.
 */
export const coreManifest: ModuleManifest = {
  vertical: "core",
  nav: [
    { href: "/dashboard/terceros", label: "Terceros", icon: "Handshake", modulo: "core.terceros", roles: ["owner", "admin", "operativo", "viewer"], grupo: "Maestros", orden: 10 },
    // En «Maestros», junto a Terceros (HU-F1-09 del café las ubica ahí; los parámetros son un maestro más).
    // Ruta aparte de /dashboard/configuracion a propósito: el resaltado de la barra es por prefijo y
    // "Configuración" (ganadería) quedaría marcada junto a ella.
    { href: "/dashboard/tarifas", label: "Tarifas y parámetros", icon: "SlidersHorizontal", modulo: "core.terceros", roles: ["owner", "admin"], grupo: "Maestros", orden: 20 },
    // Equipo del cliente (FIN-103): módulo propio `core.equipo`, activo solo en los clientes de café por ahora.
    { href: "/dashboard/equipo", label: "Equipo", icon: "UserCog", modulo: "core.equipo", roles: ["owner", "admin"], grupo: "Maestros", orden: 30 },
  ],
};
