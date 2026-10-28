import type { ModuleManifest } from "@/modules/core/registry/types";

/**
 * Navegación del vertical de ganadería, trasladada tal cual de la antigua barra lateral: mismas rutas,
 * etiquetas, iconos y roles (`rolesLegacy` = los `allowedRoles` de siempre; estas pantallas siguen
 * gobernadas por la tabla `roles`). `modulo` es el módulo del catálogo al que pertenece cada pantalla:
 * los cuatro de base los tiene todo cliente ganadero; Arriendos solo si hay fila en `tenant_modulos`.
 * Sin `grupo`: el menú es plano, como siempre.
 *
 * Ojo: la entrada solo esconde la opción. Cada página sigue protegiéndose con `checkRoutePermission()`
 * (y Arriendos, con `requireModuloPagina()`).
 */
export const ganaderiaManifest: ModuleManifest = {
  vertical: "ganaderia",
  nav: [
    { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", modulo: "ganaderia.finanzas", rolesLegacy: ["admin", "viewer"], orden: 10 },
    { href: "/dashboard/gastos", label: "Gastos", icon: "ArrowDownCircle", modulo: "ganaderia.finanzas", rolesLegacy: ["admin", "viewer"], orden: 20 },
    { href: "/dashboard/ingresos", label: "Ingresos", icon: "ArrowUpCircle", modulo: "ganaderia.finanzas", rolesLegacy: ["admin", "viewer"], orden: 30 },
    { href: "/dashboard/extracciones", label: "Extracciones", icon: "Droplets", modulo: "ganaderia.extracciones", rolesLegacy: ["admin", "viewer", "user"], orden: 40 },
    { href: "/dashboard/animales", label: "Animales", icon: "PiCow", modulo: "ganaderia.animales", rolesLegacy: ["admin", "viewer"], orden: 50 },
    { href: "/dashboard/informe-avanzado", label: "Informe avanzado", icon: "CalendarClock", modulo: "ganaderia.animales", rolesLegacy: ["admin", "viewer"], orden: 60 },
    { href: "/dashboard/inventario", label: "Inventario", icon: "Package", modulo: "ganaderia.inventario", rolesLegacy: ["admin", "viewer"], orden: 70 },
    { href: "/dashboard/arriendos", label: "Arriendos", icon: "KeyRound", modulo: "ganaderia.arriendos", rolesLegacy: ["admin", "viewer"], orden: 80 },
    // El precio de la leche (lo único que configura hoy) cuelga de las extracciones.
    { href: "/dashboard/configuracion", label: "Configuración", icon: "Settings", modulo: "ganaderia.extracciones", rolesLegacy: ["admin"], orden: 90 },
  ],
};
