import { COPY } from "./copy";
import type { ModuleManifest } from "@/modules/core/registry/types";

/**
 * Navegación del vertical de café (A-07 · FIN-125): el menú sigue el recorrido del café, no las áreas del sistema.
 *
 *   Panel
 *   EL RECORRIDO DEL CAFÉ   ① Recibir café · ② Planta · ③ Inventario · ④ Ventas marca propia
 *   CONSULTAR               Lotes · Remisiones a terceros
 *   Configuración           pestañas: Tipos de café · Terceros · Tarifas y parámetros · Insumos · Equipo
 *
 * Administrador/propietario ve 8 entradas; Operativo 6 (sin Panel ni Configuración). La entrega no es opción de
 * menú: vive en Planta. Tipos de café, Terceros, Tarifas, Insumos y Equipo ya no son entradas: son pestañas de
 * Configuración (las del núcleo se excluyen del café con `excluirVerticales`).
 *
 * Cada pantalla de la Fase 1 añade aquí su entrada cuando existe su página (más `requireModuloPagina()` en ella y
 * `requireModulo()` + `requireRolTenant()` en sus actions). Al ser un módulo nuevo, las entradas usan `roles`
 * (membresía), no `rolesLegacy`.
 *
 * TODO(A-08): `/dashboard/cafe/recibir` la crea A-08; hasta que se fusione, ① apunta a una ruta que aún no existe.
 */
const TODOS: ("owner" | "admin" | "operativo" | "viewer")[] = ["owner", "admin", "operativo", "viewer"];
const OPERA: ("owner" | "admin" | "operativo")[] = ["owner", "admin", "operativo"];

const RECORRIDO = "El recorrido del café";

/** Pantallas que viven bajo la entrada «Configuración» (pestañas), para resaltarla en ellas. */
export const RUTAS_CONFIGURACION_CAFE = [
  "/dashboard/cafe/configuracion",
  "/dashboard/cafe/maestros",
  "/dashboard/terceros",
  "/dashboard/tarifas",
  "/dashboard/equipo",
];

export const cafeManifest: ModuleManifest = {
  vertical: "cafe",
  nav: [
    // Panel de gerencia (FIN-115): solo lectura; página de inicio del administrador y de Gerencia si el cliente tiene
    // `cafe.dashboard` (no es módulo base). El operativo no lo ve.
    { href: "/dashboard/cafe", label: "Panel", icon: "LayoutDashboard", modulo: "cafe.dashboard", roles: ["owner", "admin", "viewer"], orden: 5 },
    { href: "/dashboard/cafe/recibir", label: "Recibir café", icon: "ArrowDownCircle", modulo: "cafe.recepcion", roles: OPERA, grupo: RECORRIDO, numero: 1, orden: 10 },
    // Planta (FIN-109): cola de trabajo y registro de trilla, tostión, molienda y empaque de maquila.
    { href: "/dashboard/cafe/planta", label: "Planta", icon: "Factory", modulo: "cafe.procesos", roles: OPERA, grupo: RECORRIDO, numero: 2, orden: 20 },
    // Inventario (A-15: tres pestañas — marca propia, servicios a terceros e insumos): todos lo ven; las salidas las limita la acción.
    { href: "/dashboard/cafe/inventario", label: "Inventario", icon: "Package", modulo: "cafe.inventario", roles: TODOS, grupo: RECORRIDO, numero: 3, orden: 30 },
    // Ventas y cortesías de marca propia (FIN-112). `cafe.ventas` no es módulo base: se activa por cliente.
    { href: "/dashboard/cafe/ventas/nueva", label: `Ventas ${COPY.marcaPropia.toLowerCase()}`, icon: "ArrowUpCircle", modulo: "cafe.ventas", roles: TODOS, grupo: RECORRIDO, numero: 4, orden: 40 },
    { href: "/dashboard/cafe/lotes", label: "Lotes", icon: "Boxes", modulo: "cafe.recepcion", roles: TODOS, grupo: "Consultar", orden: 10 },
    // Remisiones de entrega (FIN-113): se generan desde Planta/la ficha del lote; aquí solo se consultan y reimprimen.
    { href: "/dashboard/cafe/remisiones", label: "Remisiones a terceros", icon: "FileText", modulo: "cafe.remisiones", roles: TODOS, grupo: "Consultar", orden: 20 },
    // Configuración: owner/admin. Solo se ve en el menú; sus pestañas se filtran por módulo (ver ConfiguracionTabs).
    { href: "/dashboard/cafe/configuracion", label: "Configuración", icon: "Settings", modulo: "cafe.recepcion", roles: ["owner", "admin"], grupo: "Configuración", orden: 10, activaEn: RUTAS_CONFIGURACION_CAFE },
  ],
};
