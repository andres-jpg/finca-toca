import type { ModuleManifest } from "@/modules/core/registry/types";

/**
 * Navegación del vertical de café. Vacía en la Fase 0: las pantallas llegan en la Fase 1, cada una con su
 * entrada aquí (más `requireModuloPagina()` en la página y `requireModulo()` en sus actions). Rutas
 * previstas:
 *
 *   /dashboard/cafe/lotes        (cafe.recepcion)
 *   /dashboard/cafe/procesos     (cafe.procesos)
 *   /dashboard/cafe/inventario   (cafe.inventario)
 *   /dashboard/cafe/ventas       (cafe.ventas)
 *   /dashboard/cafe/remisiones   (cafe.remisiones)
 *
 * Al ser un módulo nuevo, sus entradas usan `roles` (membresía), no `rolesLegacy`.
 */
export const cafeManifest: ModuleManifest = { vertical: "cafe", nav: [] };
