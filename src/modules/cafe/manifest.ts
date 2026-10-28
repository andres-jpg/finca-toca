import type { ModuleManifest } from "@/modules/core/registry/types";

/**
 * Navegación del vertical de café. Cada pantalla de la Fase 1 añade aquí su entrada cuando existe su página
 * (más `requireModuloPagina()` en ella y `requireModulo()` + `requireRolTenant()` en sus actions): una entrada
 * cuya página aún no existe no se declara. Previstas, con su grupo, ruta, módulo y roles:
 *
 *   Inventario  Producto terminado   /dashboard/cafe/inventario    cafe.inventario   todos
 *   Comercial   Ventas               /dashboard/cafe/ventas        cafe.ventas       todos
 *   Comercial   Remisiones           /dashboard/cafe/remisiones    cafe.remisiones   todos
 *
 * Terceros y Tarifas y parámetros (grupo «Maestros») los aporta el manifiesto del núcleo, no este.
 * Los grupos están en `ORDEN_GRUPOS` (`core/registry/nav.ts`). Al ser un módulo nuevo, las entradas usan
 * `roles` (membresía), no `rolesLegacy`.
 */
const TODOS: ("owner" | "admin" | "operativo" | "viewer")[] = ["owner", "admin", "operativo", "viewer"];

export const cafeManifest: ModuleManifest = {
  vertical: "cafe",
  nav: [
    { href: "/dashboard/cafe/lotes", label: "Lotes", icon: "Boxes", modulo: "cafe.recepcion", roles: TODOS, grupo: "Operación", orden: 10 },
    // Planta (FIN-109): cola de trabajo y registro de trilla, tostión, molienda y empaque de maquila. Gerencia
    // (`viewer`) no la ve: consulta los procesos desde la ficha del lote.
    { href: "/dashboard/cafe/planta", label: "Planta", icon: "Factory", modulo: "cafe.procesos", roles: ["owner", "admin", "operativo"], grupo: "Operación", orden: 20 },
    // Insumos de empaque: todos lo ven (Gerencia solo lee); la página y las actions limitan compras y maestro.
    { href: "/dashboard/cafe/insumos", label: "Insumos", icon: "Package", modulo: "cafe.inventario", roles: TODOS, grupo: "Inventario", orden: 20 },
    { href: "/dashboard/cafe", label: "Panel", icon: "LayoutDashboard", modulo: "cafe.dashboard", roles: TODOS, grupo: "Gerencia", orden: 10 },
    // Maestro: lo edita solo owner/admin (Terceros y Tarifas, del núcleo, completan el grupo).
    { href: "/dashboard/cafe/maestros/tipos", label: "Tipos de café", icon: "Coffee", modulo: "cafe.recepcion", roles: ["owner", "admin"], grupo: "Maestros", orden: 5 },
  ],
};
