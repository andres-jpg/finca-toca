import type { ModuleManifest } from "@/modules/core/registry/types";

/**
 * Navegación del vertical de cooperativa, trasladada tal cual de la antigua barra lateral (mismas
 * rutas, etiquetas, iconos y roles; `rolesLegacy` = los `allowedRoles` de siempre).
 *
 * `hideInPWA`: Itinerarios es una vista de administración; en la PWA instalada el conductor
 * (`cooperativa_user`) trabaja con Recolecciones y no la ve. El admin de la cooperativa sí la sigue
 * viendo (la regla de rol vive en `ocultoEnPWA()`, `core/registry/nav.ts`).
 *
 * `orden` arranca en 110 para no repetirse con ganadería: un cliente tiene un único vertical, así que no
 * coinciden en un mismo menú, pero un `orden` único por plataforma evita sorpresas el día que un tenant
 * mezcle verticales.
 */
export const cooperativaManifest: ModuleManifest = {
  vertical: "cooperativa",
  nav: [
    { href: "/dashboard/cooperativa", label: "Dashboard Coop.", icon: "LayoutDashboard", modulo: "cooperativa.recolecciones", rolesLegacy: ["cooperativa_admin"], orden: 110 },
    { href: "/dashboard/fincas-cooperativa", label: "Fincas", icon: "Building2", modulo: "cooperativa.rutas", rolesLegacy: ["cooperativa_admin"], orden: 120 },
    { href: "/dashboard/rutas-cooperativa", label: "Rutas", icon: "MapPin", modulo: "cooperativa.rutas", rolesLegacy: ["cooperativa_admin"], orden: 130 },
    { href: "/dashboard/itinerarios", label: "Itinerarios", icon: "Route", modulo: "cooperativa.rutas", rolesLegacy: ["cooperativa_admin", "cooperativa_user"], hideInPWA: true, orden: 140 },
    { href: "/dashboard/recolecciones", label: "Recolecciones", icon: "ClipboardList", modulo: "cooperativa.recolecciones", rolesLegacy: ["cooperativa_admin", "cooperativa_user"], orden: 150 },
    { href: "/dashboard/mi-historial", label: "Mi historial", icon: "History", modulo: "cooperativa.recolecciones", rolesLegacy: ["cooperativa_user"], orden: 160 },
    { href: "/dashboard/informes-cooperativa", label: "Informes", icon: "FileSpreadsheet", modulo: "cooperativa.informes", rolesLegacy: ["cooperativa_admin"], orden: 170 },
    { href: "/dashboard/pagos-cooperativa", label: "Pagos", icon: "Banknote", modulo: "cooperativa.pagos", rolesLegacy: ["cooperativa_admin"], orden: 180 },
    // La asignación usuario → itinerario es parte de la gestión de rutas.
    { href: "/dashboard/usuarios-cooperativa", label: "Usuarios", icon: "Users", modulo: "cooperativa.rutas", rolesLegacy: ["cooperativa_admin"], orden: 190 },
  ],
};
