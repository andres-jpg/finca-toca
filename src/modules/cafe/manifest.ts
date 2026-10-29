import type { ModuleManifest } from "@/modules/core/registry/types";

/**
 * Navegación del vertical de café. Cada pantalla de la Fase 1 añade aquí su entrada cuando existe su página
 * (más `requireModuloPagina()` en ella y `requireModulo()` + `requireRolTenant()` en sus actions): una entrada
 * cuya página aún no existe no se declara.
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
    // Producto terminado (FIN-111): matriz tipo × presentación con su kardex; todos lo ven (Gerencia solo lee), las
    // salidas las limita la acción. Comparte icono con Insumos: es el mismo grupo.
    { href: "/dashboard/cafe/inventario", label: "Producto terminado", icon: "Package", modulo: "cafe.inventario", roles: TODOS, grupo: "Inventario", orden: 10 },
    // Insumos de empaque: todos lo ven (Gerencia solo lee); la página y las actions limitan compras y maestro.
    { href: "/dashboard/cafe/insumos", label: "Insumos", icon: "Package", modulo: "cafe.inventario", roles: TODOS, grupo: "Inventario", orden: 20 },
    { href: "/dashboard/cafe", label: "Panel", icon: "LayoutDashboard", modulo: "cafe.dashboard", roles: TODOS, grupo: "Gerencia", orden: 10 },
    // Maestro: lo edita solo owner/admin (Terceros y Tarifas, del núcleo, completan el grupo).
    // Remisiones de entrega (FIN-113): las ven todos (Gerencia consulta y reimprime); se generan desde la ficha del lote.
    { href: "/dashboard/cafe/remisiones", label: "Remisiones", icon: "FileText", modulo: "cafe.remisiones", roles: TODOS, grupo: "Comercial", orden: 20 },
    // Ventas y cortesías de marca propia (FIN-112): las ven todos (Gerencia solo consulta); registran owner/admin/operativo y
    // anula owner/admin. `cafe.ventas` no es módulo base: se activa por cliente. Sin icono propio en `ICONOS_NAV`:
    // reutiliza el de ingresos.
    { href: "/dashboard/cafe/ventas", label: "Ventas", icon: "ArrowUpCircle", modulo: "cafe.ventas", roles: TODOS, grupo: "Comercial", orden: 10 },
    { href: "/dashboard/cafe/maestros/tipos", label: "Tipos de café", icon: "Coffee", modulo: "cafe.recepcion", roles: ["owner", "admin"], grupo: "Maestros", orden: 5 },
  ],
};
