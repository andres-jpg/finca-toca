import type { Vertical } from "../../tenants/tenant.queries";

/**
 * Módulos de núcleo que `platform.crear_tenant()` activa por defecto según el vertical (hoy solo café). Debe
 * coincidir con la migración `platform_alta_tenants`: aquí solo sirve para que el formulario de alta no los
 * ofrezca como opcionales. Los clientes de ganadería y cooperativa no los reciben todavía, para no cambiar su menú.
 */
export const NUCLEO_POR_DEFECTO: Partial<Record<Vertical, readonly string[]>> = {
  cafe: ["core.terceros", "core.auditoria", "core.equipo"],
};

export const VERTICALES: readonly Vertical[] = ["ganaderia", "cooperativa", "cafe"];

export const ETIQUETA_VERTICAL: Record<Vertical, string> = {
  ganaderia: "Ganadería",
  cooperativa: "Cooperativa",
  cafe: "Café",
};

export const ESTADOS_TENANT = ["activo", "prueba", "suspendido", "baja"] as const;

export const ETIQUETA_ESTADO: Record<(typeof ESTADOS_TENANT)[number], string> = {
  activo: "Activo",
  prueba: "Prueba",
  suspendido: "Suspendido",
  baja: "Baja",
};

export const ROLES_MIEMBRO = ["owner", "admin", "operativo", "viewer"] as const;

export const ETIQUETA_ROL_MIEMBRO: Record<(typeof ROLES_MIEMBRO)[number], string> = {
  owner: "Propietario",
  admin: "Administrador",
  operativo: "Operativo",
  viewer: "Solo lectura",
};
